# Test phase plan: social-grid V0 (Stage 4)

> Approved on 2026-11-03 and carried out on 2026-11-07, committed as `1cf2c8c`. Restored word for word from the approved text, because the plan file it lived in was later overwritten.
>
> **Outcome:** all 10 bugs were fixed in round 1 of each group. At the end:
> - JUnit: 355 passing
> - pytest: 262 passing
> - Playwright: 598 passing, with 20 by-design skips (desktop-only or mobile-only tests)
> - The 7.4 journey passed.
>
> **Changes made during the phase:**
> - Rounds were counted per group (backend, frontend) rather than for the whole phase.
> - Fixes were made by 10 developer agents while 3 testers ran the suites.
> - V0 reached `main` as `f710abd` through the auto-merge hook, which a command triggered by mistake. From then on, changes go through PRs.

## Context

The V0 build is finished (commits `9a26852` backend, `f4fb9dc` frontend), and it was built with no tests on purpose (spec D10). This phase has to show that the app meets `spec.md`, and fix the code where it doesn't.

**Where things stand (from reading the code; no tests have been run yet):**

| Suite | Today | Gap |
|---|---|---|
| JUnit (white box) | 51 tests. Last run predates the V0 code (50 passed, 1 error). | Nothing from the V0 commits is tested. The feed queries have never been run by a test. |
| pytest (black box) | 92 cases, never run | Nothing from V0 is tested, and about 3 cases are out of date |
| Playwright (UI) | 132 runs (66 tests on 2 projects) | No feed, post, comment, search or profile flow is tested, and 11 assertions still expect the old `Welcome` heading |

**Blockers for the `CLAUDE.md` checks:** there is no Makefile, `make` isn't installed, no backend linter exists, and nothing prints "Build succeeded". Stage 0 fixes these.

**Out of scope:** FR12 and the deployed run of the journey (M4), the real-phone upload (R9), and `PUT` endpoints (C5).

## How the work is divided

Three agents write **and** run the tests. Only I change app code. There are two reasons for that split:

- If agents fixed code in parallel, one agent's backend rebuild would break another agent's test run halfway, producing failures that aren't real.
- An agent that can edit both the test and the code can make a test pass by weakening it.

| Agent | Owns (may edit) | May read | May not edit |
|---|---|---|---|
| **White box** | `src/test/**` | Everything, since white box tests are written from the code | App code, Docker files, other agents' tests |
| **Black box** | `tests/blackbox/**` | `spec.md`, `intent.md`, live API responses. **Not** `src/main`, so the tests check the spec rather than copying what the code does. | Same |
| **UI** | `frontend/e2e/**` | `spec.md`, plus `frontend/src` for selectors only | Same |

Rules for all three:
- A failing test is a result, so report it rather than reshaping it until it passes.
- No skips or deletions.
- No commits, and no rebuilding or restarting the stack.
- A test may only change if the test itself is wrong against the spec, and the report must say so.

Each agent reports every failure as: test name, the spec requirement it checks, expected result, actual result.

## Stage 0: Tooling (me, before any agent starts)

