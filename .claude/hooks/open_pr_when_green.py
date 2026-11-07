"""PostToolUse hook: opens a PR to main once the CLAUDE.md checks all pass. It never pushes to main.

The AI-Native SDLC Playbook (Stage 5): the agent may act up to the gate and cannot pass it. So this hook pushes
the current BRANCH and opens a pull request; the owner reviews and merges it on GitHub.

Runs after Bash or PowerShell commands that actually run `make build`, `make lint` or `make test`
(matched as a command, so text like a path `make-test-2.log` doesn't trigger it). It acts only when:
- `make build`, `make lint` and `make test` have each recorded a pass for the CURRENT commit
  (stamps in .git/checks/, written by the Makefile; a run with uncommitted code changes records "dirty");
- the current branch isn't main.

Every decision is appended to .git/checks/hook.log. Set PR_HOOK_DRY_RUN=1 to log without pushing or opening a PR.
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2])
CHECKS = ("build", "lint", "test")
DRY_RUN = os.environ.get("PR_HOOK_DRY_RUN") == "1"
# `make` as a command word (start of command or after ; & | ( or a space), optionally make.exe, then a check target.
MAKE_CHECK = re.compile(r"(?:^|[\s;&|(])make(?:\.exe)?\s+(?:-\S+\s+)*(?:build|lint|test)(?=$|[\s;&|)])")


def run(*args, check=True):
    result = subprocess.run(list(args), cwd=ROOT, capture_output=True, text=True)
    if check and result.returncode != 0:
        raise RuntimeError(f"{' '.join(args)} failed: {result.stderr.strip()}")
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


def pr_body(branch, head):
    subject = run("git", "log", "-1", "--format=%s", head).stdout.strip()
    commits = run("git", "log", "--format=- %h %s", f"origin/main..{head}", check=False).stdout.strip()
    return (
        f"## {subject}\n\n"
        f"Opened automatically by `.claude/hooks/open_pr_when_green.py` because all three CLAUDE.md checks "
        f"passed on `{head[:7]}`:\n\n"
        "| Check | Result |\n|---|---|\n"
        "| `make build` | Build succeeded |\n"
        "| `make lint` | Lint succeeded (zero warnings) |\n"
        "| `make test` | All tests passed (JUnit, pytest, Playwright) |\n\n"
        f"### Commits\n{commits or '- (none listed)'}\n\n"
        "Review and merge on GitHub. The agent never pushes to main.\n\n"
        "🤖 Generated with [Claude Code](https://claude.com/claude-code)\n"
    )


def main():
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return 0
    command = str((payload.get("tool_input") or {}).get("command", ""))
    if not MAKE_CHECK.search(command):
        return 0

    checks_dir = ROOT / run("git", "rev-parse", "--git-dir").stdout.strip() / "checks"
    head = run("git", "rev-parse", "HEAD").stdout.strip()

    stamps = {}
    for name in CHECKS:
        path = checks_dir / name
        stamps[name] = path.read_text(encoding="utf-8").strip() if path.exists() else "missing"
    not_passed = [name for name in CHECKS if stamps[name] != head]
    if not_passed:
        log(checks_dir, f"skip {head[:7]}: not yet passed on this commit: {', '.join(not_passed)}")
        return 0

    branch = run("git", "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    if branch in ("main", "HEAD"):
        log(checks_dir, f"skip {head[:7]}: on '{branch}'; PRs need a feature branch")
        return 0

    pr_marker = checks_dir / "pr"
    if pr_marker.exists() and pr_marker.read_text(encoding="utf-8").strip() == head:
        return 0

    if DRY_RUN:
        log(checks_dir, f"dry run {head[:7]}: would push {branch} and open a PR to main")
        tell(f"[dry run] All checks passed on {branch} ({head[:7]}); would push the branch and open a PR to main.")
        return 0

    push = run("git", "push", "-u", "origin", branch, check=False)
    if push.returncode != 0:
        log(checks_dir, f"fail {head[:7]}: branch push rejected: {push.stderr.strip()}")
        tell(f"All checks passed, but pushing branch {branch} failed: {push.stderr.strip()}")
        return 0

    existing = run("gh", "pr", "view", branch, "--json", "url,state", check=False)
    if existing.returncode == 0 and json.loads(existing.stdout).get("state") == "OPEN":
        url = json.loads(existing.stdout)["url"]
        message = f"All checks passed on {branch} ({head[:7]}). Pushed to the existing PR: {url}"
    else:
        subject = run("git", "log", "-1", "--format=%s", head).stdout.strip()
        created = run("gh", "pr", "create", "--base", "main", "--head", branch,
                      "--title", subject, "--body", pr_body(branch, head), check=False)
        if created.returncode != 0:
            log(checks_dir, f"fail {head[:7]}: gh pr create: {created.stderr.strip()}")
            tell(f"All checks passed and {branch} was pushed, but opening the PR failed: {created.stderr.strip()}")
            return 0
        url = created.stdout.strip().splitlines()[-1]
        message = f"All checks passed on {branch} ({head[:7]}), so a PR to main was opened: {url}"

    pr_marker.write_text(head, encoding="utf-8")
    log(checks_dir, f"pr {head[:7]} from {branch}: {url}")
    tell(message + " Review and merge it on GitHub.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # A hook must never break the session; report and carry on.
        print(json.dumps({"systemMessage": f"open_pr_when_green hook error: {error}"}))
        sys.exit(0)
