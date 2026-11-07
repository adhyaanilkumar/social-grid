import { expect, test, type Page } from '@playwright/test'
import {
  api,
  captionField,
  cleanupUsers,
  composer,
  countRequests,
  expectRendered,
  fileInput,
  fixture,
  gated,
  json,
  main,
  makePost,
  mockLoggedIn,
  navLink,
  newPostButton,
  openComposer,
  ownProfileLink,
  profileCount,
  pixelAt,
  postItem,
  postItems,
  postThroughUi,
  preview,
  revealPost,
  signedInUser,
  submitPost,
} from './helpers'

// Creating a post: FR1, spec 5.2 (PostComposer, prepareImage), 7.3. Mocks for edge cases, the real backend for
// whether the photo really arrives.

test.afterAll(cleanupUsers)

const POSTS = api('posts')

test.describe('mocked', () => {
  test.beforeEach(async ({ page }) => {
    await mockLoggedIn(page)
    await page.goto('/home')
  })

  test('opens from New post', async ({ page }) => {
    await expect(composer(page)).toHaveCount(0)
    await newPostButton(page).click()
    await expect(composer(page)).toBeVisible()
    await expect(composer(page).getByText('Choose photo')).toBeVisible()
    await expect(submitPost(page)).toBeVisible()
  })

  test('is full screen on mobile and a centred dialog on desktop (D6)', async ({ page, isMobile }) => {
    await openComposer(page)
    const box = (await composer(page).boundingBox())!
    const viewport = page.viewportSize()!
    if (isMobile) {
      expect(box.x).toBe(0)
      expect(box.y).toBe(0)
      expect(box.width).toBe(viewport.width)
      expect(box.height).toBe(viewport.height)
    } else {
      expect(box.width).toBeLessThan(viewport.width)
      expect(box.x + box.width / 2).toBeCloseTo(viewport.width / 2, 0)
    }
  })

  test('choosing a file shows a preview', async ({ page }) => {
    await openComposer(page)
    await expect(preview(page)).toHaveCount(0)
    await fileInput(page).setInputFiles(fixture('photo.jpg'))
    await expectRendered(preview(page))
    await expect(preview(page)).toHaveAttribute('src', /^blob:/)
  })

  test('the file input takes images, and does not force the camera', async ({ page }) => {
    await openComposer(page)
    await expect(fileInput(page)).toHaveAttribute('accept', /image/)
    await expect(fileInput(page)).not.toHaveAttribute('capture', /.*/)
  })

  test('Remove photo takes the preview away and lets you choose again', async ({ page }) => {
    await openComposer(page)
    await fileInput(page).setInputFiles(fixture('photo.jpg'))
    await expect(preview(page)).toBeVisible()
    await composer(page).getByRole('button', { name: 'Remove photo' }).click()
    await expect(preview(page)).toHaveCount(0)
    await expect(composer(page).getByText('Choose photo')).toBeVisible()

    // The same file can be chosen again straight away.
    await fileInput(page).setInputFiles(fixture('photo.jpg'))
    await expect(preview(page)).toBeVisible()
  })

  test('Change photo replaces the preview', async ({ page }) => {
    await openComposer(page)
    await fileInput(page).setInputFiles(fixture('photo.jpg'))
    await expectRendered(preview(page))
    const landscape = await preview(page).evaluate((el: HTMLImageElement) => el.naturalWidth > el.naturalHeight)
    expect(landscape).toBe(true)

    await expect(composer(page).getByText('Change photo')).toBeVisible()
    await fileInput(page).setInputFiles(fixture('photo-tall.jpg'))
    await expect.poll(() => preview(page).evaluate((el: HTMLImageElement) => el.naturalWidth < el.naturalHeight)).toBe(true)
  })

  test('a non-image file shows an inline error and no preview (FR1)', async ({ page }) => {
    await openComposer(page)
    await fileInput(page).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a photo') })
    await expect(composer(page).getByRole('alert')).toBeVisible()
    await expect(preview(page)).toHaveCount(0)
  })

  test('an unreadable file named .jpg shows an inline error (FR1)', async ({ page }) => {
    await openComposer(page)
    await fileInput(page).setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not really a jpeg') })
    await expect(composer(page).getByRole('alert')).toBeVisible()
    await expect(preview(page)).toHaveCount(0)
  })

  test('a file over 25 MB shows an inline error (spec 5.2)', async ({ page }) => {
    await openComposer(page)
    await fileInput(page).setInputFiles({
      name: 'huge.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(25 * 1024 * 1024 + 1),
    })
    await expect(composer(page).getByRole('alert')).toContainText(/too large/i)
    await expect(preview(page)).toHaveCount(0)
  })

  test('a good file clears an earlier file error', async ({ page }) => {
    await openComposer(page)
    await fileInput(page).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })
    await expect(composer(page).getByRole('alert')).toBeVisible()
    await fileInput(page).setInputFiles(fixture('photo.jpg'))
    await expect(preview(page)).toBeVisible()
    await expect(composer(page).getByRole('alert')).toHaveCount(0)
  })

  test('posting with no photo shows an inline error and sends nothing (FR1)', async ({ page }) => {
    const posts = countRequests(page, POSTS)
    await openComposer(page)
    await captionField(page).fill('a caption alone')
    await submitPost(page).click()
    await expect(composer(page).getByRole('alert')).toContainText('Choose a photo to post')
    await page.waitForTimeout(200)
    expect(posts.count).toBe(0)
  })

  test('the caption counter appears near the limit and 2,200 characters can be posted', async ({ page }) => {
    let sent: string | undefined
    await page.route(POSTS, async (route) => {
      sent = route.request().postData() ?? ''
      await json(route, 201, makePost())
    })
    await openComposer(page)
    await fileInput(page).setInputFiles(fixture('photo.jpg'))
    await expect(preview(page)).toBeVisible()
    await captionField(page).fill('a'.repeat(2200))
    await expect(composer(page)).toContainText(/2,?200 of 2,?200/)
    await expect(composer(page).getByRole('alert')).toHaveCount(0)
    await submitPost(page).click()
    await expect(composer(page)).toBeHidden()
    expect(sent).toContain('a'.repeat(2200))
  })

  test('a caption over 2,200 characters is refused inline, keeping the text and photo (FR1)', async ({ page }) => {
    const posts = countRequests(page, POSTS)
    await openComposer(page)
    await fileInput(page).setInputFiles(fixture('photo.jpg'))
    await expect(preview(page)).toBeVisible()
    await captionField(page).fill('a'.repeat(2201))
    await expect(composer(page)).toContainText(/2,?201 of 2,?200/)
    await submitPost(page).click()
    await expect(composer(page).getByRole('alert')).toContainText('2,200')
    await page.waitForTimeout(200)
    expect(posts.count).toBe(0)
    await expect(captionField(page)).toHaveValue('a'.repeat(2201))
    await expect(preview(page)).toBeVisible()
  })

  test('a 413 with no JSON body shows "That photo is too large", keeping the form (spec 5.2)', async ({ page }) => {
    await page.route(POSTS, (route) => route.fulfill({ status: 413, contentType: 'text/html', body: '<html>413</html>' }))
    await openComposer(page)
    await fileInput(page).setInputFiles(fixture('photo.jpg'))
    await expect(preview(page)).toBeVisible()
    await captionField(page).fill('keep me')
    await submitPost(page).click()
    await expect(composer(page).getByRole('alert')).toHaveText('That photo is too large')
    await expect(captionField(page)).toHaveValue('keep me')
    await expect(preview(page)).toBeVisible()
  })

  test('a server rejection shows its message beside the form', async ({ page }) => {
    await page.route(POSTS, (route) => json(route, 400, { status: 400, error: 'Bad Request', message: 'Unsupported image' }))
    await openComposer(page)
    await fileInput(page).setInputFiles(fixture('photo.jpg'))
    await expect(preview(page)).toBeVisible()
    await submitPost(page).click()
    await expect(composer(page).getByRole('alert')).toHaveText('Unsupported image')
  })

  test('a network failure shows an error and the form can try again', async ({ page }) => {
    let broken = true
    await page.route(POSTS, (route) => (broken ? route.abort('failed') : json(route, 201, makePost())))
    await openComposer(page)
    await fileInput(page).setInputFiles(fixture('photo.jpg'))
    await expect(preview(page)).toBeVisible()
    await submitPost(page).click()
    await expect(composer(page).getByRole('alert')).toBeVisible()
    broken = false
    await submitPost(page).click()
    await expect(composer(page)).toBeHidden()
  })

  test('a double submit sends one request and shows "Posting…"', async ({ page }) => {
    const posts = countRequests(page, POSTS)
    const { gate, release } = gated()
    await page.route(POSTS, async (route) => {
      await gate
      await json(route, 201, makePost())
    })
    await openComposer(page)
    await fileInput(page).setInputFiles(fixture('photo.jpg'))
    await expect(preview(page)).toBeVisible()
    await submitPost(page).dblclick()
    await expect(submitPost(page)).toHaveText('Posting…')
    await expect(submitPost(page)).toHaveAttribute('aria-disabled', 'true')
    await submitPost(page).click({ force: true })
    await page.waitForTimeout(200)
    expect(posts.count).toBe(1)
    release()
    await expect(composer(page)).toBeHidden()
    expect(posts.count).toBe(1)
  })

  test('sends multipart form data with the CSRF token left to the browser\'s boundary', async ({ page }) => {
    let contentType = ''
    await page.route(POSTS, async (route) => {
      contentType = route.request().headers()['content-type'] ?? ''
      await json(route, 201, makePost())
    })
    await openComposer(page)
    await fileInput(page).setInputFiles(fixture('photo.jpg'))
    await expect(preview(page)).toBeVisible()
    await submitPost(page).click()
    await expect(composer(page)).toBeHidden()
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/)
  })

  test('closing with content asks first; Keep editing keeps it, Discard clears it', async ({ page }) => {
    await openComposer(page)
    await fileInput(page).setInputFiles(fixture('photo.jpg'))
    await expect(preview(page)).toBeVisible()
    await captionField(page).fill('half written')

    await page.keyboard.press('Escape')
    await expect(composer(page).getByText('Discard this post?')).toBeVisible()
    await composer(page).getByRole('button', { name: 'Keep editing' }).click()
    await expect(composer(page).getByText('Discard this post?')).toHaveCount(0)
    await expect(captionField(page)).toHaveValue('half written')
    await expect(preview(page)).toBeVisible()

    await composer(page).getByRole('button', { name: 'Close' }).click()
    await composer(page).getByRole('button', { name: 'Discard' }).click()
    await expect(composer(page)).toBeHidden()

    await openComposer(page)
    await expect(captionField(page)).toHaveValue('')
    await expect(preview(page)).toHaveCount(0)
  })

  test('closing an untouched composer asks nothing', async ({ page }) => {
    await openComposer(page)
    await page.keyboard.press('Escape')
    await expect(composer(page)).toBeHidden()
  })

  test('keyboard focus stays inside the dialog and returns afterwards', async ({ page }) => {
    await openComposer(page)
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab')
      expect(await composer(page).evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(composer(page)).toBeHidden()
    await expect(newPostButton(page)).toBeFocused()
  })
})

