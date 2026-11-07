import { expect, test, type Page } from '@playwright/test'
import {
  AFTER_RETRIES,
  ALICE,
  api,
  BOB,
  cleanupUsers,
  commentField,
  createPostThroughApi,
  deletePostButton,
  fail,
  likeButton,
  logInThroughApi,
  main,
  makePost,
  makeProfile,
  mockLoggedIn,
  mockProfile,
  mockPostList,
  navLink,
  ownProfileLink,
  profileCount,
  postItem,
  registerThroughApi,
  signedInUser,
  userPosts,
  userProfile,
  type MockPost,
} from './helpers'

// Profiles and the post grid: FR6, FR7, FR11, spec 5.2, 5.3, 5.5 and 7.3. Mocks for edge cases, the real backend for
// follow and unfollow.

test.afterAll(cleanupUsers)

const tile = (page: Page, post: MockPost) => page.locator(`#tile-${post.postId}`)
const tiles = (page: Page) => page.locator('[id^="tile-"]')
const dialog = (page: Page, username = BOB.username) => page.getByRole('dialog', { name: `Post by ${username}` })
const followButton = (page: Page) => main(page).getByRole('button', { name: 'Follow', exact: true })
const unfollowButton = (page: Page) => main(page).getByRole('button', { name: 'Unfollow', exact: true })

async function bobWithPosts(page: Page, posts: MockPost[]) {
  await mockLoggedIn(page)
  await mockProfile(page, makeProfile(BOB, { postCount: posts.length }), [posts])
  await page.goto(`/users/${BOB.username}`)
  await expect(tiles(page)).toHaveCount(posts.length)
}

