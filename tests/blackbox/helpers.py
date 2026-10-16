"""Shared helpers for the black-box suite: CSRF-primed sessions and session login (AD-264).

CSRF is on, so every non-GET request needs an X-XSRF-TOKEN header equal to the XSRF-TOKEN cookie.
The backend sets that cookie on any response, so a session is "primed" by one GET first.
"""
import os

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
