import { expect, test, type Page } from '@playwright/test'
import {
  AFTER_RETRIES,
  ALICE,
  api,
  BOB,
  cleanupUsers,
  commentButton,
  countRequests,
  createPostThroughApi,
  deletePostButton,
  fail,
  gated,
  EXPLORE_FEED,
  json,
  likeButton,
  main,
  makePost,
  mockLoggedIn,
  navLink,
  postItem,
  signedInUser,
  type MockPost,
} from './helpers'

// One post in a feed: FR2, FR8, spec 5.2, 5.3 and 5.5. Mocks for edge cases, the real backend for a double click.

test.afterAll(cleanupUsers)

const likes = (post: MockPost) => api(`posts/${post.postId}/likes`)

async function showPost(page: Page, post: MockPost) {
  await mockLoggedIn(page, { home: () => [[post]] })
  await page.goto('/home')
  await expect(postItem(page, post.postId)).toBeVisible()
  return postItem(page, post.postId)
}

test.describe('likes', () => {
  test('like updates straight away, before the server answers (FR8)', async ({ page }) => {
    const post = makePost({ likeCount: 5 })
    const item = await showPost(page, post)
    const { gate, release } = gated()
    await page.route(likes(post), async (route) => {
      await gate
      await route.fulfill({ status: 201, body: '' })
    })
    await expect(likeButton(item)).toHaveAttribute('aria-pressed', 'false')
    await likeButton(item).click()
    await expect(likeButton(item)).toHaveAttribute('aria-pressed', 'true')
    await expect(likeButton(item)).toHaveText('6 likes')
    release()
    await page.waitForTimeout(100)
    await expect(likeButton(item)).toHaveText('6 likes')
    await expect(item.getByRole('alert')).toHaveCount(0)
  })

  test('unlike updates straight away, before the server answers (FR8)', async ({ page }) => {
    const post = makePost({ likeCount: 2, likedByMe: true })
    const item = await showPost(page, post)
    const { gate, release } = gated()
    await page.route(likes(post), async (route) => {
      await gate
      await route.fulfill({ status: 204, body: '' })
    })
    await expect(likeButton(item)).toHaveAttribute('aria-pressed', 'true')
    await likeButton(item).click()
    await expect(likeButton(item)).toHaveAttribute('aria-pressed', 'false')
    await expect(likeButton(item)).toHaveText('1 like')
    release()
    await page.waitForTimeout(100)
    await expect(likeButton(item)).toHaveText('1 like')
  })

  test('the liked state is more than colour: the heart fills', async ({ page }) => {
    const post = makePost({ likeCount: 1, likedByMe: true })
    const item = await showPost(page, post)
    const fill = await likeButton(item).locator('svg').evaluate((el) => getComputedStyle(el).fill)
    expect(fill).not.toBe('none')
  })

  test('a failed like rolls back with a message (FR8)', async ({ page }) => {
    const post = makePost({ likeCount: 5 })
    const item = await showPost(page, post)
    await page.route(likes(post), (route) => fail(route, 500))
    await likeButton(item).click()
    await expect(item.getByRole('alert')).toBeVisible()
    await expect(likeButton(item)).toHaveAttribute('aria-pressed', 'false')
    await expect(likeButton(item)).toHaveText('5 likes')
  })

  test('a failed unlike rolls back with a message (FR8)', async ({ page }) => {
    const post = makePost({ likeCount: 5, likedByMe: true })
    const item = await showPost(page, post)
    await page.route(likes(post), (route) => route.abort('failed'))
    await likeButton(item).click()
    await expect(item.getByRole('alert')).toBeVisible()
    await expect(likeButton(item)).toHaveAttribute('aria-pressed', 'true')
    await expect(likeButton(item)).toHaveText('5 likes')
  })

  test('a 409 on like counts as success (spec 5.3)', async ({ page }) => {
    // Already liked from another tab, so the server's count is what the refetch will return.
    const post = makePost({ likeCount: 5 })
    const item = await showPost(page, post)
    await page.route(likes(post), (route) => {
      post.likeCount = 6
      post.likedByMe = true
      return fail(route, 409, 'Already liked')
    })
    await likeButton(item).click()
    await expect(likeButton(item)).toHaveAttribute('aria-pressed', 'true')
    await expect(likeButton(item)).toHaveText('6 likes')
    await page.waitForTimeout(200)
    await expect(item.getByRole('alert')).toHaveCount(0)
    await expect(likeButton(item)).toHaveText('6 likes')
  })

  test('a 404 on unlike counts as success (spec 5.3)', async ({ page }) => {
    const post = makePost({ likeCount: 5, likedByMe: true })
    const item = await showPost(page, post)
    await page.route(likes(post), (route) => {
      post.likeCount = 4
      post.likedByMe = false
      return fail(route, 404, 'Not liked')
    })
    await likeButton(item).click()
    await expect(likeButton(item)).toHaveAttribute('aria-pressed', 'false')
    await expect(likeButton(item)).toHaveText('4 likes')
    await page.waitForTimeout(200)
    await expect(item.getByRole('alert')).toHaveCount(0)
  })

  test('a double click while the first is on its way shows no error and sends one request (FR8)', async ({ page }) => {
    const post = makePost({ likeCount: 5 })
    const item = await showPost(page, post)
    const requests = countRequests(page, likes(post))
    const { gate, release } = gated()
    await page.route(likes(post), async (route) => {
      await gate
      await route.fulfill({ status: 201, body: '' })
    })
    await likeButton(item).dblclick()
    await expect(likeButton(item)).toHaveText('6 likes')
    release()
    await page.waitForTimeout(200)
    await expect(item.getByRole('alert')).toHaveCount(0)
    await expect(likeButton(item)).toHaveAttribute('aria-pressed', 'true')
    expect(requests.count).toBe(1)
  })

  test('a double click on the real backend shows no error and ends in a consistent state (FR8)', async ({ page }, info) => {
    await signedInUser(page, info.project.name)
    const postId = await createPostThroughApi(page, 'double click me')
    await page.goto('/home')
    const item = postItem(page, postId)
    await likeButton(item).dblclick()
    await page.waitForTimeout(500)
    await expect(item.getByRole('alert')).toHaveCount(0)
    const pressed = await likeButton(item).getAttribute('aria-pressed')
    await expect(likeButton(item)).toHaveText(pressed === 'true' ? '1 like' : '0 likes')
    // What's on screen is what was saved.
    await page.reload()
    await expect(likeButton(item)).toHaveAttribute('aria-pressed', pressed!)
    await expect(likeButton(item)).toHaveText(pressed === 'true' ? '1 like' : '0 likes')
  })
})