test.describe('header', () => {
  test('shows username, name, bio and the three counts (FR6)', async ({ page }) => {
    await mockLoggedIn(page)
    await mockProfile(
      page,
      makeProfile(BOB, { firstName: 'Bob', lastName: 'Builder', bio: 'I build things', postCount: 3, followerCount: 1, followingCount: 12 }),
    )
    await page.goto(`/users/${BOB.username}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(BOB.username)
    await expect(main(page)).toContainText('Bob Builder')
    await expect(main(page)).toContainText('I build things')
    await expect(profileCount(page, '3 posts')).toBeVisible()
    await expect(profileCount(page, '1 follower')).toBeVisible()
    await expect(profileCount(page, '12 following')).toBeVisible()
    // Plain text, since there are no follower lists (spec 5.4).
    await expect(main(page).getByRole('link', { name: /follower|following/ })).toHaveCount(0)
    await expect(main(page).getByRole('button', { name: /follower|following/ })).toHaveCount(0)
  })

  test('name and bio are left out when not set (FR6)', async ({ page }) => {
    await mockLoggedIn(page)
    await mockProfile(page, makeProfile(BOB))
    await page.goto(`/users/${BOB.username}`)
    await expect(profileCount(page, '0 posts')).toBeVisible()
    await expect(main(page)).not.toContainText('null')
  })

  test('own profile has no follow button; another user has one (FR7, FR11)', async ({ page }) => {
    await mockLoggedIn(page)
    await mockProfile(page, makeProfile(ALICE))
    await mockProfile(page, makeProfile(BOB))

    await page.goto(`/users/${ALICE.username}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ALICE.username)
    await expect(followButton(page)).toHaveCount(0)
    await expect(unfollowButton(page)).toHaveCount(0)

    await page.goto(`/users/${BOB.username}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(BOB.username)
    await expect(followButton(page)).toBeVisible()
  })

  test('someone you follow shows Unfollow', async ({ page }) => {
    await mockLoggedIn(page)
    await mockProfile(page, makeProfile(BOB, { followedByMe: true }))
    await page.goto(`/users/${BOB.username}`)
    await expect(unfollowButton(page)).toBeVisible()
    await expect(followButton(page)).toHaveCount(0)
  })

  test('an unknown username shows a not-found message (FR6)', async ({ page }) => {
    await mockLoggedIn(page)
    await page.route(userProfile('nobody_here'), (route) => fail(route, 404, 'User not found'))
    await page.route(userPosts('nobody_here'), (route) => fail(route, 404, 'User not found'))
    await page.goto('/users/nobody_here')
    await expect(main(page)).toContainText(/not found|can't find/i)
    await expect(followButton(page)).toHaveCount(0)
  })

  test('a profile that fails to load offers a retry, and does not claim not-found', async ({ page }) => {
    await mockLoggedIn(page)
    let broken = true
    const profile = makeProfile(BOB)
    await page.route(userProfile(BOB.username), (route) => (broken ? fail(route, 500) : route.fulfill({ json: profile })))
    await page.goto(`/users/${BOB.username}`)
    await expect(main(page).getByRole('alert')).toBeVisible(AFTER_RETRIES)
    await expect(main(page)).not.toContainText(/not found/i)
    broken = false
    await main(page).getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(BOB.username)
  })

  test('a 409 on follow and a 404 on unfollow count as success (spec 5.3)', async ({ page }) => {
    await mockLoggedIn(page)
    const profile = makeProfile(BOB)
    await page.route(userProfile(BOB.username), (route) => route.fulfill({ json: profile }))
    await page.route(api(`users/${BOB.id}/follow`), (route) => {
      const following = route.request().method() === 'POST'
      profile.followedByMe = following
      return fail(route, following ? 409 : 404)
    })
    await page.goto(`/users/${BOB.username}`)
    await followButton(page).click()
    await expect(unfollowButton(page)).toBeVisible()
    await expect(main(page).getByRole('alert')).toHaveCount(0)
    await unfollowButton(page).click()
    await expect(followButton(page)).toBeVisible()
    await expect(main(page).getByRole('alert')).toHaveCount(0)
  })

  test('a failed follow says so and leaves the button as it was', async ({ page }) => {
    await mockLoggedIn(page)
    await mockProfile(page, makeProfile(BOB))
    await page.route(api(`users/${BOB.id}/follow`), (route) => fail(route, 500))
    await page.goto(`/users/${BOB.username}`)
    await followButton(page).click()
    await expect(main(page).getByRole('alert')).toBeVisible()
    await expect(followButton(page)).toBeVisible()
  })
})

test.describe('empty states', () => {
  test('your own empty profile points to New post', async ({ page }) => {
    await mockLoggedIn(page)
    await mockProfile(page, makeProfile(ALICE))
    await page.goto(`/users/${ALICE.username}`)
    await main(page).getByRole('button', { name: 'New post' }).click()
    await expect(page.getByRole('dialog', { name: 'New post' })).toBeVisible()
  })

  test("someone else's empty profile says so, with no New post", async ({ page }) => {
    await mockLoggedIn(page)
    await mockProfile(page, makeProfile(BOB))
    await page.goto(`/users/${BOB.username}`)
    await expect(main(page)).toContainText(`${BOB.username} hasn't posted yet`)
    await expect(main(page).getByRole('button', { name: 'New post' })).toHaveCount(0)
  })
})

test.describe('grid', () => {
  test('3 columns of square tiles with 4px gaps, up to 960px wide (spec 5.2, 5.5)', async ({ page }) => {
    await bobWithPosts(page, Array.from({ length: 7 }, () => makePost()))
    const boxes = await tiles(page).evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect()
        return { x, y, width, height }
      }),
    )
    const columns = new Set(boxes.map((box) => Math.round(box.x)))
    expect(columns.size).toBe(3)
    // Row one holds exactly the first three.
    expect(boxes.filter((box) => Math.round(box.y) === Math.round(boxes[0].y))).toHaveLength(3)
    for (const box of boxes) expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1)
    expect(boxes[1].x - (boxes[0].x + boxes[0].width)).toBeCloseTo(4, 0)
    expect(boxes[3].y - (boxes[0].y + boxes[0].height)).toBeCloseTo(4, 0)
    const gridWidth = boxes[2].x + boxes[2].width - boxes[0].x
    expect(gridWidth).toBeLessThanOrEqual(960)
  })

  test('tiles use object-cover and empty alt text, with the caption or "Post by" as their name (spec 5.2)', async ({ page }) => {
    const withCaption = makePost({ caption: 'sunset at the lake' })
    const without = makePost({ caption: null })
    await bobWithPosts(page, [withCaption, without])
    await expect(main(page).getByRole('button', { name: 'sunset at the lake' })).toHaveAttribute('id', `tile-${withCaption.postId}`)
    await expect(main(page).getByRole('button', { name: `Post by ${BOB.username}` })).toHaveAttribute('id', `tile-${without.postId}`)
    const image = tile(page, withCaption).locator('img')
    await expect(image).toHaveAttribute('alt', '')
    await expect(image).toHaveCSS('object-fit', 'cover')
  })

  test('a tile opens the full post by click, with likes, comments and photo (FR6)', async ({ page }) => {
    const post = makePost({ likeCount: 4, caption: 'open me' })
    await bobWithPosts(page, [post])
    await tile(page, post).click()
    await expect(dialog(page)).toBeVisible()
    await expect(likeButton(dialog(page))).toHaveText('4 likes')
    await expect(commentField(dialog(page))).toBeVisible()
    await expect(dialog(page)).toContainText('open me')
    await expect(dialog(page).getByRole('img', { name: `Photo by ${BOB.username}` })).toBeVisible()
  })

  for (const key of ['Enter', 'Space']) {
    test(`a tile opens by keyboard with ${key} (spec 7.3)`, async ({ page }) => {
      const post = makePost()
      await bobWithPosts(page, [post])
      await tile(page, post).focus()
      await page.keyboard.press(key)
      await expect(dialog(page)).toBeVisible()
    })
  }

  test('Escape closes the dialog, focus returns to the tile, and Back does not reopen it', async ({ page }) => {
    const post = makePost()
    await mockLoggedIn(page)
    await mockProfile(page, makeProfile(BOB), [[post]])
    await page.goto('/home')
    await page.goto(`/users/${BOB.username}`)
    await tile(page, post).focus()
    await page.keyboard.press('Enter')
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await expect(tile(page, post)).toBeFocused()
    await page.goBack()
    await expect(page).toHaveURL('/home')
  })

  test('the Close button closes the dialog', async ({ page }) => {
    const post = makePost()
    await bobWithPosts(page, [post])
    await tile(page, post).click()
    await dialog(page).getByRole('button', { name: 'Close' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(page).toHaveURL(`/users/${BOB.username}`)
  })

  test("the phone's Back closes the dialog and stays on the profile (spec 5.5)", async ({ page }) => {
    const post = makePost()
    await mockLoggedIn(page)
    await mockProfile(page, makeProfile(BOB), [[post]])
    await page.goto('/home')
    await page.goto(`/users/${BOB.username}`)
    await tile(page, post).click()
    await expect(dialog(page)).toBeVisible()
    await page.goBack()
    await expect(dialog(page)).toBeHidden()
    await expect(page).toHaveURL(`/users/${BOB.username}`)
    await page.goBack()
    await expect(page).toHaveURL('/home')
  })

  test('a like in the dialog updates straight away, and the dialog stays open (spec 5.3)', async ({ page }) => {
    const post = makePost({ likeCount: 1 })
    await bobWithPosts(page, [post])
    await page.route(api(`posts/${post.postId}/likes`), (route) => route.fulfill({ status: 201, body: '' }))
    await tile(page, post).click()
    await likeButton(dialog(page)).click()
    await expect(likeButton(dialog(page))).toHaveText('2 likes')
    await expect(likeButton(dialog(page))).toHaveAttribute('aria-pressed', 'true')
    await expect(dialog(page)).toBeVisible()
  })

  test('deleting your post from the dialog closes it and removes the tile (spec 5.2)', async ({ page }) => {
    const post = makePost({ authorId: ALICE.id, authorUsername: ALICE.username })
    const other = makePost({ authorId: ALICE.id, authorUsername: ALICE.username })
    let posts = [post, other]
    await mockLoggedIn(page)
    await page.route(userProfile(ALICE.username), (route) =>
      route.fulfill({ json: makeProfile(ALICE, { postCount: posts.length }) }),
    )
    await mockPostList(page, userPosts(ALICE.username), () => [posts])
    await page.route(api(`posts/${post.postId}`), async (route) => {
      expect(route.request().method()).toBe('DELETE')
      posts = [other]
      await route.fulfill({ status: 204, body: '' })
    })

    await page.goto(`/users/${ALICE.username}`)
    await tile(page, post).click()
    const open = dialog(page, ALICE.username)
    await deletePostButton(open).click()
    await expect(open).toContainText('Delete this post and its comments?')
    await deletePostButton(open).click()
    await expect(open).toBeHidden()
    await expect(tile(page, post)).toHaveCount(0)
    await expect(tile(page, other)).toBeVisible()
    await expect(profileCount(page, '1 post')).toBeVisible()
    await expect(page).toHaveURL(`/users/${ALICE.username}`)
  })

  test("someone else's post in the dialog has no delete", async ({ page }) => {
    const post = makePost()
    await bobWithPosts(page, [post])
    await tile(page, post).click()
    await expect(likeButton(dialog(page))).toBeVisible()
    await expect(deletePostButton(dialog(page))).toHaveCount(0)
  })

  test('a broken image shows a placeholder, and the tile still opens the post (spec 5.2, 7.3)', async ({ page }) => {
    const post = makePost({ caption: 'broken photo' })
    await mockLoggedIn(page)
    await mockProfile(page, makeProfile(BOB), [[post]])
    await page.route(api(`posts/${post.postId}/image`), (route) => fail(route, 404))
    await page.goto(`/users/${BOB.username}`)
    await expect(tile(page, post)).toContainText('Image unavailable')
    await expect(main(page).getByRole('button', { name: 'broken photo' })).toBeVisible()
    await tile(page, post).click()
    await expect(dialog(page)).toBeVisible()
    await expect(likeButton(dialog(page))).toBeVisible()
  })

  test('Load more adds tiles with no duplicates, and a failure can be tried again (spec 5.2)', async ({ page }) => {
    const first = [makePost(), makePost(), makePost()]
    const second = [makePost(), makePost()]
    await mockLoggedIn(page)
    await mockProfile(page, makeProfile(BOB, { postCount: 5 }), [first, second])
    let broken = true
    await page.route(userPosts(BOB.username), (route) => {
      if (broken && new URL(route.request().url()).searchParams.has('before')) return fail(route, 500)
      return route.fallback()
    })
    await page.goto(`/users/${BOB.username}`)
    await expect(tiles(page)).toHaveCount(3)

    const loadMore = main(page).getByRole('button', { name: 'Load more' })
    await loadMore.click()
    await expect(main(page).getByRole('alert')).toBeVisible(AFTER_RETRIES)
    await expect(tiles(page)).toHaveCount(3)

    broken = false
    await loadMore.click()
    await expect(tiles(page)).toHaveCount(5)
    const ids = await tiles(page).evaluateAll((elements) => elements.map((element) => element.id))
    expect(new Set(ids).size).toBe(5)
    await expect(loadMore).toHaveCount(0)
  })

  test('a grid that fails to load offers a retry', async ({ page }) => {
    const post = makePost()
    await mockLoggedIn(page)
    await page.route(userProfile(BOB.username), (route) => route.fulfill({ json: makeProfile(BOB) }))
    let broken = true
    await page.route(userPosts(BOB.username), (route) =>
      broken ? fail(route, 500) : route.fulfill({ json: { items: [post], nextCursor: null } }),
    )
    await page.goto(`/users/${BOB.username}`)
    await expect(main(page).getByRole('alert')).toBeVisible(AFTER_RETRIES)
    broken = false
    await main(page).getByRole('button', { name: 'Try again' }).click()
    await expect(tile(page, post)).toBeVisible()
  })
})

