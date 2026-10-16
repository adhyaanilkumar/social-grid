"""Black-box tests for session login (AD-264): POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout.

Every user created here starts with t264a_ plus a random suffix, so reruns never collide.
"""
import statistics
import time
import uuid

import pytest
import requests

from conftest import make_user
from helpers import BASE, PROXY, CsrfSession, csrf_session, login, login_ok

LOGIN = "/api/auth/login"
ME = "/api/auth/me"
LOGOUT = "/api/auth/logout"
BAD_CREDS = {"status": 401, "error": "Unauthorized", "message": "Invalid username/email or password"}
LOG_IN_TO_CONTINUE = {"status": 401, "error": "Unauthorized", "message": "Log in to continue"}
IDENTIFIER_REQUIRED = "Username or email is required"
PASSWORD_REQUIRED = "Password is required"


@pytest.fixture
def user():
    return make_user("t264a")


def assert_bad_creds(r):
    assert r.status_code == 401, r.text
    assert r.json() == BAD_CREDS
    assert "WWW-Authenticate" not in r.headers


def set_cookie(r, name):
    """The raw Set-Cookie header for one cookie name, or None."""
    for value in r.raw.headers.getlist("Set-Cookie"):
        if value.startswith(f"{name}="):
            return value
    return None


def bare_session():
    """A session holding the XSRF-TOKEN cookie that does NOT send the header (for the 403 tests)."""
    s = requests.Session()
    s.get(f"{BASE}{ME}", timeout=10)
    return s


# ---------- success ----------

@pytest.mark.parametrize("by", ["username", "email"])
def test_login_returns_user_and_session(user, by):
    s, r = login(user[by], user["password"])
    assert r.status_code == 200, r.text
    assert r.json() == {"id": user["id"], "username": user["username"], "email": user["email"]}
    assert "password" not in r.text
    me = s.get(ME)
    assert me.status_code == 200
    assert me.json()["id"] == user["id"]


def test_login_cookie_attributes(user):
    s = csrf_session()
    r = s.post(LOGIN, json={"identifier": user["username"], "password": user["password"]})
    cookie = set_cookie(r, "JSESSIONID")
    assert cookie, r.headers
    attrs = [a.strip().lower() for a in cookie.split(";")]
    assert "httponly" in attrs
    assert "samesite=lax" in attrs
    max_age = [int(a.split("=")[1]) for a in attrs if a.startswith("max-age=")]
    assert max_age and abs(max_age[0] - 604800) <= 5


def test_session_id_changes_on_login(user):
    s = csrf_session()
    before = s.cookies.get("JSESSIONID")
    assert before, "expected the priming GET to create a pre-login session"
    s.post(LOGIN, json={"identifier": user["username"], "password": user["password"]})
    after = s.cookies.get("JSESSIONID")
    assert after and after != before
    # The pre-login ID (one an attacker could have planted) must not be logged in.
    planted = requests.get(f"{BASE}{ME}", cookies={"JSESSIONID": before}, timeout=10)
    assert planted.status_code == 401


# ---------- bad credentials ----------

def test_wrong_password_and_unknown_user_are_byte_identical(user):
    _, wrong = login(user["username"], "wrong-password")
    _, unknown = login(f"t264a_nobody_{uuid.uuid4().hex[:8]}", "wrong-password")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.content == unknown.content
    assert_bad_creds(wrong)
    assert_bad_creds(unknown)


def test_failed_login_does_not_log_in(user):
    s, r = login(user["username"], "wrong-password")
    assert r.status_code == 401
    assert s.get(ME).status_code == 401


# ---------- 400s ----------

@pytest.mark.parametrize("body,errors", [
    ({"identifier": "", "password": ""}, {"identifier": IDENTIFIER_REQUIRED, "password": PASSWORD_REQUIRED}),
    ({"identifier": "   ", "password": "x"}, {"identifier": IDENTIFIER_REQUIRED}),
    ({"identifier": "someone", "password": "  "}, {"password": PASSWORD_REQUIRED}),
    ({"identifier": None, "password": "x"}, {"identifier": IDENTIFIER_REQUIRED}),
    ({"password": "x"}, {"identifier": IDENTIFIER_REQUIRED}),
    ({"identifier": "someone"}, {"password": PASSWORD_REQUIRED}),
    ({}, {"identifier": IDENTIFIER_REQUIRED, "password": PASSWORD_REQUIRED}),
])
def test_blank_or_missing_fields_are_400(body, errors):
    r = csrf_session().post(LOGIN, json=body)
    assert r.status_code == 400, r.text
    assert r.json()["status"] == 400
    assert r.json()["fieldErrors"] == errors


@pytest.mark.parametrize("raw", ['{"identifier":', "[]", "", "not json"])
def test_malformed_json_is_400(raw):
    r = csrf_session().post(LOGIN, data=raw, headers={"Content-Type": "application/json"})
    assert r.status_code == 400, r.text
    assert r.json()["message"] == "Malformed request"
    assert "fieldErrors" not in r.json()


