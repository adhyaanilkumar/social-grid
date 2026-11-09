# social-grid

## Operations (production)

Live at https://social-grid.dev on one AWS Lightsail server (`deploy@16.4.116.37`, app in `/opt/social-grid`), run with Docker Compose: `social-grid-caddy` (HTTPS), `social-grid-frontend` (nginx, proxies `/api/`), `social-grid-backend`, `social-grid-db` (Postgres 18). Plans and history: `sdlc/v0/deploy-plan.md` and `sdlc/v0/maintain-plan.md`.

**Releases.** Merge a PR to `main`; CI publishes images tagged with the 7-character commit SHA. Then run `gh workflow run release.yml -f tag=<sha>` and approve it in GitHub's `production` environment. `release.sh` backs up the database to `backups/before-<sha>-*.dump` before switching.

**Rollback.** On the server: `./rollback.sh`. It releases the previous tag again (code only, not data). Running it twice goes forward again.

**Backups.** Every day at 03:00 IST (cron, 21:30 UTC) `backup.sh` dumps the database, uploads it to the private R2 bucket `social-grid-backups` (`daily/`, deleted after 30 days), keeps the 7 newest on the server, and pings healthchecks.io. Settings live in `/opt/social-grid/r2.env` (mode 600, never in git). Log: `backups/backup.log`. The restore drill, `bash restore-check.sh`, restores the newest R2 backup into a throwaway Postgres and compares row counts with the live database.

**Monitoring (all free).**
- UptimeRobot, every 5 minutes, emails on down and on up: `https://social-grid.dev/` (Caddy and the frontend) and `https://social-grid.dev/api/health` (also the backend and the database: 200 `{"status":"UP"}`, or 503 when the database doesn't answer).
- healthchecks.io "social-grid daily backup": emails if `backup.sh` reports a failure, or if no successful backup arrives for 25 hours.
- No email means everything is working.

### Runbook (what to do when...)

| Situation | What to do |
|---|---|
| UptimeRobot says `/` is down | The server, Caddy or the frontend is down. Check `docker compose -f compose.prod.yml --env-file .env ps` and `docker stats --no-stream`, then `df -h`. If the last release caused it: `./rollback.sh`. |
| UptimeRobot says only `/api/health` is down | The backend or database. Check `docker compose -f compose.prod.yml --env-file .env logs --tail 200 backend` and the same for `postgres`. If the last release caused it: `./rollback.sh`. |
| healthchecks.io says a backup failed or was missed | The site still works. Read `tail -50 backups/backup.log` and `crontab -l`, then fix it the same day and run `bash backup.sh` by hand until it ends with "Done". |
| `backup.sh` says `r2.env line(s) N must be NAME=value...` | Line N of `r2.env` has a space, a quote or a character outside `A-Z a-z 0-9 . _ : / @ + = -`. Fix it with `nano r2.env`. The message never shows the values. |
| Bad data after a release | A rollback doesn't restore data. Restore `backups/before-<sha>-*.dump` (below). It overwrites live data, so the owner decides. |
| The server is lost | Provision a new server with `deploy/provision.sh`, release the last tag, recreate `r2.env`, then restore the newest R2 backup (below). Update the DNS record if the IP changed. |

**Restoring a backup into the live database** overwrites everything written since that backup. It's the owner's decision, and **it hasn't been rehearsed against production**; the drill only restores into a throwaway database. On the server, as `deploy`, in `/opt/social-grid`:

```bash
# Only for a backup that's in R2 but not on the server: download it into backups/
source r2.sh && r2_setup && rclone_run "$PWD/backups" copyto "${R2_DEST}/daily-<UTC>.dump" "/work/daily-<UTC>.dump"
bash backup.sh                                   # a backup of the current state, just in case
docker compose -f compose.prod.yml --env-file .env stop backend
docker exec -i social-grid-db sh -c 'pg_restore -U "$POSTGRES_USER" -d socialgrid --clean --if-exists --no-owner --exit-on-error' < backups/<file>.dump
docker compose -f compose.prod.yml --env-file .env start backend
```

**Access.** No one has standing SSH except the owner. Claude diagnoses through commands the owner runs, or a temporary allow rule for one task that is removed afterwards. R2 keys and other secrets go only in `/opt/social-grid/r2.env` and `.env` on the server, never in chat or git. Production data never comes to a laptop.
