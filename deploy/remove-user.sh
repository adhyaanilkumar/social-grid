#!/usr/bin/env bash
# Deletes one account and everything it made: ./remove-user.sh <username>
# An admin tool for the owner (deploy-plan.md P3), run on the server as the deploy user in /opt/social-grid:
#   ssh -t deploy@<host> /opt/social-grid/remove-user.sh <username>
# It is not a moderation feature in the app, and nothing calls it automatically.
#
#   1. shows the account and how many posts, comments, likes and follows it has;
#   2. asks you to type the username again, and stops on anything else;
#   3. backs up the whole database to backups/, so a mistake can be undone;
#   4. deletes it all in one transaction: either everything goes, or nothing does.
# Likes, comments and photos that other people left on this user's posts go with the posts (ON DELETE CASCADE).
set -euo pipefail
cd "$(dirname "$0")"
# The backup in step 3 holds emails and password hashes: only deploy may read it (maintain review, PR #15).
umask 077

name="${1:-}"
# The app's own username rule (RegisterRequest): letters, numbers, dots, dashes and underscores.
# It also keeps the name safe to pass to psql.
if [[ ! "$name" =~ ^[A-Za-z0-9._-]{1,50}$ ]]; then
  echo "usage: ./remove-user.sh <username>   (got '${name}')" >&2
  exit 2
fi

compose() { docker compose -f compose.prod.yml --env-file .env "$@"; }
# psql inside the database container. The SQL comes on stdin, and :'name' is the username as a quoted literal.
sql() {
  compose exec -T postgres sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -q -t -A -F " " -v ON_ERROR_STOP=1 -v name="$1"' sh "$name"
}

summary="$(sql <<'SQL'
SELECT u.id, u.email,
       (SELECT count(*) FROM posts    WHERE author_id = u.id),
       (SELECT count(*) FROM comments WHERE author_id = u.id),
       (SELECT count(*) FROM likes    WHERE user_id = u.id),
       (SELECT count(*) FROM follows  WHERE follower_id = u.id),
       (SELECT count(*) FROM follows  WHERE followee_id = u.id)
FROM users u WHERE u.username = :'name';
SQL
)"
if [ -z "$summary" ]; then
  echo "No user called '${name}'. Nothing deleted." >&2
  exit 1
fi
read -r id email posts comments likes following followers <<< "$summary"
cat <<EOF
User ${name} (id ${id}, ${email})
  posts:     ${posts} (their photos, and other people's likes and comments on them, go too)
  comments:  ${comments}
  likes:     ${likes}
  follows:   ${following} following, ${followers} followers
EOF

printf 'Type the username again to delete all of this: '
read -r answer || answer=""
if [ "$answer" != "$name" ]; then
  echo "Didn't match. Nothing deleted."
  exit 1
fi

mkdir -p backups
backup="backups/before-remove-${name}-$(date -u +%Y%m%dT%H%M%SZ).dump"
compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$backup"
echo "Database backed up to ${backup}"

sql <<'SQL'
BEGIN;
SELECT id AS uid FROM users WHERE username = :'name' \gset
DELETE FROM likes    WHERE user_id = :uid;
DELETE FROM comments WHERE author_id = :uid;
DELETE FROM follows  WHERE follower_id = :uid OR followee_id = :uid;
DELETE FROM posts    WHERE author_id = :uid;
DELETE FROM profiles WHERE user_id = :uid;
DELETE FROM users    WHERE id = :uid;
COMMIT;
SQL
echo "Deleted ${name}. The backup holds the whole database as it was just before; restoring it also undoes anything since."
