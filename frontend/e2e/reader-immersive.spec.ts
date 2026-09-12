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

test('opening the notes overlay mid-article does not throw the reading position away', async ({
  page,
}) => {
  // TASK-046 的遗留 H：浮层原先钉在**文档**里（相对 `.reader-body` 的 `absolute;
  // top:6px`），而「心得」按钮自 TASK-046 把顶栏 sticky 化之后在任意滚动位置都够得着。
  // 于是滚到文章中部点它，浮层整块出现在视口上方，`NotesPanel` 写作框的 `focus()`
  // 把页面滚回文章开头——读到哪里就丢了。这条守的就是那件事。
  const { id } = await seed(page, '阅读位置 F')
  for (const [width, height] of [
    [320, 844],
    [390, 844],
    [768, 1024],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.goto(`/resources/${id}`)
    await expect(article(page)).toBeVisible()
    await page.evaluate(() =>
      window.scrollTo(0, Math.round(document.documentElement.scrollHeight / 2)),
    )
    const before = await page.evaluate(() => window.scrollY)
    expect(before, `${width}px 下确实滚离了顶部（否则本用例验不到东西）`).toBeGreaterThan(800)

    await page.locator('.reader-toolbar').getByRole('button', { name: '心得', exact: true }).click()
    await expect(page.locator('.reader-notes')).toBeVisible()
    // **写作框必须真的拿到焦点**：只断言「页面没滚」的话，将来聚焦失效（按钮变成纯
    // 开合、不再聚焦）会让这条在"什么都没发生"的状态下照样通过。
    await expect(page.getByRole('textbox', { name: '这次想记下什么？' })).toBeFocused()
    const after = await page.evaluate(() => window.scrollY)
    expect(Math.abs(after - before), `${width}px 下展开心得没有把阅读位置拽走`).toBeLessThanOrEqual(
      2,
    )
  }
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

    // 展开前先滚到文章中部。**站位在滚动位置 0 量不出这个缺陷**：浮层原先钉在文档里
    // （相对 `.reader-body` 的 `absolute; top:6px`），只有滚过它才会跑到视口上方。
    await page.evaluate(() =>
      window.scrollTo(0, Math.round(document.documentElement.scrollHeight / 2)),
    )
    const scrolled = await page.evaluate(() => window.scrollY)
    expect(scrolled, `${width}px 下确实滚离了顶部（否则本用例验不到浮层定位）`).toBeGreaterThan(800)
    const pinned = (await page.locator('.reader-toolbar').boundingBox())!
    expect(pinned.y, `${width}px 下顶栏已钉住`).toBeLessThanOrEqual(2)

    const notes = page.locator('.reader-toolbar').getByRole('button', { name: '心得', exact: true })
    await notes.click()
    const overlay = page.locator('.reader-notes')
    await expect(overlay).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${width}px 下不横向溢出（展开态）`,
    ).toBe(true)

    // **浮层必须出现在视口里、且在顶栏之下**（TASK-049）。它原先钉在文档里：此刻
    // 展开会整块落在视口上方（`y` 是几千米的负数），下面每条断言都会红。
    const overlayBox = (await overlay.boundingBox())!
    console.log(`[${width}px] 顶栏高 ${pinned.height}px，浮层 top ${overlayBox.y}px`)
    // 让开的距离**恰好**是顶栏高度：太小会被不透明的顶栏压住头部，太大是白扔一截屏幕。
    // 顶栏高度在 ≤640px 会因按钮换行而变（styles.css 的 `@media (max-width: 640px)`），
    // 所以这里量的是「跟随实测」而不是某个常量。
    expect(
      overlayBox.y,
      `${width}px 下浮层顶边不高于顶栏底边（没被顶栏压住）`,
    ).toBeGreaterThanOrEqual(pinned.y + pinned.height - 1)
    expect(
      overlayBox.y - (pinned.y + pinned.height),
      `${width}px 下没有多让出空白`,
    ).toBeLessThanOrEqual(8)
    // 整块在视口内——「视口定位」的全部意义（`height` 是本档视口高）。
    expect(overlayBox.y, `${width}px 下浮层上沿在视口内`).toBeGreaterThanOrEqual(-1)
    expect(overlayBox.y + overlayBox.height, `${width}px 下浮层下沿在视口内`).toBeLessThanOrEqual(
      height + 1,
    )

    // 顶栏那个用来收起浮层的按钮必须仍是**最顶**的元素：浮层盖住它的话，用户就没有
    // 屏幕上的收起入口了（Esc 与浮层内的「收起」按钮还在，但那是另一回事）。
    const notesBox = (await notes.boundingBox())!
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

test('the toolbar is one row of actions on a phone, and the more menu floats instead of growing it', async ({
  page,
}) => {
  // TASK-052（用户 2026-09-12 选定「A3 标题移出顶栏 + 全部宽度统一」与「B1 菜单浮动」）。
  // 改前实测 390px：常态顶栏 123px（「← 返回资料库 · 网页 · 标题」+ 四个按钮排两行），
  // ⋯ 菜单展开后 472px（菜单是塞进 sticky 盒子里的普通块，把顶栏撑高、正文整体被推下
  // ——TASK-046 验收 F7）。**数值必须在真实浏览器里量**：jsdom 没有布局。
  const { id } = await seed(page, '顶栏 G')
  for (const [width, height] of [
    [320, 844],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.goto(`/resources/${id}`)
    await expect(article(page)).toBeVisible()
    const toolbar = page.locator('.reader-toolbar')
    const closed = (await toolbar.boundingBox())!
    console.log(`[${width}px] 常态顶栏高 ${closed.height}px`)
    // 一行：按钮 38px + 上下留白 9px×2 + 1px 底边 = 57px；给圆整与字体差留余量。
    expect(closed.height, `${width}px 下顶栏只有一行动作`).toBeLessThanOrEqual(64)
    // 标题不在顶栏里，在正文列里、上下文层之前，且仍是页面唯一的 h1（正文 Markdown 自带的
    // `# 沉浸阅读` 在 `.snapshot-rendered` 内，属 TASK-046 遗留 B，排除）。
    const pageHeadings = page.locator('h1:not(.snapshot-rendered h1)')
    await expect(pageHeadings).toHaveCount(1)
    expect(await pageHeadings.evaluate((el) => Boolean(el.closest('.reader-toolbar')))).toBe(false)
    expect(await pageHeadings.evaluate((el) => Boolean(el.closest('.reader-main')))).toBe(true)
    // 返回链接在窄屏只露箭头，但名字还在（读屏与用例都靠它）。
    const back = page.getByRole('link', { name: '返回资料库' })
    await expect(back).toBeVisible()
    expect((await back.boundingBox())!.width, `${width}px 下返回链接收成图标宽`).toBeLessThan(48)

    // 展开 ⋯ 菜单：顶栏不变高，正文不被推下，菜单整块在视口内。
    const bodyBefore = (await page.locator('.reader-body').boundingBox())!.y
    await page.getByRole('button', { name: '更多操作' }).click()
    const menu = page.getByRole('menu', { name: '更多操作' })
    await expect(menu).toBeVisible()
    const opened = (await toolbar.boundingBox())!
    expect(opened.height, `${width}px 下展开菜单没把顶栏撑高`).toBeLessThanOrEqual(
      closed.height + 1,
    )
    const bodyAfter = (await page.locator('.reader-body').boundingBox())!.y
    expect(Math.abs(bodyAfter - bodyBefore), `${width}px 下正文没被菜单推下去`).toBeLessThanOrEqual(
      1,
    )
    const menuBox = (await menu.boundingBox())!
    expect(menuBox.x, `${width}px 下菜单左沿在视口内`).toBeGreaterThanOrEqual(0)
    expect(menuBox.x + menuBox.width, `${width}px 下菜单右沿在视口内`).toBeLessThanOrEqual(
      width + 1,
    )
    // 菜单挂在动作行下方（静态位置 + 6px），落在顶栏 9px 的底部留白里——与宽屏一致；
    // 它不能盖住动作行本身。
    expect(menuBox.y, `${width}px 下菜单在动作行之下`).toBeGreaterThanOrEqual(
      closed.y + closed.height - 9,
    )
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${width}px 下不横向溢出（菜单展开态）`,
    ).toBe(true)
    // 菜单浮在正文之上：菜单项中心点取到的最顶元素是菜单自己。
    const item = page.getByRole('menuitem', { name: '编辑资料' })
    const itemBox = (await item.boundingBox())!
    const topmost = await page.evaluate(
      ([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('.reader-menu')),
      [itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2] as const,
    )
    expect(topmost, `${width}px 下菜单浮在最上层`).toBe(true)
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  }

  // 宽屏对照：顶栏不比改前高（改前单行 ≈56px），标题同样在正文列。
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/resources/${id}`)
  await expect(article(page)).toBeVisible()
  const wide = (await page.locator('.reader-toolbar').boundingBox())!
  console.log(`[1440px] 常态顶栏高 ${wide.height}px`)
  expect(wide.height).toBeLessThanOrEqual(64)
  const title = page.locator('h1:not(.snapshot-rendered h1)')
  await expect(title).toHaveCount(1)
  expect(await title.evaluate((el) => Boolean(el.closest('.reader-main')))).toBe(true)
  // 标题与正文列左对齐（差 ≤2px）：它是文章的一部分，不是另一块。
  const titleBox = (await title.boundingBox())!
  const column = (await measured(page).boundingBox())!
  expect(Math.abs(titleBox.x - column.x)).toBeLessThanOrEqual(2)
})
