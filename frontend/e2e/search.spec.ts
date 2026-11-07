import { expect, test, type Page } from '@playwright/test'
import {
  AFTER_RETRIES,
  ALICE,
  BOB,
  cleanupUsers,
  countRequests,
  fail,
  json,
  logInThroughApi,
  main,
  makeProfile,
  mockLoggedIn,
  mockProfile,
  navLink,
  registerThroughApi,
  runSearch,
  searchBox,
  SEARCH_USERS,
  type RealUser,
} from './helpers'

// Search: FR5, spec 5.1, 5.2 (SearchBar) and 5.5. Mocks for edge cases, the real backend for matching rules.

test.afterAll(cleanupUsers)

const results = (page: Page) => main(page).getByRole('listitem')

async function mockSearch(page: Page, answer: (q: string) => { id: number; username: string }[]) {
  await page.route(SEARCH_USERS, (route) => json(route, 200, answer(new URL(route.request().url()).searchParams.get('q') ?? '')))
}

const twenty = Array.from({ length: 20 }, (_, i) => ({ id: 100 + i, username: `match_${i}` }))

test.describe('mocked', () => {
  test.beforeEach(async ({ page }) => {
    await mockLoggedIn(page)
  })

  test('desktop searches from the header box, with Enter or the button', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the header box is desktop only')
    await mockSearch(page, () => [BOB])
    await page.goto('/home')
    await searchBox(page).fill('bob')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page).toHaveURL('/search?q=bob')
    await expect(results(page)).toHaveCount(1)

    await page.goto('/explore')
    await searchBox(page).fill('bob')
    await searchBox(page).press('Enter')
    await expect(page).toHaveURL('/search?q=bob')
  })

  test('mobile searches from the Search page, reached from the bottom bar', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the bottom bar is mobile only')
    await mockSearch(page, () => [BOB])
    await page.goto('/home')
    await expect(searchBox(page)).toBeHidden()
    await navLink(page, 'Search').click()
    await expect(page).toHaveURL('/search')
    await searchBox(page).fill('bob')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page).toHaveURL('/search?q=bob')
    await expect(results(page)).toHaveCount(1)
  })

  test('there is no live dropdown: nothing is searched until you submit (spec 5.2)', async ({ page }) => {
    const searches = countRequests(page, SEARCH_USERS, 'GET')
    await page.goto('/search')
    await searchBox(page).pressSequentially('bob')
    await page.waitForTimeout(300)
    expect(searches.count).toBe(0)
    await expect(page).toHaveURL('/search')
  })

  test('the URL keeps the query, so refresh and Back work (spec 5.1)', async ({ page }) => {
    await mockSearch(page, (q) => (q === 'bob' ? [BOB] : q === 'carol' ? [{ id: 9, username: 'carol_3' }] : []))
    await page.goto('/home')
    await runSearch(page, 'bob')
    await expect(page).toHaveURL('/search?q=bob')
    await expect(results(page)).toHaveText([/bob_2$/])

    await page.reload()
    await expect(page).toHaveURL('/search?q=bob')
    await expect(results(page)).toHaveText([/bob_2$/])
    await expect(searchBox(page)).toHaveValue('bob')

    await searchBox(page).fill('carol')
    await searchBox(page).press('Enter')
    await expect(page).toHaveURL('/search?q=carol')
    await expect(results(page)).toHaveText([/carol_3$/])

    await page.goBack()
    await expect(page).toHaveURL('/search?q=bob')
    await expect(results(page)).toHaveText([/bob_2$/])
    await expect(searchBox(page)).toHaveValue('bob')
  })

  test('results link to profiles and never show an email (FR5)', async ({ page }) => {
    // Even if a response were to hold one, which it must not, the page doesn't show it.
    await mockSearch(page, () => [BOB])
    await mockProfile(page, makeProfile(BOB))
    await page.goto('/search?q=bob')
    await expect(results(page)).toHaveCount(1)
    await expect(main(page)).not.toContainText('@')
    await results(page).getByRole('link', { name: BOB.username }).click()
    await expect(page).toHaveURL(`/users/${BOB.username}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(BOB.username)
  })

  test('no match says so', async ({ page }) => {
    await mockSearch(page, () => [])
    await page.goto('/search?q=nobody')
    await expect(main(page).getByRole('status')).toContainText(/no users/i)
    await expect(main(page).getByRole('status')).toContainText('nobody')
    await expect(results(page)).toHaveCount(0)
  })

  test('says "Your own profile isn\'t shown" with results and with none (spec 5.5)', async ({ page }) => {
    await mockSearch(page, (q) => (q === 'bob' ? [BOB] : []))
    await page.goto('/search?q=bob')
    await expect(main(page)).toContainText("Your own profile isn't shown")
    await page.goto(`/search?q=${ALICE.username}`)
    await expect(main(page)).toContainText("Your own profile isn't shown")
  })

  test('says "Showing the first 20" at the limit, and not below it (spec 5.5)', async ({ page }) => {
    await mockSearch(page, (q) => (q === 'many' ? twenty : twenty.slice(0, 19)))
    await page.goto('/search?q=many')
    await expect(results(page)).toHaveCount(20)
    await expect(main(page)).toContainText('Showing the first 20')

    await page.goto('/search?q=fewer')
    await expect(results(page)).toHaveCount(19)
    await expect(main(page)).not.toContainText('Showing the first 20')
  })

  test('a blank search stays on /search and asks the server nothing', async ({ page }) => {
    const searches = countRequests(page, SEARCH_USERS, 'GET')
    await page.goto('/home')
    await runSearch(page, '   ')
    await expect(page).toHaveURL('/search')
    await expect(main(page).getByRole('alert')).toHaveCount(0)
    expect(searches.count).toBe(0)
  })

  test('a failed search shows an error with a working retry', async ({ page }) => {
    let broken = true
    await page.route(SEARCH_USERS, (route) => (broken ? fail(route, 500) : json(route, 200, [BOB])))
    await page.goto('/search?q=bob')
    await expect(main(page).getByRole('alert')).toBeVisible(AFTER_RETRIES)
    broken = false
    await main(page).getByRole('button', { name: 'Try again' }).click()
    await expect(results(page)).toHaveText([/bob_2$/])
    await expect(main(page).getByRole('alert')).toHaveCount(0)
  })

  for (const query of ['%', '_', '100%_a']) {
    test(`"${query}" is sent as typed, and the URL survives Back and refresh (FR5)`, async ({ page }) => {
      const seen: (string | null)[] = []
      await page.route(SEARCH_USERS, (route) => {
        seen.push(new URL(route.request().url()).searchParams.get('q'))
        return json(route, 200, [])
      })
      await page.goto('/home')
      await runSearch(page, query)
      await expect(page).toHaveURL(`/search?q=${encodeURIComponent(query)}`)
      await expect(main(page).getByRole('status')).toContainText(query)
      expect(seen).toEqual([query])
      await page.reload()
      await expect(searchBox(page)).toHaveValue(query)
      await expect(main(page).getByRole('status')).toContainText(query)
    })
  }
})

test.describe('real backend', () => {
  // Two users whose names hold a token nothing else on the backend can match.
  async function usersToFind(page: Page, project: string) {
    const searcher = await registerThroughApi(page, project)
    const target: RealUser = await registerThroughApi(page, project)
    await logInThroughApi(page, searcher)
    return { searcher, target }
  }

  test('matching ignores case and finds any part of the name, excluding the searcher (FR5)', async ({ page }, info) => {
    const { searcher, target } = await usersToFind(page, info.project.name)
    await page.goto('/home')

    // The end of the name, in upper case.
    await runSearch(page, target.username.slice(-8).toUpperCase())
    await expect(main(page).getByRole('link', { name: target.username })).toBeVisible()
    await expect(main(page).getByRole('link', { name: searcher.username })).toHaveCount(0)

    await runSearch(page, searcher.username)
    await expect(main(page).getByRole('status')).toContainText("Your own profile isn't shown")
    await expect(main(page).getByRole('link', { name: searcher.username })).toHaveCount(0)
  })

  test('the response holds no email (FR5, NFR5)', async ({ page }, info) => {
    const { target } = await usersToFind(page, info.project.name)
    const response = await page.request.get(`/api/users/search?q=${target.username}`)
    expect(await response.text()).not.toContain('@')
    await page.goto(`/search?q=${target.username}`)
    await expect(main(page).getByRole('link', { name: target.username })).toBeVisible()
    await expect(main(page)).not.toContainText(target.email)
  })

  test('a result opens the real profile', async ({ page }, info) => {
    const { target } = await usersToFind(page, info.project.name)
    await page.goto(`/search?q=${target.username}`)
    await main(page).getByRole('link', { name: target.username }).click()
    await expect(page).toHaveURL(`/users/${target.username}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(target.username)
  })

  test('% and _ match literally, not as wildcards (FR5)', async ({ page }, info) => {
    const { target } = await usersToFind(page, info.project.name)
    const name = target.username

    // As SQL wildcards, % skips the "_ui_" and _ stands in for the "u", and both would find the target.
    for (const wildcard of [`t%${name.slice(5)}`, `t__i_${name.slice(5)}`]) {
      await page.goto(`/search?q=${encodeURIComponent(wildcard)}`)
      await expect(main(page).getByRole('status')).toContainText(/no users/i)
    }

    // The real underscores in the name do match.
    await page.goto(`/search?q=${encodeURIComponent(name)}`)
    await expect(main(page).getByRole('link', { name })).toBeVisible()
  })
})
