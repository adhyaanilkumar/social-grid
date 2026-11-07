#!/usr/bin/env bash
# The one-command rollback (CLAUDE.md, Stage 5): runs the tag that was live before the last release.
#   ./rollback.sh
# It's an ordinary release of the previous tag, so it also backs up the database first. It restores the CODE only.
# If the bad release changed data, restore from backups/ (deploy-plan.md K2).
# Running it twice in a row goes forward again, because release.sh records the tag it replaced.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -s previous-tag ]; then
  echo "No previous-tag file: nothing has been released over yet, so there's nothing to roll back to." >&2
  exit 1
fi
exec ./release.sh "$(cat previous-tag)"
