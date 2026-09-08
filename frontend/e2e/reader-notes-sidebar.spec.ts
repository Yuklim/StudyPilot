/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'

test.use({ timezoneId: 'Asia/Shanghai', trace: 'off' })

/**
 * 心得侧栏（TASK-045）的两档形态要在真实浏览器里数值断言：
 * 宽屏（≥1280px）是**挤压式两栏**——默认收起、正文满宽，点「心得」展开才让出右侧一列；
 * 窄屏是**盖在正文上的浮层**——正文宽度不被挤压，且展开时正文 `inert`。
 * 开合 + 聚焦一体、`Esc`/「收起」归还焦点、角标数量随新增实时更新都在这里验。
 */

async function call(page: Page, path: string, method = 'GET', body?: object, version?: number) {
  return page.evaluate(
    async ({ path, method, body, version }) => {
      const session = await fetch('/api/v1/local-session', {
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
      }).then((r) => r.json())
      const headers: Record<string, string> = { 'X-StudyPilot-Token': session.data.token }
      if (body) headers['Content-Type'] = 'application/json'
      if (version) headers['If-Match'] = `"${version}"`
      const response = await fetch('/api/v1' + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
      })
      return {
        status: response.status,
        body: response.status === 204 ? null : await response.json(),
      }
    },
    { path, method, body, version },
  )
}

/** 建一份带 `noteCount` 条已绑定心得的资料（心得从后端的真实取数来，不是 mock）。 */
async function seed(page: Page, suffix: string, noteCount: number) {
  await page.goto('/resources')
  // suffix 会带中文与空格，直接拼进 URL 会 422；用百分比编码保证它是合法 URL。
  const created = await call(page, '/resources', 'POST', {
    source_type: 'WEB',
    title: `心得侧栏 · ${suffix}`,
    source_url: `https://example.test/reader-notes-sidebar-${encodeURIComponent(suffix)}`,
  })
  expect(created.status).toBe(201)
  const id = created.body.data.id as string
  for (let i = 1; i <= noteCount; i++)
    expect(
      (await call(page, `/resources/${id}/notes`, 'POST', { content: `预置心得 ${i}` })).status,
    ).toBe(201)
  return { id }
}

const toggle = (page: Page) =>
  page.locator('.reader-toolbar').getByRole('button', { name: '心得', exact: true })
const notes = (page: Page) => page.locator('.reader-notes')
const main = (page: Page) => page.locator('.reader-main')

test('wide screen: notes are collapsed by default and squeeze the reading column only while open', async ({
  page,
}) => {
  const { id } = await seed(page, '宽屏 A', 2)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/resources/${id}`)

  // 默认收起：正文满宽、心得区不可见、心得按钮处于收起态；**角标在没开侧栏时就显示**。
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(notes(page)).toBeHidden()
  await expect(main(page)).toBeVisible()
  await expect(toggle(page)).toContainText('2')
  const closedWidth = (await main(page).boundingBox())!.width

  // 点「心得」＝展开并聚焦写作框；正文列让出右侧一列（340px 心得列 + 24px 缝隙）。
  await toggle(page).click()
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(notes(page)).toBeVisible()
  await expect(page.getByRole('textbox', { name: '这次想记下什么？' })).toBeFocused()
  const openWidth = (await main(page).boundingBox())!.width
  expect(closedWidth - openWidth).toBeGreaterThan(300)
  expect(closedWidth - openWidth).toBeLessThan(420)
  // 展开态正文也不横向溢出。
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  // 在侧栏里新增一条心得 → 角标实时从 2 变 3（数据来自侧栏自己的 total_items）。
  await page.getByRole('textbox', { name: '这次想记下什么？' }).fill('展开时记下的一条')
  await page.getByRole('button', { name: '保存心得', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('心得已保存')
  await expect(toggle(page)).toContainText('3')

  // Esc 收起并把焦点还给「心得」按钮，正文回到满宽。
  await page.keyboard.press('Escape')
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(notes(page)).toBeHidden()
  await expect(toggle(page)).toBeFocused()
  expect(Math.abs((await main(page).boundingBox())!.width - closedWidth)).toBeLessThanOrEqual(2)

  // 再开一次：刚才保存的那条已在列表里（写入真实后端）。
  await toggle(page).click()
  await expect(page.getByRole('list', { name: '心得列表' })).toContainText('展开时记下的一条')
  // **收起不丢未保存草稿**（条件 6）：写一句不保存，用「收起」收起再展开，草稿还在——
  // 这靠侧栏「收起时保持挂载、CSS 显隐」成立，卸载就会把草稿丢掉。
  await page.getByRole('textbox', { name: '这次想记下什么？' }).fill('这条还没保存的草稿')
  await page
    .getByRole('region', { name: '记录与理解' })
    .getByRole('button', { name: '收起', exact: true })
    .click()
  await expect(notes(page)).toBeHidden()
  await expect(toggle(page)).toBeFocused()
  await toggle(page).click()
  await expect(page.getByRole('textbox', { name: '这次想记下什么？' })).toHaveValue(
    '这条还没保存的草稿',
  )
  // 后端也确认新增落库，不是只在本地屏幕上。
  expect((await call(page, `/resources/${id}/notes`)).body.page.total_items).toBe(3)
})

test('narrow screen: notes float over the reading area without squeezing it, and the body is inert', async ({
  page,
}) => {
  const { id } = await seed(page, '窄屏 B', 1)
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto(`/resources/${id}`)
    await expect(notes(page)).toBeHidden()
    const closedWidth = (await main(page).boundingBox())!.width

    // 展开＝浮层：正文宽度不变（不挤压），正文容器 inert（Tab 进不去），焦点进写作框。
    await toggle(page).click()
    await expect(notes(page)).toBeVisible()
    await expect(page.getByRole('textbox', { name: '这次想记下什么？' })).toBeFocused()
    const openWidth = (await main(page).boundingBox())!.width
    expect(Math.abs(openWidth - closedWidth), '窄屏展开不该挤压正文').toBeLessThanOrEqual(2)
    expect(await main(page).evaluate((element) => element.hasAttribute('inert'))).toBe(true)
    // inert 是真的：直接 focus() 拿不走正文里首个真实可聚焦节点。种子没给快照时正文是
    // 空态（「粘贴正文」按钮）；给了快照时是正文区。两者都落在 `.reader-main` 里，按
    // 第一个可聚焦节点取，不依赖快照是否存在（取不到靶子就空过了，先断言它在）。
    const firstFocusable = main(page).locator('button:not([disabled]), [href], [tabindex]').first()
    await expect(firstFocusable).toHaveCount(1)
    const stolen = await firstFocusable.evaluate((element) => {
      ;(element as HTMLElement).focus()
      return document.activeElement === element
    })
    expect(stolen).toBe(false)
    // 浮层展开也不横向溢出。
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    // Esc 收起：正文不再 inert，焦点回「心得」按钮。
    await page.keyboard.press('Escape')
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(notes(page)).toBeHidden()
    await expect(toggle(page)).toBeFocused()
    expect(await main(page).evaluate((element) => element.hasAttribute('inert'))).toBe(false)
  }
})
