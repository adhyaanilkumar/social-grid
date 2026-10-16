"""Black-box tests for POST /api/auth/register error bodies (AD-263), run against the live stack.

Every name starts with t263a_ plus a random suffix, so reruns and parallel testers never collide.
"""
import os
import random
import string
import uuid

import pytest

from helpers import BASE, csrf_session, login
REGISTER = f"{BASE}/api/auth/register"
PASSWORD = "password1"


def uid(n=8):
    return uuid.uuid4().hex[:n]


def fresh():
    s = uid()
    return {"username": f"t263a_{s}", "password": PASSWORD, "email": f"t263a_{s}@example.com"}


def register(body):
    # Register is a POST, so it needs the CSRF cookie + header like every other non-GET (AD-264).
    return csrf_session().post(REGISTER, json=body)


def register_ok(body=None):
    body = body or fresh()
    r = register(body)
    assert r.status_code == 201, r.text
    return body, r.json()


def assert_field_error(r, field, message):
    assert r.status_code == 400, r.text
    body = r.json()
    assert body["status"] == 400
    assert body["error"] == "Bad Request"
    assert body["fieldErrors"] == {field: message}


# ---------- success ----------

def test_success_returns_201_with_user_and_no_password():
    body, user = register_ok()
    assert isinstance(user["id"], int)
    assert user["username"] == body["username"]
    assert user["email"] == body["email"]
    assert "password" not in user
    assert "fieldErrors" not in user


# ---------- 400 per field ----------

USERNAME_REQUIRED = "Username is required"
USERNAME_SIZE = "Username must be 3–30 characters"
PASSWORD_REQUIRED = "Password is required"
PASSWORD_SIZE = "Password must be 8–72 characters"
EMAIL_REQUIRED = "Email is required"
EMAIL_INVALID = "Enter a valid email address"


@pytest.mark.parametrize("field,value,message", [
    ("username", "", USERNAME_REQUIRED),
    ("username", "   ", USERNAME_REQUIRED),
    ("username", "\t\t\t", USERNAME_REQUIRED),
    ("username", None, USERNAME_REQUIRED),
    ("username", "ab", USERNAME_SIZE),
    ("password", "", PASSWORD_REQUIRED),
    ("password", "        ", PASSWORD_REQUIRED),
    ("password", None, PASSWORD_REQUIRED),
    ("password", "short", PASSWORD_SIZE),
    ("email", "", EMAIL_REQUIRED),
    ("email", "   ", EMAIL_REQUIRED),
    ("email", None, EMAIL_REQUIRED),
    ("email", "not-an-email", EMAIL_INVALID),
    ("email", "a b@example.com", EMAIL_INVALID),
    ("email", " padded@example.com ", EMAIL_INVALID),
])
def test_single_bad_field(field, value, message):
    body = fresh()
    body[field] = value
    assert_field_error(register(body), field, message)


def test_missing_key_is_required():
    body = fresh()
    del body["email"]
    assert_field_error(register(body), "email", EMAIL_REQUIRED)


def test_all_fields_blank_lists_each_once_with_required_message():
    r = register({"username": "", "password": "", "email": ""})
    assert r.status_code == 400
    assert r.json()["fieldErrors"] == {
        "username": USERNAME_REQUIRED,
        "password": PASSWORD_REQUIRED,
        "email": EMAIL_REQUIRED,
    }


def test_empty_object_lists_all_three():
    r = register({})
    assert r.status_code == 400
    assert set(r.json()["fieldErrors"]) == {"username", "password", "email"}


# ---------- boundaries ----------

def name_of_length(n):
    base = f"t263a_{uid(24)}"
    return (base * 3)[:n] if n >= 6 else base[:n]


@pytest.mark.parametrize("length,ok", [(2, False), (3, True), (30, True), (31, False)])
def test_username_length_boundaries(length, ok):
    body = fresh()
    # Short names can't carry the prefix, so make them random to avoid clashes.
    body["username"] = name_of_length(length) if length >= 6 else "".join(
        random.choices(string.ascii_letters + string.digits, k=length))
    r = register(body)
    if ok:
        assert r.status_code == 201, r.text
    else:
        assert_field_error(r, "username", USERNAME_SIZE)


