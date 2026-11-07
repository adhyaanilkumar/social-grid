"""Black-box tests for POST and DELETE /api/posts/{id}/likes (FR8, spec 4.2)."""
import pytest

from helpers import assert_error, create_post, feed_page, find_post

UNKNOWN_POST = 2147483000
EXPLORE = "/api/feed/explore"


@pytest.fixture
def author(logged_in):
    return logged_in("t_bb_like")


@pytest.fixture
def fan(logged_in):
    return logged_in("t_bb_like")


@pytest.fixture
def post(author):
    return create_post(author["session"])["postId"]


def like_count(user, post_id):
    r = user["session"].get(f"/api/posts/{post_id}")
    assert r.status_code == 200, r.text
    return r.json()["likeCount"]


def test_like_then_unlike_moves_the_count(author, fan, post):
    assert like_count(author, post) == 0
    assert fan["session"].post(f"/api/posts/{post}/likes").status_code == 201
    assert like_count(author, post) == 1
    r = fan["session"].delete(f"/api/posts/{post}/likes")
    assert r.status_code == 204, r.text
    assert like_count(author, post) == 0


def test_count_and_liked_by_me_move_in_the_feed(fan, post):
    assert fan["session"].post(f"/api/posts/{post}/likes").status_code == 201
    item = find_post(fan["session"], EXPLORE, post)
    assert (item["likeCount"], item["likedByMe"]) == (1, True)
    assert fan["session"].delete(f"/api/posts/{post}/likes").status_code == 204
    item = find_post(fan["session"], EXPLORE, post)
    assert (item["likeCount"], item["likedByMe"]) == (0, False)


def test_counts_add_up_across_users(author, fan, post):
    assert fan["session"].post(f"/api/posts/{post}/likes").status_code == 201
    assert author["session"].post(f"/api/posts/{post}/likes").status_code == 201
    assert like_count(author, post) == 2
    assert fan["session"].delete(f"/api/posts/{post}/likes").status_code == 204
    assert like_count(author, post) == 1
    assert feed_page(author["session"], "/api/feed/home")["items"][0]["likedByMe"] is True


def test_duplicate_like_is_409_and_count_stays(author, fan, post):
    assert fan["session"].post(f"/api/posts/{post}/likes").status_code == 201
    assert_error(fan["session"].post(f"/api/posts/{post}/likes"), 409, "Post already liked")
    assert like_count(author, post) == 1


def test_unlike_when_not_liked_is_404(fan, post):
    assert_error(fan["session"].delete(f"/api/posts/{post}/likes"), 404)


def test_like_unknown_post_is_404(fan):
    assert_error(fan["session"].post(f"/api/posts/{UNKNOWN_POST}/likes"), 404)


def test_unlike_unknown_post_is_404(fan):
    assert_error(fan["session"].delete(f"/api/posts/{UNKNOWN_POST}/likes"), 404)