test.describe('real backend', () => {
  test('Follow and Unfollow update counts and the Home feed straight away (FR7)', async ({ page, browser }, info) => {
    const otherContext = await browser.newContext()
    const otherPage = await otherContext.newPage()
    const other = await registerThroughApi(otherPage, info.project.name)
    await logInThroughApi(otherPage, other)
    const theirPost = await createPostThroughApi(otherPage, 'from someone I may follow')
    await otherContext.close()

    const me = await signedInUser(page, info.project.name)
    await page.goto('/home')
    await expect(postItem(page, theirPost)).toHaveCount(0)

    // A full page load would lose this attribute.
    await page.evaluate(() => {
      document.documentElement.dataset.noReload = 'yes'
    })
    await main(page).getByRole('link', { name: /Explore/ }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explore')
    await page.getByRole('main').locator(`a[href="/users/${other.username}"]`).first().click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(other.username)
    await expect(profileCount(page, '0 followers')).toBeVisible()

    await followButton(page).click()
    await expect(unfollowButton(page)).toBeVisible()
    await expect(profileCount(page, '1 follower')).toBeVisible()

    await navLink(page, 'Home').click()
    await expect(postItem(page, theirPost)).toBeVisible()

    await ownProfileLink(page, me.username).click()
    await expect(profileCount(page, '1 following')).toBeVisible()

    await page.goBack()
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(other.username)
    await unfollowButton(page).click()
    await expect(followButton(page)).toBeVisible()
    await expect(profileCount(page, '0 followers')).toBeVisible()

    await navLink(page, 'Home').click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home')
    await expect(postItem(page, theirPost)).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.dataset.noReload)).toBe('yes')
  })

  test('a real unknown username shows the not-found message (FR6)', async ({ page }, info) => {
    await signedInUser(page, info.project.name)
    await page.goto(`/users/t_ui_nobody_${Date.now().toString(36)}`)
    await expect(main(page)).toContainText(/not found|can't find/i)
  })

  test('a real profile shows the grid newest first, and counts its posts (FR6)', async ({ page }, info) => {
    const me = await signedInUser(page, info.project.name)
    const older = await createPostThroughApi(page, 'older')
    const newer = await createPostThroughApi(page, 'newer')
    await page.goto(`/users/${me.username}`)
    await expect(profileCount(page, '2 posts')).toBeVisible()
    await expect(tiles(page)).toHaveCount(2)
    expect(await tiles(page).evaluateAll((elements) => elements.map((element) => element.id))).toEqual([`tile-${newer}`, `tile-${older}`])
  })

  test('deleting from the dialog really removes the post', async ({ page }, info) => {
    const me = await signedInUser(page, info.project.name)
    const postId = await createPostThroughApi(page, 'short lived')
    await page.goto(`/users/${me.username}`)
    await page.locator(`#tile-${postId}`).click()
    const open = dialog(page, me.username)
    await deletePostButton(open).click()
    await deletePostButton(open).click()
    await expect(open).toBeHidden()
    await expect(page.locator(`#tile-${postId}`)).toHaveCount(0)
    await expect(profileCount(page, '0 posts')).toBeVisible()
    await page.reload()
    await expect(profileCount(page, '0 posts')).toBeVisible()
    await page.goto('/home')
    await expect(postItem(page, postId)).toHaveCount(0)
  })
})
