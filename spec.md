# Spec: social-grid MVP (V0 cycle)

Cycle: V0. Source: `intent.md` (approved). Status: approved. Date: 2026-11-02.

**Readiness:** the backend, frontend and tests (milestones M0–M3) are ready to start. Deployment (M4) cannot finish until a host is chosen, which you've chosen to decide later. Later SDLC stages are unknown, so this spec doesn't assume any process after it.

## 1. Decisions

| # | Question | Decision | Effect |
|---|---|---|---|
| D1 | What is a post? | **An uploaded photo**, with an optional caption. No text-only posts and no pasting image links. Replaces the earlier image-URL decision, because most users have no link to their own photo. | Changes `POST /api/posts`, adds image storage, and makes the landing page's "Post photos" true. |
| D2 | Which host? | **Decide later**, at M4. Section 8 lists what any host must provide. | Blocks M4 only. |
| D3 | Accept that restarting or sleeping the backend logs everyone out? | **Yes**, for the MVP. | See R1. |
| D4 | Which additions beyond `intent.md`? | **Posts on the profile as a grid. No post dates.** Username rule and "Load more" paging stay. | See section 2.3. |
| D5 | How long may a browser keep a photo? | **1 day**, `private`, not `immutable`. Replaces the earlier 365 days. | A shorter window limits how long a cached photo stays reachable after logout or deletion. See 4.4. |
| D6 | Where does the composer live? | **A "New post" button in the navigation, opening a dialog** (full screen on mobile). Replaces the composer at the top of the feeds. | Works from every page. See 5.2. |
| D7 | Store photo dimensions? | **Yes**: nullable `width` and `height` on `posts`, returned in `PostView`. | The page reserves each photo's space before it loads. See 4.1 and 5.5. |
| D8 | Which 21st.dev components? | **originui Dialog and Textarea, shadcn Skeleton.** | Restyled to the design tokens. See 5.2. |
| D9 | Keep or replace the visual design? | **Refine it.** Research found contrast, focus and app-layout problems, not a reason to replace it. | See 5.5. |
| D10 | How are build and test ordered? | **Separate phases.** The build has no test suites or UI testing. The test phase is TDD: loop until all suites pass, and the owner steps in after 3 loops. | Replaces the milestone tests in section 10. Section 7 is the test phase's scope. |

## 2. Requirements

### 2.1 Functional requirements

All of these apply to logged-in users only. Logged-out requests get 401 from the API, and logged-out page visits redirect to `/login`.

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR1 | Create a post | The user chooses a photo from their device, sees a preview, and can add a caption of at most 2,200 characters. Sideways phone photos appear the right way up. A missing, unreadable or unsupported file gives an inline message. The post appears at the top of the author's Home and Explore without a page reload. |
| FR2 | Delete own post | The delete control shows only on the user's own posts and asks for confirmation inline. Its likes and comments are removed too. Deleting someone else's post through the API gives 403. |
| FR3 | Home tab | Shows the user's own posts and posts by people they follow, newest first. Posts by anyone else never appear. New users see their own posts or a prompt to create a post or go to Explore (see 5.4). |
| FR4 | Explore tab | Shows everyone's posts, including the user's own, newest first. |
| FR5 | Search users | The search bar finds other users by username. Matching ignores case and matches any part of the name. The searcher is excluded. Results link to profiles and never include email addresses. `%` and `_` match literally. |
| FR6 | View a profile | Any user's profile loads at `/users/{username}` and shows username, name and bio if set, post, follower and following counts, and a grid of that user's posts, newest first. Selecting a grid tile opens the full post, with likes, comments and delete. An unknown username shows a not-found message. |
| FR7 | Follow and unfollow | Other users' profiles have a Follow/Unfollow button. Counts update and the Home feed changes straight away. Users can't follow themselves. |
| FR8 | Like and unlike | A post shows its like count and whether the viewer liked it. The display updates immediately and rolls back with a message if the request fails. A double click does not show an error. |
| FR9 | Comment | A user can read and add comments on any post. Comments show the author's username, oldest first, at most 1,000 characters. |
| FR10 | Delete own comment | The delete control shows only on the user's own comments. Deleting someone else's through the API gives 403. A post's author can't delete other people's comments, as `intent.md` says users can delete only their own. |
| FR11 | Own profile | Reachable from the navigation on every members-only page, using the same page as FR6, without a follow button. |
| FR12 | Deployed | The whole journey in section 7.4 works on a public HTTPS URL. |
| FR13 | Serve uploaded photos | Photos load only for logged-in users, survive a backend restart, and are removed when their post is deleted. Stored photos contain no metadata such as GPS location. |

### 2.2 Non-functional requirements

| ID | Requirement |
|---|---|
| NFR1 | Backend code follows Entity, Repository, Service and Controller layers, with the existing service interface plus `impl` pattern (`CLAUDE.md`). |
| NFR2 | Existing session login, CSRF and error format stay as they are. Errors use `ErrorResponse`. |
| NFR3 | One feed page makes one database query, not one per post (see 4.3). This includes a user's posts page (`GET /api/users/{username}/posts`): looking up the user must not add a second query, and an unknown user still gives 404. Decided 2026-11-07. |
| NFR4 | Sized for one laptop or one small host. No caching layer, queues, replicas or new indexes. |
| NFR5 | No response exposes another user's email or password hash. |
| NFR6 | Works on the desktop and mobile Playwright projects, with no horizontal scrolling on mobile. |
| NFR7 | No secrets in committed files. Production database credentials come from environment variables. |

