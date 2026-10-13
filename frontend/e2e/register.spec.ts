import { expect, test, type Page, type Route } from '@playwright/test'

// Sign-up page (AD-263). The API is mocked with page.route: the test dev server (port 5174)
// is not a CORS-allowed origin, and mocking lets us force every server answer.

const REGISTER = '**/api/auth/register'

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

// Counts how many register requests reach the "server".
function countRequests(page: Page) {
  const counter = { count: 0 }
  page.on('request', (req) => {
    if (req.url().includes('/api/auth/register') && req.method() === 'POST') counter.count++
  })
  return counter
}

const username = (page: Page) => page.getByLabel('Username')
const email = (page: Page) => page.getByLabel('Email')
const password = (page: Page) => page.getByLabel('Password', { exact: true })
const submit = (page: Page) => page.getByRole('button', { name: /Create account|Creating account/ })

async function fillValid(page: Page, name = 'alice_1') {
  await username(page).fill(name)
  await email(page).fill('alice@example.com')
  await password(page).fill('secret123')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/register')
})

test('shows heading, labelled fields and hints', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create account')
  await expect(username(page)).toHaveAttribute('autocomplete', 'username')
  await expect(email(page)).toHaveAttribute('autocomplete', 'email')
  await expect(email(page)).toHaveAttribute('type', 'email')
  await expect(password(page)).toHaveAttribute('autocomplete', 'new-password')
  await expect(page.locator('#username-hint')).toHaveText('3–30 characters')
  await expect(username(page)).toHaveAttribute('aria-describedby', 'username-hint')
  await expect(password(page)).toHaveAttribute('aria-describedby', 'password-hint')
  await expect(username(page)).toHaveAttribute('aria-invalid', 'false')
})

