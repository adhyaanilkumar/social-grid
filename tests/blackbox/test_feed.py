"""Black-box tests for GET /api/feed/home and /api/feed/explore (FR3, FR4, spec 4.2).

Explore is global and another suite posts at the same time, so its tests only look at this test's own post IDs.
Home holds only own and followed posts, so its tests can assert exact contents.
"""
import pytest

from conftest import make_user
from helpers import (assert_error, assert_logged_out, create_post, feed_page, find_post, login_ok, png_image,
                     walk_feed)

HOME = "/api/feed/home"
EXPLORE = "/api/feed/explore"
FEEDS = [HOME, EXPLORE]


def ids(items):
    return [i["postId"] for i in items]


def post_id(user, caption=None):
    return create_post(user["session"], caption)["postId"]


def follow(follower, followee):
    r = follower["session"].post(f"/api/users/{followee['id']}/follow")
    assert r.status_code == 201, r.text


def unfollow(follower, followee):
    r = follower["session"].delete(f"/api/users/{followee['id']}/follow")
    assert r.status_code == 204, r.text


@pytest.fixture(scope="module")
def prolific():
    """A user with 52 posts: more than two default pages and more than the largest allowed page."""
    user = make_user("t_bb_feed")
    user["session"] = login_ok(user["username"], user["password"])
    user["post_ids"] = [post_id(user) for _ in range(52)]
    return user


# ---------- who sees what ----------

def test_home_has_own_and_followed_posts_only(logged_in):
    me, friend, stranger = logged_in("t_bb_feed"), logged_in("t_bb_feed"), logged_in("t_bb_feed")
    follow(me, friend)
    mine, theirs = post_id(me), post_id(friend)
    post_id(stranger)
    assert sorted(ids(walk_feed(me["session"], HOME))) == sorted([mine, theirs])


def test_home_of_new_user_is_empty(logged_in):
    assert feed_page(logged_in("t_bb_feed")["session"], HOME) == {"items": [], "nextCursor": None}


def test_followed_users_old_posts_appear_straight_away(logged_in):
    me, friend = logged_in("t_bb_feed"), logged_in("t_bb_feed")
    theirs = post_id(friend)
    assert ids(walk_feed(me["session"], HOME)) == []
    follow(me, friend)
    assert ids(walk_feed(me["session"], HOME)) == [theirs]


def test_unfollowed_users_posts_disappear(logged_in):
    me, friend = logged_in("t_bb_feed"), logged_in("t_bb_feed")
    follow(me, friend)
    mine, theirs = post_id(me), post_id(friend)
    assert theirs in ids(walk_feed(me["session"], HOME))
    unfollow(me, friend)
    assert ids(walk_feed(me["session"], HOME)) == [mine]


def test_explore_has_everyone_including_own(logged_in):
    me, stranger = logged_in("t_bb_feed"), logged_in("t_bb_feed")
    mine, theirs = post_id(me), post_id(stranger)
    assert find_post(me["session"], EXPLORE, mine) is not None
    assert find_post(me["session"], EXPLORE, theirs) is not None


def test_explore_stops_showing_a_deleted_post(logged_in):
    me = logged_in("t_bb_feed")
    mine = post_id(me)
    assert me["session"].delete(f"/api/posts/{mine}").status_code == 204
    assert find_post(me["session"], EXPLORE, mine) is None


# ---------- order ----------

def test_home_is_newest_first(logged_in):
    me, friend = logged_in("t_bb_feed"), logged_in("t_bb_feed")
    follow(me, friend)
    posted = [post_id(me), post_id(friend), post_id(me), post_id(friend)]
    assert ids(walk_feed(me["session"], HOME)) == posted[::-1]


def test_explore_is_newest_first(logged_in):
    me, other = logged_in("t_bb_feed"), logged_in("t_bb_feed")
    posted = [post_id(me), post_id(other), post_id(me)]
    seen = ids(walk_feed(me["session"], EXPLORE, until_id=posted[0]))
    assert seen == sorted(seen, reverse=True)
    assert [i for i in seen if i in posted] == posted[::-1]


# ---------- paging ----------

def test_home_paging_has_no_duplicates_or_gaps(logged_in):
    me = logged_in("t_bb_feed")
    posted = [post_id(me) for _ in range(7)]
    pages, before = [], None
    while True:
        params = {"limit": 3, **({"before": before} if before else {})}
        page = feed_page(me["session"], HOME, **params)
        pages.append(ids(page["items"]))
        before = page["nextCursor"]
        if before is None:
            break
    assert [len(p) for p in pages] == [3, 3, 1]
    assert sum(pages, []) == posted[::-1]


def test_explore_paging_has_no_duplicates_or_gaps(logged_in):
    me = logged_in("t_bb_feed")
    posted = [post_id(me) for _ in range(7)]
    seen = ids(walk_feed(me["session"], EXPLORE, limit=3, until_id=posted[0]))
    assert len(seen) == len(set(seen))
    assert seen == sorted(seen, reverse=True)
    assert [i for i in seen if i in posted] == posted[::-1]


