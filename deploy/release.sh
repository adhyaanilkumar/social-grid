#!/usr/bin/env bash
# Runs the images built from one commit: ./release.sh <commit-sha>
# Called by .github/workflows/release.yml after the owner approves, or by hand on the server as the deploy user.
#
# Order matters:
#   1. pull the new images first, so a bad tag fails before anything changes;
#   2. back up the database, because a rollback swaps the code, not the data (deploy-plan.md K2);
#   3. remember the running tag in previous-tag, which rollback.sh uses;
#   4. switch TAG in .env and start the new containers, waiting until their healthchecks pass;
#   5. check the site answers through Caddy over HTTPS.
set -euo pipefail
cd "$(dirname "$0")"
# The backup in step 2 holds emails and password hashes: only deploy may read it (maintain review, PR #15).
umask 077

tag="${1:-}"
if [[ ! "$tag" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "usage: ./release.sh <commit-sha>   (got '${tag}')" >&2
  exit 2
fi

compose() { docker compose -f compose.prod.yml --env-file .env "$@"; }
env_value() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2-; }

domain="$(env_value DOMAIN)"
current="$(env_value TAG || true)"
echo "Releasing ${tag} (running now: ${current:-nothing})"

# 1. Pull. TAG is overridden for this command only; .env still names the running tag.
# REHEARSAL=1 is only for trying this script on a laptop (deploy-plan.md D1): it skips the pull, because the
# images are built locally and aren't on GHCR, and accepts Caddy's self-signed localhost certificate in step 5.
# Also set COMPOSE_PROJECT_NAME=sg-rehearsal there, so its database volume can't be the dev one.
rehearsal="${REHEARSAL:-0}"
if [ "$rehearsal" != "1" ]; then
  TAG="$tag" compose pull backend frontend
fi

# 2. Back up, if a database is already running (there isn't one on the very first release).
mkdir -p backups
if [ -n "$(compose ps -q --status running postgres)" ]; then
  backup="backups/before-${tag}-$(date -u +%Y%m%dT%H%M%SZ).dump"
  compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc socialgrid' > "$backup"
  echo "Database backed up to ${backup} ($(du -h "$backup" | cut -f1))"
  # Keep the 10 newest release backups. Daily backups are a separate job (Maintain stage).
  ls -1t backups/before-*.dump | tail -n +11 | xargs -r rm --
fi

# 3. Remember what was running.
if [ -n "$current" ] && [ "$current" != "$tag" ]; then
  echo "$current" > previous-tag
fi

# 4. Switch and start. --wait returns once every container is running and healthy, or fails.
if grep -qE '^TAG=' .env; then
  sed -i "s/^TAG=.*/TAG=${tag}/" .env
else
  echo "TAG=${tag}" >> .env
fi
if ! compose up -d --remove-orphans --wait --wait-timeout 300; then
  echo "Release ${tag} did not become healthy. Logs: docker compose -f compose.prod.yml logs backend" >&2
  echo "To go back to ${current:-the previous tag}: ./rollback.sh" >&2
  exit 1
fi

# 5. Through Caddy, as a browser would: a logged-out /api/auth/me must answer 401.
insecure=""
[ "$rehearsal" = "1" ] && insecure="--insecure"
# Retry for up to 90 s: on the first release Caddy still has to get the certificate from Let's Encrypt.
status=""
for _ in $(seq 1 18); do
  status="$(curl -s $insecure -o /dev/null -w '%{http_code}' --resolve "${domain}:443:127.0.0.1" "https://${domain}/api/auth/me" || true)"
  [ "$status" = "401" ] && break
  sleep 5
done
if [ "$status" != "401" ]; then
  echo "Containers are healthy, but https://${domain}/api/auth/me answered '${status}', not 401." >&2
  echo "To go back to ${current:-the previous tag}: ./rollback.sh" >&2
  exit 1
fi

# Free disk: unused images older than 14 days. A rollback to an older tag pulls it again from GHCR.
# Skipped in a rehearsal: on a laptop it would delete other projects' images.
if [ "$rehearsal" != "1" ]; then
  docker image prune -af --filter "until=336h" > /dev/null
fi
echo "Released ${tag}: https://${domain} is up."