1. **Install `make`:** `C:\msys64\usr\bin\pacman -S make`, then add `C:\msys64\usr\bin` to the end of your user PATH. MSYS2 is already on this machine, so nothing new gets downloaded from elsewhere.
2. **Root `Makefile`:** a Makefile is a list of named commands. It sets `SHELL` to Git Bash, because plain `bash` on this PATH resolves to `C:\windows\system32\bash.exe` (the WSL launcher).
   - `make build`: Maven package, frontend build and Docker image build, ending with "Build succeeded".
   - `make lint`: backend compile with `-Xlint:all -Werror` (the Java compiler's own warnings, treated as errors) and `oxlint --deny-warnings` on the frontend. I chose compiler warnings over Checkstyle because they catch real problems, whereas Checkstyle mostly adds style arguments and a new tool.
   - `make test`: starts the stack, waits for `/api/auth/me` to return 401, then runs JUnit, pytest and Playwright. Also `test-white`, `test-black` and `test-ui` to run one suite.
3. **Test database:** add Testcontainers, a library that starts a throwaway Postgres container for the test run and deletes it afterwards. Today `SocialGridApplicationTests` connects to your dev database and runs schema changes on it. This fixes the failure the spec's section 7.1 asks about, without deleting the test. I'm not using H2 (an in-memory database) because the error handler depends on a Postgres error code and `post_images` uses `bytea`.
4. **Rebuild the stack from HEAD:** the running images were built before the last commits (backend image 00:37, commit 00:42; frontend image 00:50, commit 00:54).

## Stage 1: Write and run (3 agents in parallel)

Each agent first runs its existing suite to record a baseline, then writes the new tests and runs everything.

### White box: JUnit (spec 7.1, plus gaps found)
- **Unit tests with Mockito (fake dependencies):**
  - `FeedServiceImplTest`, `ImageServiceImplTest` (with every case in 7.1)
  - `FollowServiceImpl` unfollow, `UserServiceImpl` profile and search, `PostServiceImpl`, `CommentServiceImpl`
  - `RegisterRequest` username rule, and the untested `GlobalExceptionHandler` branches (413, 415, missing part, foreign key to 404)
- **Controller tests with `@WebMvcTest`:** `FeedController`, `PostController` and `UserController`: status codes, 401, CSRF.
- **Repository tests on real Postgres:** feed query order and filtering, keyset paging, search escaping of `%` and `_`, and **NFR3**: count the SQL statements for one feed page with Hibernate statistics, and require exactly one.

### Black box: pytest (spec 7.2)
- Add `create_post` to `helpers.py`, with a small PNG embedded in the code.
- New files: `test_feed`, `test_posts`, `test_images`, `test_comments`, `test_likes`, `test_follow`, `test_profile`, `test_search`.
- Must confirm what the spec left open:
  - `nosniff` and private `Cache-Control` on photos (4.4)
  - `ImageIO` working in the real Docker image (R11)
  - a 4 MB upload through nginx (`SOCIAL_GRID_PROXY_URL`)
  - no EXIF data left in stored photos, using a hand-built JPEG (FR13)
  - no email in any response (NFR5)
- Feeds and search are shared across all test users, so tests look for their own post IDs and never assume an empty feed or exact totals.

### UI: Playwright (spec 7.3, desktop and mobile)
- **Shared test helpers:** `e2e/helpers.ts` and image fixtures, including a JPEG flagged as rotated.
- **Update out-of-date mocked specs:** new heading, plus a catch-all mock for `/api/**` so mocked tests can't reach the real backend by accident.
- **New specs:** `shell`, `feed`, `composer`, `post-card`, `comments`, `search`, `profile`, `session`. They include:
  - session expiry, and a second user not seeing the first user's cached data
  - the grid: 3 columns, keyboard use, Escape and Back, broken image placeholder
  - `setInputFiles` uploads with non-zero `naturalWidth`, and the rotated photo coming out upright
  - no horizontal scrolling on any screen (NFR6)
- **Contrast check:** `@axe-core/playwright`, a new dev dependency, because spec 5.5 says the test phase must measure contrast.
- **`journey.spec.ts`:** the 8-step journey from 7.4, using two browser contexts against Docker (`E2E_BASE_URL=http://localhost:5173`). Written now, run in Stage 3.
- **Cleanup:** removes test users' posts, comments, likes and follows as well as the users (spec section 6). Passes for pytest data too, if the prefixes stay distinct from real accounts.

## Stage 2: TDD loop (me fixing, agents re-running)

I sort every failure into one of three groups:

| Type | Action |
|---|---|
| App bug | Fix the code, rebuild, re-run |
| Test contradicts the spec | The owning agent corrects it. I list each one for you. |
| Spec itself is unclear or wrong | Stop and ask you, not decide alone |

**A round** is: fix everything currently failing, rebuild, then all three agents re-run their whole suites. **After 3 rounds, I stop and hand you whatever is still failing,** with what I tried and my best guess at the cause. That's a total of 3 for the whole phase, not 3 per bug, which is the stricter reading of `CLAUDE.md`. Tell me if you meant per bug.

One flaky-test trap: `test_login.py:330` compares response timings, so running suites in parallel can upset it. If it fails under parallel load, I re-run it alone before calling it a bug.

### Which existing tests change, and why

`CLAUDE.md` says to fix the code and not the test, but the spec deliberately changed some behaviour. Only these are changed as test updates:

- **Expected by spec section 6:** the `Welcome` assertions in `auth.spec.ts` and `login.spec.ts`, and `test_register.py:216` (JSON post creation).
- **`xfail` markers:** `xfail` means "this test is expected to fail because of a known bug", so those bugs stay hidden behind a passing suite. **I plan to remove all 5 markers and treat them as real failures.**
  - Fix in code: multibyte password over 72 bytes giving a 500, password over 72 bytes accepted at login, NUL byte in the login identifier.
  - Already fixed, so just remove the marker: NUL byte in username.
  - `test_login.py:349`: the `@` in a username is now rejected, so this test's setup fails at registration. I'd rewrite it to assert that refusal. Accounts created before the rule could still have this problem.

  This is slightly beyond section 7, so say so if you'd rather leave them.

## Stage 3: Final checks (run one at a time, after all rounds pass)

1. `make build`, `make lint` and `make test`, one after another, each must pass.
2. `journey.spec.ts` on its own. Step 7 restarts the backend, which logs everyone out and would break any other suite running at the same time.

## Stage 4: Hand-off

1. **Report to you:** counts per suite before and after, each bug found and its fix, every test I changed and why, and what's still unproven.
2. **Your review.** I stop here.
3. **After your approval:** one commit containing only the test phase's work. Your uncommitted edits to `.mcp.json`, `CLAUDE.md`, `README.md` and `.gitignore`, and the stray files (`suffix`, `test-screenshots/`, `.playwright-mcp/`), stay out unless you say otherwise. No push until you ask.

## What a green result won't prove

- Anything about the deployed site, including the HTTPS and cookie settings in section 8 (M4).
- iPhone or Safari behaviour, or HEIC photos, because Playwright here runs Chrome only (R9).
- Behaviour under load, since these tests use one laptop and few users.
- Existing accounts created before the username rule. Tests only create new ones.

## Critical files

- **New:** `Makefile`, `frontend/e2e/helpers.ts`, `frontend/e2e/journey.spec.ts`, and test classes and `tests/blackbox/test_*.py` as listed above.
- **Changed for tests:** `pom.xml` (Testcontainers, lint flags), `frontend/package.json` (axe), `frontend/playwright.config.ts`, `tests/blackbox/helpers.py`, `SocialGridApplicationTests.java`.
- **Reused:**
  - `CsrfSession`, `login`, `logged_in` and `make_user` in `tests/blackbox/helpers.py` and `conftest.py`
  - `registerThroughApi` at `frontend/e2e/auth.spec.ts:36`
  - the cleanup pattern at `frontend/e2e/auth.spec.ts:65`
  - `SOCIAL_GRID_PROXY_URL` and `E2E_BASE_URL`, which are already supported
- **App code:** changes only as failures require, listed in the Stage 4 report.

## Verification

Phase is done when `make build` ends with "Build succeeded", `make lint` shows zero warnings, `make test` is all green with no skipped or deleted failing tests, and the 7.4 journey passes through Docker on desktop and mobile.
