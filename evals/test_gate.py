"""The evals gate, tested without a model (deploy bug B7, found by Claude's review of PR #9).

A case job can die before writing its result file (setup-java fails, a timeout, an early exit). The gate used to
score only the files that arrived, so 7 passing results with a must-pass case missing still read "Gate: PASSED".
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run  # noqa: E402


def record(case, passed=True, must_pass=False):
    return {"case": case, "passed": passed, "must_pass": must_pass, "reason": "", "claude": {}}


EXPECTED = ["a-case", "b-must", "c-case", "d-case"]
ALL_PASS = [record("a-case"), record("b-must", must_pass=True), record("c-case"), record("d-case")]


def test_all_cases_present_and_passing_passes():
    assert run.gate(ALL_PASS, expected=EXPECTED)


def test_a_missing_must_pass_case_fails_the_gate():
    without_must = [r for r in ALL_PASS if r["case"] != "b-must"]
    assert not run.gate(without_must, expected=EXPECTED)


def test_a_missing_ordinary_case_fails_the_gate():
    # Unknown means not passed: a case with no result can't count towards the pass rate either.
    without_one = [r for r in ALL_PASS if r["case"] != "c-case"]
    assert not run.gate(without_one, expected=EXPECTED)


def test_no_results_at_all_fails():
    assert not run.gate([], expected=EXPECTED)


def test_a_failed_must_pass_case_still_fails():
    failed = [record("b-must", passed=False, must_pass=True) if r["case"] == "b-must" else r for r in ALL_PASS]
    assert not run.gate(failed, expected=EXPECTED)