test.describe('real backend', () => {
  async function imageOfPost(page: Page, postId: number) {
    return postItem(page, postId).getByRole('img', { name: /^Photo by / })
  }

  test('a new post is at the top of Home and Explore with no page reload, and in the grid (FR1)', async ({ page }, info) => {
    const user = await signedInUser(page, info.project.name)
    await page.goto('/home')
    // Feeds that were already viewed are cached, which is the harder case.
    await navLink(page, 'Explore').click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explore')
    await navLink(page, 'Home').click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home')

    // A full page load would lose this attribute.
    await page.evaluate(() => {
      document.documentElement.dataset.noReload = 'yes'
    })

    const caption = `first post ${Date.now()}`
    await postThroughUi(page, caption)

    const top = postItems(page).first()
    await expect(top).toContainText(caption)
    await expect(top).toContainText(user.username)
    const id = Number((await top.getAttribute('id'))!.replace('post-', ''))
    await expectRendered(top.getByRole('img', { name: `Photo by ${user.username}` }))

    await navLink(page, 'Explore').click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explore')
    await expect(await revealPost(page, id)).toBeVisible()
    // Feeds are global here, so only posts newer than ours may sit above it.
    const ids = await postItems(page).evaluateAll((items) => items.map((item) => Number(item.id.replace('post-', ''))))
    expect(ids.slice(0, ids.indexOf(id)).every((other) => other > id)).toBe(true)

    await ownProfileLink(page, user.username).click()
    await expect(page.locator(`#tile-${id}`)).toBeVisible()
    await expect(profileCount(page, '1 post')).toBeVisible()

    expect(await page.evaluate(() => document.documentElement.dataset.noReload)).toBe('yes')
  })

  test('the posted photo really renders, and Posted is said from pages without a feed', async ({ page }, info) => {
    const user = await signedInUser(page, info.project.name)
    await page.goto(`/users/${user.username}`)
    await postThroughUi(page, 'posted from my profile')
    const tileImage = main(page).locator('[id^="tile-"] img').first()
    await expectRendered(tileImage)
    await tileImage.click()
    const dialog = page.getByRole('dialog', { name: `Post by ${user.username}` })
    await expectRendered(dialog.getByRole('img', { name: `Photo by ${user.username}` }))
  })

  test('a PNG can be posted, and comes back as a real image', async ({ page }, info) => {
    await signedInUser(page, info.project.name)
    await page.goto('/home')
    await postThroughUi(page, 'a png', 'photo.png')
    const image = postItems(page).first().getByRole('img', { name: /^Photo by / })
    await expectRendered(image)
    const { naturalWidth, naturalHeight } = await image.evaluate((el: HTMLImageElement) => ({
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
    }))
    expect([naturalWidth, naturalHeight]).toEqual([120, 80])
    // JPEG has no transparency, so the see-through half is white rather than black.
    const right = await pixelAt(image, 0.9, 0.5)
    expect(Math.min(right.r, right.g, right.b)).toBeGreaterThan(230)
  })

  test('a JPEG flagged as rotated comes out upright (FR1)', async ({ page }, info) => {
    await signedInUser(page, info.project.name)
    await page.goto('/home')

    await openComposer(page)
    await fileInput(page).setInputFiles(fixture('rotated-exif6.jpg'))
    await expectRendered(preview(page))
    await expect
      .poll(() => preview(page).evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight]))
      .toEqual([100, 200])
    await captionField(page).fill('rotated')
    await submitPost(page).click()
    await expect(composer(page)).toBeHidden({ timeout: 15_000 })

    const top = postItems(page).first()
    await expect(top).toContainText('rotated')
    const id = Number((await top.getAttribute('id'))!.replace('post-', ''))
    const image = await imageOfPost(page, id)
    await expectRendered(image)

    // Stored sideways as left red, right blue. Upright is 100x200 with red on top and blue underneath.
    expect(await image.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])).toEqual([100, 200])
    const upper = await pixelAt(image, 0.5, 0.2)
    const lower = await pixelAt(image, 0.5, 0.8)
    expect(upper.r).toBeGreaterThan(200)
    expect(upper.b).toBeLessThan(80)
    expect(lower.b).toBeGreaterThan(200)
    expect(lower.r).toBeLessThan(80)
  })

  test('a large photo is shrunk to 1,080 pixels on its longest side before upload (spec 5.2)', async ({ page }, info) => {
    await signedInUser(page, info.project.name)
    await page.goto('/home')
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 3000
      canvas.height = 2000
      const context = canvas.getContext('2d')!
      context.fillStyle = '#336699'
      context.fillRect(0, 0, 3000, 2000)
      return canvas.toDataURL('image/jpeg', 0.5)
    })
    await openComposer(page)
    await fileInput(page).setInputFiles({
      name: 'big.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(dataUrl.split(',')[1], 'base64'),
    })
    await expect(preview(page)).toBeVisible()
    await captionField(page).fill('big')
    await submitPost(page).click()
    await expect(composer(page)).toBeHidden({ timeout: 15_000 })

    const image = postItems(page).first().getByRole('img', { name: /^Photo by / })
    await expectRendered(image)
    expect(await image.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])).toEqual([1080, 720])
  })
})
