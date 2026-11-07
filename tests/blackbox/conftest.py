"""Pytest fixtures shared across the black-box suite. Plain helpers live in helpers.py."""
import subprocess
import uuid
import warnings

import pytest

from helpers import BASE, csrf_session, login_ok

# Deletes only users named t_bb_*. The order matters because likes.user_id, comments.author_id, posts.author_id
# and follows have no foreign key to users. A post's own likes, comments and photo go with it by cascade.
CLEANUP_SQL = r"""
BEGIN;
CREATE TEMP TABLE bb_users ON COMMIT DROP AS SELECT id FROM users WHERE username LIKE 't\_bb\_%' ESCAPE '\';
DELETE FROM likes WHERE user_id IN (SELECT id FROM bb_users);
DELETE FROM comments WHERE author_id IN (SELECT id FROM bb_users);
DELETE FROM follows WHERE follower_id IN (SELECT id FROM bb_users) OR followee_id IN (SELECT id FROM bb_users);
DELETE FROM posts WHERE author_id IN (SELECT id FROM bb_users);
DELETE FROM profiles WHERE user_id IN (SELECT id FROM bb_users);
DELETE FROM users WHERE id IN (SELECT id FROM bb_users);
COMMIT;
"""


@pytest.fixture(scope="session", autouse=True)
def cleanup_blackbox_users():
    """After the run, remove everything the t_bb_ users made. A failed cleanup warns; it never fails the run."""
    yield
    try:
        out = subprocess.run(["docker", "exec", "-i", "social-grid-db", "psql", "-U", "postgres", "-d", "socialgrid",
                              "-v", "ON_ERROR_STOP=1"],
                             input=CLEANUP_SQL, capture_output=True, text=True, timeout=60)
        if out.returncode != 0:
            warnings.warn(f"t_bb_ cleanup failed: {out.stderr.strip()}")
    except (OSError, subprocess.SubprocessError) as e:
        warnings.warn(f"t_bb_ cleanup failed: {e}")


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
