"""The eval checks' helpers, tested without a model (deploy bug B8).

On PR #10, fix-search-sql failed and the reported reason was a harmless Hibernate WARN line that happens to contain
"SqlExceptionHelper", not the failing test. The reason has to point at what failed.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from checks import failure_reason  # noqa: E402

MAVEN_OUTPUT = """
2026-11-07T12:12:19.084Z  WARN 2691 --- [social-grid] [main] o.h.engine.jdbc.spi.SqlExceptionHelper   : SQL Warning Code: 0
[INFO] Running com.socialgrid.service.impl.UserServiceImplTest
[ERROR] Tests run: 19, Failures: 0, Errors: 2, Skipped: 0, Time elapsed: 0.197 s <<< FAILURE! -- in com.socialgrid.service.impl.UserServiceImplTest
[ERROR] com.socialgrid.service.impl.UserServiceImplTest.searchTrimsTheQuery -- Time elapsed: 0.002 s <<< ERROR!
java.lang.NullPointerException: Cannot invoke "JdbcTemplate.query(...)" because "this.jdbcTemplate" is null
[ERROR] Failed to execute goal org.apache.maven.plugins:maven-surefire-plugin:3.5.6:test -> [Help 1]
"""


def test_the_reason_names_the_failing_tests_not_a_log_warning():
    reason = failure_reason(MAVEN_OUTPUT.splitlines())
    assert "SqlExceptionHelper" not in reason
    assert "Tests run: 19, Failures: 0, Errors: 2" in reason
    assert "searchTrimsTheQuery" in reason


def test_a_compile_error_is_reported():
    out = ["[INFO] Compiling 40 source files", "[ERROR] COMPILATION ERROR :",
           "[ERROR] /repo/src/main/java/com/socialgrid/X.java:[12,5] cannot find symbol"]
    assert "X.java:[12,5] cannot find symbol" in failure_reason(out)


def test_nothing_recognisable_falls_back_to_the_exit_code():
    assert failure_reason(["[INFO] something"], exit_code=1) == "mvn exit 1"
