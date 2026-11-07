import { expect, test, type Page } from '@playwright/test'
import {
  AFTER_RETRIES,
  cleanupUsers,
  createPostThroughApi,
  EXPLORE_FEED,
  fail,
  gated,
  HOME_FEED,
  logInThroughApi,
  main,
  makePost,
  mockLoggedIn,
  navLink,
  postItem,
  postItems,
  registerThroughApi,
  revealPost,
  signedInUser,
} from './helpers'

// Home and Explore: FR3, FR4, spec 5.2 (PostList), 5.4 and 5.5. Mocks for edge cases, the real backend for what
// each feed holds.

test.afterAll(cleanupUsers)

const loadMore = (page: Page) => page.getByRole('button', { name: /^(Load more|Loading…)$/ })

test.describe('mocked', () => {
  test('Home and Explore each say what they hold, and show their own posts', async ({ page }) => {
    const mine = makePost({ caption: 'home post' })
    const theirs = makePost({ caption: 'explore only post' })
    await mockLoggedIn(page, { home: [[mine]], explore: [[theirs, mine]] })

    await page.goto('/home')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home')
    await expect(main(page)).toContainText('From you and people you follow')
    await expect(postItem(page, mine.postId)).toBeVisible()
    await expect(postItem(page, theirs.postId)).toHaveCount(0)

    await navLink(page, 'Explore').click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explore')
    await expect(main(page)).toContainText("Everyone's posts")
    await expect(postItem(page, theirs.postId)).toBeVisible()
    await expect(postItem(page, mine.postId)).toBeVisible()
    await expect(postItems(page)).toHaveCount(2)
  })

  for (const [name, path, url] of [
    ['Home', '/home', HOME_FEED],
    ['Explore', '/explore', EXPLORE_FEED],
  ] as const) {
    test(`${name} shows a skeleton while loading`, async ({ page }) => {
      await mockLoggedIn(page)
      const { gate, release } = gated()
      const post = makePost()
      await page.route(url, async (route) => {
        await gate
        await route.fulfill({ json: { items: [post], nextCursor: null } })
      })
      await page.goto(path)
      await expect(page.getByRole('status', { name: 'Loading posts' })).toBeVisible()
      await expect(postItem(page, post.postId)).toHaveCount(0)
      release()
      await expect(postItem(page, post.postId)).toBeVisible()
      await expect(page.getByRole('status', { name: 'Loading posts' })).toHaveCount(0)
    })

    test(`${name} shows an error with a working retry`, async ({ page }) => {
      await mockLoggedIn(page)
      const post = makePost()
      let broken = true
      await page.route(url, (route) =>
        broken ? fail(route, 500) : route.fulfill({ json: { items: [post], nextCursor: null } }),
      )
      await page.goto(path)
      await expect(main(page).getByRole('alert')).toBeVisible(AFTER_RETRIES)
      broken = false
      await main(page).getByRole('button', { name: 'Try again' }).click()
      await expect(postItem(page, post.postId)).toBeVisible()
      await expect(main(page).getByRole('alert')).toHaveCount(0)
    })

    test(`${name} offers New post when empty`, async ({ page }) => {
      await mockLoggedIn(page)
      await page.goto(path)
      await main(page).getByRole('button', { name: 'New post' }).click()
      await expect(page.getByRole('dialog', { name: 'New post' })).toBeVisible()
    })
  }

  test("a new user's empty Home points to New post and Explore (FR3)", async ({ page }) => {
    await mockLoggedIn(page)
    await page.goto('/home')
    await expect(main(page).getByRole('button', { name: 'New post' })).toBeVisible()
    await main(page).getByRole('link', { name: /Explore/ }).click()
    await expect(page).toHaveURL('/explore')
  })

  test('Load more adds the next page with no duplicates, then goes away', async ({ page }) => {
    const first = [makePost(), makePost()]
    const second = [makePost(), makePost()]
    await mockLoggedIn(page, { home: [first, second] })
    await page.goto('/home')
    await expect(postItems(page)).toHaveCount(2)

    await loadMore(page).click()
    await expect(postItems(page)).toHaveCount(4)
    const ids = await postItems(page).evaluateAll((items) => items.map((item) => item.id))
    expect(new Set(ids).size).toBe(4)
    expect(ids).toEqual([...first, ...second].map((post) => `post-${post.postId}`))
    await expect(loadMore(page)).toHaveCount(0)
  })

  test('Load more asks for posts older than the last one shown', async ({ page }) => {
    const first = [makePost(), makePost()]
    const second = [makePost()]
    await mockLoggedIn(page, { explore: [first, second] })
    const asked: (string | null)[] = []
    page.on('request', (request) => {
      if (EXPLORE_FEED.test(request.url())) asked.push(new URL(request.url()).searchParams.get('before'))
    })
    await page.goto('/explore')
    await loadMore(page).click()
    await expect(postItems(page)).toHaveCount(3)
    expect(asked).toEqual([null, String(first[1].postId)])
  })

  test('a failed Load more keeps the posts, shows an error and can be tried again', async ({ page }) => {
    const first = [makePost(), makePost()]
    const second = [makePost()]
    await mockLoggedIn(page, { home: [first, second] })
    let broken = true
    await page.route(HOME_FEED, (route) => {
      if (broken && new URL(route.request().url()).searchParams.has('before')) return fail(route, 500)
      return route.fallback()
    })
    await page.goto('/home')
    await loadMore(page).click()
    await expect(main(page).getByRole('alert')).toBeVisible(AFTER_RETRIES)
    await expect(postItems(page)).toHaveCount(2)

    broken = false
    await loadMore(page).click()
    await expect(postItems(page)).toHaveCount(3)
    await expect(main(page).getByRole('alert')).toHaveCount(0)
  })

  test('a double click on Load more adds the next page once, with no duplicates', async ({ page }) => {
    const first = [makePost(), makePost()]
    const second = [makePost()]
    await mockLoggedIn(page, { home: [first, second] })
    await page.goto('/home')
    await loadMore(page).dblclick()
    await expect(postItems(page)).toHaveCount(3)
    const ids = await postItems(page).evaluateAll((items) => items.map((item) => item.id))
    expect(ids).toEqual([...first, ...second].map((post) => `post-${post.postId}`))
    await expect(main(page).getByRole('alert')).toHaveCount(0)
  })

  test.describe('feed photos (spec 5.5)', () => {
    const cases: [string, number, number, number][] = [
      ['follows a 3:2 photo', 1080, 720, 1.5],
      ['follows a square photo', 1080, 1080, 1],
      ['limits a very tall photo to 4:5', 400, 1080, 0.8],
      ['limits a very wide photo to 1.91:1', 1080, 200, 1.91],
    ]
    for (const [name, width, height, expected] of cases) {
      test(`the frame ${name}`, async ({ page }) => {
        const post = makePost({ width, height })
        await mockLoggedIn(page, { home: [[post]] })
        await page.goto('/home')
        const image = postItem(page, post.postId).getByRole('img', { name: `Photo by ${post.authorUsername}` })
        await expect(image).toBeVisible()
        const frame = (await image.locator('..').boundingBox())!
        expect(frame.width / frame.height).toBeCloseTo(expected, 1)
      })
    }

    test('photos are never cropped, and letterbox on the muted colour', async ({ page }) => {
      const post = makePost({ width: 400, height: 1080 })
      await mockLoggedIn(page, { home: [[post]] })
      await page.goto('/home')
      const image = postItem(page, post.postId).getByRole('img', { name: `Photo by ${post.authorUsername}` })
      await expect(image).toHaveCSS('object-fit', 'contain')
      await expect(image).toHaveAttribute('loading', 'lazy')
      const background = await image.locator('..').evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(background).not.toBe('rgba(0, 0, 0, 0)')
    })

    test('a frame is at most 100svh - 112px tall', async ({ page }) => {
      await page.setViewportSize({ width: page.viewportSize()!.width, height: 480 })
      const post = makePost({ width: 800, height: 1000 })
      await mockLoggedIn(page, { home: [[post]] })
      await page.goto('/home')
      const image = postItem(page, post.postId).getByRole('img', { name: `Photo by ${post.authorUsername}` })
      await expect(image).toBeVisible()
      const frame = (await image.locator('..').boundingBox())!
      expect(frame.height).toBeLessThanOrEqual(480 - 112 + 1)
    })

    test('the feed is 480px wide on desktop and full width on phones, with the stated gaps', async ({ page, isMobile }) => {
      const posts = [makePost(), makePost()]
      await mockLoggedIn(page, { home: [posts] })
      await page.goto('/home')
      await expect(postItems(page)).toHaveCount(2)
      const first = (await postItem(page, posts[0].postId).boundingBox())!
      const second = (await postItem(page, posts[1].postId).boundingBox())!
      expect(first.width).toBeCloseTo(isMobile ? page.viewportSize()!.width : 480, 0)
      expect(second.y - (first.y + first.height)).toBeCloseTo(isMobile ? 24 : 32, 0)
    })
  })
  // Deploy bug B1 (sdlc/v0/deploy-plan.md): revealPost gave up if it looked before the feed's first page arrived,
  // so a post pushed onto page 2 (by other workers posting in parallel) was never found. Here the first page is
  // held back and the post sits on page 2, so only "Load more" can reveal it.
  test('revealPost finds a post on a later page even when the first page is slow (B1)', async ({ page }) => {
    const target = makePost({ postId: 900, caption: 'on page two' })
    const newer = [makePost({ postId: 902 }), makePost({ postId: 901 })]
    await mockLoggedIn(page, { explore: [newer, [target]] })
    await page.route(EXPLORE_FEED, async (route) => {
      if (!new URL(route.request().url()).searchParams.has('before')) await new Promise((r) => setTimeout(r, 1500))
      return route.fallback()
    })
    await page.goto('/explore')
    await expect(await revealPost(page, target.postId)).toBeVisible()
  })

  // Deploy bug B10 (sdlc/v0/deploy-plan.md): coming back to a feed shows the cached posts and refreshes them in the
  // background. Pressing "Load more" before that refresh finished cancelled it, so a post made in the meantime
  // (here 903) never appeared at the top. Found when composer.spec's FR1 test failed on mobile in `make test`.
  test('Load more pressed while a revisited feed is refreshing keeps the newest post (B10)', async ({ page }) => {
    let pages = [[makePost({ postId: 902 }), makePost({ postId: 901 })], [makePost({ postId: 900 })]]
    await mockLoggedIn(page, { explore: () => pages })
    await page.goto('/explore')
    await expect(postItem(page, 902)).toBeVisible()
    await navLink(page, 'Home').click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home')

    pages = [[makePost({ postId: 903, caption: 'posted meanwhile' }), makePost({ postId: 902 }), makePost({ postId: 901 })], [makePost({ postId: 900 })]]
    await page.route(EXPLORE_FEED, async (route) => {
      if (!new URL(route.request().url()).searchParams.has('before')) await new Promise((r) => setTimeout(r, 1500))
      return route.fallback()
    })
    await navLink(page, 'Explore').click()
    await expect(postItem(page, 902)).toBeVisible()
    await loadMore(page).click()

    await expect(postItem(page, 903)).toBeVisible()
    await expect(postItems(page).first()).toHaveId('post-903')
  })
})

