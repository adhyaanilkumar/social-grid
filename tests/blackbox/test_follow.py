"""Black-box tests for POST and DELETE /api/users/{id}/follow (FR7, spec 4.2)."""
import pytest

from helpers import assert_error

UNKNOWN_USER = 2147483000


@pytest.fixture
def me(logged_in):
    return logged_in("t_bb_fol")


@pytest.fixture
def other(logged_in):
    return logged_in("t_bb_fol")


def followed_by_me(me, other):
    r = me["session"].get(f"/api/users/{other['username']}/profile")
    assert r.status_code == 200, r.text
    return r.json()["followedByMe"]


def test_follow(me, other):
    r = me["session"].post(f"/api/users/{other['id']}/follow")
    assert r.status_code == 201, r.text
    assert followed_by_me(me, other) is True


def test_unfollow_is_204(me, other):
    assert me["session"].post(f"/api/users/{other['id']}/follow").status_code == 201
    r = me["session"].delete(f"/api/users/{other['id']}/follow")
    assert r.status_code == 204, r.text
    assert r.content == b""
    assert followed_by_me(me, other) is False


def test_can_follow_again_after_unfollowing(me, other):
    url = f"/api/users/{other['id']}/follow"
    assert me["session"].post(url).status_code == 201
    assert me["session"].delete(url).status_code == 204
    assert me["session"].post(url).status_code == 201
    assert followed_by_me(me, other) is True


def test_self_follow_is_400(me):
    assert_error(me["session"].post(f"/api/users/{me['id']}/follow"), 400)


def test_duplicate_follow_is_409(me, other):
    assert me["session"].post(f"/api/users/{other['id']}/follow").status_code == 201
    assert_error(me["session"].post(f"/api/users/{other['id']}/follow"), 409, "Already following")


def test_unfollow_when_not_following_is_404(me, other):
    assert_error(me["session"].delete(f"/api/users/{other['id']}/follow"), 404)


def test_follow_is_one_way(me, other):
    assert me["session"].post(f"/api/users/{other['id']}/follow").status_code == 201
    assert followed_by_me(other, me) is False
    assert_error(other["session"].delete(f"/api/users/{me['id']}/follow"), 404)


def test_follow_unknown_user_is_404(me):
    assert_error(me["session"].post(f"/api/users/{UNKNOWN_USER}/follow"), 404)


def test_unfollow_unknown_user_is_404(me):
    assert_error(me["session"].delete(f"/api/users/{UNKNOWN_USER}/follow"), 404)
