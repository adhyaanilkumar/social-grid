import { expect, type Locator, type Page, type Route } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Shared by the V0 UI specs: mocks for edge cases, real-backend users for journeys, and locators.
//
// Fixtures in ./fixtures were made once with Pillow:
//   photo.jpg           400x300, yellow top half, green bottom half
//   photo-tall.jpg      300x400, solid blue
//   photo.png           120x80, half pink, half transparent
//   rotated-exif6.jpg   stored 200x100 with the left half red and the right half blue, and an EXIF Orientation of 6
//                       (rotate 90 degrees clockwise to display). Upright it's 100x200, red on top, blue underneath.

export function fixture(name: string) {
  return path.resolve(import.meta.dirname, 'fixtures', name)
}

// Error states wait for TanStack Query's two retries on a 5xx or a network failure, about 3 seconds in all.
export const AFTER_RETRIES = { timeout: 10_000 }

// ---------------------------------------------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------------------------------------------

export interface MockUser {
  id: number
  username: string
  email: string
}

export interface MockPost {
  postId: number
  authorId: number
  authorUsername: string
  mediaUrl: string | null
  caption: string | null
  width: number | null
  height: number | null
  likeCount: number
  commentCount: number
  likedByMe: boolean
}

export interface MockComment {
  commentId: number
  authorId: number
  authorUsername: string
  postId: number
  message: string
}

export const ALICE: MockUser = { id: 7, username: 'alice_1', email: 'alice@example.com' }
export const BOB: MockUser = { id: 8, username: 'bob_2', email: 'bob@example.com' }

export function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

function errorBody(status: number, message = 'Mocked error') {
  return { status, error: 'Error', message }
}

export const fail = (route: Route, status: number, message?: string) => json(route, status, errorBody(status, message))

// A regex, not a glob: `**/api/**` would also catch Vite's own module files such as /src/api/client.ts and stop the
// app from loading. `pattern` is regex source for what follows /api/.
export function api(pattern: string) {
  return new RegExp(`^https?://[^/]+/api/${pattern}(\\?.*)?$`)
}

const ANY_API = /^https?:\/\/[^/]+\/api\//
const IMAGE = /\/api\/posts\/\d+\/image(\?.*)?$/
const POST_LIST = /\/api\/(feed\/(home|explore)|users\/[^/]+\/posts)(\?.*)?$/
const COMMENTS = /\/api\/posts\/\d+\/comments(\?.*)?$/
const SEARCH = /\/api\/users\/search(\?.*)?$/

const PHOTO = readFileSync(fixture('photo.jpg'))

// Registered first, so a test's own page.route calls win (Playwright tries the newest route first). Nothing here
// reaches the real backend, which could otherwise set an XSRF-TOKEN cookie behind a mocked test's back.
export async function mockCatchAll(page: Page) {
  await page.route(ANY_API, (route) => {
    const request = route.request()
    const url = request.url()
    if (request.method() === 'GET') {
      if (url.endsWith('/api/auth/me')) return fail(route, 401, 'Log in to continue')
      if (IMAGE.test(url)) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: PHOTO })
      if (POST_LIST.test(url)) return json(route, 200, { items: [], nextCursor: null })
      if (COMMENTS.test(url) || SEARCH.test(url)) return json(route, 200, [])
    }
    return fail(route, 404, `No mock for ${request.method()} ${url}`)
  })
}

let nextPostId = 1000

export function makePost(overrides: Partial<MockPost> = {}): MockPost {
  const postId = overrides.postId ?? nextPostId--
  return {
    postId,
    authorId: BOB.id,
    authorUsername: BOB.username,
    mediaUrl: `/api/posts/${postId}/image`,
    caption: `Caption of post ${postId}`,
    width: 1080,
    height: 1080,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    ...overrides,
  }
}

export function makeProfile(user: Pick<MockUser, 'id' | 'username'>, overrides: Record<string, unknown> = {}) {
  return {
    userId: user.id,
    username: user.username,
    firstName: null,
    lastName: null,
    bio: null,
    profilePicUrl: null,
    postCount: 0,
    followerCount: 0,
    followingCount: 0,
    followedByMe: false,
    ...overrides,
  }
}

