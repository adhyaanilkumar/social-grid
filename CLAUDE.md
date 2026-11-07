# social-grid

Instagram-style photo sharing app. A learning project sized for one laptop. Current cycle: V0 (in `sdlc/v0/`).

## Stack (always use)
- Backend: Java 21, Spring Boot 3.5. Frontend: React 19 + Vite. Database: Postgres 18. Docker Compose. Git.
- Tests: JUnit (white box), pytest (black box), Playwright (UI, desktop and mobile).

## Commands (run from PowerShell; make is GNU make from MSYS2)
- `make build`: ends with "Build succeeded"
- `make lint`: ends with "Lint succeeded", zero javac -Xlint:all and oxlint warnings
- `make test`: JUnit, pytest, Playwright; ends with "All tests passed" (about 10 min, starts Docker)
- `make test-journey`: the spec 7.4 end-to-end journey. It restarts the backend, so run it alone
- `make stack-up`: app at http://localhost:5173, API at :8080
- `python evals/run.py [--case <name>]`: evals of Claude's setup; ends with "Gate: PASSED". On this laptop set `EVAL_WORKDIR=C:\git\.eval-work` (no spaces). Uses Pro usage

## How we work: the AI-native SDLC (playbook)
Each cycle lives in `sdlc/v<version>/`. Every stage commits an artifact the next stage reads, and I approve each one.
1. Plan: propose the version (big feature: 1→2; small feature: 1→1.1; small tweak or fix: 1.1→1.1.1) and I confirm it. Write `intent.md` (Problem, Proposed outcome, Affected users and systems, Constraints, Open questions).
2. Design: `spec.md` from the approved intent. Flag areas of concern and conflicting policies. Write my decisions into it, with the date.
3. Build: start in plan mode. Commit `build-plan.md` (files, order, risks, proof) before writing code, and update it in the same commit if the code departs from it. No tests in this stage. Stop for my review after each milestone, then make one commit per milestone.
4. Test: commit `test-plan.md` (suites, cases, who runs what) first. Then TDD: fix the code, not the test. At most 3 rounds per group (backend, frontend), then stop and hand over to me. Changes to CLAUDE.md, REVIEW.md, `.claude/` or `evals/` (including the pinned model) must pass the `evals` check; every incident adds an eval.
5. Deploy: when build, lint and test all pass, a hook opens a PR to `main`. Claude reviews each PR against `REVIEW.md` (advice only), and `@claude` comments from me get fixes pushed to the branch. I approve and merge it. Never push to `main`. CI (GitHub Actions) builds the images and runs the checks. I approve production releases. Rollback is one command, back to the previous image tag. A bug found during Deploy (by review, CI, a rehearsal or production) goes back through Stage 4's TDD loop: red (a test that fails because of the bug), green (fix the code, never the test), refactor (tidy up while staying green), then all suites again. At most 3 rounds per group, then stop and hand over to me. Log each bug in the cycle's `deploy-plan.md`.
6. Maintain: uptime checks, error tracking and daily database backups. Claude diagnoses problems on demand, and anything it finds becomes the next cycle's `intent.md`.

Budget: ₹3,500 a month is the cap across ALL my projects, not just this one, and social-grid is the first to deploy. Keep its share as low as reasonable (estimated ₹1,385–2,030). Before adding anything that costs money, state its monthly cost in INR and stop for my approval. Monitoring that covers all my projects will be planned separately later, so don't build it here.

## Verifying your work
Run `make build`, `make lint` and `make test` before reporting anything done, and paste the result lines.
Never skip, weaken or delete a failing test.

## Conventions
- Backend layers: Entity, Repository, Service (interface plus `impl/`), Controller. Errors go through `GlobalExceptionHandler` as `ErrorResponse`.
- Keep session login and CSRF as they are. Frontend API calls go through `apiFetch` in `frontend/src/api/client.ts`.
- One SQL query per feed page, including a user's posts page (NFR3). Page with keyset paging on `post_id`.
- JUnit database tests use Testcontainers (`TestDatabaseConfig`). Never use H2 or the dev database.
- Test users: pytest uses the prefix `t_bb_`, Playwright `t_ui_`. Feeds and search are shared, so never assume they're empty or have exact totals.
- UI/UX research goes to the `ui-ux-research` agent: Norman, *The Design of Everyday Things*; Krug, *Don't Make Me Think*.

## Architecture
- `src/main/java/com/socialgrid/`: controller, service, service/impl, repository, entity, dto, config, exception, validation
- `frontend/src/`: pages, components, api, lib. Tests are in `src/test`, `tests/blackbox` and `frontend/e2e`
- Photos are stored in Postgres (`post_images`, bytea) and re-encoded as JPEG on upload. The browser resizes them first.

## Things Claude gets wrong
- Windows PowerShell 5.1 breaks quoted arguments to git. Write commit messages to a file and use `git commit -F <file>`.
- In PowerShell, quote `"@journey"`. Unquoted, it's read as a variable.
- Never rebuild or restart Docker while another test suite is using it.
- In Claude's sandbox the test JVM can't write to `target/`. Set `MAVEN_ARGS=-DargLine=-Djava.io.tmpdir=<scratchpad>`.
- Don't run `make` from Git Bash inside the sandbox (Maven fails to start). Use PowerShell.
- Run `make test` in the foreground (it takes about 6 minutes). The PR hook runs when a command returns, and a background command returns as soon as it starts, so the hook never sees the pass.
- Claude Code file permission rules are `Edit(path)`, which also covers Write; `Write(path)` never matches. A path outside the working directory also needs `--add-dir`. `//` starts an absolute path.
- If PowerShell says `make` isn't recognized, add MSYS2 for that command: `$env:Path += ";C:\msys64\usr\bin"`.
