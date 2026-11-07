import { expect, test, type Page } from '@playwright/test'
import {
  ALICE,
  api,
  cleanupUsers,
  createPostThroughApi,
  EXPLORE_FEED,
  fail,
  gated,
  HOME_FEED,
  json,
  likeButton,
  logInThroughApi,
  logInThroughUi,
  makePost,
  mockLoggedIn,
  navLink,
  postItem,
  registerThroughApi,
  shell,
  signedInUser,
} from './helpers'

// Sessions and the query cache: spec 5.3, 5.5 and 7.3. Mocks for a mid-session 401, the real backend for the
// second-user cases.

test.afterAll(cleanupUsers)

const SESSION_ENDED = 'Your session ended. Log in again.'
const logOut = (page: Page) => shell(page).getByRole('button', { name: 'Log out' }).click()

test.describe('mid-session 401', () => {
  test('a feed that answers 401 redirects to login with the message (spec 5.5)', async ({ page }) => {
    await mockLoggedIn(page)
    await page.route(EXPLORE_FEED, (route) => fail(route, 401, 'Log in to continue'))
    await page.goto('/home')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home')
    await navLink(page, 'Explore').click()
    await expect(page).toHaveURL('/login')
    await expect(page.getByText(SESSION_ENDED)).toBeVisible()
  })

  test('a like that answers 401 redirects to login with the message (spec 5.3)', async ({ page }) => {
    const post = makePost()
    await mockLoggedIn(page, { home: [[post]] })
    await page.route(api(`posts/${post.postId}/likes`), (route) => fail(route, 401, 'Log in to continue'))
    await page.goto('/home')
    await likeButton(postItem(page, post.postId)).click()
    await expect(page).toHaveURL('/login')
    await expect(page.getByText(SESSION_ENDED)).toBeVisible()
  })

  test('a search that answers 401 redirects to login with the message (spec 5.3)', async ({ page }) => {
    await mockLoggedIn(page)
    await page.route(api('users/search'), (route) => fail(route, 401, 'Log in to continue'))
    await page.goto('/search?q=x')
    await expect(page).toHaveURL('/login')
    await expect(page.getByText(SESSION_ENDED)).toBeVisible()
  })

  test('a wrong password on the login page is not a session end (spec 5.3)', async ({ page }) => {
    await mockLoggedIn(page)
    await page.route(api('auth/me'), (route) => fail(route, 401, 'Log in to continue'))
    await page.route(api('auth/login'), (route) => fail(route, 401, 'Invalid username/email or password'))
    await page.goto('/login')
    await logInThroughUi(page, { username: ALICE.username, password: 'wrong-password' })
    await expect(page.getByRole('alert')).toHaveText('Invalid username/email or password')
    await expect(page.getByText(SESSION_ENDED)).toHaveCount(0)
  })

  test('an ordinary logout does not say the session ended', async ({ page }) => {
    await mockLoggedIn(page)
    await page.route(api('auth/logout'), (route) => route.fulfill({ status: 200, body: '' }))
    await page.goto('/home')
    await logOut(page)
    await expect(page).toHaveURL('/login')
    await expect(page.getByText(SESSION_ENDED)).toHaveCount(0)
  })

  test('the message goes away once logged in again', async ({ page }) => {
    let expired = true
    await mockLoggedIn(page)
    await page.route(EXPLORE_FEED, (route) =>
      expired ? fail(route, 401, 'Log in to continue') : json(route, 200, { items: [], nextCursor: null }),
    )
    await page.route(api('auth/login'), (route) => {
      expired = false
      return json(route, 200, ALICE)
    })
    await page.route(api('auth/logout'), (route) => route.fulfill({ status: 200, body: '' }))
    await page.goto('/home')
    await navLink(page, 'Explore').click()
    await expect(page.getByText(SESSION_ENDED)).toBeVisible()
    await logInThroughUi(page, { username: ALICE.username, password: 'secret123' })
    await expect(page).toHaveURL(/\/(home|explore)$/)
    await logOut(page)
    await expect(page).toHaveURL('/login')
    await expect(page.getByText(SESSION_ENDED)).toHaveCount(0)
  })

  test('a real session that ends redirects with the message (spec 7.3)', async ({ page, context }, info) => {
    await signedInUser(page, info.project.name)
    await page.goto('/home')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home')
    // The server no longer knows this browser, as after a backend restart.
    await context.clearCookies()
    await navLink(page, 'Explore').click()
    await expect(page).toHaveURL('/login')
    await expect(page.getByText(SESSION_ENDED)).toBeVisible()
  })
})

