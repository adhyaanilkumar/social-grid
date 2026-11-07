# Implementation plan: social-grid MVP (V0 cycle), build phase

> Approved on 2026-11-03 and carried out as commits `9a26852` (M1) and `f4fb9dc` (M2). Copied unchanged from the Claude plan file `intent-md-spec-md-go-through-lazy-catmull.md`. It was written while `intent.md` and `spec.md` were at the repo root and Jira was still referenced; both are history.

## Context

Users can register and log in, but then land on a placeholder page. The backend has posts, comments, likes and follows, but no screens, feed, search, unfollow or photo storage. `intent.md` and `spec.md` (both approved) define the MVP.

This plan covers **implementation only**. Test suites and UI testing belong to the next phase.

I checked the spec against the code by reading it. I haven't run anything, and Docker isn't running right now.

## Your decisions so far

| # | Decision | Effect |
|---|---|---|
| A | Browsers keep photos for **1 day** | The image response is `private`, `max-age` 1 day, without `immutable`. Replaces the spec's 365 days. |
| B | The test phase uses **TDD with a loop** | I write the suites and keep fixing until they all pass. After 3 loops without passing, I stop and you step in. Not part of this plan. |
| C | **Stop for your review after each milestone** | Nothing starts on the next milestone until you've reviewed. |
| D | **One commit per milestone** | I commit after your review, on a `v0-mvp` branch because the repo is on `main`. Your uncommitted `.gitignore`, `.mcp.json`, `CLAUDE.md` and `README.md` edits and the stray files stay out of these commits. |
| E | **Research subagent in `.claude/agents/`** | See Setup. No `AGENTS.md`. |

## Decisions I need from you

These three change the approved spec or depend on your rule of picking components yourself.

**1. Composer: move it into a "New post" dialog? Recommended: yes.**
The spec puts it at the top of the Home and Explore feeds. Inline, it takes up the first mobile screen, disappears when you scroll, and on Explore implies you're posting *to* Explore. A "New post" button in the navigation works from every page and opens a dialog (full screen on mobile). It costs one extra click.

**2. Store each photo's width and height? Recommended: yes.**
This is a small backend addition beyond the spec: two nullable columns on `posts`, filled in by `normalizeToJpeg`, and returned in `PostView`. The page can then reserve the right space for each photo before it loads. Without them, either the page jumps as photos load, or every feed photo sits in a fixed-ratio frame with empty bands.

**3. 21st.dev components: which do you want?**
The design audit says only three component types are worth getting from a library. I recommend the plain shadcn versions, because they have nothing to strip out and match the existing `Button` and `Input`:

