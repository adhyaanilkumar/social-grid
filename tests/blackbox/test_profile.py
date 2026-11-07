"""Black-box tests for GET /api/users/{username}/profile and /posts (FR6, FR11, NFR5, spec 4.2)."""
import uuid

import pytest

from helpers import assert_error, assert_logged_out, create_post, feed_page, walk_feed

COUNT_FIELDS = ("postCount", "followerCount", "followingCount")


@pytest.fixture
def me(logged_in):
    return logged_in("t_bb_prof")


@pytest.fixture
def other(logged_in):
    return logged_in("t_bb_prof")


def profile(viewer, user):
    r = viewer["session"].get(f"/api/users/{user['username']}/profile")
    assert r.status_code == 200, r.text
    return r.json()


def counts(viewer, user):
    p = profile(viewer, user)
    return tuple(p[f] for f in COUNT_FIELDS)


def posts_path(user):
    return f"/api/users/{user['username']}/posts"


def test_profile_has_the_spec_fields(me, other):
    assert profile(me, other) == {
        "userId": other["id"], "username": other["username"], "firstName": None, "lastName": None, "bio": None,
        "profilePicUrl": None, "postCount": 0, "followerCount": 0, "followingCount": 0, "followedByMe": False,
    }


def test_post_count_moves_after_create_and_delete(me, other):
    assert counts(other, me) == (0, 0, 0)
    first = create_post(me["session"])["postId"]
    create_post(me["session"])
    assert counts(other, me) == (2, 0, 0)
    assert me["session"].delete(f"/api/posts/{first}").status_code == 204
    assert counts(other, me) == (1, 0, 0)


def test_follow_counts_move_on_both_sides(me, other):
    url = f"/api/users/{other['id']}/follow"
    assert me["session"].post(url).status_code == 201
    assert counts(me, me) == (0, 0, 1)
    assert counts(me, other) == (0, 1, 0)
    assert me["session"].delete(url).status_code == 204
    assert counts(me, me) == (0, 0, 0)
    assert counts(me, other) == (0, 0, 0)


def test_followed_by_me_depends_on_the_viewer(me, other, logged_in):
    third = logged_in("t_bb_prof")
    assert profile(me, other)["followedByMe"] is False
    assert me["session"].post(f"/api/users/{other['id']}/follow").status_code == 201
    assert profile(me, other)["followedByMe"] is True
    assert profile(third, other)["followedByMe"] is False
    assert profile(other, me)["followedByMe"] is False
    assert me["session"].delete(f"/api/users/{other['id']}/follow").status_code == 204
    assert profile(me, other)["followedByMe"] is False


def test_own_profile_is_not_followed_by_me(me):
    assert profile(me, me)["followedByMe"] is False


def test_posts_returns_only_that_users_posts_newest_first(me, other):
    mine = [create_post(me["session"])["postId"] for _ in range(3)]
    create_post(other["session"])
    mine.append(create_post(me["session"])["postId"])
    items = walk_feed(other["session"], posts_path(me))
    assert {i["authorId"] for i in items} == {me["id"]}
    assert {i["authorUsername"] for i in items} == {me["username"]}
    assert [i["postId"] for i in items] == mine[::-1]


def test_posts_pages_correctly(me, other):
    posted = [create_post(me["session"])["postId"] for _ in range(5)]
    page1 = feed_page(other["session"], posts_path(me), limit=2)
    assert [i["postId"] for i in page1["items"]] == [posted[4], posted[3]]
    assert page1["nextCursor"] == posted[3]
    page2 = feed_page(other["session"], posts_path(me), limit=2, before=page1["nextCursor"])
    assert [i["postId"] for i in page2["items"]] == [posted[2], posted[1]]
    page3 = feed_page(other["session"], posts_path(me), limit=2, before=page2["nextCursor"])
    assert [i["postId"] for i in page3["items"]] == [posted[0]]
    assert page3["nextCursor"] is None


def test_posts_cursor_past_the_oldest_post_is_an_empty_last_page(me, other):
    posted = [create_post(me["session"])["postId"] for _ in range(2)]
    assert feed_page(other["session"], posts_path(me), before=posted[0]) == {"items": [], "nextCursor": None}
    assert feed_page(other["session"], posts_path(me), before=1) == {"items": [], "nextCursor": None}


def test_posts_of_user_with_none_is_empty(me, other):
    assert feed_page(me["session"], posts_path(other)) == {"items": [], "nextCursor": None}


def test_posts_shows_likes_and_comments_for_this_viewer(me, other):
    post = create_post(me["session"])["postId"]
    assert other["session"].post(f"/api/posts/{post}/likes").status_code == 201
    assert other["session"].post(f"/api/posts/{post}/comments", json={"message": "hi"}).status_code == 201
    seen = feed_page(other["session"], posts_path(me))["items"][0]
    assert (seen["likeCount"], seen["commentCount"], seen["likedByMe"]) == (1, 1, True)
    assert feed_page(me["session"], posts_path(me))["items"][0]["likedByMe"] is False


@pytest.mark.parametrize("param", ["before", "limit"])
def test_posts_non_integer_paging_value_is_400(me, other, param):
    assert_error(me["session"].get(posts_path(other), params={param: "abc"}), 400)


@pytest.mark.parametrize("suffix", ["profile", "posts"])
def test_unknown_user_is_404(me, suffix):
    assert_error(me["session"].get(f"/api/users/t_bb_nobody_{uuid.uuid4().hex[:8]}/{suffix}"), 404)


@pytest.mark.parametrize("own", [True, False], ids=["own", "someone-else"])
def test_no_email_or_password_hash_in_profile_or_posts(me, other, own):
    target = me if own else other
    create_post(target["session"])
    for path in (f"/api/users/{target['username']}/profile", posts_path(target)):
        r = me["session"].get(path)
        assert r.status_code == 200, r.text
        assert target["email"] not in r.text
        assert "email" not in r.text.lower()
        assert "password" not in r.text.lower()
        assert "$2a$" not in r.text


@pytest.mark.parametrize("suffix", ["profile", "posts"])
def test_logged_out_is_401(other, suffix):
    assert_logged_out(f"/api/users/{other['username']}/{suffix}")