// Answers a keyset-paged list. `pages` can be a function, for tests whose server state changes. The cursor between
// two pages is the last post's ID, as on the real backend.
export function pagedResponse(pages: MockPost[][], url: string) {
  const before = new URL(url).searchParams.get('before')
  const index = before === null ? 0 : pages.findIndex((items) => items.at(-1)?.postId === Number(before)) + 1
  const items = pages[index] ?? []
  return { items, nextCursor: index < pages.length - 1 ? (items.at(-1)?.postId ?? null) : null }
}

export async function mockPostList(page: Page, pattern: RegExp, pages: MockPost[][] | (() => MockPost[][])) {
  await page.route(pattern, (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return json(route, 200, pagedResponse(typeof pages === 'function' ? pages() : pages, route.request().url()))
  })
}

export const HOME_FEED = api('feed/home')
export const EXPLORE_FEED = api('feed/explore')
export const userPosts = (username: string) => api(`users/${username}/posts`)
export const userProfile = (username: string) => api(`users/${username}/profile`)
export const SEARCH_USERS = api('users/search')

export interface LoggedInOptions {
  user?: MockUser
  home?: MockPost[][] | (() => MockPost[][])
  explore?: MockPost[][] | (() => MockPost[][])
}

// Catch-all, a session for `user` (Alice by default), and the two feeds.
export async function mockLoggedIn(page: Page, { user = ALICE, home = [[]], explore = [[]] }: LoggedInOptions = {}) {
  await mockCatchAll(page)
  await page.route(api('auth/me'), (route) => json(route, 200, user))
  await mockPostList(page, HOME_FEED, home)
  await mockPostList(page, EXPLORE_FEED, explore)
}

export async function mockProfile(page: Page, profile: ReturnType<typeof makeProfile>, posts: MockPost[][] = [[]]) {
  await page.route(userProfile(profile.username), (route) => json(route, 200, profile))
  await mockPostList(page, userPosts(profile.username), posts)
}

export async function mockComments(page: Page, postId: number, comments: MockComment[] | (() => MockComment[])) {
  await page.route(api(`posts/${postId}/comments`), (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return json(route, 200, typeof comments === 'function' ? comments() : comments)
  })
}

// A route that holds its answer until release() is called.
export function gated() {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  return { gate, release }
}

// Counts how many requests of a method reach URLs matching the pattern.
export function countRequests(page: Page, pattern: RegExp, method = 'POST') {
  const counter = { count: 0 }
  page.on('request', (request) => {
    if (request.method() === method && pattern.test(request.url())) counter.count++
  })
  return counter
}

// ---------------------------------------------------------------------------------------------------------------
// Real backend
// ---------------------------------------------------------------------------------------------------------------

export const PASSWORD = 'secret123'

export interface RealUser {
  id: number
  username: string
  email: string
  password: string
}

let userCounter = 0
const created: string[] = []

// Only `t_ui_` names, unique per run, project and worker, so nothing else on this backend can be touched.
export function freshUser(project: string) {
  const worker = process.env.TEST_WORKER_INDEX ?? '0'
  const username = `t_ui_${Date.now().toString(36)}${project[0]}${worker}x${userCounter++}`
  created.push(username)
  return { username, email: `${username}@example.com`, password: PASSWORD }
}

// A GET first makes Spring set the XSRF-TOKEN cookie, which every POST has to echo back in a header.
export async function csrfHeaders(page: Page) {
  await page.request.get('/api/auth/me')
  const token = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value
  return { 'X-XSRF-TOKEN': token ?? '' }
}

export async function registerThroughApi(page: Page, project: string): Promise<RealUser> {
  const user = freshUser(project)
  const response = await page.request.post('/api/auth/register', { data: user, headers: await csrfHeaders(page) })
  expect(response.status(), await response.text()).toBe(201)
  return { ...user, id: (await response.json()).id }
}

