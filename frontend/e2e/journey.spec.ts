import { expect, test, type Browser, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import {
  captionField,
  cleanupUsers,
  commentButton,
  commentField,
  composer,
  deletePostButton,
  expectRendered,
  fileInput,
  fixture,
  freshUser,
  likeButton,
  logInThroughUi,
  main,
  navLink,
  openComposer,
  ownProfileLink,
  profileCount,
  postItem,
  postItems,
  preview,
  revealPost,
  runSearch,
  shell,
  submitComment,
  submitPost,
} from './helpers'

// The MVP's definition of done, spec 7.4. Restarts the backend in step 7, so it only runs on its own, through the
// Docker app:
//   make test-journey
//   (or: E2E_BASE_URL=http://localhost:5173 npx playwright test --grep @journey --workers=1)
// Everything else runs with --grep-invert @journey. The skip below stops a plain `npx playwright test` restarting
// the backend under the tests running beside it.

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..')

test.afterAll(cleanupUsers)

async function newPage(browser: Browser) {
  const context = await browser.newContext()
  return context.newPage()
}

async function registerThroughUi(page: Page, user: { username: string; email: string; password: string }) {
  await page.goto('/register')
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL('/login')
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 })

async function goToFeed(page: Page, name: 'Home' | 'Explore') {
  await navLink(page, name).click()
  await expect(heading(page)).toHaveText(name)
}

