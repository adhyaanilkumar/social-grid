import { expect, test } from '@playwright/test'

// Smoke tests for the public landing page (AD-243).

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('answers "what is this" above the fold', async ({ page }) => {
  await expect(page).toHaveTitle('social-grid')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Share photos with friends')
  await expect(page.getByRole('main').getByRole('link', { name: 'Create account' }).first()).toBeInViewport()
})

test('shows every planned section', async ({ page }) => {
  for (const name of ['Everything you need, nothing you don\'t', 'What a post looks like', 'Ready to join?']) {
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
  }
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Post photos', 'Follow friends', 'Like & comment'])
  await expect(page.locator('#posts img')).toHaveCount(3)
  await expect(page.getByRole('contentinfo')).toBeVisible()
})

test('primary call to action goes to register', async ({ page }) => {
  await page.getByRole('main').getByRole('link', { name: 'Create account' }).first().click()
  await expect(page).toHaveURL('/register')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create account')
})

test('secondary link goes to login', async ({ page }) => {
  await page.getByRole('link', { name: 'I already have an account' }).click()
  await expect(page).toHaveURL('/login')
})

test('every image has alt text or is marked decorative', async ({ page }) => {
  const images = page.locator('img')
  for (const img of await images.all()) {
    expect(await img.getAttribute('alt')).not.toBeNull()
  }
})

test('theme toggle switches to dark mode and remembers it', async ({ page }) => {
  await page.getByRole('button', { name: 'Switch to dark mode' }).first().click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test.describe('mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile-only checks')

  test('no horizontal scrolling', async ({ page }) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('menu sheet opens with log in and sign up', async ({ page }) => {
    await page.getByRole('button', { name: 'Open menu' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('link', { name: 'Log in' })).toBeVisible()
    await dialog.getByRole('link', { name: 'Sign up' }).click()
    await expect(page).toHaveURL('/register')
  })
})
