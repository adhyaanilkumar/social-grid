"""Evals for Claude's setup in this repo (deploy-plan.md D4; playbook "Continuous evals in CI").

A regular test checks the code. An eval checks that Claude, as configured here (CLAUDE.md, REVIEW.md, .claude/ and the
pinned model), still does real tasks properly. Each case in evals/cases/<name>/ is a past task with its answer key:
  case.json   prompt, tools Claude may use, turn cap, whether the case must always pass, and what it needs (java, node)
  setup.patch optional; applied first, for example to put a fixed bug back
  check.py    judges the result; exit code 0 means pass, and it prints one line saying why

Safety: every case runs in a throwaway clone of the commit under test, whose "origin" is a local bare repo, so a push
or anything else Claude does can't reach GitHub. PR_HOOK_DRY_RUN=1 keeps the PR hook from acting.

Usage:
  python evals/run.py                       run every case, then apply the gate
  python evals/run.py --case fix-truncated-jpeg [--case ...]
  python evals/run.py --list                print the case names as JSON (CI builds its matrix from this)
  python evals/run.py --gate results/*.json apply the gate to results from separate runs (CI)
Results go to evals/results/<case>.json, plus the full transcript in <case>.jsonl.
On Windows, if your user folder's path has a space, set EVAL_WORKDIR to a folder without spaces (e.g. C:\\git\\.eval-work).
EVAL_KEEP=1 keeps a failed case's folder for inspection.
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

EVALS = Path(__file__).resolve().parent
ROOT = EVALS.parent
CASES = EVALS / "cases"
RESULTS = EVALS / "results"
# Pinned on purpose: changing the model is a change to Claude's setup, so it goes through a PR and these evals.
MODEL = "claude-sonnet-5-5"
PASS_RATE = 0.75


def git(*args, cwd, check=True):
    return subprocess.run(["git", *args], cwd=cwd, check=check, capture_output=True, text=True,
                          encoding="utf-8").stdout.strip()


def which(name):
    for candidate in (name, f"{name}.cmd", f"{name}.exe"):
        found = shutil.which(candidate)
        if found:
            return found
    raise SystemExit(f"{name} is not on PATH")


def prepare(case_dir, spec, work):
    """Clone HEAD into work/repo with a local bare origin, apply the setup patch, and return the setup commit."""
    head = git("rev-parse", "HEAD", cwd=ROOT)
    repo, origin = work / "repo", work / "origin.git"
    # LF checkout on every OS, so setup patches apply the same on Windows as on Linux.
    subprocess.run(["git", "clone", "-q", "-c", "core.autocrlf=false", "--no-hardlinks", str(ROOT), str(repo)],
                   check=True)
    git("checkout", "-q", "-B", spec.get("branch", "eval-work"), head, cwd=repo)
    git("config", "user.name", "eval", cwd=repo)
    git("config", "user.email", "eval@example.invalid", cwd=repo)
    patch = case_dir / "setup.patch"
    if patch.exists():
        git("apply", "--whitespace=nowarn", str(patch), cwd=repo)
        git("commit", "-q", "-am", f"eval setup: {case_dir.name}", cwd=repo)
    subprocess.run(["git", "clone", "-q", "--bare", str(repo), str(origin)], check=True)
    git("remote", "set-url", "origin", str(origin), cwd=repo)
    git("push", "-q", "--force", "origin", "HEAD:refs/heads/main", cwd=repo)
    if "node" in spec.get("needs", []):
        # A clean install, as in CI. Linking another checkout's node_modules doesn't work: Vite resolves the link to
        # its real path outside the project and refuses to serve those files, so the page stays blank.
        subprocess.run([which("npm"), "ci", "--silent", "--no-audit", "--no-fund"], cwd=repo / "frontend", check=True)
    return git("rev-parse", "HEAD", cwd=repo)


def run_claude(spec, repo, transcript):
    cmd = [which("claude"), "-p", spec["prompt"], "--model", MODEL, "--max-turns", str(spec.get("max_turns", 25)),
           "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits",
           "--allowedTools", ",".join(spec.get("allowed_tools", ["Read", "Edit", "Write", "Glob", "Grep"]))]
    env = {**os.environ, "PR_HOOK_DRY_RUN": "1"}
    with open(transcript, "w", encoding="utf-8") as out:
        try:
            subprocess.run(cmd, cwd=repo, env=env, stdout=out, stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                           timeout=spec.get("timeout_minutes", 15) * 60)
        except subprocess.TimeoutExpired:
            return {"timed_out": True}
    result = {}
    for line in Path(transcript).read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get("type") == "result":
            result = {k: event.get(k) for k in ("subtype", "is_error", "num_turns", "duration_ms", "result")}
            result["permission_denials"] = len(event.get("permission_denials") or [])
    return result


def run_case(name):
    case_dir = CASES / name
    spec = json.loads((case_dir / "case.json").read_text(encoding="utf-8"))
    RESULTS.mkdir(exist_ok=True)
    transcript = RESULTS / f"{name}.jsonl"
    record = {"case": name, "must_pass": spec.get("must_pass", False), "model": MODEL}
    started = time.monotonic()
    # The work folder's path must have no 8.3 short names (Vite resolves them and refuses the files) and no spaces
    # (Maven's test fork fails with "Could not find or load main class"). /tmp in CI is fine. On a Windows laptop
    # whose user folder has a space, set EVAL_WORKDIR, e.g. C:\git\.eval-work.
    base = os.environ.get("EVAL_WORKDIR")
    if base:
        Path(base).mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix=f"eval-{name}-", dir=base)).resolve()
    try:
        if " " in str(work):
            record.update(passed=False, reason=f"SETUP FAILED: work folder has a space ({work}); set EVAL_WORKDIR")
            return record
        try:
            setup_sha = prepare(case_dir, spec, work)
        except subprocess.CalledProcessError as error:
            # A broken case, not a Claude failure, but it still fails the run so it gets fixed.
            record.update(passed=False, reason=f"SETUP FAILED: {error.stderr or error}")
            return record
        record["claude"] = run_claude(spec, work / "repo", transcript)
        # The checks run model-written code (tests, pom.xml), so they don't get the Claude token.
        no_token = {k: v for k, v in os.environ.items() if k != "CLAUDE_CODE_OAUTH_TOKEN"}
        check = subprocess.run([sys.executable, str(case_dir / "check.py"), str(work / "repo"), str(transcript),
                                setup_sha, str(work / "origin.git")], capture_output=True, text=True,
                               encoding="utf-8", errors="replace", env=no_token)
        record.update(passed=check.returncode == 0,
                      reason=(check.stdout.strip().splitlines() or [check.stderr.strip()[-300:]])[-1])
        return record
    finally:
        record["seconds"] = round(time.monotonic() - started)
        (RESULTS / f"{name}.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
        if os.environ.get("EVAL_KEEP") == "1" and not record.get("passed"):
            print(f"kept for inspection: {work}")
        else:
            shutil.rmtree(work, ignore_errors=True)


def gate(records, expected=None):
    # Every expected case must have a result. A case job can die before writing one (setup failure, timeout); scoring
    # only the files that arrived let a missing must-pass case read "PASSED" (deploy bug B7). Missing means failed.
    present = {r["case"] for r in records}
    missing = sorted(set(expected or []) - present)
    for name in missing:
        spec_file = CASES / name / "case.json"
        must = json.loads(spec_file.read_text(encoding="utf-8")).get("must_pass", False) if spec_file.exists() else False
        records = records + [{"case": name, "must_pass": must, "passed": False, "reason": "NO RESULT: the case never finished"}]
    passed = sum(r["passed"] for r in records)
    rate = passed / len(records) if records else 0
    must_failed = [r["case"] for r in records if r["must_pass"] and not r["passed"]]
    lines = [f"## Evals: {passed}/{len(records)} passed ({rate:.0%}), model {MODEL}", "",
             "| Case | Must pass | Result | Turns | Seconds | Why |", "|---|---|---|---|---|---|"]
    for r in sorted(records, key=lambda r: r["case"]):
        turns = (r.get("claude") or {}).get("num_turns", "")
        lines.append(f"| {r['case']} | {'yes' if r['must_pass'] else 'no'} | {'PASS' if r['passed'] else 'FAIL'} "
                     f"| {turns} | {r.get('seconds', '')} | {str(r.get('reason', '')).replace('|', '/')[:160]} |")
    ok = bool(records) and not missing and not must_failed and rate >= PASS_RATE
    lines += ["", f"**Gate: {'PASSED' if ok else 'FAILED'}** (every must-pass case passes, and at least "
                  f"{PASS_RATE:.0%} overall)" + (f". Must-pass failures: {', '.join(must_failed)}" if must_failed else "")
              + (f". No result: {', '.join(missing)}" if missing else "")]
    report = "\n".join(lines)
    print(report)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
            summary.write(report + "\n")
    return ok


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", action="append")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--gate", nargs="*")
    args = parser.parse_args()
    names = sorted(p.parent.name for p in CASES.glob("*/case.json"))
    if args.list:
        print(json.dumps(names))
        return 0
    if args.gate is not None:
        files = [f for pattern in args.gate for f in glob.glob(pattern)]
        return 0 if gate([json.loads(Path(f).read_text(encoding="utf-8")) for f in files], expected=names) else 1
    chosen = args.case or names
    records = [run_case(name) for name in chosen]
    return 0 if gate(records, expected=chosen) else 1


if __name__ == "__main__":
    sys.exit(main())
