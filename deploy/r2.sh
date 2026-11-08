# Shared by backup.sh and restore-check.sh (maintain-plan.md MT1). Sourced, not run.
#
# rclone talks to Cloudflare R2 through R2's S3-compatible API. It runs as a pinned Docker image, so the server
# needs no install and no root. Settings come from r2.env (mode 600, made by hand on the server, never in git):
#   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, HEALTHCHECK_URL
# rclone reads its remote "r2" from RCLONE_CONFIG_R2_* environment variables. They're passed to the container by
# name only (-e NAME), so the secret never appears on a command line, where `ps` could show it.
#
# REHEARSAL=1 (laptop only): the "r2" remote is a plain folder, REHEARSAL_REMOTE_DIR, instead of R2.

RCLONE_IMAGE="rclone/rclone:1.68.2"

r2_setup() {
  if [ "${REHEARSAL:-0}" = "1" ]; then
    [ -n "${REHEARSAL_REMOTE_DIR:-}" ] || { echo "set REHEARSAL_REMOTE_DIR for a rehearsal" >&2; return 1; }
    export RCLONE_CONFIG_R2_TYPE=local
    R2_DEST="r2:/remote/daily"
    return
  fi
  [ -r r2.env ] || { echo "r2.env is missing: copy r2.env.example to r2.env and fill it in (chmod 600)." >&2; return 1; }
  # Check the format before sourcing. A bad line (a space after "=", quotes) makes bash run the value as a command,
  # and its error message would print the secret into backup.log. Only line numbers are shown here.
  local bad
  bad="$(grep -nvE '^(#.*|[[:space:]]*|[A-Z0-9_]+=[^[:space:]"'\'']*)$' r2.env | cut -d: -f1 | tr '\n' ' ' || true)"
  if [ -n "$bad" ]; then
    # Still find the ping URL if its own line is fine, so the failure is reported straight away.
    HEALTHCHECK_URL="$(grep -E '^HEALTHCHECK_URL=https://[^[:space:]"'\'']+$' r2.env | tail -n 1 | cut -d= -f2- || true)"
    echo "r2.env line(s) ${bad}must be NAME=value, with no spaces or quotes. Not reading it." >&2
    return 1
  fi
  # shellcheck disable=SC1091
  . ./r2.env
  # return, not ${VAR:?}: that exits the shell at once, before backup.sh's ERR trap can log and ping /fail.
  local v
  for v in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
    [ -n "${!v:-}" ] || { echo "${v} is empty in r2.env" >&2; return 1; }
  done
  export RCLONE_CONFIG_R2_TYPE=s3
  export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  # The token may only touch objects in this one bucket, so rclone mustn't try to check or create the bucket.
  export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
  R2_DEST="r2:${R2_BUCKET}/daily"
}

# A folder path as Docker expects it. On the Linux server that's the path itself. In a laptop rehearsal from Git
# Bash, /c/Users/... means nothing to Docker Desktop, so cygpath (Git Bash only) turns it into C:/Users/...
host_path() {
  if command -v cygpath > /dev/null; then cygpath -m -l "$1"; else printf '%s\n' "$1"; fi
}

# rclone_run <host dir to mount at /work> <rclone args...>
rclone_run() {
  local work="$1"; shift
  local mounts=(-v "$(host_path "$work"):/work")
  if [ "${REHEARSAL:-0}" = "1" ]; then
    mounts+=(-v "$(host_path "$REHEARSAL_REMOTE_DIR"):/remote")
  fi
  docker run --rm --memory 128m \
    -e RCLONE_CONFIG_R2_TYPE -e RCLONE_CONFIG_R2_PROVIDER -e RCLONE_CONFIG_R2_ENDPOINT \
    -e RCLONE_CONFIG_R2_ACCESS_KEY_ID -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET \
    "${mounts[@]}" "$RCLONE_IMAGE" "$@" \
    --retries 3 --low-level-retries 3 --contimeout 20s --timeout 2m
  # rclone's defaults (10 low-level retries per attempt) took about 6 minutes to give up on bad credentials in the
  # rehearsal. A few retries cover a network blip; anything worse should fail fast and ping /fail.
}

# The live database's container. The name is fixed in compose.prod.yml; a rehearsal points it at a throwaway one.
DB_CONTAINER="${DB_CONTAINER:-social-grid-db}"

# Prints "table=rows" for every table, sorted, from the database in container $1 (exact counts, not estimates).
row_counts() {
  docker exec -i "$1" sh -c 'psql -U "$POSTGRES_USER" -d socialgrid -X -At -v ON_ERROR_STOP=1' <<'SQL'
SELECT format('SELECT %L || ''='' || count(*) FROM %I', tablename, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename \gexec
SQL
}
