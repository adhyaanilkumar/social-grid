import { expect, test, type Page, type Route } from '@playwright/test'

// Login, session check and route guard (AD-264). The API is mocked with page.route on the
// relative /api URLs the app now calls through the Vite dev server (port 5174).
// The "live" describe at the bottom talks to the real stack on :5173 and only runs with LIVE=1.

const ME = '**/api/auth/me'
const LOGIN = '**/api/auth/login'
const LOGOUT = '**/api/auth/logout'

const ALICE = { id: 7, username: 'alice_1', email: 'alice@example.com' }
const UNAUTHORIZED = { status: 401, error: 'Unauthorized', message: 'Log in to continue' }
const BAD_CREDENTIALS = { status: 401, error: 'Unauthorized', message: 'Invalid username/email or password' }

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

// Counts how many requests of a method reach a path.
function countRequests(page: Page, path: string, method = 'POST') {
  const counter = { count: 0 }
  page.on('request', (req) => {
    if (req.url().includes(path) && req.method() === method) counter.count++
  })
  return counter
}

// A login route that holds its answer until release() is called.
function gated() {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  return { gate, release }
}

const identifier = (page: Page) => page.getByLabel('Username or email')
const password = (page: Page) => page.getByLabel('Password', { exact: true })
const submit = (page: Page) => page.getByRole('button', { name: /Log in|Logging in/ })

async function fillValid(page: Page) {
  await identifier(page).fill('alice_1')
  await password(page).fill('secret123')
}

// Logged out by default; a successful login flips /me to 200, logout flips it back.
async function mockSession(page: Page, { loggedIn = false } = {}) {
  const session = { loggedIn }
  await page.route(ME, (r) => (session.loggedIn ? json(r, 200, ALICE) : json(r, 401, UNAUTHORIZED)))
  await page.route(LOGIN, async (r) => {
    session.loggedIn = true
    await json(r, 200, ALICE)
  })
  await page.route(LOGOUT, async (r) => {
    session.loggedIn = false
    await r.fulfill({ status: 200, body: '' })
  })
  return session
}

