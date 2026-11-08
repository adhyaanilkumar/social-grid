"""Black-box tests for GET /api/health, the uptime monitor's target (maintain-plan.md MT3).

UptimeRobot calls it anonymously with Accept */* every 5 minutes. On the free plan only 2xx and 3xx count as up.
"""
import requests

from helpers import BASE, PROXY

HEALTH = "/api/health"


def test_health_is_up_and_public():
    r = requests.get(f"{BASE}{HEALTH}", headers={"Accept": "*/*"}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json() == {"status": "UP"}


def test_health_creates_no_session():
    r = requests.get(f"{BASE}{HEALTH}", headers={"Accept": "*/*"}, timeout=10)
    assert "JSESSIONID" not in r.cookies


def test_health_through_the_frontend_proxy():
    # The monitor goes through the proxy in front of the backend, as on the server.
    r = requests.get(f"{PROXY}{HEALTH}", headers={"Accept": "*/*"}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json() == {"status": "UP"}
