"""Black-box tests for POST and DELETE /api/posts (FR1, FR2, spec 4.2, 4.4)."""
import pytest

from helpers import (SVG_WITH_SCRIPT, TINY_GIF, TINY_PNG, assert_error, create_post, db_scalar, feed_page, jpeg_image,
                     no_csrf_session, noise_png, png_image, upload)

UNSUPPORTED = "Upload a JPEG or PNG photo"
UNREADABLE = "We couldn't read that photo"
NO_PHOTO = "Choose a photo to post"
TOO_LARGE = "That photo is too large"
CAPTION_TOO_LONG = "Captions can be up to 2,200 characters"
MIB = 1024 * 1024
HOME = "/api/feed/home"


@pytest.fixture
def me(logged_in):
    return logged_in("t_bb_post")


def home_ids(user):
    return [i["postId"] for i in feed_page(user["session"], HOME, limit=50)["items"]]


# ---------- accepted uploads ----------

@pytest.mark.parametrize("image,filename,mime", [
    (jpeg_image(32, 16), "photo.jpg", "image/jpeg"),
    (TINY_PNG, "photo.png", "image/png"),
], ids=["jpeg", "png"])
@pytest.mark.parametrize("caption", [None, "A caption"], ids=["no-caption", "caption"])
def test_upload_succeeds(me, image, filename, mime, caption):
    r = upload(me["session"], image, filename, mime, caption)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["authorId"] == me["id"]
    assert body["caption"] == caption
    assert body["mediaUrl"] == f"/api/posts/{body['postId']}/image"
    assert body["likeCount"] == 0
    assert me["session"].get(body["mediaUrl"]).status_code == 200
    assert home_ids(me) == [body["postId"]]


def test_format_comes_from_contents_not_name_or_declared_type(me):
    r = upload(me["session"], TINY_PNG, "notes.txt", "text/plain")
    assert r.status_code == 201, r.text


# ---------- caption length ----------

def test_caption_of_2200_chars_is_accepted(me):
    caption = "c" * 2200
    assert create_post(me["session"], caption)["caption"] == caption


def test_caption_of_2201_chars_is_400_and_creates_nothing(me):
    assert_error(upload(me["session"], TINY_PNG, caption="c" * 2201), 400, CAPTION_TOO_LONG)
    assert home_ids(me) == []


# ---------- rejected files ----------

@pytest.mark.parametrize("image,filename,mime", [
    (b"This is plain text, not a photo.\n" * 10, "photo.jpg", "image/jpeg"),
    (SVG_WITH_SCRIPT, "photo.svg", "image/svg+xml"),
    (SVG_WITH_SCRIPT, "photo.png", "image/png"),
    (TINY_GIF, "photo.gif", "image/gif"),
    (TINY_GIF, "photo.jpg", "image/jpeg"),
], ids=["text-as-jpg", "svg", "svg-as-png", "gif", "gif-as-jpg"])
def test_unsupported_file_is_400(me, image, filename, mime):
    assert_error(upload(me["session"], image, filename, mime), 400, UNSUPPORTED)
    assert home_ids(me) == []


def test_undecodable_png_is_400_not_500(me):
    truncated = png_image(64, 64)[:40]  # the signature and header survive; the pixel data doesn't
    assert_error(upload(me["session"], truncated), 400, UNREADABLE)


