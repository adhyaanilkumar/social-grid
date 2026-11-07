"""Black-box tests for comments (FR9, FR10, spec 4.2)."""
import pytest

from helpers import assert_error, create_post

UNKNOWN_POST = 2147483000


@pytest.fixture
def author(logged_in):
    return logged_in("t_bb_cmt")


@pytest.fixture
def commenter(logged_in):
    return logged_in("t_bb_cmt")


@pytest.fixture
def post(author):
    return create_post(author["session"])["postId"]


def add(user, post_id, message):
    return user["session"].post(f"/api/posts/{post_id}/comments", json={"message": message})


def added(user, post_id, message="a comment"):
    r = add(user, post_id, message)
    assert r.status_code == 201, r.text
    return r.json()


def listed(user, post_id):
    r = user["session"].get(f"/api/posts/{post_id}/comments")
    assert r.status_code == 200, r.text
    return r.json()


def test_add_returns_the_comment_with_author_username(commenter, post):
    comment = added(commenter, post, "hello")
    assert isinstance(comment.pop("commentId"), int)
    assert comment == {"authorId": commenter["id"], "authorUsername": commenter["username"],
                       "postId": post, "message": "hello"}


def test_list_is_oldest_first_with_author_usernames(author, commenter, post):
    first = added(commenter, post, "first")
    second = added(author, post, "second")
    third = added(commenter, post, "third")
    comments = listed(author, post)
    assert [c["commentId"] for c in comments] == [first["commentId"], second["commentId"], third["commentId"]]
    assert [c["message"] for c in comments] == ["first", "second", "third"]
    assert [c["authorUsername"] for c in comments] == [commenter["username"], author["username"],
                                                       commenter["username"]]


def test_list_never_exposes_email_or_password_hash(author, commenter, post):
    added(commenter, post)
    r = author["session"].get(f"/api/posts/{post}/comments")
    assert commenter["email"] not in r.text
    assert "email" not in r.text.lower()
    assert "password" not in r.text.lower()


def test_comment_of_1000_chars_is_accepted(commenter, post):
    assert added(commenter, post, "c" * 1000)["message"] == "c" * 1000


def test_comment_of_1001_chars_is_400(author, commenter, post):
    assert_error(add(commenter, post, "c" * 1001), 400)
    assert listed(author, post) == []


@pytest.mark.parametrize("message", ["", "   ", "\t\n", None], ids=["empty", "spaces", "whitespace", "null"])
def test_blank_comment_is_400(author, commenter, post, message):
    assert_error(add(commenter, post, message), 400)
    assert listed(author, post) == []


def test_add_to_unknown_post_is_404(commenter):
    assert_error(add(commenter, UNKNOWN_POST, "hello"), 404)


def test_list_for_unknown_post_is_404(commenter):
    assert_error(commenter["session"].get(f"/api/posts/{UNKNOWN_POST}/comments"), 404)


def test_delete_own_comment(author, commenter, post):
    comment = added(commenter, post)
    r = commenter["session"].delete(f"/api/comments/{comment['commentId']}")
    assert r.status_code == 204, r.text
    assert listed(author, post) == []


def test_delete_someone_elses_comment_is_403_and_it_stays(logged_in, commenter, author, post):
    comment = added(commenter, post)
    stranger = logged_in("t_bb_cmt")
    assert_error(stranger["session"].delete(f"/api/comments/{comment['commentId']}"), 403)
    assert [c["commentId"] for c in listed(author, post)] == [comment["commentId"]]


def test_posts_author_cant_delete_someone_elses_comment(author, commenter, post):
    comment = added(commenter, post)
    assert_error(author["session"].delete(f"/api/comments/{comment['commentId']}"), 403)
    assert [c["commentId"] for c in listed(author, post)] == [comment["commentId"]]


def test_delete_unknown_comment_is_404(commenter):
    assert_error(commenter["session"].delete("/api/comments/2147483000"), 404)
