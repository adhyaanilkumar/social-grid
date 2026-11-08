# Maintain plan: social-grid V0

Cycle: V0. Stage: 6, Maintain. Sources: `deploy-plan.md` (section 5, "Not in this stage"), the AI-Native SDLC Playbook Stage 6, and prices fetched 2026-11-08. Status: **approved 2026-11-08**, with M1–M4 as recommended. Date: 2026-11-08.

**Owner's decisions, 2026-11-08:**
- **Backups:** daily, copied off the server to Cloudflare R2, with a restore drill.
- **Uptime:** a free external uptime checker now, as a stopgap until the monitoring plan that covers all your projects.
- **Error tracking:** deferred to that same plan. Until then, Claude reads the server logs on demand.

**Why backups come first:** today the only backups are the `pg_dump` files `release.sh` takes before each release. They sit in `/opt/social-grid/backups` on the same disk as the database. If the server is lost, the backups go with it. Production now holds real accounts and photos (16 users and 11 posts on 2026-11-08), so this is the biggest risk left.

## 1. Decisions you need to make

| # | Question | My recommendation | Monthly cost |
|---|---|---|---|
| M1 | How long are backups kept in R2? | **30 days**, enforced by an R2 lifecycle rule that deletes older objects automatically. One dump is about 1.3 MB, so 30 of them are about 40 MB. | **₹0.** The free tier covers 10 GB-month of storage, 1 million Class A operations (uploads) and 10 million Class B operations (downloads) each month, and egress (data downloaded out of R2) is free. We'd use about 0.4% of the storage and 30 uploads. Beyond the free tier: $0.015 per GB-month. |
| M2 | Encrypt the dumps before upload? | **No, not in V0.** The bucket is private, R2 encrypts data at rest, and the upload token works on this one bucket only. Encrypting with your own key (gpg) protects against a leaked R2 token, but if the key is lost, every backup becomes useless. That's a worse failure for a one-person project. We can revisit this in the cross-project plan. | ₹0 |
| M3 | How do you hear about a failed backup? | **A free [healthchecks.io](https://healthchecks.io) check.** The backup job pings a private URL when it succeeds, and healthchecks.io emails you when a day passes with no ping. Without it, a broken cron job fails silently, and you'd only find out when you needed the backup. This is a check on the backup itself, not general monitoring, but it's still an extra account. Say no and I'll leave it out. | ₹0 (free plan for hobby use: 20 checks; I'll confirm the terms at setup) |
| M4 | What does the uptime checker watch? | **Two UptimeRobot free monitors, every 5 minutes, alerting by email:** (1) `https://social-grid.dev/`, the frontend through Caddy; (2) `https://social-grid.dev/api/auth/me`, the backend through Caddy. A logged-out request gets 401, and UptimeRobot counts a 401 as "up" when the monitor has no login details set. A 502 from Caddy, when the backend is down, counts as "down". No code changes are needed. | ₹0. 50 monitors at 5-minute checks are free. Recent terms changes allow any use, and this is personal anyway. Custom status codes and heartbeat monitors are paid features, so we don't use them. |

**Total for social-grid stays about ₹1,420–1,440 a month** (Lightsail plus the domain). Nothing in this plan costs money.

## 2. How it fits together

```text
Server (Lightsail), cron as the deploy user, every day at 03:00 IST (21:30 UTC)
  └─ backup.sh
       1. pg_dump -Fc from the postgres container   → backups/daily-<UTC time>.dump
       2. rclone (run as a pinned Docker image)     → R2 bucket social-grid-backups/daily/
       3. only after a good upload: keep the 7 newest daily dumps on the server
       4. ping healthchecks.io: success at the end, /fail on any error (M3)

R2 lifecycle rule: delete objects under daily/ after 30 days                       (M1)
healthchecks.io: no ping within 1 day + 1 hour grace → email to you               (M3)
UptimeRobot: GET / and GET /api/auth/me every 5 minutes → email when down         (M4)
```

Points to note:
- **No root needed on the server.** The `deploy` user can already run Docker, so it runs `rclone` as a container (`rclone/rclone:<pinned version>`) instead of installing it, and it installs its own crontab. `provision.sh` doesn't change.
- **The R2 credentials stay off GitHub and out of this chat.** You create a token in the Cloudflare dashboard that can only read and write the `social-grid-backups` bucket. You put it into `/opt/social-grid/r2.env` (mode 600) on the server yourself. The repo only has `deploy/r2.env.example` with empty values, the same pattern as `.env`.
- **Dumps never come to the laptop.** Production data stays out of dev, the same rule as dev data never reaching production. The restore drill runs on the server, into a throwaway Postgres container.
- **pg_dump is a consistent snapshot.** The app keeps running during the backup, and the dump shows the database as it was at one moment.

## 3. Milestones

Same rhythm as Deploy: a review stop after each milestone, then one commit. Before each stop I run `make build`, `make lint` and `make test` and paste the result lines. The PR hook opens the PR.

### MT1. Backup and restore scripts, rehearsed on the laptop

| File | Change |
|---|---|
| `deploy/backup.sh` (new) | Steps 1–4 above. `set -Eeuo pipefail` plus an `ERR` trap: any failed step stops the script, logs `FAILED` and pings `/fail`. It logs to `backups/backup.log`. Files are created with `umask 077`. |
| `deploy/r2.sh` (new) | Shared by `backup.sh` and `restore-check.sh`, which source it. It checks and reads `r2.env`, sets rclone's `r2` remote through environment variables, runs rclone as a pinned image (`rclone_run`), and counts rows per table (`row_counts`). |
| `deploy/restore-check.sh` (new) | The restore drill. It downloads the newest R2 object (or a named one) and starts a throwaway `postgres:18-alpine` container, `sg-restore-check`, with no volume and no published port. Then it runs `pg_restore`, prints a row count per table next to the live database's, and removes the container whatever happens (a `trap`). It's read-only for production. |
| `deploy/r2.env.example` (new) | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `HEALTHCHECK_URL`, all empty |
| `deploy/crontab` (new) | The one line for `deploy`'s crontab |
| `deploy/release.sh`, `deploy/remove-user.sh` | `umask 077`, so their own backups are private too (review of PR #15, B12) |
| `.github/workflows/release.yml` | Also copies `r2.sh`, `backup.sh`, `restore-check.sh`, `r2.env.example` and `crontab` to the server |

**Proof (laptop rehearsal, like D1 and D6):** run against a throwaway Postgres loaded with the app's schema and a fixture, using rclone's local-folder backend in place of R2.
- A dump is written and uploaded, and the 8th local dump removes the oldest.
- Breaking a step (wrong container name, an unreachable "bucket") → non-zero exit, no ping, and nothing deleted.
- `restore-check.sh` restores the dump, and the counts match the fixture.
- The throwaway container is gone afterwards, even after a forced failure.

These are shell scripts with no test harness, so the live runs are the red and green, as for `provision.sh` (B9).

**MT1 results (2026-11-08, laptop rehearsal).** Run in Git Bash with `REHEARSAL=1` against a throwaway `postgres:18-alpine` (`sg-rehearsal-db`). The fixture had 5 users, 12 posts and 12 binary `post_images`. rclone 1.68.2 wrote to a local folder in place of R2.
- **Backup:** dumped (8 KB) and uploaded. After 8 more runs, 7 dumps were left locally and all of them were in the "R2" folder.
- **Restore drill:** the newest dump restored into `sg-restore-check`, and all 3 tables matched (5/5, 12/12, 12/12). The container and the download folder were gone afterwards.
- **Failures:**
  - Wrong database container: exit 1, `FAILED` logged, a `/fail` ping sent, nothing uploaded or deleted.
  - Bad R2 credentials (the real S3 path, with a bogus account): exit 1 after 9 s, and the new dump was kept locally.
  - Missing `r2.env`: a clear message, exit 1.
  - A row added after the backup: "differs" shown for that table, exit 0.
  - A corrupt newest backup: `pg_restore` error, exit 1, container removed.
  - A bad backup name: exit 2.
- **Fixed along the way:**
  - A failed dump left an empty `.part` file. The error trap now removes it.
  - With rclone's default retries, bad credentials took about 6 minutes to fail. Retries and timeouts are now capped.
  - In a Git Bash rehearsal, Docker Desktop can't read `/c/...` paths, so `host_path` uses `cygpath`, which exists only in Git Bash. On the server the path is used as it is.
  - Bug B11 in `release.yml` (logged in `deploy-plan.md`, section 3b).
- **Not tested on the laptop:** the real R2 upload and the healthchecks.io success ping. They're tested in MT2. `release.sh` prunes unused images older than 14 days, so the rclone image may be pulled again (about 20 MB) after a release. That's harmless.

### MT2. R2 and the first real backup (you and me)

**Your steps (dashboard, about 10 minutes):**
1. Cloudflare dashboard → R2 → enable it. It may ask you to accept R2's terms or confirm a payment method. The free tier still applies; if it asks for anything that costs money, stop and tell me.
2. Create the bucket `social-grid-backups`.
3. Create an R2 API token with "Object Read & Write" on that bucket only. Copy the access key ID and secret.
4. If you approve M3: sign up at healthchecks.io and create one check (period 1 day, grace 1 hour). Copy its ping URL.
5. On the server, as `deploy`, fill `/opt/social-grid/r2.env` from the example and `chmod 600` it.

**My steps:** add the lifecycle rule (M1) through the Cloudflare API, if the MCP token is allowed to, otherwise I give you the dashboard clicks. Then release `MT1`'s commit through `release.yml` (your approval), install the crontab, and run `backup.sh` once by hand. The server steps need SSH, so this uses the same temporary allow rule as the rollback drill, removed afterwards. Or you run the commands with `!`.

**Proof:**
- The object appears in R2.
- healthchecks.io shows the ping.
- `restore-check.sh` on the server restores the R2 copy, and every table's count matches the live database.
- The next morning, the 03:00 run has happened on its own: there's a new object in R2 and a new ping.

### MT3. Uptime checks (mostly you)

**Your steps:** sign up for UptimeRobot (free) and add the two monitors from M4, with alerts to your email.

**Proof, with no downtime for real users:**
- Both monitors show "Up" within 10 minutes.
- A temporary third monitor on a host that doesn't exist (for example `https://nope.social-grid.dev/`) goes "Down", and **you get the alert email**. Then delete that monitor.
- I check the server log to confirm the monitors' 5-minute requests to `/api/auth/me` don't create a session each time.

### MT4. Close the cycle

- Record the results here.
- Write the runbook below into `README.md`'s operations section.
- Collect the V0 follow-ups (list below) into a draft of the next cycle's `intent.md`, for you to pick from when you start V0.1 or V1.

## 4. Runbook (what to do when...)

| Situation | What to do |
|---|---|
| UptimeRobot says the site is down | Ask me to diagnose. I need SSH (a temporary rule, or you run the commands): `docker compose ps`, `docker compose logs --tail 200 backend`, `docker stats --no-stream`, `df -h`. If a release caused it: `./rollback.sh`. |
| healthchecks.io says a backup was missed | Same: I read `backups/backup.log` and the cron output. The site still works, so it's not urgent, but fix it the same day. |
| Bad data after a release | A rollback restores code, not data (deploy-plan K2). Restore from `backups/before-<tag>-*.dump` on the server with `pg_restore --clean`. That needs your approval because it overwrites live data. |
| The server is lost | Provision a new Lightsail server (`provision.sh`), release the last tag, then restore the newest R2 dump. You'd also update the DNS record if the static IP changed. |

**Claude's access in Maintain:** no standing SSH. Every diagnosis is either commands you run with `!`, or a temporary allow rule for that one task, removed afterwards (as in the 2026-11-08 rollback drill).

## 5. Risks

| # | Risk | Handling |
|---|---|---|
| R1 | **A backup that never restores.** | The MT2 restore drill, and running `restore-check.sh` again at the start of every new cycle. |
| R2 | **Backups hold friends' personal data** (emails, password hashes, photos) at a third party. | A private bucket and a token limited to that bucket. Cloudflare already runs our DNS. Encryption is M2. Deleting a user with `remove-user.sh` doesn't remove them from backups until those age out after 30 days. That's normal, but worth knowing. |
| R3 | **2 GB of memory** (K1) while the restore drill runs a second Postgres. | It runs only during the drill and is removed straight after. Last measured, the running stack used about 400 MB. I'll watch `docker stats` during the drill. |
| R4 | **The R2 token lives on the server.** If the server is compromised, the attacker can read or delete the backups. | Accepted for V0. The database itself would already be exposed then. A write-only token isn't offered by R2. |
| R5 | **Cron runs in UTC.** | 21:30 UTC = 03:00 IST, written in the crontab comment. |

## 6. Not in this plan

- **Error tracking and monitoring across all your projects:** your separate plan (CLAUDE.md).
- **Point-in-time recovery** (WAL archiving): overkill at this size. Up to 24 hours of data could be lost.
- **V0 follow-ups**, collected for the next cycle in MT4:
  - NUL bytes in text fields may give 409 or 500;
  - `registerRules.ts` checks the 72 limit in characters, not bytes;
  - the comment box wipes text typed while an earlier comment is still posting;
  - old `t263a_` and `t264a_` test users;
  - Flyway migrations (K2);
  - the HEIC photo check (D6 item 3).
