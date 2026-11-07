"""Shared helpers for the black-box suite: CSRF-primed sessions, session login, API shortcuts and image builders.

CSRF is on, so every non-GET request needs an X-XSRF-TOKEN header equal to the XSRF-TOKEN cookie.
The backend sets that cookie on any response, so a session is "primed" by one GET first.
"""
import base64
import math
import os
import struct
import subprocess
import zlib

import requests

BASE = os.environ.get("SOCIAL_GRID_URL", "http://localhost:8080")
PROXY = os.environ.get("SOCIAL_GRID_PROXY_URL", "http://localhost:5173")
TIMEOUT = 10
SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}


def csrf_header(session):
    """The header that proves this session read its own XSRF-TOKEN cookie."""
    token = session.cookies.get("XSRF-TOKEN")
    assert token, "session has no XSRF-TOKEN cookie; prime it with a GET first"
    return {"X-XSRF-TOKEN": token}


class CsrfSession(requests.Session):
    """A requests.Session that adds the CSRF header to every unsafe request, like the React client does.

    Pass headers={"X-XSRF-TOKEN": ...} explicitly to override it.
    """

    def __init__(self, base=BASE):
        super().__init__()
        self.base = base

    def request(self, method, url, **kwargs):
        if url.startswith("/"):
            url = self.base + url
        kwargs.setdefault("timeout", TIMEOUT)
        if method.upper() not in SAFE_METHODS:
            headers = dict(kwargs.get("headers") or {})
            if "X-XSRF-TOKEN" not in headers:
                if not self.cookies.get("XSRF-TOKEN"):
                    self.prime()
                headers.update(csrf_header(self))
            kwargs["headers"] = headers
        return super().request(method, url, **kwargs)

    def prime(self):
        """Any GET sets the XSRF-TOKEN cookie; /api/auth/me is cheap (401 when logged out)."""
        super().request("GET", f"{self.base}/api/auth/me", timeout=TIMEOUT)
        return self


def csrf_session(base=BASE):
    """A fresh session that already holds the XSRF-TOKEN cookie."""
    return CsrfSession(base).prime()


def login(identifier, password, base=BASE):
    """Return (session, response) after POST /api/auth/login with a valid CSRF token."""
    s = csrf_session(base)
    r = s.post("/api/auth/login", json={"identifier": identifier, "password": password})
    return s, r


def login_ok(identifier, password, base=BASE):
    s, r = login(identifier, password, base)
    assert r.status_code == 200, r.text
    return s


# ---------- API shortcuts ----------

LOGGED_OUT_BODY = {"status": 401, "error": "Unauthorized", "message": "Log in to continue"}
UPLOAD_TIMEOUT = 60  # large uploads get longer than the default, because another suite shares the backend


def no_csrf_session(session):
    """A plain session with the same cookies that does NOT send the CSRF header (for the 403 tests)."""
    raw = requests.Session()
    raw.cookies.update(session.cookies)
    return raw


def assert_logged_out(path, base=BASE):
    r = requests.get(f"{base}{path}", timeout=TIMEOUT)
    assert r.status_code == 401, r.text
    assert r.json() == LOGGED_OUT_BODY


def assert_error(r, status, message=None):
    """Checks the status and the ErrorResponse shape (NFR2); message is exact when the spec gives one."""
    assert r.status_code == status, f"{r.status_code}: {r.text[:300]}"
    body = r.json()
    assert body["status"] == status
    assert body["error"]
    if message is not None:
        assert body["message"] == message


def upload(session, image, filename="photo.png", mime="image/png", caption=None):
    """POST /api/posts as multipart, returning the raw response."""
    data = {"caption": caption} if caption is not None else None
    return session.post("/api/posts", files={"image": (filename, image, mime)}, data=data, timeout=UPLOAD_TIMEOUT)


def create_post(session, caption=None, image=None, filename="photo.png", mime="image/png"):
    """Upload a photo (the tiny embedded PNG by default) and return the PostResponse."""
    r = upload(session, TINY_PNG if image is None else image, filename, mime, caption)
    assert r.status_code == 201, r.text
    return r.json()


def feed_page(session, path, **params):
    r = session.get(path, params=params)
    assert r.status_code == 200, r.text
    return r.json()


def walk_feed(session, path, limit=50, until_id=None):
    """Every item newest first, following nextCursor. until_id stops once a page reaches that post ID,
    because Explore holds other people's posts and can be long."""
    items, before = [], None
    while True:
        params = {"limit": limit}
        if before is not None:
            params["before"] = before
        page = feed_page(session, path, **params)
        items += page["items"]
        cursor = page["nextCursor"]
        if cursor is None or (until_id is not None and page["items"] and page["items"][-1]["postId"] <= until_id):
            return items
        assert before is None or cursor < before, f"cursor did not move: {before} -> {cursor}"
        before = cursor


def find_post(session, path, post_id):
    """The feed item for post_id, or None if the feed doesn't have it."""
    return next((i for i in walk_feed(session, path, until_id=post_id) if i["postId"] == post_id), None)


def db_scalar(sql):
    """One read-only value from Postgres. Some cascades (likes, photos) leave no trace the API can show."""
    out = subprocess.run(["docker", "exec", "-i", "social-grid-db", "psql", "-U", "postgres", "-d", "socialgrid",
                          "-tA", "-c", sql], capture_output=True, text=True, timeout=30)
    assert out.returncode == 0, out.stderr
    return out.stdout.strip()


