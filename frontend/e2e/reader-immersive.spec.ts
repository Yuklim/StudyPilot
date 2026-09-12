/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'

/**
 * 走真实后端：**打开一份资料，看到的就是一整页文章。**
 *
 * 用户原话（2026-09-08）：「我想要点开这个资料之后，显示的就是一个完整的阅读器页面，
 * 就像正常在网页中读文章一样。而不是阅读器镶嵌在页面中，这样很影响阅读。而且现在正文的
 * 字号有点小。」以及「『正文快照 / 保存于… · 共 48338 字 · 来源标识 manual · 第 1 版 /
 * 这是保存当时的副本…』没有用，可以删掉」。
 *
 * 这几条守的就是那三件事：外壳让位、正文可读（740px/18px、整页一条滚动条）、元信息下线。
 * **数值断言必须在真实浏览器里做**：jsdom 不应用样式，字号、行宽、居中、滚动都量不到。
 */
async function call(page: Page, path: string, method = 'GET', body?: unknown) {
  return page.evaluate(
    async ([target, verb, payload]) => {
      const bootstrap = await fetch('/api/v1/local-session', {
        headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' },
      })
      const token = ((await bootstrap.json()) as { data: { token: string } }).data.token
      const response = await fetch('/api/v1' + target, {
        method: verb as string,
        headers: { 'X-StudyPilot-Token': token, 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      })
      return { status: response.status, ...(await response.json().catch(() => ({}))) }
    },
    [path, method, body] as const,
  )
}

/** 一份**长**正文：短正文量不出「整页滚动」与「顶栏钉住」这两件事。 */
const LONG_BODY =
  '# 沉浸阅读\n\n' +
  Array.from(
    { length: 120 },
    (_, i) => `第 ${i + 1} 段。这是一段用来把页面撑高的正文，长度足够让整页出现滚动条。`,
  ).join('\n\n') +
  '\n'

async function seed(page: Page, suffix: string) {
  await page.goto('/resources')
  const created = await call(page, '/resources', 'POST', {
    source_type: 'WEB',
    title: `沉浸阅读 · ${suffix}`,
    source_url: `https://example.test/reader-immersive-${encodeURIComponent(suffix)}`,
    save_reason: '想一次读完',
  })
  expect(created.status).toBe(201)
  const id = created.data.id as string
  expect(
    (await call(page, `/resources/${id}/snapshot`, 'PUT', { content: LONG_BODY })).status,
  ).toBe(201)
  return { id }
}

const article = (page: Page) => page.locator('.snapshot-rendered')
const measured = (page: Page) => page.locator('.resource-snapshot')

test('the reader takes the whole window and the shell stays on the other pages', async ({
  page,
}) => {
  const { id } = await seed(page, '外壳 A')
  await page.setViewportSize({ width: 1440, height: 900 })

  // 对照组先跑：资料库上外壳三件套都在。**没有这一组，「统统不在」也可能是外壳整个坏了。**
  await page.goto('/resources')
  await expect(page.locator('.sidebar')).toHaveCount(1)
  await expect(page.locator('.workspace-topbar')).toHaveCount(1)
  await expect(page.locator('.workspace-footer')).toHaveCount(1)

  await page.goto(`/resources/${id}`)
  await expect(article(page)).toBeVisible()
  await expect(page.locator('.sidebar')).toHaveCount(0)
  await expect(page.locator('.workspace-topbar')).toHaveCount(0)
  await expect(page.locator('.workspace-footer')).toHaveCount(0)
  // 没有导航了，所以出口必须在。
  await expect(page.getByRole('link', { name: '返回资料库' })).toBeVisible()
  await page.getByRole('link', { name: '返回资料库' }).click()
  await expect(page).toHaveURL(/\/resources$/)
})

test('the article reads at 18px on a 740px measure, in one page-level scroll', async ({
  page,
}, info) => {
  const { id } = await seed(page, '版式 B')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/resources/${id}`)
  await expect(article(page)).toBeVisible()

  // 字号与行高（用户：「正文的字号有点小」；改前是 12px）。
  const type = await article(page).evaluate((el) => {
    const style = getComputedStyle(el)
    return { size: style.fontSize, height: style.lineHeight, overflow: style.overflowY }
  })
  expect(type.size).toBe('18px')
  expect(parseFloat(type.height)).toBeCloseTo(32.4, 1)

  // 行宽 ≈740px 且在可用列内居中（左右余量差 ≤2px）。
  const box = (await measured(page).boundingBox())!
  const column = (await page.locator('.reader-main').boundingBox())!
  expect(box.width).toBeLessThanOrEqual(740)
  expect(box.width).toBeGreaterThan(700)
  const left = box.x - column.x
  const right = column.x + column.width - (box.x + box.width)
  expect(Math.abs(left - right)).toBeLessThanOrEqual(2)

  // **整页只有一条滚动条**：正文自己不再是 420px 高的内嵌滚动框。
  expect(type.overflow).toBe('visible')
  const inner = await article(page).evaluate((el) => el.scrollHeight - el.clientHeight)
  expect(inner).toBeLessThanOrEqual(2)
  const scrolled = await page.evaluate(() => {
    window.scrollBy(0, 600)
    return { y: window.scrollY, page: document.documentElement.scrollHeight, view: innerHeight }
  })
  expect(scrolled.page).toBeGreaterThan(scrolled.view)
  expect(scrolled.y).toBeGreaterThan(400)

  // 留档：宽窄两档的实际观感（本任务改的就是"看起来像不像一篇文章"）。
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: info.outputPath('reader-1440.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: info.outputPath('reader-390.png') })
})

test('the snapshot metadata is gone while the text itself is there', async ({ page }) => {
  const { id } = await seed(page, '元信息 C')
  await page.goto(`/resources/${id}`)
  const section = page.getByRole('region', { name: '正文快照' })
  // **先确认正文真的在**，否则下面每一条「不在」都会在一片空白上空过。
  await expect(section.getByRole('heading', { name: '沉浸阅读', level: 1 })).toBeVisible()
  for (const gone of ['保存于', '来源标识', '第 1 版', '这是保存当时的副本', '共 '])
    await expect(section).not.toContainText(gone)
  // 那个 `<h3>正文快照</h3>` 标题也不再渲染（区块的可访问名称仍然是它，但它不上屏）。
  await expect(page.getByRole('heading', { name: '正文快照' })).toHaveCount(0)
})

test('the top bar stays within reach in the middle of a long article', async ({ page }) => {
  const { id } = await seed(page, '顶栏 D')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/resources/${id}`)
  await expect(article(page)).toBeVisible()
  await page.evaluate(() => window.scrollBy(0, 1500))
  await expect(page.locator('.reader-toolbar')).toBeInViewport()
  const bar = (await page.locator('.reader-toolbar').boundingBox())!
  // 钉在窗口顶部，不是"恰好还在第一屏"。
  expect(bar.y).toBeLessThanOrEqual(2)
  // 出口与写作入口都还点得到。
  const back = page.getByRole('link', { name: '返回资料库' })
  const notes = page.locator('.reader-toolbar').getByRole('button', { name: '心得', exact: true })
  await expect(back).toBeInViewport()
  await expect(notes).toBeInViewport()
  // **真的点得到**，不只是"在视口里"：顶栏若被别的层盖住，这一下会超时而不是静默通过。
  await notes.click({ timeout: 3000 })
  await expect(notes).toHaveAttribute('aria-expanded', 'true')
})