test.describe('validation on blur', () => {
  test('leaving an empty field shows nothing', async ({ page }) => {
    for (const field of [username(page), email(page), password(page)]) {
      await field.focus()
      await field.blur()
    }
    await expect(page.locator('[id$="-error"]')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('errors appear on blur and clear while typing the fix', async ({ page }) => {
    await username(page).fill('ab')
    await username(page).blur()
    await expect(page.locator('#username-error')).toHaveText('Username must be 3–30 characters')
    await expect(username(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(username(page)).toHaveAttribute('aria-describedby', 'username-hint username-error')

    await username(page).focus()
    await username(page).press('c') // one keystroke fixes it
    await expect(page.locator('#username-error')).toHaveCount(0)
    await expect(username(page)).toHaveAttribute('aria-invalid', 'false')

    await email(page).fill('not-an-email')
    await email(page).blur()
    await expect(page.locator('#email-error')).toHaveText('Enter a valid email address')
    await expect(email(page)).toHaveAttribute('aria-describedby', 'email-error')
    await email(page).pressSequentially('@x.io')
    await expect(page.locator('#email-error')).toHaveCount(0)

    await password(page).fill('short')
    await password(page).blur()
    await expect(page.locator('#password-error')).toHaveText('Password must be 8–72 characters')
    await password(page).pressSequentially('ish')
    await expect(page.locator('#password-error')).toHaveCount(0)
  })

  test('an error re-checks on every keystroke (clearing a field shows "required")', async ({ page }) => {
    await username(page).fill('ab')
    await username(page).blur()
    await username(page).fill('')
    await expect(page.locator('#username-error')).toHaveText('Username is required')
  })

  test('no error is shown while typing in a field that has not been left yet', async ({ page }) => {
    await username(page).pressSequentially('a')
    await expect(page.locator('#username-error')).toHaveCount(0)
  })
})

test('empty submit shows "required" on all fields, focuses username, sends nothing', async ({ page }) => {
  const requests = countRequests(page)
  await submit(page).click()
  await expect(page.locator('#username-error')).toHaveText('Username is required')
  await expect(page.locator('#email-error')).toHaveText('Email is required')
  await expect(page.locator('#password-error')).toHaveText('Password is required')
  await expect(username(page)).toBeFocused()
  await page.waitForTimeout(300)
  expect(requests.count).toBe(0)
})

test('submit focuses the first invalid field (email) when username is fine', async ({ page }) => {
  const requests = countRequests(page)
  await username(page).fill('alice')
  await email(page).fill('bad')
  await password(page).fill('secret123')
  await submit(page).click()
  await expect(email(page)).toBeFocused()
  expect(requests.count).toBe(0)
})

test.describe('server field errors', () => {
  test('400 fieldErrors land under each field and focus the first', async ({ page }) => {
    await page.route(REGISTER, (r) =>
      json(r, 400, {
        status: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        fieldErrors: { email: 'Enter a valid email address', password: 'Password must be 8–72 characters' },
      }),
    )
    await fillValid(page)
    await submit(page).click()
    await expect(page.locator('#email-error')).toHaveText('Enter a valid email address')
    await expect(page.locator('#password-error')).toHaveText('Password must be 8–72 characters')
    await expect(page.locator('#username-error')).toHaveCount(0)
    await expect(email(page)).toBeFocused()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('409 username taken goes under Username with focus, input kept', async ({ page }) => {
    await page.route(REGISTER, (r) =>
      json(r, 409, {
        status: 409,
        error: 'Conflict',
        message: 'Username already taken',
        fieldErrors: { username: 'Username already taken' },
      }),
    )
    await fillValid(page)
    await submit(page).click()
    await expect(page.locator('#username-error')).toHaveText('Username already taken')
    await expect(username(page)).toBeFocused()
    await expect(username(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(username(page)).toHaveValue('alice_1')
    await expect(password(page)).toHaveValue('secret123')
    // Editing the username clears the server error (client rules pass).
    await username(page).press('x')
    await expect(page.locator('#username-error')).toHaveCount(0)
  })

  test('409 email taken goes under Email with focus', async ({ page }) => {
    await page.route(REGISTER, (r) =>
      json(r, 409, {
        status: 409,
        error: 'Conflict',
        message: 'Email already registered',
        fieldErrors: { email: 'Email already registered' },
      }),
    )
    await fillValid(page)
    await submit(page).click()
    await expect(page.locator('#email-error')).toHaveText('Email already registered')
    await expect(email(page)).toBeFocused()
    await expect(email(page)).toHaveValue('alice@example.com')
  })
})

test.describe('errors without fieldErrors use the alert box', () => {
  const cases: [string, (r: Route) => Promise<void>][] = [
    ['field-less 409', (r) => json(r, 409, { status: 409, error: 'Conflict', message: 'Request conflicts with existing data' })],
    ['500', (r) => json(r, 500, { status: 500, error: 'Internal Server Error', message: 'boom' })],
    ['500 with no JSON body', (r) => r.fulfill({ status: 500, body: '' })],
    ['network failure', (r) => r.abort('failed')],
  ]
  for (const [name, handler] of cases) {
    test(name, async ({ page }) => {
      await page.route(REGISTER, handler)
      await fillValid(page)
      await submit(page).click()
      const alert = page.getByRole('alert')
      await expect(alert).toBeVisible()
      await expect(alert).toHaveText(
        name === 'network failure'
          ? "Couldn't reach the server. Check your connection and try again."
          : 'Something went wrong on our side. Please try again.',
      )
      await expect(page.locator('[id$="-error"]')).toHaveCount(0)
      await expect(username(page)).toHaveValue('alice_1')
      await expect(email(page)).toHaveValue('alice@example.com')
      await expect(password(page)).toHaveValue('secret123')
      await expect(submit(page)).toHaveText('Create account')
    })
  }

  test('alert clears on the next submit', async ({ page }) => {
    let first = true
    await page.route(REGISTER, async (r) => {
      if (first) {
        first = false
        return r.abort('failed')
      }
      return json(r, 201, { id: 1, username: 'alice_1', email: 'alice@example.com' })
    })
    await fillValid(page)
    await submit(page).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await submit(page).click()
    await expect(page).toHaveURL('/login')
  })
})

test('Show/Hide password toggles type and aria-pressed', async ({ page }) => {
  await password(page).fill('secret123')
  const toggle = page.getByRole('button', { name: 'Show password' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(password(page)).toHaveAttribute('type', 'password')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(password(page)).toHaveAttribute('type', 'text')
  await expect(password(page)).toHaveValue('secret123')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(password(page)).toHaveAttribute('type', 'password')
})

test('password length line gets a check once 8+ characters', async ({ page }) => {
  const hint = page.locator('#password-hint')
  await expect(hint).toHaveText('At least 8 characters')
  await expect(hint.locator('svg')).toHaveCount(0)
  await password(page).fill('1234567')
  await expect(hint.locator('svg')).toHaveCount(0)
  await password(page).fill('12345678')
  await expect(hint.locator('svg')).toHaveCount(1)
  await expect(hint.locator('span')).toHaveClass(/text-primary/)
  await password(page).fill('1234567')
  await expect(hint.locator('svg')).toHaveCount(0)
})

test('pending state, and a double click sends exactly one request', async ({ page }) => {
  const requests = countRequests(page)
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route(REGISTER, async (r) => {
    await gate
    await json(r, 201, { id: 7, username: 'alice_1', email: 'alice@example.com' })
  })
  await fillValid(page)
  await submit(page).dblclick()
  await expect(submit(page)).toHaveText('Creating account…')
  await expect(submit(page)).toHaveAttribute('aria-disabled', 'true')
  await expect(submit(page).locator('svg.animate-spin')).toHaveCount(1)
  // Extra clicks and Enter while pending must not send more. force: Playwright treats aria-disabled as
  // disabled and would wait, but a real click still reaches the (not natively disabled) button.
  await submit(page).click({ force: true })
  await password(page).press('Enter')
  await page.waitForTimeout(300)
  expect(requests.count).toBe(1)
  release()
  await expect(page).toHaveURL('/login')
  expect(requests.count).toBe(1)
})

test('success sends the form values and lands on /login with a status message', async ({ page }) => {
  let sent: unknown
  await page.route(REGISTER, async (r) => {
    sent = r.request().postDataJSON()
    await json(r, 201, { id: 7, username: 'alice_1', email: 'alice@example.com' })
  })
  await fillValid(page)
  await submit(page).click()
  await expect(page).toHaveURL('/login')
  expect(sent).toEqual({ username: 'alice_1', email: 'alice@example.com', password: 'secret123' })
  await expect(page.getByRole('status')).toHaveText('Account created for alice_1 — log in to continue.')
})

test('keyboard: Enter submits the form', async ({ page }) => {
  await page.route(REGISTER, (r) => json(r, 201, { id: 7, username: 'alice_1', email: 'alice@example.com' }))
  await fillValid(page)
  await password(page).press('Enter')
  await expect(page).toHaveURL('/login')
})

test('keyboard: tab order is username, email, password, show toggle, submit', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Tab order is a keyboard (desktop) concern')
  await username(page).focus()
  await page.keyboard.press('Tab')
  await expect(email(page)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(password(page)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Show password' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Create account' })).toBeFocused()
})

test('mobile: no horizontal scrolling with errors and alert showing', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile-only check')
  await page.route(REGISTER, (r) => r.abort('failed'))
  await submit(page).click()
  await fillValid(page, 'a_very_long_username_of_thirty')
  await submit(page).click()
  await expect(page.getByRole('alert')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