test.describe('login form', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(ME, (r) => json(r, 401, UNAUTHORIZED))
    await page.goto('/login')
  })

  test('heading, labelled fields, autocomplete, first field focused, Sign up link', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Log in')
    await expect(identifier(page)).toHaveAttribute('autocomplete', 'username')
    await expect(password(page)).toHaveAttribute('autocomplete', 'current-password')
    await expect(password(page)).toHaveAttribute('type', 'password')
    await expect(identifier(page)).toBeFocused()
    await expect(page.getByRole('status')).toHaveCount(0) // no "registered" banner
    await page.getByRole('link', { name: 'Sign up' }).click()
    await expect(page).toHaveURL('/register')
  })

  test('empty submit shows both required errors, focuses first, sends nothing; typing clears', async ({ page }) => {
    const requests = countRequests(page, '/api/auth/login')
    await submit(page).click()
    await expect(page.locator('#identifier-error')).toHaveText('Username or email is required')
    await expect(page.locator('#password-error')).toHaveText('Password is required')
    await expect(identifier(page)).toBeFocused()
    await expect(identifier(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(identifier(page)).toHaveAttribute('aria-describedby', 'identifier-error')
    await page.waitForTimeout(300)
    expect(requests.count).toBe(0)

    await identifier(page).press('a')
    await expect(page.locator('#identifier-error')).toHaveCount(0)
    await expect(identifier(page)).toHaveAttribute('aria-invalid', 'false')
    await expect(page.locator('#password-error')).toBeVisible()
    await password(page).press('x')
    await expect(page.locator('#password-error')).toHaveCount(0)
  })

  test('whitespace-only username counts as empty; password-only missing focuses password', async ({ page }) => {
    const requests = countRequests(page, '/api/auth/login')
    await identifier(page).fill('   ')
    await submit(page).click()
    await expect(page.locator('#identifier-error')).toBeVisible()
    await identifier(page).fill('alice_1')
    await submit(page).click()
    await expect(page.locator('#identifier-error')).toHaveCount(0)
    await expect(password(page)).toBeFocused()
    expect(requests.count).toBe(0)
  })

  test('sends trimmed identifier and untouched password', async ({ page }) => {
    let sent: unknown
    await page.route(LOGIN, async (r) => {
      sent = r.request().postDataJSON()
      await json(r, 200, ALICE)
    })
    await identifier(page).fill('  alice_1  ')
    await password(page).fill(' secret123 ')
    await submit(page).click()
    await expect(page).toHaveURL('/home')
    expect(sent).toEqual({ identifier: 'alice_1', password: ' secret123 ' })
  })

  test('401 shows the generic alert, focuses it, keeps the input', async ({ page }) => {
    await page.route(LOGIN, (r) => json(r, 401, BAD_CREDENTIALS))
    await fillValid(page)
    await submit(page).click()
    const alert = page.getByRole('alert')
    await expect(alert).toHaveText('Invalid username/email or password')
    await expect(alert).toBeFocused()
    await expect(identifier(page)).toHaveValue('alice_1')
    await expect(page).toHaveURL('/login')
    await expect(submit(page)).toHaveText('Log in')
    await expect(page.locator('[id$="-error"]')).toHaveCount(0)
  })

  test('401 without a body falls back to the generic message', async ({ page }) => {
    await page.route(LOGIN, (r) => r.fulfill({ status: 401, body: '' }))
    await fillValid(page)
    await submit(page).click()
    await expect(page.getByRole('alert')).toHaveText('Invalid username/email or password')
  })

  const failures: [string, (r: Route) => Promise<void>, string][] = [
    ['500', (r) => json(r, 500, { status: 500, error: 'Internal Server Error', message: 'boom' }), 'Something went wrong on our side. Please try again.'],
    ['502 with no JSON body', (r) => r.fulfill({ status: 502, body: '' }), 'Something went wrong on our side. Please try again.'],
    ['network failure', (r) => r.abort('failed'), "Couldn't reach the server. Check your connection and try again."],
  ]
  for (const [name, handler, message] of failures) {
    test(`${name} shows "${message.slice(0, 20)}…" and focuses it`, async ({ page }) => {
      await page.route(LOGIN, handler)
      await fillValid(page)
      await submit(page).click()
      const alert = page.getByRole('alert')
      await expect(alert).toHaveText(message)
      await expect(alert).toBeFocused()
      await expect(password(page)).toHaveValue('secret123')
      await expect(submit(page)).toHaveText('Log in')
    })
  }

  test('400 fieldErrors land under the fields', async ({ page }) => {
    await page.route(LOGIN, (r) =>
      json(r, 400, {
        status: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        fieldErrors: { password: 'Password is required' },
      }),
    )
    await fillValid(page)
    await submit(page).click()
    await expect(page.locator('#password-error')).toHaveText('Password is required')
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('alert clears on the next submit attempt', async ({ page }) => {
    let first = true
    await page.route(LOGIN, async (r) => {
      if (first) {
        first = false
        return json(r, 401, BAD_CREDENTIALS)
      }
      return json(r, 200, ALICE)
    })
    await fillValid(page)
    await submit(page).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await submit(page).click()
    await expect(page).toHaveURL('/home')
  })

  test('pending state, aria-disabled, double click sends exactly one request', async ({ page }) => {
    const requests = countRequests(page, '/api/auth/login')
    const { gate, release } = gated()
    await page.route(LOGIN, async (r) => {
      await gate
      await json(r, 200, ALICE)
    })
    await fillValid(page)
    await submit(page).dblclick()
    await expect(submit(page)).toHaveText('Logging in…')
    await expect(submit(page)).toHaveAttribute('aria-disabled', 'true')
    await expect(submit(page).locator('svg.animate-spin')).toHaveCount(1)
    await submit(page).click({ force: true })
    await password(page).press('Enter')
    await page.waitForTimeout(300)
    expect(requests.count).toBe(1)
    release()
    await expect(page).toHaveURL('/home')
    expect(requests.count).toBe(1)
  })

  test('keyboard: Enter in the password field submits', async ({ page }) => {
    await page.route(LOGIN, (r) => json(r, 200, ALICE))
    await fillValid(page)
    await password(page).press('Enter')
    await expect(page).toHaveURL('/home')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome, alice_1')
  })

  test('keyboard: tab order is username, password, submit', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Tab order is a keyboard (desktop) concern')
    await identifier(page).focus()
    await page.keyboard.press('Tab')
    await expect(password(page)).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Log in' })).toBeFocused()
  })
})

test('arriving from a successful sign-up: banner, prefilled username, password focused', async ({ page }) => {
  await page.route(ME, (r) => json(r, 401, UNAUTHORIZED))
  await page.route('**/api/auth/register', (r) => json(r, 201, ALICE))
  await page.goto('/register')
  await page.getByLabel('Username').fill('alice_1')
  await page.getByLabel('Email').fill('alice@example.com')
  await page.getByLabel('Password', { exact: true }).fill('secret123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('status')).toHaveText('Account created for alice_1 — log in to continue.')
  await expect(identifier(page)).toHaveValue('alice_1')
  await expect(password(page)).toBeFocused()
})

test.describe('route guard and session', () => {
  test('/home while logged out goes to /login, login returns to /home, Back skips /login', async ({ page }) => {
    await mockSession(page)
    await page.goto('/')
    await page.goto('/home')
    await expect(page).toHaveURL('/login')
    await fillValid(page)
    await submit(page).click()
    await expect(page).toHaveURL('/home')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome, alice_1')
    await page.goBack()
    await expect(page).toHaveURL('/')
  })

  test('login returns to a deeper "from" including its query string', async ({ page }) => {
    await mockSession(page)
    await page.goto('/home?tab=photos&page=2')
    await expect(page).toHaveURL('/login')
    await fillValid(page)
    await submit(page).click()
    await expect(page).toHaveURL('/home?tab=photos&page=2')
  })

  test('without a "from", login lands on /home', async ({ page }) => {
    await mockSession(page)
    await page.goto('/login')
    await fillValid(page)
    await submit(page).click()
    await expect(page).toHaveURL('/home')
  })

  test('/home with /me 200 renders welcome; reload stays on /home', async ({ page }) => {
    await mockSession(page, { loggedIn: true })
    await page.goto('/home')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome, alice_1')
    await page.reload()
    await expect(page).toHaveURL('/home')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome, alice_1')
  })

  test('shows "Checking your session…" while /me is pending, then the page', async ({ page }) => {
    const { gate, release } = gated()
    await page.route(ME, async (r) => {
      await gate
      await json(r, 200, ALICE)
    })
    await page.goto('/home')
    const status = page.getByRole('status')
    await expect(status).toHaveText('Checking your session…')
    await expect(status.locator('svg.animate-spin')).toHaveCount(1)
    await expect(page).toHaveURL('/home') // no premature redirect
    release()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome, alice_1')
  })

  test('/me 500 (backend broken) is treated as logged out', async ({ page }) => {
    await page.route(ME, (r) => json(r, 500, { status: 500, error: 'x', message: 'boom' }))
    await page.goto('/home')
    await expect(page).toHaveURL('/login')
  })

  test('Log out posts logout, lands on /login, then /home redirects to /login', async ({ page }) => {
    await mockSession(page, { loggedIn: true })
    const logouts = countRequests(page, '/api/auth/logout')
    await page.goto('/home')
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL('/login')
    expect(logouts.count).toBe(1)
    await page.goto('/home')
    await expect(page).toHaveURL('/login')
  })

  test('Log out failure keeps you on /home with an alert', async ({ page }) => {
    await page.route(ME, (r) => json(r, 200, ALICE))
    await page.route(LOGOUT, (r) => r.abort('failed'))
    await page.goto('/home')
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page.getByRole('alert')).toHaveText("Couldn't log out. Check your connection and try again.")
    await expect(page).toHaveURL('/home')
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
  })
})

test.describe('CSRF header', () => {
  test('login POST carries X-XSRF-TOKEN from the XSRF-TOKEN cookie', async ({ page, context }) => {
    await context.addCookies([{ name: 'XSRF-TOKEN', value: 'tok-123/=+', url: 'http://localhost:5174' }])
    await page.route(ME, (r) => json(r, 401, UNAUTHORIZED))
    let header: string | undefined
    let meHeader: string | undefined = 'unset'
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/me')) meHeader = req.headers()['x-xsrf-token']
    })
    await page.route(LOGIN, async (r) => {
      header = r.request().headers()['x-xsrf-token']
      await json(r, 200, ALICE)
    })
    await page.goto('/login')
    await fillValid(page)
    await submit(page).click()
    await expect(page).toHaveURL('/home')
    expect(header).toBe('tok-123/=+')
    expect(meHeader).toBeUndefined() // GETs don't send it
  })

  test('logout POST carries the header too; no cookie means no header', async ({ page, context }) => {
    await page.route(ME, (r) => json(r, 200, ALICE))
    const headers: (string | undefined)[] = []
    await page.route(LOGOUT, async (r) => {
      headers.push(r.request().headers()['x-xsrf-token'])
      await r.fulfill({ status: 200, body: '' })
    })
    await page.goto('/home')
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL('/login')
    expect(headers).toEqual([undefined])

    await context.addCookies([{ name: 'XSRF-TOKEN', value: 'abc', url: 'http://localhost:5174' }])
    await page.unroute(ME)
    await page.route(ME, (r) => json(r, 200, ALICE))
    await page.goto('/home')
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL('/login')
    expect(headers).toEqual([undefined, 'abc'])
  })
})

