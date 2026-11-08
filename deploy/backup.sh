#!/usr/bin/env bash
# Daily database backup (maintain-plan.md MT1). Runs from the deploy user's crontab (deploy/crontab):
#   bash /opt/social-grid/backup.sh
#
#   1. pg_dump the live database to backups/daily-<UTC time>.dump. It's a consistent snapshot, taken while the app
#      keeps running. Custom format (-Fc) is compressed and restores with pg_restore.
#   2. upload it to R2 (r2.sh). R2's lifecycle rule deletes copies older than 30 days (M1).
#   3. keep the 7 newest daily dumps on the server as well.
#   4. ping healthchecks.io (M3): success at the end, /fail on any error. If the server or cron is dead, no ping
#      arrives at all, and healthchecks.io emails the owner after a day.
set -Eeuo pipefail
cd "$(dirname "$0")"
# Dumps hold emails and password hashes: files only deploy can read (600), folders only deploy can open (700).
umask 077
. ./r2.sh

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }
ping_healthcheck() {
  # Never let the ping itself fail the backup, and never wait long for it.
  [ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 --retry 3 -o /dev/null "${HEALTHCHECK_URL}$1" || true
}

name="daily-$(date -u +%Y%m%dT%H%M%SZ).dump"
# Set before r2_setup, so a missing or broken r2.env is logged and reported too.
trap 'log "FAILED at line $LINENO"; rm -f "backups/${name}.part"; ping_healthcheck /fail' ERR
r2_setup
mkdir -p backups
log "Backing up to ${name}"

# 1. Dump to a temporary name first, so a dump that fails halfway never looks like a good backup.
docker exec "$DB_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -Fc socialgrid' > "backups/${name}.part"
[ -s "backups/${name}.part" ] || { log "pg_dump wrote an empty file"; false; }
mv "backups/${name}.part" "backups/${name}"
log "Dumped $(du -h "backups/${name}" | cut -f1)"

# 2. Upload. copyto checks the size and checksum after the transfer.
rclone_run "$PWD/backups" copyto "/work/${name}" "${R2_DEST}/${name}"
log "Uploaded to ${R2_DEST}/${name}"

# 3. Only after a good upload: drop all but the 7 newest daily dumps here.
ls -1t backups/daily-*.dump | tail -n +8 | xargs -r rm --

# Keep the log short: the last 1000 lines are about a year of backups.
if [ -f backups/backup.log ] && [ "$(wc -l < backups/backup.log)" -gt 1000 ]; then
  # Rewrite in place, not mv: cron's ">>" keeps the old file open, and lines written after an mv would go to a
  # file that no longer has a name.
  tail -n 1000 backups/backup.log > backups/backup.log.tmp
  cat backups/backup.log.tmp > backups/backup.log
  rm -f backups/backup.log.tmp
fi

ping_healthcheck ""
log "Done"