### 2.3 Additions beyond `intent.md` (D4)

Each one exists because the intent doesn't work well without it. You've approved these.

| Addition | Why |
|---|---|
| A grid of a user's posts on their profile (`GET /api/users/{username}/posts`) | A post count with no way to see the posts is a dead end. Reuses the feed query. |
| Username character rule for new accounts | Profile URLs contain the username. Today's rule allows characters like `/`, which would make a profile unreachable. |
| "Load more" paging on feeds | Without it, each feed request returns every post ever made. |

### 2.4 Out of scope

Hashtags, editing posts or comments, text-only posts, pasted image links, multiple photos per post, video, profile picture upload, post dates, profile editing screens, follower and following lists, notifications, moderation, password reset, email verification.

## 3. Current state

Measured by reading and running the code on 2026-11-02, on Windows with Git Bash.

| Check | Result |
|---|---|
| Size | 1,629 lines of backend Java and 1,836 lines of frontend source (tracked files) |
| JUnit (`mvn test`) | 51 run, 50 passed, 1 error. `SocialGridApplicationTests` couldn't start. Docker wasn't running, so Postgres was unavailable, which I believe is the cause; I didn't re-run with Postgres up. |
| pytest (`tests/blackbox`) | 92 collected, **not run**, because they need the backend and Postgres |
| Playwright | 132 total: 107 passed, 25 skipped because they need the real backend. This means the mocked tests pass, but the real-backend journeys were **not exercised**. |
| Frontend build | Succeeds |

**Exists and can be reused:** posts (create, get, update, delete), comments (create, list, update, delete), likes, follow, profile lookup, session login, CSRF, `apiFetch`, TanStack Query, `RequireAuth`, and pytest helpers (`CsrfSession`, `logged_in`).

**Missing (searches for these across source and tests found nothing):** a feed endpoint, user search, unfollow, comment counts, `likedByMe`, and any post-listing query. `PostRepository` has no custom queries at all.

**Problems found that this spec has to deal with:**

- `POST /api/posts` accepts only JSON with a `mediaUrl`, so it can't receive a file. Nothing in the app stores images.
- `frontend/nginx.conf` sets no upload limit, so nginx's 1 MB default applies and would reject larger uploads in Docker before they reach Spring.
- `apiFetch` always sends JSON, so it can't send a file yet.
- `PostResponse` and `CommentResponse` have author IDs but no usernames, so the UI couldn't show who wrote anything.
- `toResponse` in `PostServiceImpl` runs a separate like-count query per post, which would be slow if reused for a feed.
- The frontend clears only the "who am I" cache on logout. Once feeds are cached, the next person to log in on that browser could briefly see the previous user's data.
- `AuthProvider` caches login state forever (`staleTime: Infinity`), so an expired session would cause failed requests instead of a redirect to login.
- The session cookie has no `Secure` flag, and `spring.jpa.show-sql=true` is always on.
- `posts.author_id`, `comments.author_id`, `likes.user_id` and both `follows` columns have no foreign keys. `schema.sql` only covers the post side. See R6.

## 4. Backend design

### 4.1 Data model

"Newest first" sorts by `post_id`. IDs come from an always-increasing sequence, so a higher ID is a newer post. IDs are also unique, which makes paging simple.

One new table holds the photos:

```java
@Entity
@Table(name = "post_images")
public class PostImage {
    @Id
    private Integer postId;      // one photo per post, same ID as the post

    // bytea stores the bytes in the row. Don't add @Lob: on Postgres it switches to a separate large-object store.
    @Column(nullable = false, columnDefinition = "bytea")
    private byte[] data;         // always a JPEG, see 4.4
}
```

`posts` also gains nullable `width` and `height` columns holding the stored JPEG's size (D7). They're nullable so that existing rows stay valid.

`ddl-auto=update` creates the table and columns at startup. `schema.sql` adds a foreign key to `posts` with `ON DELETE CASCADE`, in the same way as comments and likes, so deleting a post deletes its photo.

**Why Postgres and not disk or cloud storage:**

| Option | Result |
|---|---|
| Postgres (**chosen**) | Already in the required stack, works on any host, and is covered by the same backups. Costs database space, which resizing keeps small. |
| Container disk | Rejected: container disks usually don't survive a restart or redeploy, so photos would vanish. |
| Object storage such as S3 | Rejected for now: a new external service, account and set of credentials that `CLAUDE.md`'s stack doesn't list. It's the normal choice at larger scale. |

A separate table means feed queries never load photo bytes, because they don't touch it. The UI only uses `posts.media_url`, which holds `/api/posts/{id}/image`, so moving storage later wouldn't change the frontend.

### 4.2 API

Everything needs a login. Non-GET requests need the CSRF header, which `apiFetch` already sends.