export async function logInThroughApi(page: Page, user: RealUser) {
  const response = await page.request.post('/api/auth/login', {
    data: { identifier: user.username, password: user.password },
    headers: await csrfHeaders(page),
  })
  expect(response.status(), await response.text()).toBe(200)
}

// A new user who is already logged in on this page's browser context.
export async function signedInUser(page: Page, project: string) {
  const user = await registerThroughApi(page, project)
  await logInThroughApi(page, user)
  return user
}

export async function createPostThroughApi(page: Page, caption: string, file = 'photo.jpg'): Promise<number> {
  const response = await page.request.post('/api/posts', {
    headers: await csrfHeaders(page),
    multipart: {
      image: { name: file, mimeType: file.endsWith('.png') ? 'image/png' : 'image/jpeg', buffer: readFileSync(fixture(file)) },
      caption,
    },
  })
  expect(response.status(), await response.text()).toBe(201)
  return (await response.json()).postId
}

export async function logInThroughUi(page: Page, user: Pick<RealUser, 'username' | 'password'>) {
  await page.getByLabel('Username or email').fill(user.username)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

// Deletes the named users and what they made, straight from Postgres, because of the missing foreign keys (spec
// R6). Named users only, never a pattern: desktop and mobile run in parallel workers, and one finishing early
// mustn't delete the other's users mid-test. A failed cleanup only leaves rows behind, so it warns.
export function deleteUsers(names: string[], label = 'UI') {
  const safe = names.filter((name) => /^(t_ui_|t246_)[A-Za-z0-9_]+$/.test(name))
  if (safe.length === 0) return
  const list = safe.map((name) => `'${name}'`).join(',')
  const ids = `SELECT id FROM users WHERE username IN (${list})`
  const sql = [
    `DELETE FROM likes WHERE user_id IN (${ids})`,
    `DELETE FROM comments WHERE author_id IN (${ids})`,
    `DELETE FROM follows WHERE follower_id IN (${ids}) OR followee_id IN (${ids})`,
    `DELETE FROM posts WHERE author_id IN (${ids})`,
    `DELETE FROM profiles WHERE user_id IN (${ids})`,
    `DELETE FROM users WHERE username IN (${list})`,
  ].join(';')
  try {
    execFileSync('docker', ['exec', 'social-grid-db', 'sh', '-c', `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qc "${sql}"`], {
      stdio: 'pipe',
    })
  } catch (e) {
    console.warn(`${label} cleanup skipped:`, (e as Error).message)
  }
}

// For test.afterAll in specs that use the real backend.
export function cleanupUsers() {
  deleteUsers(created.splice(0))
}

// ---------------------------------------------------------------------------------------------------------------
// Locators and small actions
// ---------------------------------------------------------------------------------------------------------------

// The app's own top bar and bottom bar, so feed and profile content can't match. Role locators inside it skip
// whichever of the desktop or mobile version CSS has hidden.
export const shell = (page: Page) => page.locator('#root > header, #root > nav')
export const bottomBar = (page: Page) => page.locator('#root > nav')
export const main = (page: Page) => page.getByRole('main')
export const navLink = (page: Page, name: string) => shell(page).getByRole('link', { name, exact: true })
export const newPostButton = (page: Page) => shell(page).getByRole('button', { name: 'New post', exact: true })
export const ownProfileLink = (page: Page, username: string) =>
  shell(page).getByRole('link', { name: new RegExp(`^(Profile|${username})$`) })
// One figure from a profile's header, such as "3 posts". Each is its own element, so the words can't run into the next.
export const profileCount = (page: Page, text: string) =>
  main(page).locator('span').filter({ hasText: new RegExp(`^\\s*${text.replace(' ', '\\s+')}\\s*$`) })
export const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Search users by username' })

export const postItem = (page: Page, postId: number) => page.locator(`li#post-${postId}`)
export const postItems = (page: Page) => page.locator('li[id^="post-"]')
export const likeButton = (scope: Page | Locator) => scope.getByRole('button', { name: /^[\d,]+ likes?$/ })
export const commentButton = (scope: Page | Locator) => scope.getByRole('button', { name: /^(Comment|[\d,]+ comments?)$/ })
export const deletePostButton = (scope: Page | Locator) => scope.getByRole('button', { name: 'Delete post' })

export const composer = (page: Page) => page.getByRole('dialog', { name: 'New post' })
export const fileInput = (page: Page) => composer(page).locator('input[type=file]')
export const captionField = (page: Page) => composer(page).getByLabel('Caption (optional)')
export const submitPost = (page: Page) => composer(page).getByRole('button', { name: /^(Post|Posting…)$/ })
export const preview = (page: Page) => composer(page).getByRole('img', { name: 'Preview of your photo' })

export const commentField = (scope: Page | Locator) => scope.getByRole('textbox', { name: 'Add a comment' })
export const submitComment = (scope: Page | Locator) => scope.getByRole('button', { name: /^(Post comment|Posting…)$/ })

export async function openComposer(page: Page) {
  await newPostButton(page).click()
  await expect(composer(page)).toBeVisible()
}

export async function postThroughUi(page: Page, caption: string, file = 'photo.jpg') {
  await openComposer(page)
  await fileInput(page).setInputFiles(fixture(file))
  await expect(preview(page)).toBeVisible()
  await captionField(page).fill(caption)
  await submitPost(page).click()
  await expect(composer(page)).toBeHidden({ timeout: 15_000 })
}

// Runs a search from wherever the visible search box is: the top bar on desktop, the Search page on mobile.
export async function runSearch(page: Page, query: string) {
  // The app shows nothing but "Checking your session…" until it knows who's logged in.
  await expect(shell(page).getByRole('button', { name: 'Log out' })).toBeVisible()
  if (!(await searchBox(page).isVisible())) await navLink(page, 'Search').click()
  await searchBox(page).fill(query)
  await searchBox(page).press('Enter')
}

// Feeds are global on the shared backend, so another agent's posts may have pushed this one down.
export async function revealPost(page: Page, postId: number) {
  const more = page.getByRole('button', { name: 'Load more' })
  // Wait for the first page before deciding anything: until the post or "Load more" shows up. Checking straight
  // after navigation saw neither while the feed was still loading, so it gave up without paging (deploy bug B1).
  // If neither ever shows, carry on: the caller's own assertion then reports the missing post.
  await expect(postItem(page, postId).or(more).first()).toBeVisible().catch(() => {})
  for (let i = 0; i < 5 && (await postItem(page, postId).count()) === 0; i++) {
    if (!(await more.isVisible())) break
    await more.click()
    await expect(page.getByRole('button', { name: 'Loading…' })).toBeHidden()
  }
  return postItem(page, postId)
}

export async function expectRendered(image: Locator) {
  await image.scrollIntoViewIfNeeded()
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
}

// Reads a pixel from an image, as a fraction of its size. The image must be same-origin, or the canvas is tainted.
export function pixelAt(image: Locator, x: number, y: number) {
  return image.evaluate(
    (el: HTMLImageElement, at) => {
      const canvas = document.createElement('canvas')
      canvas.width = el.naturalWidth
      canvas.height = el.naturalHeight
      const context = canvas.getContext('2d')!
      context.drawImage(el, 0, 0)
      const [r, g, b] = context.getImageData(Math.floor(el.naturalWidth * at.x), Math.floor(el.naturalHeight * at.y), 1, 1).data
      return { r, g, b }
    },
    { x, y },
  )
}

// NFR6, measured against the viewport the project set: on a phone, window.innerWidth grows with overflowing content.
export async function horizontalOverflow(page: Page) {
  const viewport = page.viewportSize()!.width
  const widest = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth))
  return widest - viewport
}

export function setTheme(page: Page, theme: 'light' | 'dark') {
  return page.addInitScript((t) => localStorage.setItem('theme', t), theme)
}
