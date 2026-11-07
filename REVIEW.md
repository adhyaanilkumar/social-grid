# Review instructions

Used by `.github/workflows/claude-review.yml` for every PR (AI-Native SDLC, Stage 5). The review is advice: it never
approves or blocks a PR. The owner decides and merges. Read `CLAUDE.md` first; its conventions are part of this policy.

## Passes
Run three passes, and tag each finding with its pass: **[Bugs]**, **[Security]** or **[Compliance]**.

- **Bugs:** logic errors, broken edge cases, regressions, race conditions, off-by-one errors in keyset paging, null
  handling, and error paths that don't go through `GlobalExceptionHandler` as `ErrorResponse`.
- **Security:**
  - session login and CSRF weakened or bypassed (they must stay as they are);
  - SQL built from strings;
  - a missing ownership check (a user editing or deleting someone else's data);
  - secrets, passwords or emails in committed files, logs or API responses;
  - untrusted image handling (format allowlist, size and dimension limits, re-encoding);
  - upload size limits;
  - new ports published in `deploy/compose.prod.yml`, and anything in `deploy/` that would reach the production
    database from outside.
- **Compliance:** the change does what the current cycle's `sdlc/v<version>/spec.md` and its plan
  (`build-plan.md`, `test-plan.md` or `deploy-plan.md`) say, and follows `CLAUDE.md`:
  - backend layers: Entity, Repository, Service (an interface plus `impl/`), Controller;
  - frontend API calls go through `apiFetch`;
  - one SQL query per feed page, with keyset paging on `post_id` (NFR3);
  - JUnit database tests use Testcontainers, never H2 or the dev database;
  - test users use the `t_bb_` and `t_ui_` prefixes;
  - **no test was skipped, weakened or deleted to make something pass.** A changed assertion needs a reason in the
    PR, and the reason must be the spec, not "the code does this now";
  - anything that costs money states its monthly INR cost and has the owner's approval.

## What Important means here
**Important** is reserved for findings that would break behaviour, lose or leak data, weaken security, or break a
rule above. Everything else is a **Nit**: naming, style, comments, small simplifications.

## Format
One PR comment:
1. A one-line verdict: "No Important findings", or "N Important findings".
2. The Important findings, each with `file:line`, its pass tag, what goes wrong (a concrete input or scenario), and
   a suggested fix.
3. At most **5 Nits**. Give any beyond that as a count only.
4. If the change makes `CLAUDE.md`, `REVIEW.md` or the cycle's plan out of date, say which line.

Be specific and brief. Don't praise, and don't restate the diff.

## Do not report
- `package-lock.json`, `frontend/dist/`, `target/`, `frontend/test-results/`, and anything generated.
- Anything `make lint` already enforces (javac `-Xlint:all` warnings, oxlint rules) and formatting.
- Findings about code the PR doesn't touch, unless the change breaks it.

## Learning from reviews
When a review flags the same kind of mistake a second time, the fix goes into `CLAUDE.md` under "Things Claude gets
wrong", in the PR that fixes it. Every month or so the owner removes noisy rules here and caps the Nits further.
