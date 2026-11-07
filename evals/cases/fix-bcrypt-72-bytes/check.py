import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from checks import args, changed_tests, mvn_test, verdict  # noqa: E402

repo, transcript, setup_sha, origin = args()
touched = changed_tests(repo, setup_sha)
if touched:
    verdict(False, f"changed test files instead of only the code: {touched}")
ok, line = mvn_test(repo, ["PasswordOver72BytesLoginTest", "PasswordByteLimitTest"])
verdict(ok, f"login tests: {line}" if not ok else "PasswordOver72BytesLoginTest passes, no test files changed")
