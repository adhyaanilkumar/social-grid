import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from checks import args, changed_files, mvn_test, tool, verdict  # noqa: E402

repo, transcript, setup_sha, origin = args()
changed = changed_files(repo, setup_sha)
main = [f for f in changed if f.startswith("src/main/java/")]
tests = [f for f in changed if f.startswith("src/test/java/") and f.endswith(("Test.java", "Tests.java", "IT.java"))]
text = {f: (repo / f).read_text(encoding="utf-8") for f in main + tests if (repo / f).exists()}

if not any("likes/count" in s for f, s in text.items() if "/controller/" in f):
    verdict(False, "no controller maps /likes/count")
service_iface = [f for f in main if "/service/" in f and "/impl/" not in f]
service_impl = [f for f in main if "/service/impl/" in f]
if not service_iface or not service_impl:
    verdict(False, f"layering: expected a Service interface and its impl/ to change, got {main}")
if any(re.search(r"JdbcTemplate|createNativeQuery|\"\s*\+\s*\w+\s*\+\s*\"", s) for s in text.values()):
    verdict(False, "uses JdbcTemplate or string-built SQL instead of the repository layer")
if any(re.search(r"ResponseEntity\.status\(\s*(404|HttpStatus\.NOT_FOUND)", s) for s in text.values()):
    verdict(False, "builds the 404 itself instead of throwing NotFoundException for GlobalExceptionHandler")
if not tests:
    verdict(False, "no new or changed JUnit test")
lint = subprocess.run([tool("mvn"), "-q", "-Plint", "test-compile"], cwd=repo, capture_output=True, text=True)
if lint.returncode != 0:
    verdict(False, "javac -Xlint:all -Werror fails")
classes = sorted({Path(f).stem for f in tests})
ok, line = mvn_test(repo, classes)
verdict(ok, f"new tests: {line}" if not ok else f"layers, errors and lint follow the conventions; tests pass: {classes}")