test.describe('delete (FR2)', () => {
  const mine = () => makePost({ authorId: ALICE.id, authorUsername: ALICE.username })

  test("delete shows on the user's own posts only", async ({ page }) => {
    const own = mine()
    const theirs = makePost()
    await mockLoggedIn(page, { home: [[own, theirs]] })
    await page.goto('/home')
    await expect(deletePostButton(postItem(page, own.postId))).toBeVisible()
    await expect(postItem(page, theirs.postId)).toBeVisible()
    await expect(deletePostButton(postItem(page, theirs.postId))).toHaveCount(0)
  })

  test('delete asks inline first, and Keep post cancels', async ({ page }) => {
    const own = mine()
    const item = await showPost(page, own)
    const deletes = countRequests(page, api(`posts/${own.postId}`), 'DELETE')
    await deletePostButton(item).click()
    await expect(item).toContainText('Delete this post and its comments?')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await item.getByRole('button', { name: 'Keep post' }).click()
    await expect(item.getByText('Delete this post and its comments?')).toHaveCount(0)
    await expect(item).toBeVisible()
    expect(deletes.count).toBe(0)
  })

  test('confirming removes the post', async ({ page }) => {
    const own = mine()
    let gone = false
    await mockLoggedIn(page, { home: () => (gone ? [[]] : [[own]]) })
    await page.route(api(`posts/${own.postId}`), async (route) => {
      expect(route.request().method()).toBe('DELETE')
      gone = true
      await route.fulfill({ status: 204, body: '' })
    })
    await page.goto('/home')
    const item = postItem(page, own.postId)
    await deletePostButton(item).click()
    await deletePostButton(item).click()
    await expect(item).toHaveCount(0)
  })

  test('a failed delete keeps the post and says so', async ({ page }) => {
    const own = mine()
    const item = await showPost(page, own)
    await page.route(api(`posts/${own.postId}`), (route) => fail(route, 500))
    await deletePostButton(item).click()
    await deletePostButton(item).click()
    await expect(item.getByRole('alert')).toBeVisible(AFTER_RETRIES)
    await expect(item).toBeVisible()
  })

  test('a post that has already gone counts as deleted', async ({ page }) => {
    const own = mine()
    let gone = false
    await mockLoggedIn(page, { home: () => (gone ? [[]] : [[own]]) })
    await page.route(api(`posts/${own.postId}`), (route) => {
      gone = true
      return fail(route, 404)
    })
    await page.goto('/home')
    const item = postItem(page, own.postId)
    await deletePostButton(item).click()
    await deletePostButton(item).click()
    await expect(item).toHaveCount(0)
    await expect(main(page).getByRole('alert')).toHaveCount(0)
  })
})