test.describe('the next user on the same browser (spec 5.3, 7.3)', () => {
  // Registers two users on the given page's context, logged out, with one post from the first.
  async function twoUsers(page: Page, project: string) {
    const first = await registerThroughApi(page, project)
    const second = await registerThroughApi(page, project)
    await logInThroughApi(page, first)
    const caption = `private to the first user ${Date.now()}`
    const postId = await createPostThroughApi(page, caption)
    await page.goto('/home')
    await expect(postItem(page, postId)).toBeVisible()
    return { first, second, caption, postId }
  }

  // Holds the second user's Home back, so anything on screen can only have come from the cache.
  async function expectNothingLeftOver(page: Page, secondUser: { username: string; password: string }, postId: number, caption: string) {
    const { gate, release } = gated()
    await page.route(HOME_FEED, async (route) => {
      await gate
      await route.continue()
    })
    await logInThroughUi(page, secondUser)
    await expect(page).toHaveURL(/\/(home|explore)$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('status', { name: 'Loading posts' })).toBeVisible()
    await expect(postItem(page, postId)).toHaveCount(0)
    await expect(page.getByText(caption)).toHaveCount(0)

    release()
    await expect(page.getByRole('status', { name: 'Loading posts' })).toHaveCount(0)
    await expect(postItem(page, postId)).toHaveCount(0)
    await expect(page.getByText(caption)).toHaveCount(0)
    await page.unroute(HOME_FEED)
  }

  test('after logout, the second user sees none of the first user\'s cached data', async ({ page }, info) => {
    const { second, caption, postId } = await twoUsers(page, info.project.name)
    await logOut(page)
    await expect(page).toHaveURL('/login')
    await expectNothingLeftOver(page, second, postId, caption)
  })

  test('after an expired session, the second user sees none of the first user\'s cached data', async ({ page, context }, info) => {
    const { second, caption, postId } = await twoUsers(page, info.project.name)
    // The 401 comes from a like on Home, so login returns here. Explore would be no test: everyone's posts belong there.
    await context.clearCookies()
    await likeButton(postItem(page, postId)).click()
    await expect(page).toHaveURL('/login')
    await expect(page.getByText(SESSION_ENDED)).toBeVisible()
    await expectNothingLeftOver(page, second, postId, caption)
  })

  test('the top bar names the new user, not the old one', async ({ page }, info) => {
    const { first, second } = await twoUsers(page, info.project.name)
    await logOut(page)
    await expect(page).toHaveURL('/login')
    await logInThroughUi(page, second)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(shell(page).locator(`a[href="/users/${second.username}"]`).first()).toBeAttached()
    await expect(shell(page).locator(`a[href="/users/${first.username}"]`)).toHaveCount(0)
  })
})

test('logout clears the cache: logging back in loads the feed afresh (spec 5.3)', async ({ page }) => {
  const post = makePost({ caption: 'cached before logout' })
  await mockLoggedIn(page, { home: [[post]] })
  let loggedIn = true
  await page.route(api('auth/me'), (route) => (loggedIn ? json(route, 200, ALICE) : fail(route, 401)))
  await page.route(api('auth/logout'), (route) => {
    loggedIn = false
    return route.fulfill({ status: 200, body: '' })
  })
  await page.route(api('auth/login'), (route) => {
    loggedIn = true
    return json(route, 200, ALICE)
  })

  await page.goto('/home')
  await expect(postItem(page, post.postId)).toBeVisible()
  await logOut(page)
  await expect(page).toHaveURL('/login')

  const { gate, release } = gated()
  await page.route(HOME_FEED, async (route) => {
    await gate
    await route.fallback()
  })
  await logInThroughUi(page, { username: ALICE.username, password: 'secret123' })
  await expect(page).toHaveURL('/home')
  // Nothing cached, so the skeleton shows rather than the old post.
  await expect(page.getByRole('status', { name: 'Loading posts' })).toBeVisible()
  await expect(postItem(page, post.postId)).toHaveCount(0)
  release()
  await expect(postItem(page, post.postId)).toBeVisible()
})
