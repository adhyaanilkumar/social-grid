import { expect, test, type Page } from '@playwright/test'

// End-to-end auth journeys (AD-246) against the REAL backend — no page.route mocks. The Vite dev server
// (:5174) proxies /api to Spring on :8080, so this needs the backend running (e.g. `docker compose up -d`).
// If it isn't reachable, every test here is skipped rather than failed.
// The mocked edge cases (validation, pending states, CSRF header, ...) live in register.spec / login.spec.

const PASSWORD = 'secret123'

// Every run makes fresh users, prefixed so they're easy to spot (and clean up) in the dev database.
let counter = 0
function freshUser(project: string) {
  const name = `t246_${Date.now().toString(36)}${project[0]}${counter++}`
  return { username: name, email: `${name}@example.com`, password: PASSWORD }
}
type User = ReturnType<typeof freshUser>

const identifier = (page: Page) => page.getByLabel('Username or email')
const loginPassword = (page: Page) => page.getByLabel('Password', { exact: true })
const welcome = (page: Page) => page.getByRole('heading', { level: 1 })

async function registerThroughUi(page: Page, user: User) {
  await page.goto('/register')
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Create account' }).click()
}

// Registers straight through the API, for tests that are about something other than the sign-up form.
// A GET first makes Spring set the XSRF-TOKEN cookie, which every POST has to echo back in a header.
async function registerThroughApi(page: Page, user: User) {
  await page.request.get('/api/auth/me')
  const token = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value
  const response = await page.request.post('/api/auth/register', {
    data: user,
    headers: { 'X-XSRF-TOKEN': token ?? '' },
  })
  expect(response.status(), await response.text()).toBe(201)
}

async function logInThroughUi(page: Page, id: string, password: string) {
  await identifier(page).fill(id)
  await loginPassword(page).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

test.beforeAll(async ({ request }) => {
  // 401 = backend up and answering. Anything else (proxy 5xx, connection refused) = not running.
  const status = await request
    .get('/api/auth/me')
    .then((r) => r.status())
    .catch(() => 0)
  test.skip(status !== 401, 'real backend not reachable on :8080 — start it with `docker compose up -d`')
})

test('successful register lands on login with the username filled in', async ({ page }, info) => {
  const user = freshUser(info.project.name)
  await registerThroughUi(page, user)

  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('status')).toContainText(`Account created for ${user.username}`)
  await expect(identifier(page)).toHaveValue(user.username)
  await expect(loginPassword(page)).toBeFocused()
})

test('duplicate username shows "Username already taken" under the field', async ({ page }, info) => {
  const taken = freshUser(info.project.name)
  await registerThroughApi(page, taken)

  // Same username, different email, so only the username clashes.
  await registerThroughUi(page, { ...freshUser(info.project.name), username: taken.username })

  await expect(page).toHaveURL('/register')
  const username = page.getByLabel('Username')
  await expect(username).toHaveAttribute('aria-invalid', 'true')
  await expect(username).toBeFocused()
  await expect(page.locator('#username-error')).toHaveText('Username already taken')
  await expect(username).toHaveValue(taken.username)
})

test('successful login by username and by email reaches /home and survives a reload', async ({ page }, info) => {
  const user = freshUser(info.project.name)
  await registerThroughApi(page, user)

  await page.goto('/login')
  await logInThroughUi(page, user.username, user.password)
  await expect(page).toHaveURL('/home')
  await expect(welcome(page)).toHaveText(`Welcome, ${user.username}`)

  // The session cookie, not React state, is what keeps you logged in.
  await page.reload()
  await expect(page).toHaveURL('/home')
  await expect(welcome(page)).toHaveText(`Welcome, ${user.username}`)

  // Fresh browser context: log in with the email this time.
  await page.context().clearCookies()
  await page.goto('/login')
  await logInThroughUi(page, user.email, user.password)
  await expect(page).toHaveURL('/home')
  await expect(welcome(page)).toHaveText(`Welcome, ${user.username}`)
})

test('bad credentials show one generic error and stay logged out', async ({ page }, info) => {
  const user = freshUser(info.project.name)
  await registerThroughApi(page, user)
  await page.goto('/login')

  // Wrong password for a real account...
  await logInThroughUi(page, user.username, 'wrong-password')
  const alert = page.getByRole('alert')
  await expect(alert).toHaveText('Invalid username/email or password')
  await expect(alert).toBeFocused()
  await expect(page).toHaveURL('/login')

  // ...and an account that doesn't exist get the same message, so the form can't be used to probe
  // which usernames are registered.
  await logInThroughUi(page, `${user.username}_nobody`, user.password)
  await expect(alert).toHaveText('Invalid username/email or password')

  await page.goto('/home')
  await expect(page).toHaveURL('/login')
})

test('protected route redirects to login, then back to the page you wanted', async ({ page }, info) => {
  const user = freshUser(info.project.name)
  await registerThroughApi(page, user)

  await page.goto('/home')
  await expect(page).toHaveURL('/login')

  await logInThroughUi(page, user.username, user.password)
  await expect(page).toHaveURL('/home')
  await expect(welcome(page)).toHaveText(`Welcome, ${user.username}`)

  // The redirect replaced /login in history, so Back doesn't return to the form.
  await page.goBack()
  await expect(page).not.toHaveURL('/login')
})

test('logout ends the session: back to login, and /home is closed again', async ({ page }, info) => {
  const user = freshUser(info.project.name)
  await registerThroughApi(page, user)
  await page.goto('/login')
  await logInThroughUi(page, user.username, user.password)
  await expect(page).toHaveURL('/home')

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL('/login')

  // The server forgot the session too (not just React): /me says 401 and /home bounces.
  expect((await page.request.get('/api/auth/me')).status()).toBe(401)
  await page.goto('/home')
  await expect(page).toHaveURL('/login')
  await page.reload()
  await expect(page).toHaveURL('/login')
})