test.describe('photo and caption', () => {
  test('a broken image shows "Image unavailable", and the post still works', async ({ page }) => {
    const post = makePost({ likeCount: 1 })
    await mockLoggedIn(page, { home: [[post]] })
    await page.route(api(`posts/${post.postId}/image`), (route) => fail(route, 404))
    await page.goto('/home')
    const item = postItem(page, post.postId)
    await expect(item.getByText('Image unavailable')).toBeVisible()
    await expect(item.getByRole('img', { name: /^Photo by / })).toHaveCount(0)
    await expect(likeButton(item)).toBeVisible()
    await expect(commentButton(item)).toBeVisible()
  })

  test('a post with no photo URL shows the placeholder too', async ({ page }) => {
    const post = makePost({ mediaUrl: null, width: null, height: null })
    const item = await showPost(page, post)
    await expect(item.getByText('Image unavailable')).toBeVisible()
  })

  test('alt text is "Photo by {username}", not the caption (spec 5.2)', async ({ page }) => {
    const post = makePost({ caption: 'sunset' })
    const item = await showPost(page, post)
    await expect(item.locator('img')).toHaveAttribute('alt', `Photo by ${BOB.username}`)
  })

  test('a long caption collapses with "more", which shows it all (spec 5.5)', async ({ page }) => {
    const post = makePost({ caption: 'long '.repeat(200).trim() })
    const item = await showPost(page, post)
    const caption = item.getByText(/long long/)
    const more = item.getByRole('button', { name: 'more', exact: true })
    await expect(more).toBeVisible()
    const collapsed = (await caption.boundingBox())!.height
    const lineHeight = await caption.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
    expect(Math.round(collapsed / lineHeight)).toBeLessThanOrEqual(3)

    await more.click()
    await expect(more).toHaveCount(0)
    expect((await caption.boundingBox())!.height).toBeGreaterThan(collapsed)
  })

  test('a caption with many short lines collapses too', async ({ page }) => {
    const post = makePost({ caption: 'one\ntwo\nthree\nfour\nfive\nsix' })
    const item = await showPost(page, post)
    await expect(item.getByRole('button', { name: 'more', exact: true })).toBeVisible()
  })

  test('a short caption has no "more"', async ({ page }) => {
    const post = makePost({ caption: 'short' })
    const item = await showPost(page, post)
    await expect(item).toContainText('short')
    await expect(item.getByRole('button', { name: 'more', exact: true })).toHaveCount(0)
  })

  test('a post with no caption still shows a whole card', async ({ page }) => {
    const post = makePost({ caption: null })
    const item = await showPost(page, post)
    await expect(likeButton(item)).toBeVisible()
    await expect(item.getByRole('button', { name: 'more', exact: true })).toHaveCount(0)
  })
})

test.describe('card layout', () => {
  test('order is username and delete, photo, like and comment row, caption, comments (spec 5.5)', async ({ page }) => {
    const post = makePost({ authorId: ALICE.id, authorUsername: ALICE.username, caption: 'the caption text' })
    await mockLoggedIn(page, { home: [[post]] })
    await page.route(api(`posts/${post.postId}/comments`), (route) => json(route, 200, []))
    await page.goto('/home')
    const item = postItem(page, post.postId)
    await commentButton(item).click()
    const comment = item.getByRole('textbox', { name: 'Add a comment' })
    await expect(comment).toBeVisible()

    const y = async (locator: ReturnType<typeof item.locator>) => (await locator.boundingBox())!.y
    const author = await y(item.getByRole('link', { name: ALICE.username }).first())
    const del = await y(deletePostButton(item))
    const photo = await y(item.getByRole('img', { name: /^Photo by / }))
    const like = await y(likeButton(item))
    const toggle = await y(commentButton(item))
    const caption = await y(item.getByText('the caption text'))
    const comments = await y(comment)

    expect(photo).toBeGreaterThan(Math.max(author, del))
    expect(like).toBeGreaterThan(photo)
    expect(toggle).toBeCloseTo(like, 0)
    expect(caption).toBeGreaterThan(like)
    expect(comments).toBeGreaterThan(caption)
  })

  test('like, comment and delete are 44px touch targets (spec 5.5)', async ({ page }) => {
    const post = makePost({ authorId: ALICE.id, authorUsername: ALICE.username })
    const item = await showPost(page, post)
    for (const control of [likeButton(item), commentButton(item), deletePostButton(item)]) {
      const box = (await control.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
  })

  test('the author link goes to their profile', async ({ page }) => {
    const post = makePost()
    const item = await showPost(page, post)
    await item.getByRole('link', { name: BOB.username }).first().click()
    await expect(page).toHaveURL(`/users/${BOB.username}`)
  })

  test('a like shows in the cached Explore copy of the same post too (spec 5.3)', async ({ page }) => {
    const post = makePost({ likeCount: 1 })
    await mockLoggedIn(page, { home: [[post]], explore: [[post]] })
    await page.route(likes(post), (route) => route.fulfill({ status: 201, body: '' }))
    await page.goto('/explore')
    await expect(likeButton(postItem(page, post.postId))).toHaveText('1 like')
    await navLink(page, 'Home').click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home')
    await likeButton(postItem(page, post.postId)).click()
    await expect(likeButton(postItem(page, post.postId))).toHaveText('2 likes')

    // Explore's refetch never answers, so what shows can only have come from the patched cache.
    await page.route(EXPLORE_FEED, () => {})
    await navLink(page, 'Explore').click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explore')
    await expect(likeButton(postItem(page, post.postId))).toHaveText('2 likes')
    await expect(likeButton(postItem(page, post.postId))).toHaveAttribute('aria-pressed', 'true')
  })
})