# ---------- /me and logout ----------

def test_me_before_login_is_401_json_without_www_authenticate():
    r = requests.get(f"{BASE}{ME}", timeout=10)
    assert r.status_code == 401
    assert r.headers["Content-Type"].startswith("application/json")
    assert r.json() == LOG_IN_TO_CONTINUE
    assert "WWW-Authenticate" not in r.headers


def test_me_after_logout_is_401(user):
    s = login_ok(user["username"], user["password"])
    assert s.get(ME).status_code == 200
    r = s.post(LOGOUT)
    assert r.status_code == 200, r.text
    me = s.get(ME)
    assert me.status_code == 401
    assert me.json() == LOG_IN_TO_CONTINUE


def test_old_session_cookie_is_useless_after_logout(user):
    s = login_ok(user["username"], user["password"])
    stolen = s.cookies.get("JSESSIONID")
    assert requests.get(f"{BASE}{ME}", cookies={"JSESSIONID": stolen}, timeout=10).status_code == 200
    assert s.post(LOGOUT).status_code == 200
    replay = requests.get(f"{BASE}{ME}", cookies={"JSESSIONID": stolen}, timeout=10)
    assert replay.status_code == 401


def test_two_sessions_for_same_user_are_independent(user):
    a = login_ok(user["username"], user["password"])
    b = login_ok(user["email"], user["password"])
    assert a.cookies.get("JSESSIONID") != b.cookies.get("JSESSIONID")
    assert a.get(ME).status_code == 200
    assert b.get(ME).status_code == 200
    assert a.post(LOGOUT).status_code == 200
    assert a.get(ME).status_code == 401
    assert b.get(ME).status_code == 200


# ---------- CSRF ----------

def test_login_without_csrf_header_is_403(user):
    r = bare_session().post(f"{BASE}{LOGIN}", json={"identifier": user["username"], "password": user["password"]},
                            timeout=10)
    assert r.status_code == 403
    assert r.json()["status"] == 403
    assert r.json()["error"] == "Forbidden"


def test_login_without_any_cookie_is_403(user):
    r = requests.post(f"{BASE}{LOGIN}", json={"identifier": user["username"], "password": user["password"]},
                      timeout=10)
    assert r.status_code == 403
    assert r.json()["error"] == "Forbidden"


def test_login_with_wrong_csrf_value_is_403(user):
    s = csrf_session()
    r = s.post(LOGIN, json={"identifier": user["username"], "password": user["password"]},
               headers={"X-XSRF-TOKEN": "not-the-token"})
    assert r.status_code == 403
    assert r.json()["error"] == "Forbidden"
    assert s.get(ME).status_code == 401


def test_logout_without_csrf_header_is_403_and_keeps_session(user):
    s = login_ok(user["username"], user["password"])
    raw = requests.Session()
    raw.cookies.update(s.cookies)
    r = raw.post(f"{BASE}{LOGOUT}", timeout=10)
    assert r.status_code == 403
    assert r.json()["error"] == "Forbidden"
    assert s.get(ME).status_code == 200


def test_logout_with_wrong_csrf_value_is_403(user):
    s = login_ok(user["username"], user["password"])
    r = s.post(LOGOUT, headers={"X-XSRF-TOKEN": "nope"})
    assert r.status_code == 403
    assert s.get(ME).status_code == 200


def test_register_without_csrf_is_403():
    r = requests.post(f"{BASE}/api/auth/register", timeout=10,
                      json={"username": f"t264a_{uuid.uuid4().hex[:8]}", "password": "password1",
                            "email": f"t264a_{uuid.uuid4().hex[:8]}@example.com"})
    assert r.status_code == 403


# ---------- HTTP Basic is gone ----------

def test_basic_auth_header_does_not_authenticate(user):
    r = requests.get(f"{BASE}{ME}", auth=(user["username"], user["password"]), timeout=10)
    assert r.status_code == 401
    assert "WWW-Authenticate" not in r.headers


def test_old_get_login_no_longer_returns_user(user):
    r = requests.get(f"{BASE}{LOGIN}", auth=(user["username"], user["password"]), timeout=10)
    assert r.status_code != 200
    assert user["username"] not in r.text
    assert "WWW-Authenticate" not in r.headers


def test_no_www_authenticate_on_bad_login(user):
    _, r = login(user["username"], "wrong-password")
    assert "WWW-Authenticate" not in r.headers


# ---------- through the nginx proxy ----------

def test_full_flow_through_nginx_proxy(user):
    s = CsrfSession(PROXY).prime()
    assert s.cookies.get("XSRF-TOKEN")
    assert s.get(ME).status_code == 401
    r = s.post(LOGIN, json={"identifier": user["email"], "password": user["password"]})
    assert r.status_code == 200, r.text
    assert r.json()["username"] == user["username"]
    cookie = set_cookie(r, "JSESSIONID")
    assert cookie and "HttpOnly" in cookie and "SameSite=Lax" in cookie
    assert s.get(ME).json()["id"] == user["id"]
    assert s.post(LOGOUT).status_code == 200
    assert s.get(ME).status_code == 401


