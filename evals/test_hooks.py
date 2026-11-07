"""The PR hook, tested without a model (deploy-plan.md D4). Runs in the evals workflow on every change to Claude's setup.

Incident 2026-11-07: the old hook matched any "make" substring, so a read-only command mentioning make-test-2.log
pushed V0 straight to main. These tests feed the hook sample tool calls in dry-run mode, in a throwaway git repo.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

HOOK = Path(__file__).resolve().parents[1] / ".claude" / "hooks" / "open_pr_when_green.py"


def git(repo, *args):
    return subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True, text=True).stdout.strip()


@pytest.fixture
def repo(tmp_path):
    git(tmp_path, "init", "-q", "-b", "feature")
    git(tmp_path, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "x")
    return tmp_path


def stamp_all(repo, value=None):
    checks = repo / ".git" / "checks"
    checks.mkdir(parents=True, exist_ok=True)
    for name in ("build", "lint", "test"):
        (checks / name).write_text(value or git(repo, "rev-parse", "HEAD"), encoding="utf-8")


def run_hook(repo, command):
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
    env = {**os.environ, "CLAUDE_PROJECT_DIR": str(repo), "PR_HOOK_DRY_RUN": "1"}
    out = subprocess.run([sys.executable, str(HOOK)], input=payload, capture_output=True, text=True, env=env)
    assert out.returncode == 0, out.stderr
    log = repo / ".git" / "checks" / "hook.log"
    return out.stdout, (log.read_text(encoding="utf-8") if log.exists() else "")


@pytest.mark.parametrize("command", [
    "cat make-test-2.log",                      # the incident
    "grep -n 'make test' CLAUDE.md",
    "ls make-build/",
    "echo remake test",
])
def test_text_that_only_mentions_make_does_nothing(repo, command):
    stamp_all(repo)
    stdout, log = run_hook(repo, command)
    assert stdout == "" and log == ""


@pytest.mark.parametrize("command", ["make test", "make lint", "cd x && make build", "make.exe test", "make -j2 test"])
def test_real_make_checks_trigger_it(repo, command):
    stamp_all(repo)
    stdout, log = run_hook(repo, command)
    assert "dry run" in log and "would push feature and open a PR" in log


def test_it_never_acts_on_main(repo):
    git(repo, "checkout", "-q", "-b", "main")
    stamp_all(repo)
    stdout, log = run_hook(repo, "make test")
    assert "on 'main'" in log and "dry run" not in log


def test_it_waits_until_all_three_checks_pass_on_this_commit(repo):
    stamp_all(repo, value="dirty")
    stdout, log = run_hook(repo, "make test")
    assert "not yet passed on this commit: build, lint, test" in log and "dry run" not in log