test('@journey the end-to-end journey of spec 7.4', async ({ browser, request }, info) => {
  test.skip(!process.env.E2E_BASE_URL, 'restarts the backend: runs alone with E2E_BASE_URL set, through make test-journey')
  test.setTimeout(300_000)

  const pageA = await newPage(browser)
  const pageB = await newPage(browser)
  const userA = freshUser(info.project.name)
  const userB = freshUser(info.project.name)
  const caption = `journey photo ${Date.now()}`
  const commentText = `journey comment ${Date.now()}`
  let postId = 0

  await test.step('1. Register A and B, and log in as A', async () => {
    await registerThroughUi(pageA, userA)
    await registerThroughUi(pageB, userB)
    await logInThroughUi(pageA, userA)
    await expect(pageA).toHaveURL('/home')
    await expect(heading(pageA)).toHaveText('Home')
  })

  await test.step("2. A uploads a photo with a caption, and sees it on Home, Explore and in A's grid", async () => {
    await openComposer(pageA)
    await fileInput(pageA).setInputFiles(fixture('photo.jpg'))
    await expect(preview(pageA)).toBeVisible()
    await captionField(pageA).fill(caption)
    await submitPost(pageA).click()
    await expect(composer(pageA)).toBeHidden({ timeout: 15_000 })

    const top = postItems(pageA).first()
    await expect(top).toContainText(caption)
    postId = Number((await top.getAttribute('id'))!.replace('post-', ''))
    await expectRendered(top.getByRole('img', { name: `Photo by ${userA.username}` }))

    await goToFeed(pageA, 'Explore')
    await expect(await revealPost(pageA, postId)).toContainText(caption)

    await ownProfileLink(pageA, userA.username).click()
    await expect(heading(pageA)).toHaveText(userA.username)
    await expect(pageA.locator(`#tile-${postId}`)).toBeVisible()
  })

  await test.step("3. B logs in in a second browser. A's post is on Explore but not on Home", async () => {
    await logInThroughUi(pageB, userB)
    await expect(pageB).toHaveURL('/home')
    await expect(heading(pageB)).toHaveText('Home')
    await expect(main(pageB).getByRole('link', { name: /Explore/ })).toBeVisible()
    await expect(postItem(pageB, postId)).toHaveCount(0)

    await goToFeed(pageB, 'Explore')
    await expect(await revealPost(pageB, postId)).toContainText(caption)
  })

  await test.step("4. B searches for A and follows. A's follower count goes up, and the post is on B's Home", async () => {
    await runSearch(pageB, userA.username)
    await expect(pageB).toHaveURL(new RegExp(`/search\\?q=${userA.username}$`))
    await main(pageB).getByRole('link', { name: userA.username }).click()
    await expect(heading(pageB)).toHaveText(userA.username)
    await expect(profileCount(pageB, '0 followers')).toBeVisible()

    await main(pageB).getByRole('button', { name: 'Follow', exact: true }).click()
    await expect(main(pageB).getByRole('button', { name: 'Unfollow', exact: true })).toBeVisible()
    await expect(profileCount(pageB, '1 follower')).toBeVisible()

    await goToFeed(pageB, 'Home')
    await expect(postItem(pageB, postId)).toBeVisible()
  })

  await test.step('5. B likes and comments on the post. A sees the like and the comment', async () => {
    const item = postItem(pageB, postId)
    await likeButton(item).click()
    await expect(likeButton(item)).toHaveText('1 like')
    await commentButton(item).click()
    await commentField(item).fill(commentText)
    await submitComment(item).click()
    await expect(item.getByRole('listitem')).toContainText(`${userB.username} ${commentText}`)

    await goToFeed(pageA, 'Home')
    const itemA = postItem(pageA, postId)
    await expect(likeButton(itemA)).toHaveText('1 like')
    await itemA.getByRole('button', { name: '1 comment', exact: true }).click()
    await expect(itemA.getByRole('listitem')).toContainText(`${userB.username} ${commentText}`)
  })

  await test.step('6. B deletes the comment, then unfollows. The post leaves B\'s Home', async () => {
    const item = postItem(pageB, postId)
    await item.getByRole('button', { name: 'Delete comment' }).click()
    await item.getByRole('button', { name: 'Delete comment' }).click()
    await expect(item.getByText(commentText)).toHaveCount(0)

    await item.getByRole('link', { name: userA.username }).first().click()
    await expect(heading(pageB)).toHaveText(userA.username)
    await main(pageB).getByRole('button', { name: 'Unfollow', exact: true }).click()
    await expect(main(pageB).getByRole('button', { name: 'Follow', exact: true })).toBeVisible()
    await expect(profileCount(pageB, '0 followers')).toBeVisible()

    await goToFeed(pageB, 'Home')
    await expect(postItem(pageB, postId)).toHaveCount(0)
  })

  await test.step('7. Restart the backend and log in again. The photo is still there', async () => {
    execFileSync('docker', ['compose', 'restart', 'backend'], { cwd: REPO_ROOT, stdio: 'pipe' })
    await expect
      .poll(
        () =>
          request
            .get('/api/auth/me')
            .then((response) => response.status())
            .catch(() => 0),
        { timeout: 120_000, intervals: [2_000] },
      )
      .toBe(401)

    await pageA.goto('/home')
    await expect(pageA).toHaveURL('/login')
    await logInThroughUi(pageA, userA)
    await expect(heading(pageA)).toHaveText('Home')
    await expectRendered(postItem(pageA, postId).getByRole('img', { name: `Photo by ${userA.username}` }))

    await pageB.goto('/explore')
    await expect(pageB).toHaveURL('/login')
    await logInThroughUi(pageB, userB)
    await expect(heading(pageB)).toHaveText('Explore')
    const itemB = await revealPost(pageB, postId)
    await expectRendered(itemB.getByRole('img', { name: `Photo by ${userA.username}` }))
  })

  await test.step('8. A deletes the post, and it disappears for both users. Refresh, then log out', async () => {
    const item = postItem(pageA, postId)
    await deletePostButton(item).click()
    await deletePostButton(item).click()
    await expect(item).toHaveCount(0)

    await goToFeed(pageA, 'Explore')
    await expect(pageA.getByRole('heading', { level: 1 })).toHaveText('Explore')
    await expect(postItem(pageA, postId)).toHaveCount(0)

    await pageB.reload()
    await expect(heading(pageB)).toHaveText('Explore')
    await expect(postItems(pageB).first().or(main(pageB).getByRole('button', { name: 'New post' }))).toBeVisible()
    await expect(postItem(pageB, postId)).toHaveCount(0)

    await pageA.reload()
    await expect(heading(pageA)).toHaveText('Explore')
    await expect(postItem(pageA, postId)).toHaveCount(0)
    await shell(pageA).getByRole('button', { name: 'Log out' }).click()
    await expect(pageA).toHaveURL('/login')
    await shell(pageB).getByRole('button', { name: 'Log out' }).click()
    await expect(pageB).toHaveURL('/login')
  })

  await pageA.context().close()
  await pageB.context().close()
})
