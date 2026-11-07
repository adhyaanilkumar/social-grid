"""PostToolUse hook: merges the current branch into main once the CLAUDE.md checks all pass.

CLAUDE.md: "if all the tests pass, then u can merge the PR to main branch".

Runs after every Bash or PowerShell command that mentions `make`. It merges only when:
- `make build`, `make lint` and `make test` have each recorded a pass for the CURRENT commit
  (stamps in .git/checks/, written by the Makefile; a run with uncommitted code changes records "dirty");
- the current branch isn't main;
- main can be fast-forwarded to this commit (main has nothing this branch lacks), so there are no merge conflicts
  to resolve unattended.

The merge is a fast-forward push of this commit to origin/main, then local main is moved to match.
Every decision is appended to .git/checks/hook.log. Set MERGE_HOOK_DRY_RUN=1 to log without pushing.
"""
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2])
CHECKS = ("build", "lint", "test")
DRY_RUN = os.environ.get("MERGE_HOOK_DRY_RUN") == "1"


def git(*args, check=True):
    result = subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True)
    if check and result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result


def log(checks_dir, message):
    checks_dir.mkdir(parents=True, exist_ok=True)
    with open(checks_dir / "hook.log", "a", encoding="utf-8") as f:
        f.write(f"{datetime.now().isoformat(timespec='seconds')} {message}\n")


def tell(message):
    """Shows the message to the user and passes it to Claude."""
    print(json.dumps({
        "systemMessage": message,
        "hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": message},
    }))


def main():
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return 0
    command = str((payload.get("tool_input") or {}).get("command", ""))
    if "make" not in command:
        return 0

    checks_dir = ROOT / git("rev-parse", "--git-dir").stdout.strip() / "checks"
    head = git("rev-parse", "HEAD").stdout.strip()

    stamps = {}
    for name in CHECKS:
        path = checks_dir / name
        stamps[name] = path.read_text(encoding="utf-8").strip() if path.exists() else "missing"
    not_passed = [name for name in CHECKS if stamps[name] != head]
    if not_passed:
        log(checks_dir, f"skip {head[:7]}: not yet passed on this commit: {', '.join(not_passed)}")
        return 0

    branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    if branch in ("main", "HEAD"):
        log(checks_dir, f"skip {head[:7]}: on '{branch}', nothing to merge")
        return 0

    merged_marker = checks_dir / "merged"
    if merged_marker.exists() and merged_marker.read_text(encoding="utf-8").strip() == head:
        return 0

    git("fetch", "origin", "main")
    if git("merge-base", "--is-ancestor", "origin/main", "HEAD", check=False).returncode != 0:
        message = (f"All checks passed on {branch} ({head[:7]}), but main has commits this branch doesn't. "
                   "Not merging automatically: merge or rebase main into the branch, then re-run the checks.")
        log(checks_dir, f"refuse {head[:7]}: not a fast-forward")
        tell(message)
        return 0
    if git("rev-parse", "origin/main").stdout.strip() == head:
        merged_marker.write_text(head, encoding="utf-8")
        return 0

    if DRY_RUN:
        log(checks_dir, f"dry run {head[:7]}: would push {branch} to origin/main")
        tell(f"[dry run] All checks passed on {branch} ({head[:7]}); would merge it into main.")
        return 0

    push = git("push", "origin", "HEAD:main", check=False)
    if push.returncode != 0:
        log(checks_dir, f"fail {head[:7]}: push rejected: {push.stderr.strip()}")
        tell(f"All checks passed, but pushing {branch} to main failed: {push.stderr.strip()}")
        return 0
    # Moves local main to the same commit without checking it out; fast-forward only.
    git("fetch", ".", "HEAD:main", check=False)
    merged_marker.write_text(head, encoding="utf-8")
    log(checks_dir, f"merged {head[:7]} from {branch} into main")
    tell(f"All checks passed (build, lint, test) on {branch}, so {head[:7]} was merged into main and pushed.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # A hook must never break the session; report and carry on.
        print(json.dumps({"systemMessage": f"merge_when_green hook error: {error}"}))
        sys.exit(0)
