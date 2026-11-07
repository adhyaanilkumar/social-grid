"""Black-box tests for GET /api/users/search (FR5, NFR5, spec 4.2).

Search is global, so every query includes a random token only this test's users have.
"""
import uuid

import pytest

from conftest import make_user
from helpers import assert_logged_out, csrf_session

SEARCH = "/api/users/search"


def token():
    return uuid.uuid4().hex[:10]


def register(username):
    body = {"username": username, "password": "password1", "email": f"{username}@example.com"}
    r = csrf_session().post("/api/auth/register", json=body)
    assert r.status_code == 201, r.text
    return {**body, "id": r.json()["id"]}


@pytest.fixture
def me(logged_in):
    return logged_in("t_bb_srch")


def search(user, q):
    r = user["session"].get(SEARCH, params={"q": q})
    assert r.status_code == 200, r.text
    return r.json()


def names(results):
    return [u["username"] for u in results]


@pytest.mark.parametrize("change", [str.upper, str.lower, str.title], ids=["upper", "lower", "title"])
def test_matching_ignores_case(me, change):
    t = token()
    other = register(f"t_bb_MiXeD{t}")
    assert names(search(me, change(f"mixed{t}"))) == [other["username"]]


def test_matches_any_part_of_the_name(me):
    t = token()
    other = register(f"t_bb_a{t}z")
    for q in (t, t[2:7], f"a{t}", f"{t}z", other["username"]):
        assert names(search(me, q)) == [other["username"]], q


def test_result_is_id_and_username_only(me):
    t = token()
    other = register(f"t_bb_{t}")
    assert search(me, t) == [{"id": other["id"], "username": other["username"]}]


def test_excludes_the_searcher(me):
    assert search(me, me["username"]) == []


def test_other_users_still_found_when_searcher_also_matches(logged_in):
    t = token()
    a, b = make_user(f"t_bb_{t}"), logged_in(f"t_bb_{t}")
    assert names(search(b, t)) == [a["username"]]


def test_percent_is_not_a_wildcard(me):
    t = token()
    register(f"t_bb_{t}")
    assert search(me, f"%{t}") == []
    assert search(me, f"{t[:4]}%{t[6:]}") == []
    # '%' can't be in a new username, so a bare '%' can only find an account that literally has one.
    assert all("%" in name for name in names(search(me, "%")))


def test_underscore_matches_literally(me):
    t = token()
    with_underscore = register(f"t_bb_ab_cd{t}")
    register(f"t_bb_abxcd{t}")
    assert names(search(me, f"ab_cd{t}")) == [with_underscore["username"]]
    assert all("_" in name for name in names(search(me, "_")))


@pytest.mark.parametrize("q", ["\\", "'", '"', "%%", "__", "a'b--"])
def test_special_characters_are_not_an_error(me, q):
    assert isinstance(search(me, q), list)


@pytest.mark.parametrize("params", [{"q": ""}, {"q": "   "}, {}], ids=["empty", "spaces", "missing"])
def test_blank_or_missing_q_is_empty_list(me, params):
    r = me["session"].get(SEARCH, params=params)
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_at_most_20_results(me):
    t = token()[:6]
    made = {make_user(f"t_bb_s{t}")["username"] for _ in range(22)}
    results = names(search(me, t))
    assert len(results) == 20
    assert set(results) <= made


def test_no_email_in_response(me):
    t = token()
    other = register(f"t_bb_{t}")
    r = me["session"].get(SEARCH, params={"q": t})
    assert names(r.json()) == [other["username"]]
    assert other["email"] not in r.text
    assert "email" not in r.text.lower()
    assert "password" not in r.text.lower()


def test_email_address_isnt_searchable(me):
    t = token()
    other = register(f"t_bb_{t}")
    assert search(me, other["email"]) == []


def test_logged_out_is_401():
    assert_logged_out(f"{SEARCH}?q=a")