def test_jpeg_truncated_mid_scan_is_400(me):
    whole = jpeg_image(1600, 1600)
    scan_start = whole.index(b"\xFF\xDA")
    truncated = whole[:scan_start + (len(whole) - scan_start) // 2]  # headers intact, pixel data cut, no EOI
    assert_error(upload(me["session"], truncated, "photo.jpg", "image/jpeg"), 400, UNREADABLE)
    assert home_ids(me) == []


def test_empty_file_is_400(me):
    assert_error(upload(me["session"], b""), 400)


def test_missing_file_is_400(me):
    r = me["session"].post("/api/posts", files={"not_image": ("a.png", TINY_PNG, "image/png")})
    assert_error(r, 400, NO_PHOTO)


def test_caption_with_no_file_is_400(me):
    # A (None, value) entry makes requests send a plain multipart field with no file.
    r = me["session"].post("/api/posts", files={"caption": (None, "Just words")})
    assert_error(r, 400, NO_PHOTO)
    assert home_ids(me) == []


def test_json_body_no_longer_creates_a_post(me):
    r = me["session"].post("/api/posts", json={"mediaUrl": "https://example.com/p.jpg", "caption": "old way"})
    assert_error(r, 415)
    assert home_ids(me) == []


# ---------- size limits ----------

@pytest.mark.parametrize("size", [int(5.5 * MIB), 7 * MIB], ids=["over-file-limit", "over-request-limit"])
def test_over_limit_file_is_413(me, size):
    assert_error(upload(me["session"], noise_png(size)), 413, TOO_LARGE)
    assert home_ids(me) == []


@pytest.mark.parametrize("build", [
    pytest.param(lambda: png_image(8001, 1), id="png-too-wide"),
    pytest.param(lambda: png_image(1, 8001), id="png-too-tall"),
    pytest.param(lambda: png_image(7000, 7000), id="png-over-40-megapixels"),
    pytest.param(lambda: jpeg_image(8001, 8), id="jpeg-too-wide"),
    pytest.param(lambda: jpeg_image(8, 8001), id="jpeg-too-tall"),
])
def test_oversized_dimensions_are_rejected(me, build):
    # Spec 4.4 step 2 gives no status or wording; a bad file is 400 (spec 4.2).
    assert_error(upload(me["session"], build()), 400)
    assert home_ids(me) == []


@pytest.mark.parametrize("width,height", [(8000, 1000), (1000, 8000), (8000, 1)])
def test_dimensions_on_the_limit_are_accepted(me, width, height):
    r = upload(me["session"], png_image(width, height))
    assert r.status_code == 201, r.text


# ---------- CSRF ----------

def test_missing_csrf_token_is_403(me):
    raw = no_csrf_session(me["session"])
    r = raw.post(f"{me['session'].base}/api/posts", files={"image": ("a.png", TINY_PNG, "image/png")}, timeout=10)
    assert_error(r, 403)
    assert home_ids(me) == []


# ---------- delete ----------

def test_delete_own_post_is_204_and_it_goes_away(me):
    post = create_post(me["session"])["postId"]
    r = me["session"].delete(f"/api/posts/{post}")
    assert r.status_code == 204, r.text
    assert me["session"].get(f"/api/posts/{post}").status_code == 404
    assert home_ids(me) == []


def test_delete_someone_elses_post_is_403_and_it_stays(me, logged_in):
    other = logged_in("t_bb_post")
    post = create_post(me["session"])["postId"]
    assert_error(other["session"].delete(f"/api/posts/{post}"), 403)
    assert me["session"].get(f"/api/posts/{post}").status_code == 200
    assert me["session"].get(f"/api/posts/{post}/image").status_code == 200
    assert home_ids(me) == [post]


def test_delete_unknown_post_is_404(me):
    assert_error(me["session"].delete("/api/posts/2147483000"), 404)


def test_delete_cascades_to_likes_comments_and_photo(me, logged_in):
    fan = logged_in("t_bb_post")
    post = create_post(me["session"])["postId"]
    assert fan["session"].post(f"/api/posts/{post}/likes").status_code == 201
    assert me["session"].post(f"/api/posts/{post}/likes").status_code == 201
    made = fan["session"].post(f"/api/posts/{post}/comments", json={"message": "nice"})
    assert made.status_code == 201, made.text
    assert me["session"].get(f"/api/posts/{post}/image").status_code == 200

    assert me["session"].delete(f"/api/posts/{post}").status_code == 204

    assert me["session"].get(f"/api/posts/{post}/image").status_code == 404
    assert fan["session"].delete(f"/api/comments/{made.json()['commentId']}").status_code == 404
    assert fan["session"].delete(f"/api/posts/{post}/likes").status_code == 404
    for table in ("likes", "comments", "post_images"):
        assert db_scalar(f"SELECT count(*) FROM {table} WHERE post_id = {post}") == "0", table
