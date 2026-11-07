import { expect, test, type Page } from '@playwright/test'
import {
  AFTER_RETRIES,
  ALICE,
  api,
  BOB,
  cleanupUsers,
  commentButton,
  commentField,
  countRequests,
  createPostThroughApi,
  fail,
  gated,
  json,
  makePost,
  mockComments,
  mockLoggedIn,
  postItem,
  registerThroughApi,
  logInThroughApi,
  revealPost,
  signedInUser,
  submitComment,
  type MockComment,
  type MockPost,
} from './helpers'

// Comments: FR9, FR10, spec 5.2 (CommentSection) and 5.5. Mocks for edge cases, the real backend for what another
// user sees.

test.afterAll(cleanupUsers)

function comment(post: MockPost, id: number, author: { id: number; username: string }, message: string): MockComment {
  return { commentId: id, authorId: author.id, authorUsername: author.username, postId: post.postId, message }
}

const commentsUrl = (post: MockPost) => api(`posts/${post.postId}/comments`)

async function showPost(page: Page, post: MockPost, comments: MockComment[] = []) {
  await mockLoggedIn(page, { home: [[post]] })
  await mockComments(page, post.postId, comments)
  await page.goto('/home')
  await expect(postItem(page, post.postId)).toBeVisible()
  return postItem(page, post.postId)
}

