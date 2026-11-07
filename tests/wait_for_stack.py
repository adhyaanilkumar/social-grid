"""Waits until the Docker stack can serve requests, because the compose file has no backend healthcheck.

A logged-out GET /api/auth/me returning 401 means Spring has started and the request reached it.
Checks the backend directly and through nginx.
"""
import os
import sys
import time
import urllib.error
import urllib.request

URLS = [
    os.environ.get("SOCIAL_GRID_URL", "http://localhost:8080") + "/api/auth/me",
    os.environ.get("SOCIAL_GRID_PROXY_URL", "http://localhost:5173") + "/api/auth/me",
]
TIMEOUT_SECONDS = 120


def status_of(url):
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except OSError:
        return None


def main():
    deadline = time.monotonic() + TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if all(status_of(url) == 401 for url in URLS):
            print("Stack is ready")
            return 0
        time.sleep(2)
    for url in URLS:
        print(f"{url} -> {status_of(url)}, expected 401", file=sys.stderr)
    print(f"Stack not ready after {TIMEOUT_SECONDS} seconds", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