| Need | Recommended | Alternative |
|---|---|---|
| Dialog | [shadcn/dialog](https://21st.dev/@shadcn/components/dialog) | [originui/dialog](https://21st.dev/@originui/components/dialog) |
| Textarea | [shadcn/textarea](https://21st.dev/@shadcn/components/textarea) | [originui/textarea](https://21st.dev/@originui/components/textarea) |
| Skeleton (loading placeholder) | [shadcn/skeleton](https://21st.dev/@shadcn/components/skeleton) | [ddoemonn/skeleton-swap](https://21st.dev/@ddoemonn/components/skeleton-swap) |

I searched for ready-made post cards, bottom bars, upload dropzones, profile headers and comment threads too, and recommend against them. They bring things out of scope (share, bookmark, replies, reactions, multi-file upload, drag and drop). The [Bottom Nav Bar](https://21st.dev/@arunachalam/components/bottom-nav-bar) hides labels on inactive tabs, which the research advises against. If you'd like to look at one for inspiration anyway, [shadcnui-blocks Post Card](https://21st.dev/@shadcnui-blocks/components/card-06) is the closest. I only saw descriptions and preview links, not the code.

## Design direction from the research

Two research agents reported. **Their limits:** neither read the books themselves, so the Norman and Krug points come from summaries and Norman's own essays. Several sources couldn't be fetched, nothing was tested with users, and no screen was rendered. Contrast ratios are calculated, not measured on screen.

**Refine the current design, don't replace it.** Replacing it wouldn't solve anything they found. Its neutral greys don't tint photos, and the single blue works well as the "you can act here" signal. The real problems are contrast, focus and missing app-level rules.

**Fixes to existing styling (`index.css` and a few components):**
- Raise contrast where it fails AA (the accessibility standard: 4.5:1 for text, 3:1 for controls): input borders (1.26:1), focus rings (as low as 1.27:1), placeholders (2.71:1), error text and destructive buttons (3.99:1), muted text on muted backgrounds (4.34:1), and primary button hover (3.59:1).
- Use one focus style everywhere: 2px solid ring with a 2px offset.
- Follow the OS theme until the user chooses, set `color-scheme`, and apply the theme from an inline script in `<head>` to avoid a light flash.
- Add the logo to `Register.tsx` to match Login, and make `SamplePosts` stop misrepresenting the feed with cropped squares and a blue avatar.

**App layout:**
- **Feed:** 480px wide, full width on phones. Photos are never cropped: the frame follows the photo's ratio, limited to 4:5–1.91:1. Posts are separated by whitespace, not card boxes.
- **Grid:** stays square and 3-column as in the spec, with 4px gaps and up to 960px wide.
- **Desktop navigation:** a 56px solid top bar with logo, Home, Explore, search box, New post, profile, theme toggle and Log out.
- **Mobile navigation:** a 48px top bar with logo, theme toggle and Log out, and a 56px bottom bar with **Home, Explore, Search, New post, Profile**, always labelled in words. This changes the spec, which only moved the tabs.
- **Touch targets:** 44px for like, comment, delete and the bottom bar. The current buttons are 32–36px.
- **Motion:** 150ms colour and opacity changes only.

**Behaviour:**
- **Post card order:** username and delete, photo, like and comment row, caption, comments. Long captions collapse to about 3 lines with "more", so they can't push Like away.
- **Alt text:** `Photo by {username}`, not the caption, which would be read out twice and can run to 2,200 characters. Changes the spec.
- **Feed descriptions:** one line each, "From you and people you follow" and "Everyone's posts".
- **Navigation markup:** links with `aria-current`, not ARIA tabs, because these are separate pages. The current page is shown by more than colour.
- **Search:** "Your own profile isn't shown" note, and "Showing the first 20" at the limit.
- **Post dialog:** the phone's Back button closes it, using a history entry rather than a new endpoint.
- **Copy:** use the researched wording for empty, error and confirmation states, such as "Delete this post and its comments?" with [Delete post] and [Keep post].
- **Comment delete:** the same short inline confirmation as posts.

**Hand-written, not from a library:** bottom bar (`NavLink`), initials avatar (reused from `SamplePosts.tsx:22`), like button, file picker and inline confirmations.

**Left out as beyond scope:** a real photo description field, undo for delete, clickable follower counts, drag-and-drop upload.

## How I'll use MCPs and skills

| Tool | Use | Phase |
|---|---|---|
| **21st.dev MCP** | Search is done. I fetch only what you pick from the table above, install it, restyle it to our tokens, and check the API key wasn't written into any project file. AI generation isn't on your plan and isn't needed. | M2 |
| **Postgres MCP** | Read-only checks: confirm `post_images` and its foreign key exist, and that deleting a post removes its photo. It failed to connect this session because the database is down. If it still fails with Docker up, I'll use read-only `psql` through `docker exec`. | M1 |
| **Playwright MCP** | Not used in the build, as you asked. It belongs to the UI testing phase. | Test phase |
| **IDE diagnostics** | Check for type errors in files as I edit them. | M1, M2 |
| **Claude in Chrome** | Not used. It acts in your real browser with your sign-ins, which this doesn't need. | None |
| **Jira, Notion, Slack, Gmail, Drive, Calendar and others** | Not used. Agile tracking is scrapped, and nothing here needs them. | None |

**Skills:** there's no skill called "design" in this session. The nearest match is the design guide on the artifacts server, which I read. It's written for standalone pages, so the research above drives the design instead. I'd use `run` to start the app for the M1 checks, and `/simplify` on each milestone's code before your review if you want it.

## Setup: research subagent and spec update

**Create `.claude/agents/ui-ux-research.md`**, the location Claude Code registers subagents from, so it can be called by name.
- **Frontmatter:** `name: ui-ux-research`, a description saying when to use it, and read-only tools plus web search and fetch, so it can research but not change code.
- **Instructions:** apply *The Design of Everyday Things* (Norman) and *Don't Make Me Think* (Krug), as `CLAUDE.md` requires. Separate what comes from the books, from other named sources, and from its own inference, and never invent quotes. Say when it only used summaries. Stay inside the spec's scope and flag anything that isn't. Report in a short, fixed format.
- Claude Code may only pick up a new agent file when a session starts, so it may need a restart.

**Update `spec.md`** with the changes you approve here: the 1-day cache, the design direction, and decisions 1–3. It also fixes a wrong citation: 5.4 credits Krug with "omit needless steps", but summaries give "omit needless words".

## Spec gaps this plan fills

None of these change the spec's scope. Items 2–4 are my reasoning about library behaviour and haven't been run.

1. **`PUT /api/users/me/profile` also returns `ProfileResponse`** (`UserServiceImpl.java:70`). Adding counts to that record affects this endpoint too, so it has to fill them in.
2. **Wrong content type on `POST /api/posts`.** Sending JSON raises `HttpMediaTypeNotSupportedException`, which `GlobalExceptionHandler` doesn't catch, so the response wouldn't use `ErrorResponse` (NFR2). Add a 415 handler.
3. **Logout order.** The spec calls `queryClient.clear()` before setting `ME` to null. `clear()` removes the query that `AuthProvider` is subscribed to, so it may keep showing the old user until something re-renders it. Instead, remove every query except `ME`, then set `ME` to null. Use one helper for both logout and the 401 handler, because an expired session must not leave the old user's data cached either.
4. **Slow redirect on an expired session.** TanStack Query retries failed requests 3 times by default, with waits of about 1, 2 and 4 seconds, and the global `onError` only fires after that. The redirect to login would take about 7 seconds. Set the default `retry` to skip 4xx errors.

## M1: Backend

Follows Entity, Repository, Service, Controller, with the existing interface plus `impl` pattern. Files are under `src/main/java/com/socialgrid/`.

**Step 1: try the riskiest parts first.**
- Add `PostView` and `PostRepository.findHomeFeed`, and run the query against real Postgres. `Like` is also a keyword in the query language, and Hibernate may not match `PostView`'s primitive `long` to its constructor. If either fails, the fixes are an entity name or alias, and `Long`.
- Add `ImageServiceImpl` and try it in the real Docker image (R11).
- If either needs a design change, I come back to you before building on it.

**Step 2: photos.**
- Add the `PostImage` entity, `PostImageRepository` and a foreign key in `schema.sql`, following the existing pattern for comments and likes.
- `ImageServiceImpl.normalizeToJpeg` follows spec 4.4, and returns the dimensions if you approve decision 2.
- `PostServiceImpl.createPost` saves the post, its photo and `mediaUrl` in one transaction. Reuse `setMediaURL`, and remove `PostCreateRequest`.
- `PostController`: multipart `createPost` and `GET /{postId}/image`, with decision A's cache policy.
- `GlobalExceptionHandler`: the upload errors in spec 4.2, plus the 415 from gap 2.
- Add the multipart settings to `application.properties`, and `client_max_body_size 6m` to `frontend/nginx.conf`.

**Step 3: feeds, search and social.**
- `FeedService` and its `impl`: clamp `limit`, fetch `limit + 1` rows, build `nextCursor`. Add `FeedController`.
- `PostRepository`: Explore and per-user queries, plus `countByAuthorId`. `FollowsRepository`: the two counts.
- `FollowService.unfollow`, and `DELETE /api/users/{userId}/follow`.
- `UserRepository` search query. `UserServiceImpl`: `searchUsers`, plus counts and `followedByMe` on both `getProfile` and `updateProfile` (gap 1).
- `UserController`: search, user posts, unfollow, and the viewer's ID on profile.
- `CommentResponse` gains `authorUsername`. Use one joined query for the list, so reading comments stays one query rather than one per comment.
- `RegisterRequest`: username `@Pattern`, with the same rule in `frontend/src/lib/registerRules.ts`.

**Check before review (no test suites):**
- `docker compose up --build` builds and starts. You'll need to start Docker Desktop first.
- A few one-off `curl` calls: upload a photo, load it back, and fetch a feed.
- The Postgres checks from the MCP table.

**Then:** you review, and I make the M1 commit.

## M2: Frontend

Files are under `frontend/src/`.

**Step 1: design foundations.**
- The token, focus and theme fixes from the design direction, in `index.css`, `lib/theme.ts` and `index.html` (including `viewport-fit=cover` for the bottom bar).
- Install and restyle your 21st.dev picks.

**Step 2: data and session.**
- `api/client.ts`: `apiFetch` accepts `FormData` and leaves `Content-Type` unset. The CSRF header stays.
- `main.tsx`: the `QueryCache` and `MutationCache` 401 handling, plus the retry rule (gap 4). `Login.tsx` already uses `useMutation`, so the spec's `meta` opt-out works as written.
- The shared session-clearing helper in `AuthProvider` (gap 3).
- `api/feed.ts`, `posts.ts`, `comments.ts`, `users.ts`.

**Step 3: shell and routes.**
- `AppShell` with top and bottom bars, and `SearchBar`, inside the existing `RequireAuth` route in `App.tsx`.
- Move the logout logic out of `Home.tsx` into `AppShell`, keeping the button name "Log out". Move `ThemeToggle` out of `components/landing/` so both can share it.

**Step 4: posts.**
- `PostList`, `PostCard`, `PostComposer` (as a dialog if you approve decision 1), `lib/prepareImage.ts`, `CommentSection`.
- Likes, follows and double-submit guards as in spec 5.3.

**Step 5: pages.**
- `Home` (rewritten), `Explore`, `Search`, `Profile`, `PostGrid`, `PostDialog`.

**Check before review:** `npm run build` and `npm run lint` pass, and the Docker image builds. I won't do UI testing, so this shows the code compiles, not that the screens work.

**Then:** you review, and I make the M2 commit.

## What this phase leaves for the test phase

**Some existing tests will fail until then. That's expected, and I won't change them in this phase:**
- `tests/blackbox/test_register.py:217` creates a post with JSON, which stops working in M1.
- `test_register.py:252` is a strict `xfail`, meaning "this bug is known, and fail if it ever stops happening". The username rule fixes that bug, so the marker must come off.
- `frontend/e2e/auth.spec.ts` and `login.spec.ts` check the `Welcome` heading 11 times, and that heading goes away in M2. The mocked tests also need the new feed requests mocked.
- `frontend/e2e/landing.spec.ts:44,46` and `register.spec.ts:241` check styling classes. The design plan keeps those classes, but they need confirming.

Searching `src/test` found no use of the changed method signatures or `PostCreateRequest`, so the Docker build's test compile step shouldn't break. M1's build will confirm that.

**Not measured:** the spec's M0 baseline run moves here too. The current `main` commit stays untouched, so old failures can still be told apart from new ones.

**Also for the test phase:** everything in spec section 7, including the 7.4 end-to-end journey, cases for gaps 1–4, and checking the contrast ratios on the rendered screens.

## After the test phase: deployment

The spec's M4 stays blocked on your host choice. The spec 8.3 production changes happen then. R3 still applies before sharing the URL: with open signup and no moderation, anyone could upload illegal or abusive photos to your server.

## Out of scope for this plan

- Everything in spec 2.4.
- Test suites and UI testing (next phase).
- Any SDLC stage you haven't described yet.
