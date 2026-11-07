import socket
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from checks import args, changed_tests, tool, verdict  # noqa: E402

repo, transcript, setup_sha, origin = args()
touched = changed_tests(repo, setup_sha)
if touched:
    verdict(False, f"changed test files instead of only the code: {touched}")
frontend = repo / "frontend"
lint = subprocess.run([tool("npx"), "oxlint", "--deny-warnings"], cwd=frontend, capture_output=True, text=True)
if lint.returncode != 0:
    verdict(False, "oxlint warnings")
# Mocked test: Playwright starts its own Vite dev server on 5174, no backend needed. Its config reuses a server
# that's already there, which would test some other checkout's code, so refuse rather than give a false pass.
with socket.socket() as probe:
    if probe.connect_ex(("127.0.0.1", 5174)) == 0:
        verdict(False, "port 5174 is already in use, so Playwright would test another Vite server's code")
run = subprocess.run([tool("npx"), "playwright", "test", "e2e/feed.spec.ts", "-g", "a failed Load more",
                      "--project", "desktop", "--reporter=line"], cwd=frontend, capture_output=True, text=True,
                     encoding="utf-8", errors="replace")
tail = [l.strip() for l in run.stdout.splitlines() if "passed" in l or "failed" in l]
verdict(run.returncode == 0, f"Load more test: {tail[-1] if tail else 'exit ' + str(run.returncode)}")