def test_proxy_bad_creds_and_csrf(user):
    _, r = login(user["username"], "wrong-password", base=PROXY)
    assert_bad_creds(r)
    r = requests.post(f"{PROXY}{LOGIN}", json={"identifier": user["username"], "password": user["password"]},
                      timeout=10)
    assert r.status_code == 403


# ---------- edge cases (observed behaviour, recorded as the current contract) ----------

def test_username_is_case_sensitive_at_login(user):
    _, r = login(user["username"].upper(), user["password"])
    assert_bad_creds(r)


def test_email_is_case_sensitive_at_login(user):
    # Observed: emails match exactly, so ALICE@X.COM can't log in as alice@x.com. Design decision.
    _, r = login(user["email"].upper(), user["password"])
    assert_bad_creds(r)


def test_identifier_is_not_trimmed(user):
    # Observed: " name " is not trimmed. Design decision (phone keyboards add trailing spaces).
    _, r = login(f" {user['username']} ", user["password"])
    assert_bad_creds(r)


def test_password_is_not_trimmed(user):
    _, r = login(user["username"], user["password"] + " ")
    assert_bad_creds(r)


@pytest.mark.parametrize("password", ["p" * 73, "p" * 1000, "é" * 40], ids=["73", "1000", "80bytes"])
def test_over_72_byte_password_at_login_is_401_not_500(user, password):
    _, r = login(user["username"], password)
    assert_bad_creds(r)


@pytest.mark.xfail(strict=True, reason="BUG: login silently truncates passwords to 72 bytes, so a 72-char "
                                       "password followed by anything is accepted (related to AD-273)")
def test_72_char_password_plus_extra_is_not_accepted():
    # bcrypt only reads 72 bytes; an implementation that truncates would accept anything after them.
    u = f"t264a_{uuid.uuid4().hex[:8]}"
    r = csrf_session().post("/api/auth/register",
                            json={"username": u, "password": "p" * 72, "email": f"{u}@example.com"})
    assert r.status_code == 201, r.text
    assert login(u, "p" * 72)[1].status_code == 200
    assert_bad_creds(login(u, "p" * 72 + "EXTRA")[1])


@pytest.mark.parametrize("identifier", ["a" * 10_000, "a" * 1_000_000], ids=["10k", "1M"])
def test_very_long_identifier_is_401(identifier):
    _, r = login(identifier, "password1")
    assert_bad_creds(r)


@pytest.mark.parametrize("identifier,password", [
    ("' OR '1'='1", "' OR '1'='1"),
    ("admin'--", "x"),
    ('x"; DROP TABLE users; --', "x"),
    ("%", "password1"),
    ("_", "password1"),
])
def test_sql_like_identifiers_are_plain_401(identifier, password):
    _, r = login(identifier, password)
    assert_bad_creds(r)


def test_non_string_identifier_is_coerced(user):
    # Observed: a JSON number is coerced to a string and just fails as bad credentials.
    r = csrf_session().post(LOGIN, json={"identifier": 123, "password": "password1"})
    assert_bad_creds(r)


def test_timing_unknown_user_vs_wrong_password(user):
    """Rough check only: both paths run one bcrypt compare, so medians should be close. Prints numbers."""
    def median_ms(identifier, n=10):
        times = []
        for _ in range(n):
            s = csrf_session()
            t = time.perf_counter()
            s.post(LOGIN, json={"identifier": identifier, "password": "wrong-password"})
            times.append((time.perf_counter() - t) * 1000)
        return statistics.median(times)

    unknown = median_ms(f"t264a_nobody_{uuid.uuid4().hex[:8]}")
    wrong = median_ms(user["username"])
    print(f"\nlogin timing median: unknown user {unknown:.1f} ms, wrong password {wrong:.1f} ms")
    assert abs(unknown - wrong) < max(unknown, wrong) * 0.5


# ---------- known bugs found while probing (expected to fail until fixed) ----------

@pytest.mark.xfail(strict=True, reason="BUG: a username equal to someone's email hijacks their email login "
                                       "(username is tried first), so the email owner can't log in by email")
def test_username_that_looks_like_another_users_email_does_not_block_email_login():
    victim = make_user("t264a")
    squat = victim["email"]
    assert len(squat) <= 30
    r = csrf_session().post("/api/auth/register", json={
        "username": squat, "password": "password2", "email": f"t264a_{uuid.uuid4().hex[:8]}@example.com"})
    assert r.status_code == 201, r.text
    _, r = login(victim["email"], victim["password"])
    assert r.status_code == 200, r.text
    assert r.json()["id"] == victim["id"]


@pytest.mark.xfail(strict=True, reason="BUG: NUL byte in login identifier reaches Postgres and comes back as a "
                                       "generic 409 Conflict instead of 401 (same root cause as AD-274)")
def test_nul_in_login_identifier_is_401_not_409(user):
    _, r = login(user["username"] + "\u0000", user["password"])
    assert_bad_creds(r)