test.describe('mocked', () => {
  test('comments load only when opened (spec 5.2)', async ({ page }) => {
    const post = makePost({ commentCount: 1 })
    const loads = countRequests(page, commentsUrl(post), 'GET')
    const item = await showPost(page, post, [comment(post, 1, BOB, 'hello there')])
    await page.waitForTimeout(200)
    expect(loads.count).toBe(0)
    await expect(item.getByText('hello there')).toHaveCount(0)

    await commentButton(item).click()
    await expect(item.getByText('hello there')).toBeVisible()
    expect(loads.count).toBeGreaterThanOrEqual(1)
  })

  test('the comment button says how many, and toggles the section in place', async ({ page }) => {
    const post = makePost({ commentCount: 2 })
    const item = await showPost(page, post, [comment(post, 1, BOB, 'one'), comment(post, 2, BOB, 'two')])
    await expect(item.getByRole('button', { name: '2 comments' })).toHaveAttribute('aria-expanded', 'false')
    await commentButton(item).click()
    await expect(item.getByRole('button', { name: '2 comments' })).toHaveAttribute('aria-expanded', 'true')
    await expect(item.getByRole('listitem').nth(0)).toContainText('one')
    await commentButton(item).click()
    await expect(item.getByRole('button', { name: '2 comments' })).toHaveAttribute('aria-expanded', 'false')
    await expect(commentField(item)).toBeHidden()
  })

  test('a post with none says "Comment" and shows an empty section', async ({ page }) => {
    const post = makePost()
    const item = await showPost(page, post)
    await item.getByRole('button', { name: 'Comment', exact: true }).click()
    await expect(commentField(item)).toBeVisible()
    await expect(item.getByRole('list')).toHaveCount(0)
  })

  test('comments keep the server order, oldest first, and show the username (FR9)', async ({ page }) => {
    const post = makePost({ commentCount: 3 })
    const item = await showPost(page, post, [
      comment(post, 1, BOB, 'first'),
      comment(post, 2, ALICE, 'second'),
      comment(post, 3, BOB, 'third'),
    ])
    await commentButton(item).click()
    const rows = item.getByRole('listitem')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText(`${BOB.username} first`)
    await expect(rows.nth(1)).toContainText(`${ALICE.username} second`)
    await expect(rows.nth(2)).toContainText(`${BOB.username} third`)
    await rows.nth(0).getByRole('link', { name: BOB.username }).click()
    await expect(page).toHaveURL(`/users/${BOB.username}`)
  })

  test('adding a comment puts it at the bottom, clears the box and updates the count', async ({ page }) => {
    const post = makePost({ commentCount: 1 })
    const item = await showPost(page, post, [comment(post, 1, BOB, 'first')])
    let sent: unknown
    await page.route(commentsUrl(post), async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      sent = route.request().postDataJSON()
      return json(route, 201, comment(post, 2, ALICE, 'my reply'))
    })
    await commentButton(item).click()
    await commentField(item).fill('  my reply  ')
    await submitComment(item).click()

    const rows = item.getByRole('listitem')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(1)).toContainText(`${ALICE.username} my reply`)
    await expect(commentField(item)).toHaveValue('')
    await expect(item.getByRole('button', { name: '2 comments' })).toBeVisible()
    expect(sent).toEqual({ message: 'my reply' })
  })

  test('an empty comment is refused inline', async ({ page }) => {
    const post = makePost()
    const item = await showPost(page, post)
    const posts = countRequests(page, commentsUrl(post))
    await commentButton(item).click()
    await commentField(item).fill('   ')
    await submitComment(item).click()
    await expect(item.getByRole('alert')).toBeVisible()
    expect(posts.count).toBe(0)
  })

  test('a double submit sends one comment', async ({ page }) => {
    const post = makePost()
    const item = await showPost(page, post)
    const posts = countRequests(page, commentsUrl(post))
    const { gate, release } = gated()
    await page.route(commentsUrl(post), async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      await gate
      return json(route, 201, comment(post, 9, ALICE, 'once'))
    })
    await commentButton(item).click()
    await commentField(item).fill('once')
    await submitComment(item).dblclick()
    await page.waitForTimeout(200)
    expect(posts.count).toBe(1)
    release()
    await expect(item.getByRole('listitem')).toHaveCount(1)
    expect(posts.count).toBe(1)
  })

  test('1,000 characters can be sent, with a counter (FR9)', async ({ page }) => {
    const post = makePost()
    const item = await showPost(page, post)
    await page.route(commentsUrl(post), (route) =>
      route.request().method() === 'POST' ? json(route, 201, comment(post, 9, ALICE, 'x'.repeat(1000))) : route.fallback(),
    )
    await commentButton(item).click()
    await commentField(item).fill('x'.repeat(1000))
    await expect(item).toContainText(/1,?000 of 1,?000/)
    await submitComment(item).click()
    await expect(item.getByRole('listitem')).toHaveCount(1)
  })

  test('over 1,000 characters is refused inline, keeping the text (FR9)', async ({ page }) => {
    const post = makePost()
    const item = await showPost(page, post)
    const posts = countRequests(page, commentsUrl(post))
    await commentButton(item).click()
    await commentField(item).fill('x'.repeat(1001))
    await expect(item).toContainText(/1,?001 of 1,?000/)
    await submitComment(item).click()
    await expect(item.getByRole('alert')).toContainText('1,000')
    await page.waitForTimeout(200)
    expect(posts.count).toBe(0)
    await expect(commentField(item)).toHaveValue('x'.repeat(1001))
  })

  test('commenting on a post that was deleted says so (FR9)', async ({ page }) => {
    const post = makePost()
    const item = await showPost(page, post)
    await page.route(commentsUrl(post), (route) =>
      route.request().method() === 'POST' ? fail(route, 404, 'Post not found') : route.fallback(),
    )
    await commentButton(item).click()
    await commentField(item).fill('too late')
    await submitComment(item).click()
    await expect(item.getByRole('alert')).toContainText(/deleted/i)
  })

  test('a failed comment keeps the text and shows an error', async ({ page }) => {
    const post = makePost()
    const item = await showPost(page, post)
    await page.route(commentsUrl(post), (route) =>
      route.request().method() === 'POST' ? fail(route, 500) : route.fallback(),
    )
    await commentButton(item).click()
    await commentField(item).fill('keep this')
    await submitComment(item).click()
    await expect(item.getByRole('alert')).toBeVisible()
    await expect(commentField(item)).toHaveValue('keep this')
  })

  test('comments that fail to load show an error with a working retry', async ({ page }) => {
    const post = makePost({ commentCount: 1 })
    let broken = true
    await mockLoggedIn(page, { home: [[post]] })
    await page.route(commentsUrl(post), (route) =>
      broken ? fail(route, 500) : json(route, 200, [comment(post, 1, BOB, 'made it')]),
    )
    await page.goto('/home')
    const item = postItem(page, post.postId)
    await commentButton(item).click()
    await expect(item.getByRole('alert')).toBeVisible(AFTER_RETRIES)
    broken = false
    await item.getByRole('button', { name: 'Try again' }).click()
    await expect(item.getByText('made it')).toBeVisible()
  })

  test('delete shows only on your own comments (FR10)', async ({ page }) => {
    const post = makePost({ commentCount: 2 })
    const item = await showPost(page, post, [comment(post, 1, ALICE, 'mine'), comment(post, 2, BOB, 'theirs')])
    await commentButton(item).click()
    const rows = item.getByRole('listitem')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).getByRole('button', { name: 'Delete comment' })).toBeVisible()
    await expect(rows.nth(1).getByRole('button', { name: 'Delete comment' })).toHaveCount(0)
  })

  test("the post's author sees no delete on other people's comments (FR10)", async ({ page }) => {
    const post = makePost({ authorId: ALICE.id, authorUsername: ALICE.username, commentCount: 1 })
    const item = await showPost(page, post, [comment(post, 1, BOB, 'theirs')])
    await commentButton(item).click()
    await expect(item.getByText('theirs')).toBeVisible()
    await expect(item.getByRole('button', { name: 'Delete comment' })).toHaveCount(0)
    await expect(item.getByRole('button', { name: 'Delete post' })).toBeVisible()
  })

  test('deleting a comment asks inline first; Keep comment cancels (spec 5.5)', async ({ page }) => {
    const post = makePost({ commentCount: 1 })
    const item = await showPost(page, post, [comment(post, 5, ALICE, 'mine')])
    const deletes = countRequests(page, api('comments/5'), 'DELETE')
    await commentButton(item).click()
    await item.getByRole('button', { name: 'Delete comment' }).click()
    await expect(item).toContainText('Delete this comment?')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await item.getByRole('button', { name: 'Keep comment' }).click()
    await expect(item.getByText('Delete this comment?')).toHaveCount(0)
    await expect(item.getByText('mine')).toBeVisible()
    expect(deletes.count).toBe(0)
  })

  test('confirming removes the comment and updates the count', async ({ page }) => {
    const post = makePost({ commentCount: 2 })
    const item = await showPost(page, post, [comment(post, 5, ALICE, 'mine'), comment(post, 6, BOB, 'theirs')])
    await page.route(api('comments/5'), (route) => route.fulfill({ status: 204, body: '' }))
    await commentButton(item).click()
    await item.getByRole('button', { name: 'Delete comment' }).click()
    await item.getByRole('button', { name: 'Delete comment' }).click()
    await expect(item.getByText('mine')).toHaveCount(0)
    await expect(item.getByText('theirs')).toBeVisible()
    await expect(item.getByRole('button', { name: '1 comment', exact: true })).toBeVisible()
  })

  test('a failed comment delete keeps it and says so', async ({ page }) => {
    const post = makePost({ commentCount: 1 })
    const item = await showPost(page, post, [comment(post, 5, ALICE, 'mine')])
    await page.route(api('comments/5'), (route) => fail(route, 500))
    await commentButton(item).click()
    await item.getByRole('button', { name: 'Delete comment' }).click()
    await item.getByRole('button', { name: 'Delete comment' }).click()
    await expect(item.getByRole('alert')).toBeVisible()
    await expect(item.getByText('mine')).toBeVisible()
  })
})