@pytest.mark.parametrize("feed", FEEDS)
def test_new_post_between_pages_causes_no_duplicates_or_gaps(logged_in, feed):
    me = logged_in("t_bb_feed")
    posted = [post_id(me) for _ in range(6)]

    first = feed_page(me["session"], feed, limit=3)
    newcomer = post_id(me)

    seen, before = ids(first["items"]), first["nextCursor"]
    while before is not None and min(seen) > posted[0]:
        page = feed_page(me["session"], feed, limit=3, before=before)
        seen += ids(page["items"])
        before = page["nextCursor"]

    assert len(seen) == len(set(seen))
    assert [i for i in seen if i in posted] == posted[::-1]
    assert newcomer not in seen


# ---------- limit ----------

@pytest.mark.parametrize("feed", FEEDS)
def test_limit_defaults_to_20(prolific, feed):
    assert len(feed_page(prolific["session"], feed)["items"]) == 20


@pytest.mark.parametrize("feed", FEEDS)
@pytest.mark.parametrize("limit,expected", [(1, 1), (50, 50), (51, 50), (1000, 50), (0, 1), (-5, 1)])
def test_limit_is_clamped_to_1_through_50(prolific, feed, limit, expected):
    assert len(feed_page(prolific["session"], feed, limit=limit)["items"]) == expected


# ---------- nextCursor ----------

def test_next_cursor_is_the_last_id_returned_then_null_on_last_page(prolific):
    s = prolific["session"]
    newest_first = prolific["post_ids"][::-1]
    pages, before = [], None
    while True:
        page = feed_page(s, HOME, limit=20, **({"before": before} if before else {}))
        pages.append(page)
        before = page["nextCursor"]
        if before is None:
            break
    assert [len(p["items"]) for p in pages] == [20, 20, 12]
    assert pages[0]["nextCursor"] == newest_first[19]
    assert pages[1]["nextCursor"] == newest_first[39]
    assert pages[2]["nextCursor"] is None
    assert sum((ids(p["items"]) for p in pages), []) == newest_first


def test_next_cursor_is_null_when_last_page_is_exactly_full(logged_in):
    me = logged_in("t_bb_feed")
    for _ in range(3):
        post_id(me)
    page = feed_page(me["session"], HOME, limit=3)
    assert len(page["items"]) == 3
    assert page["nextCursor"] is None


@pytest.mark.parametrize("feed", FEEDS)
def test_before_older_than_everything_is_an_empty_last_page(logged_in, feed):
    assert feed_page(logged_in("t_bb_feed")["session"], feed, before=1) == {"items": [], "nextCursor": None}


@pytest.mark.parametrize("feed", FEEDS)
@pytest.mark.parametrize("param", ["before", "limit"])
@pytest.mark.parametrize("value", ["abc", "1.5"])
def test_non_integer_paging_values_are_400(logged_in, feed, param, value):
    assert_error(logged_in("t_bb_feed")["session"].get(feed, params={param: value}), 400)


# ---------- what each item says ----------

def test_liked_by_me_differs_per_viewer(logged_in):
    author, liker, other = logged_in("t_bb_feed"), logged_in("t_bb_feed"), logged_in("t_bb_feed")
    post = post_id(author)
    assert liker["session"].post(f"/api/posts/{post}/likes").status_code == 201
    assert find_post(liker["session"], EXPLORE, post)["likedByMe"] is True
    assert find_post(other["session"], EXPLORE, post)["likedByMe"] is False
    assert find_post(author["session"], HOME, post)["likedByMe"] is False


def test_like_and_comment_counts_are_correct(logged_in):
    author, a, b = logged_in("t_bb_feed"), logged_in("t_bb_feed"), logged_in("t_bb_feed")
    post, quiet = post_id(author), post_id(author)
    for user in (a, b):
        assert user["session"].post(f"/api/posts/{post}/likes").status_code == 201
    for user, text in ((a, "one"), (a, "two"), (b, "three")):
        assert user["session"].post(f"/api/posts/{post}/comments", json={"message": text}).status_code == 201
    items = {i["postId"]: i for i in walk_feed(author["session"], HOME)}
    assert (items[post]["likeCount"], items[post]["commentCount"]) == (2, 3)
    assert (items[quiet]["likeCount"], items[quiet]["commentCount"]) == (0, 0)


def test_item_has_the_post_view_fields_and_real_dimensions(logged_in):
    me = logged_in("t_bb_feed")
    post = create_post(me["session"], "hello", image=png_image(40, 20))["postId"]
    assert feed_page(me["session"], HOME)["items"] == [{
        "postId": post, "authorId": me["id"], "authorUsername": me["username"],
        "mediaUrl": f"/api/posts/{post}/image", "caption": "hello", "width": 40, "height": 20,
        "likeCount": 0, "commentCount": 0, "likedByMe": False,
    }]


def test_feed_never_exposes_email_or_password_hash(logged_in):
    author, viewer = logged_in("t_bb_feed"), logged_in("t_bb_feed")
    post_id(author)
    follow(viewer, author)
    r = viewer["session"].get(HOME)
    assert author["username"] in r.text
    assert author["email"] not in r.text
    assert "email" not in r.text.lower()
    assert "password" not in r.text.lower()
    assert "$2a$" not in r.text


# ---------- login ----------

@pytest.mark.parametrize("feed", FEEDS)
def test_logged_out_is_401(feed):
    assert_logged_out(feed)