test('the notes overlay never covers the button that closes it, and nothing overflows sideways', async ({
  page,
}) => {
  const { id } = await seed(page, '窄屏 E')
  for (const [width, height] of [
    [320, 844],
    [390, 844],
    [768, 1024],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.goto(`/resources/${id}`)
    await expect(article(page)).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${width}px 下不横向溢出（收起态）`,
    ).toBe(true)
    // 正文在窄屏也是 18px，且不超出可用宽度。
    expect(await article(page).evaluate((el) => getComputedStyle(el).fontSize)).toBe('18px')
    // 完成条件 7 写的是「1440 与 390 两档实测」，而此前只有 1440 档断言了「整页一条
    // 滚动条」——窄屏这一档补上，否则日后某档媒体查询给正文加回 max-height/overflow
    // 也不会有任何用例变红。
    const narrow = await article(page).evaluate((el) => ({
      overflow: getComputedStyle(el).overflowY,
      inner: el.scrollHeight - el.clientHeight,
    }))
    expect(narrow.overflow, `${width}px 下正文不内滚`).toBe('visible')
    expect(narrow.inner, `${width}px 下正文不内滚`).toBeLessThanOrEqual(2)

    const notes = page.locator('.reader-toolbar').getByRole('button', { name: '心得', exact: true })
    await notes.click()
    await expect(page.locator('.reader-notes')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${width}px 下不横向溢出（展开态）`,
    ).toBe(true)

    // **心得浮层的层级必须低于顶栏**：否则它会盖住那个用来收起它自己的按钮。
    //
    // 但浮层是相对 `.reader-body` 绝对定位的（`top:6px`），**在滚动位置 0 它整个落在
    // 顶栏下方，与顶栏根本不重叠** —— 站在那里点按钮，z 序就算错了也照样点得中，上面
    // 那几条会全部通过。要真验到层叠，得先滚到浮层上沿跑到视口上方，顶栏（sticky）
    // 才与它在按钮所在的这一片真正重叠。滚动量按浮层的**文档位置**算，不是猜一个数。
    const overlayDocTop = await page
      .locator('.reader-notes')
      .evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
    await page.evaluate((y) => window.scrollTo(0, y), Math.ceil(overlayDocTop) + 100)
    const pinned = (await page.locator('.reader-toolbar').boundingBox())!
    expect(pinned.y, `${width}px 下顶栏已钉住`).toBeLessThanOrEqual(2)
    const notesBox = (await notes.boundingBox())!
    const overlayBox = (await page.locator('.reader-notes').boundingBox())!
    // 前提断言：此刻两者确实重叠。几何一变（浮层改回视口内定位、或不再是绝对定位），
    // 这一条先红，而不是让下面那条判据悄悄退化成恒真。
    expect(
      overlayBox.y < notesBox.y + notesBox.height && notesBox.y < overlayBox.y + overlayBox.height,
      `${width}px 下浮层与顶栏按钮确有重叠（否则本用例验不到层叠）`,
    ).toBe(true)
    // 真正的判据：按钮中心这一点上，最顶的元素必须属于顶栏而不是浮层。
    const topmost = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y)
        if (!el) return 'none'
        if (el.closest('.reader-toolbar')) return 'toolbar'
        if (el.closest('.reader-notes')) return 'notes'
        return 'other'
      },
      [notesBox.x + notesBox.width / 2, notesBox.y + notesBox.height / 2] as const,
    )
    expect(topmost, `${width}px 下按钮未被浮层盖住`).toBe('toolbar')
    // 而且**真的点得到**：被盖住的话这一下会超时而不是静默通过。
    await notes.click({ timeout: 3000 })
    await expect(notes).toHaveAttribute('aria-expanded', 'true')
  }
})
