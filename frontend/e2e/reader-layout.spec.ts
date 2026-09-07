/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'

/**
 * 走真实后端：**打开一份资料，看到的第一样东西是正文。**
 *
 * TASK-043 之前这一页是一条长滚动——心得与编辑框在最上面，正文夹在元数据与原件之间，
 * 学习状态在最底下。这条用例守的是那件事真的反过来了，以及标签与「为什么收下这一页」
 * 不用点任何东西就看得见。
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

/**
 * 建一份带标签、保存原因与正文的资料，返回它的 id 与标题。
 *
 * 名字带后缀：标签名在后端唯一，多条用例复用同一个名字会 409，而 409 之后
 * `data` 是 undefined，报出来的错会指向一个与真实原因无关的地方。
 */
async function seed(page: Page, suffix: string) {
  await page.goto('/resources')
  const tag = (await call(page, '/tags', 'POST', { name: `阅读器改版 · 算法 ${suffix}` })).data
  const title = `阅读器改版 · 数组基础 ${suffix}`
  const created = await call(page, '/resources', 'POST', {
    source_type: 'WEB',
    title,
    source_url: `https://example.test/reader-layout-${suffix}`,
    save_reason: '想搞清双指针',
    tag_ids: [tag.id],
  })
  const id = created.data.id as string
  await call(page, `/resources/${id}/snapshot`, 'PUT', {
    content: '# 数组基础\n\n数组是存放在连续内存空间上的相同类型数据的集合。\n',
  })
  return { id, title }
}

test('the reader puts the body first and keeps its context in view', async ({ page }, info) => {
  const { id } = await seed(page, 'A')

  await page.goto(`/resources/${id}`)
  const heading = page.getByRole('heading', { name: '数组基础', exact: true, level: 1 })
  await expect(heading).toBeVisible()

  // **正文在心得之前。** 断言 DOM 顺序，不是「两者都在页面上」——后者改版前也成立。
  const notes = page.getByRole('region', { name: '记录与理解' })
  expect(
    await heading.evaluate(
      (element, other) =>
        Boolean(element.compareDocumentPosition(other as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
      await notes.elementHandle(),
    ),
  ).toBe(true)

  // 正文在第一屏：标题的顶边落在视口高度以内。
  const box = await heading.boundingBox()
  const viewport = page.viewportSize()!
  expect(box!.y).toBeLessThan(viewport.height)

  // 上下文层不需要任何点击。
  await expect(page.getByRole('navigation', { name: '资料标签' })).toContainText(
    '阅读器改版 · 算法',
  )
  await expect(page.getByText('想搞清双指针')).toBeVisible()

  // 低频动作在 ⋯ 里，且能真的走到编辑资料。
  await page.getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('menuitem', { name: '编辑资料' }).click()
  await page.getByRole('button', { name: '编辑资料', exact: true }).click()
  await expect(page.getByRole('form', { name: '编辑资料表单' })).toBeVisible()

  // **焦点归还要在真实浏览器里验，不能只在 jsdom 里验。** 本任务已经两次栽在这类
  // 分歧上（伪元素的生成内容会进可访问名称；`pointerdown` 之后浏览器的默认聚焦动作
  // 会把手动归还覆盖掉）。`Esc` 这一支是实测成立的那一条，钉在这里。
  await page.getByRole('button', { name: '更多操作' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '编辑资料' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '更多操作' })).toBeFocused()

  // 窄屏只要求「不横向溢出、正文可读」；侧栏的窄屏形态属 TASK-045。
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`reader-${width}.png`), fullPage: true })
  }
})

test('the body reaches the first screen on a phone, not just on a desktop', async ({ page }) => {
  // **TASK-043 那条「正文落在第一屏」的断言跑在默认 1280×720 视口上，390px 下并不成立**
  // ——实测当时正文起点 867px 而视口只有 844px，正文一个字都不在第一屏。断言比它宣称
  // 守住的东西窄。这一条显式设两档视口，把窄屏也钉住。
  const { id } = await seed(page, 'B')
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.goto(`/resources/${id}`)
    const heading = page.getByRole('heading', { name: '数组基础', exact: true, level: 1 })
    await expect(heading).toBeVisible()
    const box = await heading.boundingBox()
    expect(box!.y, `正文首个标题在 ${width}px 下必须落在第一屏内`).toBeLessThan(height)
    // 页头块与开发阶段横幅都不该再出现在这一页。
    await expect(page.getByText('原始资料与自己的理解，各有一个位置。')).toHaveCount(0)
    await expect(page.getByText('网页、文件与粘贴资料已开放')).toHaveCount(0)
  }
})

test('the resource title is the page heading and takes focus on arrival', async ({ page }) => {
  const { id, title } = await seed(page, 'C')
  await page.goto('/resources')
  await page.getByRole('link', { name: title, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(id))
  // 路由切换后的焦点落点就是资料标题本身；读取中先落在占位标题上，数据到了要接过来。
  await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeFocused()
})

test('the sidebar collapses to icons and really gets narrower', async ({ page }) => {
  await page.goto('/resources')
  const sidebar = page.locator('.sidebar')
  const expanded = (await sidebar.boundingBox())!.width
  await page.getByRole('button', { name: '收起导航栏' }).click()
  await expect(page.getByRole('button', { name: '展开导航栏' })).toBeVisible()
  const collapsed = (await sidebar.boundingBox())!.width
  // **收益要用数值说话，不是靠截图看。**
  expect(collapsed).toBeLessThan(expanded * 0.6)
  // 折叠态下入口仍按名字取得到，且没有可见文字。
  const library = page.getByRole('link', { name: '资料库' })
  await expect(library).toBeVisible()
  expect((await library.textContent())?.trim()).toBe('')
  // 折叠态也不能横向溢出。
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})
