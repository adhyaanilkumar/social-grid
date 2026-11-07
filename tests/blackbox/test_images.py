"""Black-box tests for GET /api/posts/{id}/image and image processing (FR13, spec 4.4, R11, D5).

Every real upload here also exercises ImageIO inside the Docker backend image, which is the check R11 asks for.
"""
import pytest

from helpers import (PROXY, assert_error, assert_logged_out, create_post, exif_segment, feed_page, find_post,
                     jpeg_image, jpeg_markers, jpeg_size, login_ok, noise_png, png_image, upload)

MIB = 1024 * 1024
HOME = "/api/feed/home"
APP1, COM = 0xE1, 0xFE


@pytest.fixture
def me(logged_in):
    return logged_in("t_bb_img")


def stored_photo(session, post):
    r = session.get(f"/api/posts/{post['postId']}/image")
    assert r.status_code == 200, r.text
    return r.content


# ---------- the response ----------

def test_image_is_a_jpeg_even_when_a_png_was_uploaded(me):
    r = me["session"].get(f"/api/posts/{create_post(me['session'])['postId']}/image")
    assert r.status_code == 200, r.text
    assert r.headers["Content-Type"] == "image/jpeg"
    assert r.content[:2] == b"\xFF\xD8"


def test_image_has_nosniff(me):
    r = me["session"].get(f"/api/posts/{create_post(me['session'])['postId']}/image")
    assert r.headers["X-Content-Type-Options"] == "nosniff"


def test_image_cache_control_is_private_for_one_day(me):
    r = me["session"].get(f"/api/posts/{create_post(me['session'])['postId']}/image")
    tokens = {t.strip().lower() for t in r.headers["Cache-Control"].split(",")}
    assert "private" in tokens
    assert "max-age=86400" in tokens
    assert not tokens & {"no-store", "no-cache", "public", "immutable"}


def test_image_is_visible_to_any_logged_in_user(me, logged_in):
    post = create_post(me["session"])
    assert stored_photo(logged_in("t_bb_img")["session"], post)[:2] == b"\xFF\xD8"


def test_image_logged_out_is_401(me):
    assert_logged_out(f"/api/posts/{create_post(me['session'])['postId']}/image")


def test_image_for_missing_post_is_404(me):
    assert_error(me["session"].get("/api/posts/2147483000/image"), 404)


# ---------- resizing ----------

@pytest.mark.parametrize("build,expected", [
    pytest.param(lambda: png_image(2000, 1000), (1080, 540), id="png-landscape"),
    pytest.param(lambda: png_image(1000, 2000), (540, 1080), id="png-portrait"),
    pytest.param(lambda: jpeg_image(1600, 1600), (1080, 1080), id="jpeg-square"),
    pytest.param(lambda: png_image(1080, 500), (1080, 500), id="exactly-1080-unchanged"),
    pytest.param(lambda: png_image(100, 50), (100, 50), id="small-not-enlarged"),
])
def test_longest_side_is_at_most_1080_and_feed_matches_the_stored_file(me, build, expected):
    post = create_post(me["session"], image=build())
    width, height = jpeg_size(stored_photo(me["session"], post))
    assert max(width, height) <= 1080
    assert (width, height) == expected
    item = find_post(me["session"], HOME, post["postId"])
    assert (item["width"], item["height"]) == (width, height)


def test_extreme_shape_keeps_at_least_one_pixel_each_way(me):
    post = create_post(me["session"], image=png_image(8000, 1))
    width, height = jpeg_size(stored_photo(me["session"], post))
    assert width == 1080
    assert height >= 1


# ---------- metadata ----------

def test_exif_and_gps_are_removed_from_jpeg(me):
    secret = b"T_BB_SECRET_CAMERA"
    original = jpeg_image(64, 64, extra_segments=exif_segment(secret))
    assert APP1 in jpeg_markers(original)
    assert b"Exif\0\0" in original and secret in original

    post = create_post(me["session"], image=original, filename="p.jpg", mime="image/jpeg")
    stored = stored_photo(me["session"], post)
    assert APP1 not in jpeg_markers(stored)
    assert COM not in jpeg_markers(stored)
    assert b"Exif" not in stored
    assert secret not in stored


def test_png_text_metadata_is_removed(me):
    secret = b"T_BB_SECRET_PNG_TEXT"
    original = png_image(16, 16, text=secret)
    assert secret in original
    assert secret not in stored_photo(me["session"], create_post(me["session"], image=original))


# ---------- large uploads, directly and through nginx ----------

def test_4mb_upload_succeeds_directly(me):
    image = noise_png(4 * MIB)
    assert 4 * MIB <= len(image) < 5 * MIB
    post = create_post(me["session"], image=image)
    assert max(jpeg_size(stored_photo(me["session"], post))) <= 1080


def test_4mb_upload_succeeds_through_nginx(me):
    image = noise_png(4 * MIB)
    assert 4 * MIB <= len(image) < 5 * MIB
    proxied = login_ok(me["username"], me["password"], base=PROXY)
    post = create_post(proxied, image=image)
    r = proxied.get(f"/api/posts/{post['postId']}/image")
    assert r.status_code == 200, r.text
    assert r.headers["Content-Type"] == "image/jpeg"
    assert max(jpeg_size(r.content)) <= 1080
    assert "private" in r.headers["Cache-Control"]
    assert "no-store" not in r.headers["Cache-Control"]


def test_upload_over_nginx_limit_is_413_through_proxy(me):
    proxied = login_ok(me["username"], me["password"], base=PROXY)
    r = upload(proxied, noise_png(7 * MIB))
    assert r.status_code == 413, r.text[:300]
    assert feed_page(me["session"], HOME)["items"] == []