@pytest.mark.parametrize("length,ok", [(7, False), (8, True), (72, True), (73, False)])
def test_password_length_boundaries(length, ok):
    body = fresh()
    body["password"] = "p" * length
    r = register(body)
    if ok:
        assert r.status_code == 201, r.text
    else:
        assert_field_error(r, "password", PASSWORD_SIZE)


def test_registered_72_char_password_can_log_in():
    body = fresh()
    body["password"] = "p" * 72
    register_ok(body)
    _, r = login(body["username"], body["password"])
    assert r.status_code == 200, r.text


# ---------- 409 duplicates ----------

def test_duplicate_username_is_409_on_username():
    first, _ = register_ok()
    second = fresh()
    second["username"] = first["username"]
    r = register(second)
    assert r.status_code == 409
    body = r.json()
    assert body["error"] == "Conflict"
    assert body["message"] == "Username already taken"
    assert body["fieldErrors"] == {"username": "Username already taken"}


def test_duplicate_email_is_409_on_email():
    first, _ = register_ok()
    second = fresh()
    second["email"] = first["email"]
    r = register(second)
    assert r.status_code == 409
    assert r.json()["fieldErrors"] == {"email": "Email already registered"}


def test_duplicate_username_and_email_reports_username_only():
    first, _ = register_ok()
    r = register(dict(first))
    assert r.status_code == 409
    assert r.json()["fieldErrors"] == {"username": "Username already taken"}


def test_validation_runs_before_duplicate_check():
    first, _ = register_ok()
    r = register({"username": first["username"], "password": "x", "email": first["email"]})
    assert_field_error(r, "password", PASSWORD_SIZE)


# ---------- non-field errors keep the old shape ----------

@pytest.mark.parametrize("raw", ['{"username":', "[]", ""])
def test_malformed_json_is_400_without_field_errors(raw):
    r = csrf_session().post(REGISTER, data=raw, headers={"Content-Type": "application/json"})
    assert r.status_code == 400
    body = r.json()
    assert body["message"] == "Malformed request"
    assert "fieldErrors" not in body


@pytest.fixture
def user():
    body, created = register_ok()
    s, r = login(body["username"], body["password"])
    assert r.status_code == 200, r.text
    return {**body, "id": created["id"], "session": s}


def test_follow_twice_is_409_without_field_errors(user):
    other, created = register_ok()
    url = f"{BASE}/api/users/{created['id']}/follow"
    assert user["session"].post(url).status_code == 201
    r = user["session"].post(url)
    assert r.status_code == 409
    assert r.json()["message"] == "Already following"
    assert "fieldErrors" not in r.json()


def test_like_twice_is_409_without_field_errors(user):
    post = user["session"].post(f"{BASE}/api/posts",
                                json={"mediaUrl": "https://example.com/p.jpg", "caption": "t263a"})
    assert post.status_code == 201, post.text
    url = f"{BASE}/api/posts/{post.json()['postId']}/likes"
    assert user["session"].post(url).status_code == 201
    r = user["session"].post(url)
    assert r.status_code == 409
    assert r.json()["message"] == "Post already liked"
    assert "fieldErrors" not in r.json()


def test_not_found_has_no_field_errors(user):
    r = user["session"].get(f"{BASE}/api/users/t263a_nobody_{uid()}/profile")
    assert r.status_code == 404
    assert "fieldErrors" not in r.json()


def test_update_email_to_taken_address_is_409_on_email(user):
    other, _ = register_ok()
    r = user["session"].put(f"{BASE}/api/users/me/email", json={"email": other["email"]})
    assert r.status_code == 409
    assert r.json()["fieldErrors"] == {"email": "Email already registered"}


# ---------- known bugs found while probing (expected to fail until fixed) ----------

@pytest.mark.xfail(strict=True, reason="BUG: bcrypt rejects >72 bytes; @Size counts chars, so this is a 500")
def test_password_over_72_bytes_but_under_72_chars_is_400_not_500():
    body = fresh()
    body["password"] = "é" * 40  # 40 chars, 80 UTF-8 bytes
    r = register(body)
    assert r.status_code == 400, r.text
    assert r.json()["fieldErrors"] == {"password": PASSWORD_SIZE}


@pytest.mark.xfail(strict=True, reason="BUG: NUL byte reaches Postgres and is mapped to a generic 409")
def test_nul_in_username_is_400_not_409():
    body = fresh()
    body["username"] = body["username"] + "\u0000"
    r = register(body)
    assert r.status_code == 400, r.text