# ---------- image files, built by hand so the suite needs no imaging library ----------

# A 1x1 PNG.
TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==")
# A 1x1 GIF, for the "unsupported format" cases.
TINY_GIF = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")
SVG_WITH_SCRIPT = b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'


def _png_chunk(kind, payload):
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))


def png_image(width, height, text=None):
    """A valid all-black 8-bit greyscale PNG. Blank rows compress to almost nothing, so even large sizes stay small.
    text adds a tEXt metadata chunk."""
    deflate = zlib.compressobj(9)
    row = b"\0" * (width + 1)
    idat = b"".join(deflate.compress(row) for _ in range(height)) + deflate.flush()
    meta = _png_chunk(b"tEXt", b"Comment\0" + text) if text else b""
    return (b"\x89PNG\r\n\x1a\n" + _png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
            + meta + _png_chunk(b"IDAT", idat) + _png_chunk(b"IEND", b""))


def noise_png(min_bytes):
    """A valid RGB PNG of random pixels, which can't be compressed, so the file is at least min_bytes."""
    side = math.isqrt(min_bytes // 3) + 1
    assert side <= 8000
    rows = b"".join(b"\0" + os.urandom(side * 3) for _ in range(side))
    return (b"\x89PNG\r\n\x1a\n" + _png_chunk(b"IHDR", struct.pack(">IIBBBBB", side, side, 8, 2, 0, 0, 0))
            + _png_chunk(b"IDAT", zlib.compress(rows, 1)) + _png_chunk(b"IEND", b""))


def _jpeg_segment(marker, payload):
    return bytes([0xFF, marker]) + struct.pack(">H", len(payload) + 2) + payload


def jpeg_image(width, height, extra_segments=b""):
    """A valid baseline JPEG, all mid-grey. Its Huffman tables have a single 1-bit code, so each 8x8 block
    of each of the 3 components costs 2 zero bits (DC difference 0, end of block)."""
    jfif = _jpeg_segment(0xE0, b"JFIF\0\x01\x01\x00\x00\x01\x00\x01\x00\x00")
    quant = _jpeg_segment(0xDB, b"\x00" + b"\x01" * 64)
    frame = _jpeg_segment(0xC0, b"\x08" + struct.pack(">HH", height, width)
                          + b"\x03\x01\x11\x00\x02\x11\x00\x03\x11\x00")
    huffman = (_jpeg_segment(0xC4, b"\x00\x01" + b"\x00" * 15 + b"\x00")
               + _jpeg_segment(0xC4, b"\x10\x01" + b"\x00" * 15 + b"\x00"))
    scan_header = _jpeg_segment(0xDA, b"\x03\x01\x00\x02\x00\x03\x00\x00\x3F\x00")
    whole, spare = divmod(math.ceil(width / 8) * math.ceil(height / 8) * 6, 8)
    scan = b"\0" * whole + (bytes([0xFF >> spare]) if spare else b"")
    return b"\xFF\xD8" + jfif + extra_segments + quant + frame + huffman + scan_header + scan + b"\xFF\xD9"


def exif_segment(secret):
    """An APP1 segment holding little-endian TIFF: a camera Make of `secret`, and a GPS IFD with a latitude."""
    def entry(tag, kind, count, value):
        return struct.pack("<HHI", tag, kind, count) + value

    make = secret + b"\0"
    gps_offset = 8 + 30 + len(make)  # TIFF header, then IFD0 (2 entries), then the Make string
    rationals_offset = gps_offset + 30
    ifd0 = (struct.pack("<H", 2)
            + entry(0x010F, 2, len(make), struct.pack("<I", 38))
            + entry(0x8825, 4, 1, struct.pack("<I", gps_offset))
            + struct.pack("<I", 0))
    gps = (struct.pack("<H", 2)
           + entry(0x0001, 2, 2, b"N\0\0\0")
           + entry(0x0002, 5, 3, struct.pack("<I", rationals_offset))
           + struct.pack("<I", 0))
    rationals = struct.pack("<6I", 12, 1, 58, 1, 21, 1)
    return _jpeg_segment(0xE1, b"Exif\0\0" + b"II*\0" + struct.pack("<I", 8) + ifd0 + make + gps + rationals)


def jpeg_markers(data):
    """The marker bytes of every segment before the image data."""
    assert data[:2] == b"\xFF\xD8", "not a JPEG"
    markers, i = [], 2
    while i + 4 <= len(data):
        assert data[i] == 0xFF, f"expected a marker at byte {i}"
        marker = data[i + 1]
        markers.append(marker)
        if marker == 0xDA:
            break
        i += 2 + struct.unpack(">H", data[i + 2:i + 4])[0]
    return markers


def jpeg_size(data):
    """(width, height) read from the JPEG's SOF header."""
    assert data[:2] == b"\xFF\xD8", "not a JPEG"
    i = 2
    while i + 9 <= len(data):
        assert data[i] == 0xFF, f"expected a marker at byte {i}"
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2):
            height, width = struct.unpack(">HH", data[i + 5:i + 9])
            return width, height
        assert marker != 0xDA, "no SOF header before the image data"
        i += 2 + struct.unpack(">H", data[i + 2:i + 4])[0]
    raise AssertionError("no SOF header found")
