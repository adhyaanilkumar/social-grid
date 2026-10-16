"""Pytest fixtures shared across the black-box suite. Plain helpers live in helpers.py."""
import uuid

import pytest

from helpers import BASE, csrf_session, login_ok


@pytest.fixture
def session():
    """An anonymous session primed with the CSRF cookie."""
    return csrf_session()


def make_user(prefix):
    s = uuid.uuid4().hex[:8]
    body = {"username": f"{prefix}_{s}", "password": "password1", "email": f"{prefix}_{s}@example.com"}
    r = csrf_session().post("/api/auth/register", json=body)
    assert r.status_code == 201, r.text
    return {**body, "id": r.json()["id"]}


@pytest.fixture
def logged_in():
    """Factory: logged_in(prefix) registers a fresh user and returns it with a logged-in 'session'."""
    def _make(prefix):
        user = make_user(prefix)
        user["session"] = login_ok(user["username"], user["password"])
        return user
    return _make
