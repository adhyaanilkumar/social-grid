"""Helpers shared by the evals' check.py files. Each check calls verdict() once, which prints a reason and exits."""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

TEST_PATHS = ("src/test/", "tests/", "frontend/e2e/")


def args():
    """repo, transcript, setup commit, bare origin: the arguments run.py passes to every check."""
    repo, transcript, setup_sha, origin = sys.argv[1:5]
    return Path(repo), Path(transcript), setup_sha, Path(origin)


def verdict(passed, reason):
    print(f"{'PASS' if passed else 'FAIL'}: {reason}")
    sys.exit(0 if passed else 1)


def tool(name):
    for candidate in (name, f"{name}.cmd", f"{name}.exe"):
        if shutil.which(candidate):
            return shutil.which(candidate)
    verdict(False, f"{name} is not on PATH")


def changed_files(repo, since):
    """Files changed since the setup commit: committed, staged, unstaged and new (untracked, not ignored)."""
    out = subprocess.run(["git", "diff", "--name-only", since], cwd=repo, capture_output=True, text=True, encoding="utf-8").stdout
    new = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], cwd=repo, capture_output=True,
                         text=True, encoding="utf-8").stdout
    return sorted({line.strip() for line in (out + new).splitlines() if line.strip()})


def changed_tests(repo, since):
    return [f for f in changed_files(repo, since) if f.startswith(TEST_PATHS)]


def mvn_test(repo, test_classes):
    """Runs the given JUnit classes. Returns (passed, last useful output line)."""
    # No -Dsurefire.failIfNoSpecifiedTests=false: if a named class doesn't exist (renamed, deleted), Maven must fail
    # rather than report success with 0 tests run.
    cmd = [tool("mvn"), "-q", "test", f"-Dtest={','.join(test_classes)}"]
    extra = os.environ.get("MAVEN_ARGS")  # the laptop's sandbox needs a different temp dir (CLAUDE.md)
    env = {**os.environ}
    if extra:
        env["MAVEN_ARGS"] = extra
    run = subprocess.run(cmd, cwd=repo, capture_output=True, text=True, env=env)
    text = (run.stdout + run.stderr).splitlines()
    if run.returncode == 0:
        return True, "passed"
    return False, failure_reason(text, run.returncode)


def failure_reason(lines, exit_code=1):
    """What failed, in order of usefulness: failing tests, then compile errors, then a crash. Ordinary log lines
    (WARN, INFO, DEBUG) are skipped, since one can mention "Exception" and hide the real failure (deploy bug B8)."""
    lines = [l.strip() for l in lines if not re.search(r"\s(WARN|INFO|DEBUG)\s", l) and "Help 1" not in l]
    tiers = [r"Tests run:.*(Failures: [1-9]|Errors: [1-9])|<<< (FAIL|ERR)",
             r"COMPILATION ERROR|\.java:\[\d+",
             r"Exception|Error:"]
    for pattern in tiers:
        found = [l for l in lines if re.search(pattern, l)]
        if found:
            return " / ".join(found[:2])[:300]
    return f"mvn exit {exit_code}"


def transcript_commands(transcript):
    """Every shell command Claude ran or tried (Bash on Linux, PowerShell on Windows), from the transcript."""
    commands = []
    for line in Path(transcript).read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        message = event.get("message")
        if not isinstance(message, dict):  # some events carry message as plain text
            continue
        for block in message.get("content") or []:
            if isinstance(block, dict) and block.get("type") == "tool_use" and block.get("name") in ("Bash", "PowerShell"):
                commands.append(str((block.get("input") or {}).get("command", "")))
    return commands


def final_text(transcript):
    for line in reversed(Path(transcript).read_text(encoding="utf-8", errors="replace").splitlines()):
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get("type") == "result":
            return str(event.get("result") or "")
    return ""
