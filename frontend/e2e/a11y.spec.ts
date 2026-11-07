import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  ALICE,
  api,
  BOB,
  commentButton,
  deletePostButton,
  fail,
  fileInput,
  fixture,
  horizontalOverflow,
  makePost,
  makeProfile,
  mockCatchAll,
  mockComments,
  mockLoggedIn,
  mockProfile,
  openComposer,
  postItem,
  setTheme,
  submitPost,
  type MockPost,
} from './helpers'

// Spec 5.5 says its contrast ratios were calculated and that this phase must measure them, so everything here runs
// in both themes and on the rendered page. Axe covers text; it can't see borders, focus rings, placeholders or hover
// states, so those are measured below. NFR6 is at the bottom.

const THEMES = ['light', 'dark'] as const

const longName = 'a_very_long_username_of_thirty'
const longCaption = 'x'.repeat(400)

function samplePosts(): MockPost[] {
  return [
    makePost({ authorId: ALICE.id, authorUsername: ALICE.username, caption: 'my own post', likeCount: 3, likedByMe: true, commentCount: 2 }),
    makePost({ caption: 'long '.repeat(100).trim(), likeCount: 0, width: 1080, height: 720 }),
  ]
}

async function prepareMembers(page: Page, posts: MockPost[] = samplePosts()) {
  await mockLoggedIn(page, { home: [posts], explore: [posts] })
  await mockProfile(page, makeProfile(BOB, { firstName: 'Bob', lastName: 'Builder', bio: 'Builds things', postCount: 2 }), [posts])
  await mockProfile(page, makeProfile(ALICE, { postCount: 2 }), [posts])
  if (posts.length > 0) {
    await mockComments(page, posts[0].postId, [
      { commentId: 1, authorId: BOB.id, authorUsername: BOB.username, postId: posts[0].postId, message: 'nice one' },
      { commentId: 2, authorId: ALICE.id, authorUsername: ALICE.username, postId: posts[0].postId, message: 'thanks' },
    ])
  }
  await page.route(api('users/search'), (route) => route.fulfill({ json: [BOB] }))
}

// One line per failing element, so a red test reads as a report.
function describeViolations(results: Awaited<ReturnType<AxeBuilder['analyze']>>) {
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => {
      const check = node.any[0]?.data as { contrastRatio?: number; fgColor?: string; bgColor?: string; expectedContrastRatio?: string } | undefined
      const ratio = violation.id === 'color-contrast' && check
        ? ` measured ${check.contrastRatio} (needs ${check.expectedContrastRatio}), ${check.fgColor} on ${check.bgColor}`
        : ''
      return `${violation.id}: ${node.target.join(' ')}${ratio}`
    }),
  )
}

async function expectNoAxeViolations(page: Page) {
  // Past the 150ms colour and fade transitions, which axe would otherwise measure halfway through.
  await page.waitForTimeout(300)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const ran = [...results.violations, ...results.passes, ...results.incomplete].some((rule) => rule.id === 'color-contrast')
  expect(ran, 'the color-contrast rule ran').toBe(true)
  for (const rule of results.incomplete.filter((r) => r.id === 'color-contrast')) {
    console.log(`axe could not decide contrast on ${page.url()}: ${rule.nodes.map((node) => node.target.join(' ')).join(', ')}`)
  }
  expect(describeViolations(results)).toEqual([])
}

