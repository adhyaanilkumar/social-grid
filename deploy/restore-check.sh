#!/usr/bin/env bash
# The restore drill (maintain-plan.md MT1, risk R1): proves a backup in R2 really restores.
#   bash /opt/social-grid/restore-check.sh            # the newest backup in R2
#   bash /opt/social-grid/restore-check.sh <name>     # one named backup, e.g. daily-20261109T213000Z.dump
#
# It never touches the live database except to read row counts:
#   1. downloads the backup from R2 into a temporary folder;
#   2. starts a throwaway Postgres (sg-restore-check): no volume, no published port, 256 MB of memory;
#   3. restores the backup into it, stopping on the first error;
#   4. prints each table's row count, restored next to live;
#   5. removes the container and the download, whatever happened (trap).
# Counts can differ if people posted after the backup was taken. Right after a manual backup.sh they must match.
set -euo pipefail
cd "$(dirname "$0")"
umask 077   # the download holds personal data, like the dumps (backup.sh)
. ./r2.sh

check="sg-restore-check"
mkdir -p backups
work="$(mktemp -d "${PWD}/backups/restore-check.XXXXXX")"
cleanup() { docker rm -f "$check" > /dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

r2_setup
name="${1:-}"
if [ -z "$name" ]; then
  # Names are UTC timestamps, so the alphabetically last one is the newest.
  # Said out loud: under set -e a failed listing would otherwise end the script with only rclone's own error.
  # R2 also answers "directory not found" when daily/ has no objects yet.
  if ! listing="$(rclone_run "$work" lsf --files-only --include 'daily-*.dump' "${R2_DEST}/")"; then
    echo "Couldn't list ${R2_DEST}/: no backups there yet, or R2 can't be reached (see rclone's error above)." >&2
    exit 1
  fi
  name="$(printf '%s\n' "$listing" | sort | tail -n 1)"
  [ -n "$name" ] || { echo "No backups found in ${R2_DEST}/" >&2; exit 1; }
fi
[[ "$name" =~ ^daily-[0-9]{8}T[0-9]{6}Z\.dump$ ]] || { echo "Not a backup name: '${name}'" >&2; exit 2; }

echo "== Downloading ${name}"
rclone_run "$work" copyto "${R2_DEST}/${name}" "/work/${name}"
echo "   $(du -h "${work}/${name}" | cut -f1)"

echo "== Restoring into a throwaway Postgres (${check})"
docker rm -f "$check" > /dev/null 2>&1 || true
docker run -d --name "$check" --memory 256m \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD="$(head -c 18 /dev/urandom | base64)" -e POSTGRES_DB=socialgrid \
  postgres:18-alpine > /dev/null
for _ in $(seq 1 30); do
  docker exec "$check" pg_isready -q -U postgres -d socialgrid 2> /dev/null && break
  sleep 2
done
# The live owner role doesn't exist here, so skip ownership and grants.
docker exec -i "$check" pg_restore -U postgres -d socialgrid --no-owner --no-privileges --exit-on-error \
  < "${work}/${name}"

echo "== Row counts (restored / live)"
restored="$(row_counts "$check")"
live="$(row_counts "$DB_CONTAINER")"
[ -n "$restored" ] || { echo "The restored database has no tables." >&2; exit 1; }
differ=0
while IFS='=' read -r table count; do
  now="$(printf '%s\n' "$live" | sed -n "s/^${table}=//p")"
  mark=""
  [ "$count" = "$now" ] || { mark="  <- differs"; differ=1; }
  printf '   %-14s %8s / %-8s%s\n' "$table" "$count" "${now:-missing}" "$mark"
done <<< "$restored"

if [ "$differ" = "1" ]; then
  echo "Restored OK, but some counts differ from live (expected if people posted since ${name} was taken)."
else
  echo "Restored OK: every table matches the live database."
fi