test.describe('mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile-only checks')

  test('no horizontal scrolling on /login with errors and alert', async ({ page }) => {
    await page.route(ME, (r) => json(r, 401, UNAUTHORIZED))
    await page.route(LOGIN, (r) => r.abort('failed'))
    await page.goto('/login')
    await submit(page).click()
    await identifier(page).fill('a_very_long_username_of_thirty@example-domain.com')
    await password(page).fill('secret123')
    await submit(page).click()
    await expect(page.getByRole('alert')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('no horizontal scrolling on /home with a long username', async ({ page }) => {
    await page.route(ME, (r) => json(r, 200, { ...ALICE, username: 'a_very_long_username_of_thirty' }))
    await page.goto('/home')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

// Real backend + Docker app, no mocks. Run with: LIVE=1 npx playwright test login --grep live
test.describe('live (unmocked, :5173)', () => {
  test.skip(!process.env.LIVE, 'set LIVE=1 to run against the real stack')
  const BASE = 'http://localhost:5173'
  const SHOTS = '../test-screenshots/AD-264'

  for (const theme of ['light', 'dark'] as const) {
    test(`register, log in, reload, log out (${theme})`, async ({ page }, info) => {
      const tag = `${info.project.name}-${theme}`
      const name = `t264v_${Date.now().toString(36)}${info.project.name[0]}${theme[0]}`
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme)

      await page.goto(`${BASE}/register`)
      await page.getByLabel('Username').fill(name)
      await page.getByLabel('Email').fill(`${name}@example.com`)
      await page.getByLabel('Password', { exact: true }).fill('secret123')
      await page.getByRole('button', { name: 'Create account' }).click()
      await expect(page).toHaveURL(`${BASE}/login`)
      await expect(identifier(page)).toHaveValue(name)
      await page.screenshot({ path: `${SHOTS}/${tag}-1-login-after-register.png`, fullPage: true })

      // Wrong password first, then the real one.
      await password(page).fill('wrong-pass')
      await submit(page).click()
      await expect(page.getByRole('alert')).toBeVisible()
      await page.screenshot({ path: `${SHOTS}/${tag}-2-login-error.png`, fullPage: true })
      await password(page).fill('secret123')
      await submit(page).click()
      await expect(page).toHaveURL(`${BASE}/home`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Welcome, ${name}`)
      await page.screenshot({ path: `${SHOTS}/${tag}-3-home.png`, fullPage: true })

      await page.reload()
      await expect(page).toHaveURL(`${BASE}/home`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Welcome, ${name}`)

      await page.getByRole('button', { name: 'Log out' }).click()
      await expect(page).toHaveURL(`${BASE}/login`)
      await expect(page.getByRole('alert')).toHaveCount(0)
      await page.goto(`${BASE}/home`)
      await expect(page).toHaveURL(`${BASE}/login`)
      await page.screenshot({ path: `${SHOTS}/${tag}-4-after-logout.png`, fullPage: true })

      // Logging in by email works too, then log out again.
      await identifier(page).fill(`${name}@example.com`)
      await password(page).fill('secret123')
      await submit(page).click()
      await expect(page).toHaveURL(`${BASE}/home`)
      await page.getByRole('button', { name: 'Log out' }).click()
      await expect(page).toHaveURL(`${BASE}/login`)
    })
  }
})