const SCREENS: Record<string, (page: Page) => Promise<void>> = {
  login: async (page) => {
    await mockCatchAll(page)
    await page.goto('/login')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Log in')
  },
  'login with errors': async (page) => {
    await mockCatchAll(page)
    await page.route(api('auth/login'), (route) => fail(route, 401, 'Invalid username/email or password'))
    await page.goto('/login')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.locator('#password-error')).toBeVisible()
    await page.getByLabel('Username or email').fill('alice_1')
    await page.getByLabel('Password', { exact: true }).fill('wrong-password')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
  },
  'session ended login': async (page) => {
    await mockLoggedIn(page)
    await page.route(api('feed/explore'), (route) => fail(route, 401))
    await page.goto('/explore')
    await expect(page.getByText('Your session ended. Log in again.')).toBeVisible()
  },
  register: async (page) => {
    await mockCatchAll(page)
    await page.goto('/register')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create account')
  },
  home: async (page) => {
    await prepareMembers(page)
    await page.goto('/home')
    await expect(page.locator('li[id^="post-"]')).toHaveCount(2)
  },
  'home with delete confirmation and comments open': async (page) => {
    const posts = samplePosts()
    await prepareMembers(page, posts)
    await page.goto('/home')
    const item = postItem(page, posts[0].postId)
    await deletePostButton(item).click()
    await commentButton(item).click()
    await expect(item.getByText('nice one')).toBeVisible()
    await item.getByRole('button', { name: 'Delete comment' }).click()
    await expect(item.getByRole('button', { name: 'Keep comment' })).toBeVisible()
  },
  'home with a broken image': async (page) => {
    const posts = samplePosts()
    await prepareMembers(page, posts)
    await page.route(api(`posts/${posts[1].postId}/image`), (route) => fail(route, 404))
    await page.goto('/home')
    await expect(postItem(page, posts[1].postId).getByText('Image unavailable')).toBeVisible()
  },
  'home with a like error': async (page) => {
    const posts = samplePosts()
    await prepareMembers(page, posts)
    await page.route(api(`posts/${posts[1].postId}/likes`), (route) => fail(route, 500))
    await page.goto('/home')
    await postItem(page, posts[1].postId).getByRole('button', { name: /likes?$/ }).click()
    await expect(postItem(page, posts[1].postId).getByRole('alert')).toBeVisible()
  },
  'empty home': async (page) => {
    await prepareMembers(page, [])
    await page.goto('/home')
    await expect(page.getByRole('main').getByRole('button', { name: 'New post' })).toBeVisible()
  },
  explore: async (page) => {
    await prepareMembers(page)
    await page.goto('/explore')
    await expect(page.locator('li[id^="post-"]')).toHaveCount(2)
  },
  search: async (page) => {
    await prepareMembers(page)
    await page.goto('/search?q=bob')
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(1)
  },
  'search with no match': async (page) => {
    await prepareMembers(page)
    await page.route(api('users/search'), (route) => route.fulfill({ json: [] }))
    await page.goto('/search?q=nobody')
    await expect(page.getByRole('main').getByRole('status')).toBeVisible()
  },
  profile: async (page) => {
    await prepareMembers(page)
    await page.goto(`/users/${BOB.username}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(BOB.username)
    await expect(page.locator('[id^="tile-"]')).toHaveCount(2)
  },
  'not-found profile': async (page) => {
    await prepareMembers(page)
    await page.route(api('users/ghost_user/profile'), (route) => fail(route, 404))
    await page.goto('/users/ghost_user')
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
  },
  'post dialog': async (page) => {
    const posts = samplePosts()
    await prepareMembers(page, posts)
    await page.goto(`/users/${ALICE.username}`)
    await page.locator(`#tile-${posts[0].postId}`).click()
    await expect(page.getByRole('dialog').getByText('nice one')).toBeVisible()
  },
  'composer dialog': async (page) => {
    await prepareMembers(page)
    await page.goto('/home')
    await openComposer(page)
  },
  'composer dialog with an error': async (page) => {
    await prepareMembers(page)
    await page.goto('/home')
    await openComposer(page)
    await submitPost(page).click()
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
  },
  'composer dialog with a photo and discard prompt': async (page) => {
    await prepareMembers(page)
    await page.goto('/home')
    await openComposer(page)
    await fileInput(page).setInputFiles(fixture('photo.jpg'))
    await expect(page.getByRole('dialog').getByRole('img')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog').getByText('Discard this post?')).toBeVisible()
  },
}

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await setTheme(page, theme)
    })

    test('the theme is really applied', async ({ page }) => {
      await mockCatchAll(page)
      await page.goto('/login')
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark).*$/)
    })

    for (const [name, open] of Object.entries(SCREENS)) {
      test(`axe, WCAG AA with contrast: ${name}`, async ({ page }) => {
        await open(page)
        await expectNoAxeViolations(page)
      })
    }

    test('input borders reach 3:1 against the page (spec 5.5)', async ({ page }) => {
      await mockCatchAll(page)
      await page.goto('/login')
      const ratio = await contrast(page.getByLabel('Username or email'), 'border-top-color')
      expect(ratio, `input border measured ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
    })

    test('placeholders reach 4.5:1 (spec 5.5)', async ({ page }) => {
      await prepareMembers(page)
      await page.goto('/search')
      const box = page.getByRole('searchbox')
      await expect(box).toBeVisible()
      const ratio = await contrast(box, 'color', '::placeholder')
      expect(ratio, `placeholder measured ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    })

    test('the focus ring reaches 3:1 against the page (spec 5.5)', async ({ page }) => {
      await mockCatchAll(page)
      await page.goto('/login')
      const field = page.getByLabel('Username or email')
      await field.focus()
      await page.waitForTimeout(200)
      const ratio = await contrast(field, 'outline-color', undefined, true)
      expect(ratio, `focus ring measured ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
    })

    test('primary button hover keeps 4.5:1 (spec 5.5)', async ({ page, isMobile }) => {
      test.skip(isMobile, 'hover is a mouse state')
      await mockCatchAll(page)
      await page.goto('/login')
      const button = page.getByRole('button', { name: 'Log in' })
      await button.hover()
      await page.waitForTimeout(300)
      const ratio = await contrast(button, 'color')
      expect(ratio, `primary hover measured ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    })

    test('destructive buttons keep 4.5:1, resting and hovered (spec 5.5)', async ({ page, isMobile }) => {
      const posts = samplePosts()
      await prepareMembers(page, posts)
      await page.goto('/home')
      const item = postItem(page, posts[0].postId)
      await deletePostButton(item).click()
      const button = deletePostButton(item)
      await page.waitForTimeout(300)
      const resting = await contrast(button, 'color')
      expect(resting, `destructive measured ${resting.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
      if (!isMobile) {
        await button.hover()
        await page.waitForTimeout(300)
        const hovered = await contrast(button, 'color')
        expect(hovered, `destructive hover measured ${hovered.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
      }
    })

    test('every stop on the Tab order shows the 2px ring with a 2px offset: login (spec 5.5)', async ({ page }) => {
      await mockCatchAll(page)
      await page.goto('/login')
      expect(await badFocusStops(page)).toEqual([])
    })

    test('every stop on the Tab order shows the 2px ring with a 2px offset: register (spec 5.5)', async ({ page }) => {
      await mockCatchAll(page)
      await page.goto('/register')
      expect(await badFocusStops(page)).toEqual([])
    })

    test('every stop on the Tab order shows the 2px ring with a 2px offset: home (spec 5.5)', async ({ page }) => {
      const posts = samplePosts()
      await prepareMembers(page, posts)
      await page.goto('/home')
      await expect(postItem(page, posts[0].postId)).toBeVisible()
      await commentButton(postItem(page, posts[0].postId)).click()
      await expect(postItem(page, posts[0].postId).getByText('nice one')).toBeVisible()
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      expect(await badFocusStops(page)).toEqual([])
    })

    test('every stop on the Tab order shows the 2px ring with a 2px offset: search (spec 5.5)', async ({ page }) => {
      await prepareMembers(page)
      await page.goto('/search?q=bob')
      await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(1)
      expect(await badFocusStops(page)).toEqual([])
    })

    test('every stop on the Tab order shows the 2px ring, 2px outside, or 4px inside on grid tiles: profile (spec 5.5)', async ({ page }) => {
      await prepareMembers(page)
      await page.goto(`/users/${BOB.username}`)
      await expect(page.locator('[id^="tile-"]')).toHaveCount(2)
      tiles.length = 0
      expect(await badFocusStops(page)).toEqual([])
      expect(tiles).toHaveLength(2)
    })

    test('every stop on the Tab order shows the 2px ring with a 2px offset: composer (spec 5.5)', async ({ page }) => {
      await prepareMembers(page)
      await page.goto('/home')
      await openComposer(page)
      await fileInput(page).setInputFiles(fixture('photo.jpg'))
      await expect(page.getByRole('dialog').getByRole('img')).toBeVisible()
      expect(await badFocusStops(page)).toEqual([])
    })
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------------------------------------------

// WCAG contrast between an element's colour and what's behind it. A canvas turns any CSS colour (these are oklch)
// into RGB, and transparent colours are blended over the backgrounds behind them. `property` is the CSS property
// measured; `outside` measures against what's behind the element rather than its own background, as a ring or
// border outside it would be.
function contrast(locator: Locator, property: string, pseudo?: string, outside = false) {
  return locator.evaluate(
    (element, { property, pseudo, outside }) => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const context = canvas.getContext('2d', { willReadFrequently: true })!

      function rgba(css: string) {
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = css
        context.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
        return { r, g, b, a: a / 255 }
      }
      const over = (top: ReturnType<typeof rgba>, under: ReturnType<typeof rgba>) => ({
        r: top.r * top.a + under.r * (1 - top.a),
        g: top.g * top.a + under.g * (1 - top.a),
        b: top.b * top.a + under.b * (1 - top.a),
        a: 1,
      })
      function background(from: Element | null) {
        const layers = []
        for (let el = from; el; el = el.parentElement) layers.push(rgba(getComputedStyle(el).backgroundColor))
        return layers.reduceRight((under, top) => over(top, under), { r: 255, g: 255, b: 255, a: 1 })
      }
      function luminance({ r, g, b }: { r: number; g: number; b: number }) {
        const [R, G, B] = [r, g, b].map((v) => {
          const s = v / 255
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * R + 0.7152 * G + 0.0722 * B
      }

      const behind = background(outside || property.startsWith('border') ? element.parentElement : element)
      const color = over(rgba(getComputedStyle(element, pseudo).getPropertyValue(property)), behind)
      const [hi, lo] = [luminance(color), luminance(behind)].sort((a, b) => b - a)
      return (hi + 0.05) / (lo + 0.05)
    },
    { property, pseudo, outside },
  )
}

// Tabs through the page and returns any stop whose focus style isn't the agreed one. The file input is visually
// hidden, so its ring is drawn on the label around it.
async function badFocusStops(page: Page) {
  const bad: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    const stop = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null
      if (!active || active === document.body) return null
      const shown = active.matches('input[type=file]') ? (active.closest('label') as HTMLElement) : active
      const style = getComputedStyle(shown)
      return {
        id: `${active.tagName.toLowerCase()}${active.id ? `#${active.id}` : ''}[${(active.getAttribute('aria-label') ?? active.textContent ?? '').trim().slice(0, 30)}]`,
        outline: `${style.outlineWidth} ${style.outlineStyle}`,
        offset: style.outlineOffset,
        tile: active.matches('[id^="tile-"]'),
      }
    })
    if (!stop) {
      if (seen.size > 0) break
      continue
    }
    if (seen.has(stop.id)) break
    seen.add(stop.id)
    if (stop.tile) tiles.push(stop.id)
    // Spec 5.5's one exception: grid tiles are only 4px apart, so their ring is drawn inside the tile.
    const offset = stop.tile ? '-4px' : '2px'
    if (stop.outline !== '2px solid' || stop.offset !== offset) bad.push(`${stop.id}: ${stop.outline}, offset ${stop.offset}`)
  }
  expect(seen.size, 'the Tab key reached something').toBeGreaterThan(0)
  return bad
}

// Set by badFocusStops, so the grid test can prove it reached the tiles rather than passing without them.
const tiles: string[] = []

// ---------------------------------------------------------------------------------------------------------------
// NFR6: no horizontal scrolling
// ---------------------------------------------------------------------------------------------------------------

test.describe('no horizontal scrolling (NFR6)', () => {
  const longUser = { id: 99, username: longName, email: `${longName}@example.com` }

  function longPosts() {
    return [
      makePost({ authorId: longUser.id, authorUsername: longName, caption: longCaption, likeCount: 123456, commentCount: 123456, width: 1080, height: 200 }),
      makePost({ authorUsername: longName, caption: longCaption, width: 200, height: 1080 }),
    ]
  }

  async function prepareLong(page: Page, posts = longPosts()) {
    await mockLoggedIn(page, { user: longUser, home: [posts], explore: [posts] })
    const profile = makeProfile(longUser, {
      bio: longCaption,
      firstName: 'x'.repeat(100),
      postCount: 123456,
      followerCount: 123456,
      followingCount: 123456,
    })
    await mockProfile(page, profile, [posts])
    await mockComments(page, posts[0].postId, [
      { commentId: 1, authorId: BOB.id, authorUsername: longName, postId: posts[0].postId, message: longCaption },
    ])
    await page.route(api('users/search'), (route) => route.fulfill({ json: [{ id: 1, username: longName }] }))
    return posts
  }

  const screens: Record<string, (page: Page) => Promise<void>> = {
    landing: async (page) => {
      await mockCatchAll(page)
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    },
    login: SCREENS['login with errors'],
    register: SCREENS.register,
    home: async (page) => {
      await prepareLong(page)
      await page.goto('/home')
      await expect(page.locator('li[id^="post-"]')).toHaveCount(2)
    },
    'home with comments open and a confirmation': async (page) => {
      const posts = await prepareLong(page)
      await page.goto('/home')
      const item = postItem(page, posts[0].postId)
      await commentButton(item).click()
      await expect(item.getByRole('textbox', { name: 'Add a comment' })).toBeVisible()
      await deletePostButton(item).click()
      await item.getByRole('button', { name: 'more', exact: true }).click()
    },
    explore: async (page) => {
      await prepareLong(page)
      await page.goto('/explore')
      await expect(page.locator('li[id^="post-"]')).toHaveCount(2)
    },
    search: async (page) => {
      await prepareLong(page)
      await page.goto(`/search?q=${'y'.repeat(200)}`)
      await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(1)
    },
    'search with no match': async (page) => {
      await prepareLong(page)
      await page.route(api('users/search'), (route) => route.fulfill({ json: [] }))
      await page.goto(`/search?q=${'y'.repeat(200)}`)
      await expect(page.getByRole('main').getByRole('status')).toBeVisible()
    },
    profile: async (page) => {
      await prepareLong(page)
      await page.goto(`/users/${longName}`)
      await expect(page.locator('[id^="tile-"]')).toHaveCount(2)
    },
    'not-found profile': async (page) => {
      await prepareLong(page)
      await page.route(api(`users/${'z'.repeat(30)}/profile`), (route) => fail(route, 404))
      await page.goto(`/users/${'z'.repeat(30)}`)
      await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
    },
    'composer dialog': async (page) => {
      await prepareLong(page)
      await page.goto('/home')
      await openComposer(page)
      await fileInput(page).setInputFiles(fixture('photo.jpg'))
      await expect(page.getByRole('dialog').getByRole('img')).toBeVisible()
      await page.getByRole('dialog').getByLabel('Caption (optional)').fill(longCaption)
    },
    'post dialog': async (page) => {
      const posts = await prepareLong(page)
      await page.goto(`/users/${longName}`)
      await page.locator(`#tile-${posts[0].postId}`).click()
      await expect(page.getByRole('dialog').getByRole('img')).toBeVisible()
    },
  }

  for (const [name, open] of Object.entries(screens)) {
    test(name, async ({ page }) => {
      await open(page)
      await page.waitForTimeout(200)
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
      // A dialog scrolls by itself, so the page can look fine while the dialog overflows.
      const dialog = page.getByRole('dialog')
      if ((await dialog.count()) > 0) {
        const inside = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)
        expect(inside).toBeLessThanOrEqual(0)
      }
    })
  }
})