| Method and path | Status | Purpose |
|---|---|---|
| `GET /api/feed/home?before&limit` | New | Home feed, returns `PostPage` |
| `GET /api/feed/explore?before&limit` | New | Explore feed, returns `PostPage` |
| `GET /api/users/{username}/posts?before&limit` | New | A user's posts, returns `PostPage`. 404 for an unknown user. |
| `GET /api/users/search?q=` | New | Up to 20 `UserSummary` results. A blank or missing `q` returns `[]`. |
| `DELETE /api/users/{userId}/follow` | New | Unfollow, returns 204. 404 if not following. |
| `GET /api/users/{username}/profile` | Changed | Adds counts and `followedByMe` |
| `GET /api/posts/{postId}/comments` | Changed | Adds `authorUsername` |
| `POST /api/posts/{postId}/comments` | Changed | Adds `authorUsername` |
| `POST /api/posts` | Changed | Now `multipart/form-data` (the browser's format for sending files) with an `image` file and an optional `caption`. Returns the same `PostResponse`, with `mediaUrl` set to the photo's path. 400 for a bad file, 413 if too large. |
| `GET /api/posts/{postId}/image` | New | Returns the photo as `image/jpeg`, cacheable by the browser. 404 if there's no photo. |
| `POST /api/auth/register` | Changed | New username rule (below) |
| `DELETE /api/posts/{id}`, `DELETE /api/comments/{id}`, `POST` and `DELETE /api/posts/{id}/likes`, `POST /api/users/{id}/follow` | Reused | No change |
| `PUT /api/posts/{id}`, `PUT /api/comments/{id}` | Left alone | Editing is out of scope, so no UI calls these. See C5. |

Paging: `limit` defaults to 20 and is clamped to 1–50. `before` is the `nextCursor` from the previous response. This is called keyset paging: "give me posts older than ID X". It's used instead of "skip the first 40", because a new post would shift every position and show duplicates.

```java
record PostView(Integer postId, Integer authorId, String authorUsername, String mediaUrl, String caption,
                Integer width, Integer height, long likeCount, long commentCount, boolean likedByMe) {}
record PostPage(List<PostView> items, Integer nextCursor) {}   // nextCursor is null on the last page
record UserSummary(Integer id, String username) {}
record ProfileResponse(Integer userId, String username, String firstName, String lastName, String bio,
                       String profilePicUrl, long postCount, long followerCount, long followingCount,
                       boolean followedByMe) {}
record CommentResponse(Integer commentId, Integer authorId, String authorUsername, Integer postId,
                       String message) {}
```

Validation changes:

```java
@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
@ResponseStatus(HttpStatus.CREATED)
public PostResponse createPost(@AuthenticationPrincipal SecurityUser me,
                               @RequestPart("image") MultipartFile image,
                               @RequestParam(required = false) String caption) throws IOException {
    // Processed before the database transaction, so a slow image doesn't hold a database connection.
    byte[] jpeg = imageService.normalizeToJpeg(image.getBytes());
    return postService.createPost(me.getId(), jpeg, caption);
}
```

`PostCreateRequest` is removed. `PostServiceImpl.createPost` checks the caption length and throws `BadRequestException` with "Captions can be up to 2,200 characters". It then saves the post, saves its `PostImage`, and sets `mediaUrl`, all in one transaction, so a post can't exist without its photo.

`GlobalExceptionHandler` gains these cases:

| Exception | Response |
|---|---|
| `MaxUploadSizeExceededException` | 413, "That photo is too large" |
| `MissingServletRequestPartException` | 400, "Choose a photo to post" |
| `MultipartException` | 400, "Malformed request" |

New settings in `application.properties`:

```properties
spring.servlet.multipart.max-file-size=5MB
spring.servlet.multipart.max-request-size=6MB
# Lets Tomcat read an over-limit upload and answer 413, instead of dropping the connection.
server.tomcat.max-swallow-size=10MB
```

`RegisterRequest.username` gains `@Pattern(regexp = "^[A-Za-z0-9][A-Za-z0-9._-]*$", message = "Username can only use letters, numbers, dots, dashes and underscores")`, and `registerRules.ts` gets the same check and wording. Existing accounts aren't changed.

### 4.3 Layer changes

| Layer | File | Change |
|---|---|---|
| Entity | New `PostImage` | See 4.1 |
| Repository | New `PostImageRepository` | `JpaRepository<PostImage, Integer>` |
| Service | New `ImageService` and `impl/ImageServiceImpl` | `normalizeToJpeg`, see 4.4 |
| Service | `PostService`, `impl` | `createPost` takes the JPEG bytes and caption. Add `getImage`. |
| Controller | `PostController` | Multipart `createPost`, add `GET /{postId}/image` |
| Exception | `GlobalExceptionHandler` | Upload errors, see 4.2 |
| Repository | `PostRepository` | Add the three feed queries and `countByAuthorId` |
| Repository | `FollowsRepository` | Add `countByIdFolloweeId` and `countByIdFollowerId` |
| Repository | `UserRepository` | Add `findTop20ByUsernameContainingIgnoreCaseAndIdNotOrderByUsernameAsc` |
| Repository | `CommentRepository` | Add a query returning comments with author usernames |
| Service | New `FeedService` and `impl/FeedServiceImpl` | Home, Explore and per-user pages: clamp `limit`, build `nextCursor` |
| Service | `FollowService`, `impl` | Add `unfollow` |
| Service | `UserService`, `impl` | Add `searchUsers`. `getProfile` takes the viewer's ID and fills in counts. |
| Service | `CommentServiceImpl` | Include `authorUsername`, which adds `UserRepository` as a dependency |
| Controller | New `FeedController` | `/api/feed/home`, `/api/feed/explore` |
| Controller | `UserController` | Add search, unfollow and user posts. Pass the viewer's ID to profile. |
| DTO | See 4.2 | New and changed records |

**The feed query.** Calling `toResponse` for each post would be an "N+1" problem: one query for the list, then N more for the details. A page of 20 would run about 60 queries. Instead, one query fetches everything:

```java
@Query("""
    SELECT new com.socialgrid.dto.PostView(p.postId, p.authorId, u.username, p.mediaUrl, p.caption,
        (SELECT COUNT(l) FROM Like l WHERE l.likeId.postId = p.postId),
        (SELECT COUNT(c) FROM Comment c WHERE c.postId = p.postId),
        CASE WHEN EXISTS (SELECT 1 FROM Like m WHERE m.likeId.postId = p.postId AND m.likeId.userId = :me)
             THEN true ELSE false END)
    FROM Post p JOIN User u ON u.id = p.authorId
    WHERE p.postId < :before
      AND (p.authorId = :me
           OR p.authorId IN (SELECT f.id.followeeId FROM Follows f WHERE f.id.followerId = :me))
    ORDER BY p.postId DESC
    """)
List<PostView> findHomeFeed(@Param("me") Integer me, @Param("before") Integer before, Pageable page);
```

- Explore drops the author condition, and the per-user page uses `p.authorId = :authorId`.
- The service asks for `limit + 1` rows. An extra row means another page exists, and `nextCursor` is the last ID actually returned.
- A missing `before` becomes `Integer.MAX_VALUE` in the service, rather than a null parameter, because optional null parameters often cause type errors in Postgres.
- I haven't run this query. M1 must confirm that Hibernate accepts it, and a JUnit or pytest test must confirm that the order and filtering are right.

**Search escaping.** Spring Data should escape `%` and `_` in `Containing` queries. FR5's test checks this rather than relying on it, which matters because test usernames contain `_`.

**Security config.** No change is needed for access rules, because `anyRequest().authenticated()` already covers the new endpoints, including photos. Browsers send the session cookie for same-origin `<img>` requests, so photos load normally.

### 4.4 Image processing

Uploaded files are untrusted, so the server never stores or serves what it receives. `ImageServiceImpl.normalizeToJpeg` uses Java's built-in `ImageIO`, with no new dependency:

1. **Identify the format from the file's contents.** The file name and declared type can be faked. Accept only JPEG and PNG, otherwise 400 "Upload a JPEG or PNG photo". SVG is rejected, because SVG files can contain scripts.
2. **Check the dimensions before decoding.** Reject anything over 8,000 pixels on a side or 40 million pixels in total. A tiny file can decode into gigabytes of memory, which is called a decompression bomb.
3. **Decode and redraw.** Shrink so the longest side is at most 1,080 pixels, draw onto a new white background (which handles PNG transparency), and encode as JPEG at quality 0.85.
4. **Treat any decode failure as a 400** with "We couldn't read that photo", not a 500.

Redrawing onto a new image is what removes metadata, including GPS location from phone photos. It also means the browser only ever receives a JPEG the server made itself.

**The image response:**

```java
return ResponseEntity.ok()
        .contentType(MediaType.IMAGE_JPEG)
        // private: only this user's browser may cache it. A cached photo skips the login check, so keep the window short (D5).
        .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePrivate())
        .body(bytes);
```

Spring Security adds `no-cache` headers by default, and should leave a controller's own `Cache-Control` in place. The pytest suite must confirm this, along with the `nosniff` header that stops browsers guessing at a file's type.

**Sideways photos.** Phones often save photos sideways, with a metadata flag saying how to rotate them. `ImageIO` ignores that flag, and step 3 removes it, so processing on the server alone would leave photos sideways. The browser therefore resizes first (see 5.2), which applies the rotation. Someone calling the API directly with a sideways photo only affects their own post.

## 5. Frontend design

### 5.1 Routes

| Path | Page | Notes |
|---|---|---|
| `/`, `/login`, `/register` | Existing | Public |
| `/home` | `Home` (rewritten) | Home feed |
| `/explore` | `Explore` (new) | Explore feed |
| `/search?q=` | `Search` (new) | Results. The URL keeps the query, so Back and refresh work. |
| `/users/:username` | `Profile` (new) | Own or another user's: header, counts and post grid. Encode the username with `encodeURIComponent`. |

All members-only routes sit inside `RequireAuth` and a new `AppShell` layout route.

### 5.2 Components

| File | Purpose |
|---|---|
| `api/client.ts` | `apiFetch` accepts `FormData`: send it as is and don't set `Content-Type`, because the browser must add the multipart boundary itself. The CSRF header stays. |
| `api/feed.ts`, `api/posts.ts`, `api/comments.ts`, `api/users.ts` | Typed calls through `apiFetch`, mirroring the DTOs |
| `components/app/AppShell.tsx` | Desktop top bar: logo (goes to `/home`), Home, Explore, search box, New post, profile, theme toggle, Log out. Mobile: top bar with logo, theme toggle and Log out, plus a bottom bar with Home, Explore, Search, New post and Profile, always labelled in words. |
| `components/app/SearchBar.tsx` | A form that navigates to `/search?q=` on Enter or button press. No live dropdown. |
| `components/post/PostList.tsx` | `useInfiniteQuery`, "Load more" button, loading, empty and error states |
| `components/post/PostCard.tsx` | Author link, image, caption, like button, comment toggle, delete |
| `components/post/PostComposer.tsx` | A dialog opened from New post, full screen on mobile (D6). "Choose photo" button (a real file input, so keyboard and phone gallery or camera work), preview, remove photo, optional caption, character limit, "Posting…" state, inline errors |
| `lib/prepareImage.ts` | In the browser: `createImageBitmap(file)` applies rotation, a canvas shrinks the longest side to 1,080 pixels, and it outputs a JPEG. A 10 MB phone photo becomes a few hundred KB before upload. Files over 25 MB or that the browser can't read get an inline error. |
| `components/post/CommentSection.tsx` | Loads comments only when opened. Add and delete. |
| `components/profile/PostGrid.tsx` | Square image tiles, 3 columns on every screen size, "Load more", and an empty state. Each tile is a button with the caption or "Post by {username}" as its accessible name. Hover shows nothing extra, so the same information reaches touch users. |
| `components/profile/PostDialog.tsx` | Opens the selected tile's `PostCard` in a dialog built on the existing `radix-ui` dependency, which handles Escape and keyboard focus. Uses data the grid already fetched, so no new endpoint is needed. Closes after the post is deleted. |

Reuse the existing `Button`, `Input` and `Field`. `Dialog` and `Textarea` come from originui on 21st.dev, and `Skeleton` from shadcn on 21st.dev (D8).

**Image rendering.** Use `<img loading="lazy">` with the post's `mediaUrl`, and alt text "Photo by {username}". The caption sits beside the photo, so using it as alt text would be read out twice. Grid tiles use empty alt text, because the tile button already has a name. If a photo fails to load, show an "Image unavailable" placeholder, so the tile stays selectable and the post can still be opened or deleted. The composer's preview uses `URL.createObjectURL`, released when the photo changes or the form clears.

**Nginx.** Add `client_max_body_size 6m;` to `frontend/nginx.conf`. A 413 from nginx has no JSON body, so the composer shows "That photo is too large" based on the status code.

### 5.3 Data and state

| Query key | Refreshed after |
|---|---|
| `['feed', 'home']`, `['feed', 'explore']` | Creating or deleting a post, follow or unfollow (Home only) |
| `['posts', 'user', username]` | Creating or deleting a post |
| `['profile', username]` | Creating or deleting a post, follow or unfollow |
| `['comments', postId]`, plus the feed queries for the comment count | Adding or deleting a comment |
| `['search', q]` | Not refreshed by mutations |

- **Grid dialog:** the dialog stores the selected `postId` and reads the post from the `['posts', 'user', username]` cache, so likes and comment counts stay current while it's open.
- **Likes:** update the cached post immediately, in every feed and grid cache that holds it, and put it back if the request fails. A 409 on like and a 404 on unlike mean the state is already what the user wanted, so treat them as success.
- **Follow and unfollow:** treat 409 and 404 in the same way as likes.
- **Double submits:** use a `useRef` guard on the composer and comment form, as `Login.tsx` already does.
- **Logout (security fix):** call `queryClient.clear()` before setting `ME` to null, so the next user can't see the previous user's cached data.
- **Expired sessions:** a global `QueryCache` and `MutationCache` `onError` in `main.tsx` sets `ME` to null on a 401, which makes `RequireAuth` redirect to login. The login mutation opts out with `meta`, because a 401 there means a wrong password.

### 5.4 Usability principles

These apply Norman's *The Design of Everyday Things* and Krug's *Don't Make Me Think*. Two research agents later checked them against summaries of the books and other sources, not the books themselves. Section 5.5 holds the results.

| Principle | Applied as |
|---|---|
| Don't make users guess (Krug) | Tabs are labelled "Home" and "Explore" in words, and the current tab is highlighted. |
| Feedback (Norman) | Likes respond instantly. Buttons show pending states. Errors appear next to what failed. |
| Constraints (Norman) | Delete only appears on your own content. No follow button on your own profile. |
| Signifiers (Norman) | Counts on profiles are plain text, since they lead nowhere. Usernames look like links, and are. |
| Mapping (Norman) | Like and comment sit directly under the photo they act on. |
| Conceptual model (Norman) | Each feed says what it holds: "From you and people you follow" and "Everyone's posts". |
| Ease over click count (Krug) | New post is one clear click away on every page. Comments expand in place. |
| Empty states guide the next action | A new user's Home points to New post and Explore instead of showing nothing. |

Keep the agreed visual rules: one brand colour, 8px spacing, and no carousels or fake stats. The landing page's "Post photos" copy stays as it is.

### 5.5 Design direction (D9)

Contrast ratios here are calculated, not measured on rendered screens. The test phase must check them.

**Fixes to existing styling:**

- Raise contrast where it fails WCAG AA (4.5:1 for text, 3:1 for controls): input borders, focus rings, placeholders, error text and destructive buttons, muted text on muted backgrounds, and primary button hover.
- Use one focus style everywhere: 2px solid ring with a 2px offset. **Exception (decided 2026-11-07):** profile grid tiles draw the 2px ring inside the tile (offset -4px), because tiles are only 4px apart and an outside ring would overlap the neighbouring tile.
- Follow the OS theme until the user chooses, set `color-scheme`, and apply the theme from an inline `<head>` script to avoid a light flash.
- Add the logo to the register page, and make the landing page's sample posts match the real feed.

**Layout:**

| Item | Value |
|---|---|
| Feed | 480px wide, full width on phones. Posts are separated by whitespace, 32px on desktop and 24px on mobile. |
| Feed photos | Never cropped. The frame follows the photo's ratio from `width` and `height`, limited to 4:5–1.91:1, using `object-contain` on the muted colour, at most `100svh - 112px` tall. |
| Grid | Square tiles, 3 columns, `object-cover`, 4px gaps, up to 960px wide. |
| Navigation | Breakpoint at 768px. Desktop top bar 56px, solid rather than blurred. Mobile top bar 48px, bottom bar 56px plus the safe area. |
| Touch targets | 44px for like, comment, delete and the bottom bar. |
| Motion | 150ms colour and opacity changes only. |

**Behaviour:**

- Post card order: username and delete, photo, like and comment row, caption, comments. Long captions collapse to about 3 lines with "more".
- Navigation uses links with `aria-current`, not ARIA tabs, and marks the current page with more than colour.
- Search shows "Your own profile isn't shown", and "Showing the first 20" at the limit.
- The phone's Back button closes the post dialog, using a history entry.
- Deleting a post or comment asks inline, for example "Delete this post and its comments?" with [Delete post] and [Keep post].
- Expired sessions say "Your session ended. Log in again."

## 6. Files that also need attention

- `frontend/e2e/auth.spec.ts` and `login.spec.ts` check `/home`, including the `Welcome` heading. These must be updated on purpose, not left to fail. Keep the button name "Log out" to reduce this. Mocked tests also need the new feed requests mocked.
- `tests/blackbox/test_register.py` line 218 creates a post with JSON, which will stop working. Change it to use a new `create_post` helper in `helpers.py`, which uploads a small PNG embedded in the test code. No new test dependency is needed.
- New e2e cleanup must delete a test user's posts, comments, likes and follows along with the user, because of the missing foreign keys (R6).

## 7. Test plan

Tools as set in `CLAUDE.md`. All new tests are automated.

### 7.1 JUnit (white box)

- `FeedServiceImplTest`: limit clamping, `nextCursor` with exact and partial pages, default `before`.
- `FollowServiceImpl`: unfollow succeeds, and gives 404 when not following.
- `UserServiceImpl`: profile counts, `followedByMe`, search mapping contains no email.
- `ImageServiceImplTest`, using images generated in the test: JPEG and PNG accepted, output is always JPEG, longest side is at most 1,080, small images aren't enlarged, transparent PNG gets a white background, output contains no EXIF data, over-sized dimensions are rejected before decoding, and GIF, SVG, text and truncated files are rejected.
- `PostServiceImpl`: over-length caption rejected, post and photo saved together.
- `RegisterRequest` username rule, including `/` and spaces.

Fix the baseline first: `SocialGridApplicationTests` needs a running Postgres. Either document that or give it a test configuration. Don't delete it.

### 7.2 pytest (black box)

New files in `tests/blackbox/`, using `logged_in`:

| File | Key cases |
|---|---|
| `test_feed.py` | Home has own and followed posts only. Unfollowed users' posts disappear. Explore has everything. Newest first. Paging has no duplicates or gaps, even when a new post arrives between pages. `likedByMe` differs per viewer. Counts are correct. 401 when logged out. |
| `test_posts.py` | Upload JPEG and PNG, with and without a caption. Text file named `.jpg`, SVG, GIF, missing file and caption with no file give 400. Over-limit file gives 413. Missing CSRF token gives 403. Delete own, 403 for others, delete cascades to likes, comments and the photo. |
| `test_images.py` | `GET` returns `image/jpeg` starting with the JPEG signature, with `nosniff` and a private `Cache-Control`. 401 when logged out. 404 for a missing post. A 4 MB upload succeeds through nginx as well as directly (`SOCIAL_GRID_PROXY_URL`). |
| `test_comments.py` | Add, list order, username present, delete own, 403 for others including the post's author |
| `test_likes.py` | Like, unlike, duplicate 409, missing 404 |
| `test_follow.py` | Follow, unfollow, self-follow 400, duplicates, unknown user 404 |
| `test_profile.py` | Counts move correctly after each action. The posts endpoint returns only that user's posts, newest first, and pages correctly. Unknown user 404. No email in the response. |
| `test_search.py` | Case-insensitive, partial match, excludes self, `%` and `_` literal, blank query, no email in the response |

### 7.3 Playwright (UI)

Runs on the existing desktop and mobile projects, against the real backend for journeys and mocks for edge cases. Add a case for session expiry and a case proving the second user on a browser doesn't see the first user's cached data. Add grid cases: 3 columns on both projects, a tile opens the post dialog by click and keyboard, Escape closes it, and a broken image still shows a selectable placeholder. Add upload cases using `setInputFiles`: preview appears, removing the photo works, a non-image file shows an error, the posted photo really renders (non-zero `naturalWidth`), and a fixture JPEG flagged as rotated comes out upright.

Playwright here runs Chrome only, so also try one real upload from an actual phone before calling M4 done. See R9.

### 7.4 The end-to-end journey (the MVP's definition of done)

Run locally through Docker, then again on the deployed URL:

1. Register A and B, and log in as A.
2. A uploads a photo with a caption, and sees the post on Home, Explore and in A's profile grid.
3. Log in as B in a second browser. A's post is on Explore but not on Home.
4. B searches for A, opens the profile, and follows. A's follower count goes up, and A's post appears on B's Home.
5. B likes and comments on the post. A sees the like and the comment.
6. B deletes the comment, then unfollows. The post leaves B's Home.
7. Restart the backend and log in again. The photo is still there.
8. A deletes the post, and it disappears for both users. Refresh, then log out.

## 8. Deployment design

### 8.1 Keep one origin

The login design depends on the browser treating the frontend and API as the same site ("origin" means scheme, domain and port):

```text
Browser ──HTTPS──> one public origin ──/api/*──> Spring Boot ──> Postgres
                        └──── everything else ──> React static files
```

Calling the API directly on another domain **doesn't work with the current code**, for four reasons:

- `csrfToken()` reads the token from `document.cookie`, and a page can't read another domain's cookies.
- `apiFetch` sends `credentials: 'same-origin'`.
- `CorsConfig` doesn't allow the `X-XSRF-TOKEN` header or credentials.
- `SameSite=Lax` stops the session cookie being sent on cross-site POSTs.

Changing all that would weaken a security setup that already works, and `intent.md` says to keep existing session login. So `VITE_API_URL` stays empty and a proxy provides the single origin.

### 8.2 Hosting options (D2)

Facts about Render, Fly.io and Railway come from notes dated August 2026, so check pricing and limits again before choosing. I haven't tested any of these.

| Option | How one origin works | Meets "always Docker"? | Notes |
|---|---|---|---|
| Container platform for frontend and backend, plus managed Postgres (**my recommendation**) | The existing nginx image proxies `/api` | Yes | Reuses both Dockerfiles. The frontend and API each run as a service. |
| Vercel for frontend, plus a container host for backend and Postgres | Vercel rewrites `/api/*` to the backend | Partly: the frontend isn't containerised | Needs testing that cookies, CSRF and uploads survive the rewrite, including any request size limit. See C3. |

Your "just Vercel" can't work on its own, because Vercel can't host Spring Boot or Postgres.

### 8.3 Required changes on any host

| Change | Why |
|---|---|
| `server.servlet.session.cookie.secure=${COOKIE_SECURE:false}`, set to `true` in production | Keeps the session cookie off plain HTTP, while local HTTP keeps working |
| `CORS_ALLOWED_ORIGINS` set to the public origin | The host ends HTTPS before the request reaches Spring, so Spring may see the request as cross-origin and reject POSTs with 403. This is the same kind of failure found in AD-246. **This is my reasoning, and the smoke test must confirm it.** |
| `server.forward-headers-strategy=native`, and nginx passing `X-Forwarded-Proto` | Lets Spring know the original request was HTTPS |
| nginx's backend address comes from an environment variable, using the nginx image's `templates` feature | `proxy_pass http://backend:8080` only works inside Docker Compose |
| `spring.jpa.show-sql=${SHOW_SQL:false}` | Stops every query being printed to production logs |
| `DB_URL`, `DB_USER` and `DB_PASSWORD` set as host secrets | The defaults are `postgres`/`postgres`, which must not reach production |

Compose keeps working for local use. Keep `spring.sql.init.mode=always`, because `schema.sql` is written to be safe on every start.

When comparing hosts, also check the database size limit and backups, since photos now live in Postgres.

**Exit check:** the 7.4 journey passes on the public URL, including a photo upload, a POST with a CSRF token, and a page reload that keeps the session.

## 9. Concerns

### 9.1 Contradictions I can't fully satisfy

| # | These conflict | What this spec does | Still open |
|---|---|---|---|
| C1 | **Storage.** Upload needs somewhere to keep photos. `intent.md` originally listed only existing tables, and `CLAUDE.md`'s stack has no file storage. | One new Postgres table (4.1), which stays inside the stack. I updated `intent.md` to match your decision. | Nothing, unless photos outgrow the database (R10). |
| C2 | **`CLAUDE.md`** says "Dont worry about Frontend and High Level Design Concepts yet". **`intent.md`** and this request require frontend screens and a design. | Follows the approved intent, as the newer and more specific instruction. Frontend design is kept minimal. | That `CLAUDE.md` line now looks out of date. I haven't edited it. |
| C3 | **`CLAUDE.md`** says "always" use Docker. **You** said "just Vercel, or anything that works", and Vercel doesn't run the frontend in Docker. | Recommends the fully containerised option, and keeps Vercel as a documented alternative. | Picking Vercel means a deliberate exception to `CLAUDE.md`. |
| C4 | **"Existing session login only"** against a frontend and API on separate domains. | Only same-origin setups are allowed (8.1). | Nothing, unless a host rules out proxying. |
| C5 | **"Editing out of scope"** against live `PUT` endpoints for posts and comments. | No UI, no new tests, endpoints left in place. Removing them would delete working code you plan to use later. | Anyone calling the API directly can still edit, and `PUT /api/posts/{id}` can point a post's `mediaUrl` at any address. That's low risk for an `<img>`, but it should be tightened when editing is built. |
| C6 | **Saved workflow note** says test with black-box subagents using curl and SQL, report in `TEST_REPORT.md`, and don't fix unprompted. **`CLAUDE.md`** says "always" JUnit, pytest and Playwright. You also deleted `TEST_REPORT.md`. | Follows `CLAUDE.md`, and writes permanent automated tests. | How test results get reported depends on your later SDLC stages. |
| C7 | **"Ready for implementation"** against the **21st.dev rule** that you pick each component. | Uses existing components, so no pause is needed. | Ask if you want a shortlist for the feed design. |
| C8 | **Learning project sizing** ("size for one laptop") against **a public deployment**, which attracts real traffic and abuse. | Adds the basics that are cheap (HTTPS, secure cookies, secrets), and skips anything that needs more infrastructure. | See R2 and R3. |

### 9.2 Risks

| # | Risk | Severity | Handling |
|---|---|---|---|
| R1 | **Sessions live in server memory**, so every restart or free-tier sleep logs everyone out, despite the 7-day cookie. | Medium | Accepted for the MVP (D3). If it becomes annoying, the fix is storing sessions in Postgres with Spring Session, which is a small change but adds a dependency. |
| R2 | **No rate limiting.** Login and register run BCrypt, which is deliberately slow and CPU-heavy, so a script could overload a small server. Signup is open with no email check. | Medium once public | Accepted for a personal project. Use the host's limits if it has any. Don't advertise the URL widely. |
| R3 | **No moderation, reporting or blocking, and you now host what people upload.** `intent.md` rules out moderator powers, so if the URL is public with open signup, anyone could upload illegal or abusive photos to your server, and you could only remove them through the database. Upload makes this much more serious than it was with text or links. | **High once public** | Share the URL only with people you know. Before sharing it widely, add at least invite-only signup or a way to remove content. |
| R4 | **Schema changes through `ddl-auto=update`.** It only adds things, gives no history, and can't roll back. With real user data, a mistake is hard to undo. | Medium after launch | Fine for this cycle. Use a migration tool such as Flyway next cycle, and set up database backups on the host. |
| R5 | **Parsing untrusted files.** Image decoders are a classic target for malicious files, and `ImageIO` runs inside the backend process. | Low to medium | The format allowlist, size and dimension checks, and re-encoding reduce this. Keep the Java image up to date. |
| R6 | **Missing user foreign keys.** Deleting a user directly in SQL leaves their posts behind, hidden from feeds by the join, while likes and counts can go wrong. The app has no account deletion. | Low | Adding the constraints to `schema.sql` would stop the app starting if orphaned rows already exist, and the dev database may have some. Deferred, with careful e2e cleanup. |
| R7 | **Usernames are case-sensitive**, so `Bob` and `bob` can both exist, which makes impersonation easy. | Low | Deferred. Fixing it means deciding what happens to existing clashes. |
| R9 | **Phone formats.** iPhones often store HEIC photos. I expect iOS Safari to handle them through the browser step, but Chrome on Windows can't read HEIC and would show an error. Playwright here can't test Safari. | Medium | Clear error message, plus a real phone test before M4 is done. |
| R10 | **Database growth and memory.** At an estimated 150–400 KB per photo, 1 GB holds very roughly 2,500–7,000 posts. Each upload briefly holds up to 5 MB plus the decoded image in memory, which matters on a small host. Every photo is also served through Spring. | Low at this scale | Browser caching and the size limits keep it small. Object storage is the later fix, and wouldn't change the frontend. |
| R11 | **`ImageIO` in the container.** It's part of Java's desktop module, so it must work in the `eclipse-temurin:21-jre` image without a display. I expect it to, but haven't run it. | Low | M1 must test an upload against the real Docker image, not only `mvn test`. |
| R8 | **Unverified.** Image processing, the feed query, the search escaping and all of section 8 are designed from reading the code, not from running it. pytest and the real-backend Playwright tests haven't been run this session. | Medium | M0 and M1 check these first, and failures come back to you if they change the design. |

### 9.3 Housekeeping

Not part of the MVP, and I haven't touched any of it: `suffix` at the repo root is a stray file containing only `3466`. `.playwright-mcp/`, `test-screenshots/` and `tests/blackbox/__pycache__/` are untracked and not ignored. There are uncommitted edits to `.gitignore`, `.mcp.json`, `CLAUDE.md` and `README.md`. `spec.md` and `intent.md` aren't committed. The Postgres MCP server failed to connect this session, and it needs Docker's database running.

## 10. Implementation order

**Superseded by D10.** The build now runs first with no test suites: backend, then frontend, with a review and one commit after each. The test phase follows, covering M0's baseline and everything in section 7. Deployment comes last. The table below is the original order, kept for its scope.

Each milestone leaves the app working.

| Milestone | Work | Done when |
|---|---|---|
| **M0 Baseline** | Start Docker. Run JUnit, pytest and Playwright before changing anything. | Existing failures are known and recorded, so they aren't mistaken for new ones. |
| **M1 Backend** | Image table and processing, DTOs, repositories, services and controllers (section 4), and the `nginx.conf` limit, with JUnit tests. | `mvn test` passes, the feed query runs against Postgres, and a photo uploads and loads through the real Docker images. |
| **M2 Black-box tests** | The 7.2 suite against the running API. | All pass, old and new. |
| **M3 Frontend** | Shell, feeds, composer with photo upload, likes, comments, search, profile with post grid, the logout and 401 fixes, and Playwright. | The 7.4 journey passes locally through Docker on desktop and mobile. |
| **M4 Deploy** | Pick the host (D2), make the 8.3 changes, and deploy. | The 7.4 journey passes on the public HTTPS URL. |