test.describe('real backend', () => {
  test("another user's comments appear in order, and the author can't delete them (FR9, FR10)", async ({ page, browser }, info) => {
    const author = await signedInUser(page, info.project.name)
    const postId = await createPostThroughApi(page, 'talk about this')

    const otherContext = await browser.newContext()
    const otherPage = await otherContext.newPage()
    const other = await registerThroughApi(otherPage, info.project.name)
    await logInThroughApi(otherPage, other)
    await otherPage.goto('/explore')
    const theirItem = await revealPost(otherPage, postId)
    await commentButton(theirItem).click()
    for (const message of ['first from other', 'second from other']) {
      await commentField(theirItem).fill(message)
      await submitComment(theirItem).click()
      // The list, not getByText: that also matches the comment box while it still holds the text.
      await expect(theirItem.getByRole('listitem').filter({ hasText: message })).toBeVisible()
    }
    await expect(theirItem.getByRole('listitem').nth(0)).toContainText(`${other.username} first from other`)
    await expect(theirItem.getByRole('listitem').nth(1)).toContainText(`${other.username} second from other`)
    await otherContext.close()

    await page.goto('/home')
    const item = postItem(page, postId)
    await item.getByRole('button', { name: '2 comments' }).click()
    await expect(item.getByRole('listitem')).toHaveCount(2)
    await expect(item.getByRole('listitem').nth(0)).toContainText('first from other')
    await expect(item.getByRole('listitem').nth(1)).toContainText('second from other')
    await expect(item.getByRole('button', { name: 'Delete comment' })).toHaveCount(0)
    await expect(item.getByRole('link', { name: author.username }).first()).toBeVisible()
  })

  test('add and delete your own comment, surviving a reload', async ({ page }, info) => {
    await signedInUser(page, info.project.name)
    const postId = await createPostThroughApi(page, 'my post')
    await page.goto('/home')
    const item = postItem(page, postId)
    await commentButton(item).click()
    await commentField(item).fill('saved comment')
    await submitComment(item).click()
    await expect(item.getByRole('button', { name: '1 comment', exact: true })).toBeVisible()

    await page.reload()
    await item.getByRole('button', { name: '1 comment', exact: true }).click()
    await expect(item.getByText('saved comment')).toBeVisible()
    await item.getByRole('button', { name: 'Delete comment' }).click()
    await item.getByRole('button', { name: 'Delete comment' }).click()
    await expect(item.getByText('saved comment')).toHaveCount(0)

    await page.reload()
    await expect(item.getByRole('button', { name: 'Comment', exact: true })).toBeVisible()
  })
})