test.describe('real backend', () => {
  test('Home holds own posts only, newest first; Explore holds everyone\'s (FR3, FR4)', async ({ page, browser }, info) => {
    // Another user, who posts in their own browser context.
    const otherContext = await browser.newContext()
    const otherPage = await otherContext.newPage()
    const other = await registerThroughApi(otherPage, info.project.name)
    await logInThroughApi(otherPage, other)
    const theirPost = await createPostThroughApi(otherPage, 'not on your home')
    await otherContext.close()

    await signedInUser(page, info.project.name)
    const older = await createPostThroughApi(page, 'my older post')
    const newer = await createPostThroughApi(page, 'my newer post')

    await page.goto('/home')
    await expect(postItem(page, newer)).toBeVisible()
    await expect(postItems(page).evaluateAll((items) => items.map((item) => item.id))).resolves.toEqual([`post-${newer}`, `post-${older}`])
    await expect(postItem(page, theirPost)).toHaveCount(0)

    await navLink(page, 'Explore').click()
    await expect(postItems(page).first()).toBeVisible()
    await expect(await revealPost(page, theirPost)).toBeVisible()
    await expect(await revealPost(page, newer)).toBeVisible()
    // Newest first holds over whatever else the shared backend contains.
    const ids = await postItems(page).evaluateAll((items) => items.map((item) => Number(item.id.replace('post-', ''))))
    expect(ids).toEqual([...ids].sort((a, b) => b - a))
  })

  test("a brand new user's Home shows the prompt, not an error (FR3)", async ({ page }, info) => {
    await signedInUser(page, info.project.name)
    await page.goto('/home')
    await expect(main(page).getByRole('button', { name: 'New post' })).toBeVisible()
    await expect(main(page).getByRole('link', { name: /Explore/ })).toBeVisible()
    await expect(postItems(page)).toHaveCount(0)
  })
})
