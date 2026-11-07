import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  ALICE,
  BOB,
  bottomBar,
  makeProfile,
  mockLoggedIn,
  mockProfile,
  navLink,
  newPostButton,
  ownProfileLink,
  searchBox,
  shell,
} from './helpers'

// The members-only layout: spec 5.2 (AppShell), 5.4, 5.5 and FR11. All mocked.

const MEMBERS_PAGES = ['/home', '/explore', '/search', `/users/${ALICE.username}`, `/users/${BOB.username}`]

test.beforeEach(async ({ page }) => {
  await mockLoggedIn(page)
  await mockProfile(page, makeProfile(ALICE))
  await mockProfile(page, makeProfile(BOB))
})

const fontWeight = (link: Locator) => link.evaluate((el) => Number(getComputedStyle(el).fontWeight))

async function expectMarkedAsCurrent(page: Page, current: string, others: string[]) {
  const link = navLink(page, current)
  await expect(link).toHaveAttribute('aria-current', 'page')
  for (const other of others) {
    await expect(navLink(page, other)).not.toHaveAttribute('aria-current', 'page')
    // More than colour: heavier text than the links next to it.
    expect(await fontWeight(link)).toBeGreaterThan(await fontWeight(navLink(page, other)))
  }
}

test('desktop top bar has logo, Home, Explore, search, New post, profile, theme toggle and Log out', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop layout')
  await page.goto('/home')
  const bar = shell(page)
  await expect(bar.getByRole('link', { name: 'social-grid' })).toBeVisible()
  await expect(navLink(page, 'Home')).toBeVisible()
  await expect(navLink(page, 'Explore')).toBeVisible()
  await expect(searchBox(page)).toBeVisible()
  await expect(newPostButton(page)).toBeVisible()
  await expect(navLink(page, ALICE.username)).toBeVisible()
  await expect(bar.getByRole('button', { name: /Switch to (light|dark) mode/ })).toBeVisible()
  await expect(bar.getByRole('button', { name: 'Log out' })).toBeVisible()
  await expect(bottomBar(page)).toBeHidden()
})

test('mobile top bar has logo, theme toggle and Log out; the bottom bar has the rest, labelled in words', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile layout')
  await page.goto('/home')
  const top = page.locator('#root > header')
  await expect(top.getByRole('link', { name: 'social-grid' })).toBeVisible()
  await expect(top.getByRole('button', { name: /Switch to (light|dark) mode/ })).toBeVisible()
  await expect(top.getByRole('button', { name: 'Log out' })).toBeVisible()
  await expect(top.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0)
  await expect(top.getByRole('searchbox')).toHaveCount(0)

  await expect(bottomBar(page)).toBeVisible()
  // toHaveText reads the words on screen, so an icon with only an aria-label would fail.
  await expect(bottomBar(page).locator('a, button')).toHaveText(['Home', 'Explore', 'Search', 'New post', 'Profile'])
})

test('Home and Explore use links with aria-current, and mark the current page with more than colour', async ({ page }) => {
  await page.goto('/home')
  await expectMarkedAsCurrent(page, 'Home', ['Explore'])
  await navLink(page, 'Explore').click()
  await expect(page).toHaveURL('/explore')
  await expectMarkedAsCurrent(page, 'Explore', ['Home'])
  // Links, not ARIA tabs.
  await expect(page.getByRole('tab')).toHaveCount(0)
})

test('the current desktop link has an underline as well as weight', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the underline belongs to the desktop top bar')
  await page.goto('/home')
  const border = (link: Locator) => link.evaluate((el) => getComputedStyle(el).borderBottomColor)
  expect(await border(navLink(page, 'Home'))).not.toBe(await border(navLink(page, 'Explore')))
})

test('mobile Search and Profile are marked as current on their pages', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the Search and Profile links are in the bottom bar')
  await page.goto('/search')
  await expectMarkedAsCurrent(page, 'Search', ['Home', 'Explore', 'Profile'])
  await page.goto(`/users/${ALICE.username}`)
  await expectMarkedAsCurrent(page, 'Profile', ['Home', 'Explore', 'Search'])
})

test('another user\'s profile does not mark your own profile link as current', async ({ page }) => {
  await page.goto(`/users/${BOB.username}`)
  await expect(ownProfileLink(page, ALICE.username)).not.toHaveAttribute('aria-current', 'page')
})

for (const path of MEMBERS_PAGES) {
  test(`own profile is reachable from the navigation on ${path} (FR11)`, async ({ page }) => {
    await page.goto(path)
    await ownProfileLink(page, ALICE.username).click()
    await expect(page).toHaveURL(`/users/${ALICE.username}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ALICE.username)
  })

  test(`New post is one click away on ${path}`, async ({ page }) => {
    await page.goto(path)
    await newPostButton(page).click()
    await expect(page.getByRole('dialog', { name: 'New post' })).toBeVisible()
  })

  test(`the logo goes to /home from ${path}`, async ({ page }) => {
    await page.goto(path)
    await shell(page).getByRole('link', { name: 'social-grid' }).click()
    await expect(page).toHaveURL('/home')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home')
  })
}

test('bottom bar items are at least 44px touch targets', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the bottom bar is mobile only')
  await page.goto('/home')
  const items = bottomBar(page).locator('a, button')
  await expect(items).toHaveCount(5)
  for (const item of await items.all()) {
    const box = (await item.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
  }
})

test('bar heights match spec 5.5, and the bottom bar sits at the bottom of the screen', async ({ page, isMobile }) => {
  await page.goto('/home')
  // Each bar adds a 1px border to its stated height.
  const top = (await page.locator('#root > header').boundingBox())!
  expect(top.height).toBeGreaterThanOrEqual(isMobile ? 48 : 56)
  expect(top.height).toBeLessThanOrEqual(isMobile ? 49 : 57)
  if (isMobile) {
    const bottom = (await bottomBar(page).boundingBox())!
    expect(bottom.height).toBeGreaterThanOrEqual(56)
    expect(bottom.height).toBeLessThanOrEqual(57)
    expect(bottom.y + bottom.height).toBeCloseTo(page.viewportSize()!.height, 0)
  }
})

test('Log out is on every members-only page', async ({ page }) => {
  for (const path of MEMBERS_PAGES) {
    await page.goto(path)
    await expect(shell(page).getByRole('button', { name: 'Log out' })).toBeVisible()
  }
})
