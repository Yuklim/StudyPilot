/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'

async function openOptionalFields(page: Page) {
  const summary = page.getByText('补充信息（选填）', { exact: true })
  const isOpen = await summary.evaluate(
    (element) => (element.closest('details') as HTMLDetailsElement).open,
  )
  if (!isOpen) await summary.click()
  await expect(page.getByLabel('保存原因（选填）')).toBeVisible()
}

/**
 * TASK-043 起粘贴原文在阅读器工具条的「粘贴原文」面板里，先点开才看得到。
 * 面板一次只开一个，重复点会收起，所以这里先看它在不在。
 */
async function openPasted(page: import('@playwright/test').Page) {
  const panel = page.getByRole('region', { name: '粘贴原文' })
  if (await panel.isVisible().catch(() => false)) return
  await page.getByRole('button', { name: '粘贴原文', exact: true }).click()
  await expect(panel).toBeVisible()
}

test('real UI saves WEB and PASTE, refreshes details, searches and safely reads originals', async ({
  page,
}, testInfo) => {
  const external: string[] = []
  let creates = 0
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== 'http://127.0.0.1:15173') external.push(url.origin)
    if (url.pathname === '/api/v1/resources' && request.method() === 'POST') creates++
  })
  await page.setViewportSize({ width: 1440, height: 1050 })
  await page.goto('/resources/new')
  await page.getByRole('button', { name: '保存到资料库' }).click()
  await expect(page.getByRole('alert')).toContainText('请填写')
  expect(creates).toBe(0)
  await page.reload()
  await page.getByLabel('标题', { exact: true }).fill('页面合成 · 一页阅读方法')
  await page.getByLabel('网页地址（必填）').fill('https://example.com/reading')
  await openOptionalFields(page)
  await page.getByLabel('来源名称（选填）').fill('合成书屋')
  await page.getByLabel('保存原因（选填）').fill('留一点时间，思考怎样把读过的内容变成自己的理解。')
  await page.screenshot({ path: testInfo.outputPath('desktop-web-form.png'), fullPage: true })
  await page.getByRole('button', { name: '保存到资料库' }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/resources\/[0-9a-f-]{36}$/)
  await expect(
    page.getByRole('heading', { name: '页面合成 · 一页阅读方法', level: 1 }),
  ).toBeVisible()
  expect(creates).toBe(1)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: '页面合成 · 一页阅读方法', level: 1 }),
  ).toBeVisible()
  const externalLink = page.getByRole('link', { name: /原网页/ })
  await expect(externalLink).toHaveAttribute('href', 'https://example.com/reading')
  await expect(externalLink).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(externalLink).toHaveAttribute('target', '_blank')
  await expect(externalLink).toHaveAttribute('referrerpolicy', 'no-referrer')
  // **阅读页没有左栏**（TASK-046：打开一份资料就是一整页文章），所以「添加资料」这个
  // 侧栏入口在这一屏够不着——先按阅读页唯一的出口回资料库。这不是绕路，正是那条出口
  // 在真实使用里的样子。
  await page.getByRole('link', { name: '返回资料库' }).click()
  await expect(page).toHaveURL(/\/resources$/)
  await page.getByRole('link', { name: '添加资料', exact: true }).click()
  await page.getByRole('radio', { name: /粘贴内容/ }).check()
  await page.getByLabel('标题', { exact: true }).fill('页面合成 · 写在页边的小记')
  const original =
    '  # 合成学习摘录\n慢慢积累，也是一种前进。\n<script>document.body.dataset.executed="yes"</script>\n<img src="https://example.com/tracker" onerror="alert(1)">\n '
  await page.getByLabel('粘贴原文（必填）').fill(original)
  await openOptionalFields(page)
  await page.getByLabel('保存原因（选填）').fill('先收藏，下一次再慢慢读。')
  await page.getByRole('button', { name: '保存到资料库' }).click()
  await openPasted(page)
  await expect(page.getByLabel('粘贴原文内容')).toBeVisible()
  expect(await page.getByLabel('粘贴原文内容').textContent()).toBe(original)
  expect(creates).toBe(2)
  await page.reload()
  await openPasted(page)
  await expect(page.getByLabel('粘贴原文内容')).toBeVisible()
  expect(await page.getByLabel('粘贴原文内容').textContent()).toBe(original)
  expect(await page.locator('body').getAttribute('data-executed')).toBeNull()
  await expect(page.locator('main img, main script, main iframe')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('desktop-paste-detail.png'), fullPage: true })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`mobile-${width}-detail.png`),
      fullPage: true,
    })
  }
  await page.getByRole('link', { name: '返回资料库' }).click()
  await page.getByLabel('搜索资料').fill('页面合成')
  await page.getByRole('button', { name: '搜索 / 应用筛选' }).click()
  await expect(page.getByText('共 2 份资料', { exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: '资料结果' }).getByRole('heading')).toHaveCount(2)
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1050 : 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`library-${width}.png`), fullPage: true })
  }
  await page.getByRole('button', { name: '列表', exact: true }).click()
  await expect(page.getByRole('list', { name: '资料结果' })).toHaveClass(/list/)
  await page.getByLabel('资料类型').selectOption('PASTE')
  await page.getByLabel('学习状态').selectOption('UNREAD')
  await page.getByLabel('排序').selectOption('title')
  await page.getByRole('button', { name: '搜索 / 应用筛选' }).click()
  await expect(page.getByText('共 1 份资料', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '页面合成 · 写在页边的小记' }).click()
  await openPasted(page)
  await expect(page.getByLabel('粘贴原文内容')).toBeVisible()
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
  expect(await page.context().cookies()).toEqual([])
  expect(external).toEqual([])
})

test('a WEB link can be saved without a title and stays untitled in the library', async ({
  page,
}) => {
  await page.goto('/resources/new')
  await page.getByLabel('网页地址（必填）').fill('https://example.com/quick-save')
  await page.getByRole('button', { name: '保存到资料库' }).click()
  await expect(page).toHaveURL(/\/resources\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: '未命名资料', level: 1 })).toBeVisible()
  const id = new URL(page.url()).pathname.split('/').pop()!
  await page.getByRole('link', { name: '返回资料库' }).click()
  await expect(page.locator(`a[href="/resources/${id}"]`)).toHaveText('未命名资料')
})

test('failed reads can be retried and uncertain saves do not replay or discard input', async ({
  page,
}) => {
  await page.route('**/api/v1/resources?*', (route) => route.abort())
  await page.goto('/resources')
  await expect(page.getByRole('alert')).toContainText('连接失败')
  await page.unroute('**/api/v1/resources?*')
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByRole('navigation', { name: '资料分页' })).toBeVisible()
  await page.getByRole('link', { name: '添加资料', exact: true }).click()
  await page.getByLabel('标题', { exact: true }).fill('合成失败输入')
  await page.getByLabel('网页地址（必填）').fill('https://example.com')
  let attempts = 0
  await page.route('**/api/v1/resources', async (route) => {
    if (route.request().method() === 'POST') {
      attempts++
      await route.abort()
    } else await route.continue()
  })
  await page.getByRole('button', { name: '保存到资料库' }).click()
  await expect(page.getByRole('alert')).toContainText('保存结果尚未确认')
  await expect(page.getByLabel('标题', { exact: true })).toHaveValue('合成失败输入')
  await expect(page.getByRole('button', { name: '保存到资料库' })).toBeEnabled()
  expect(attempts).toBe(1)
  await page.goto('/resources/00000000-0000-4000-8000-000000000000')
  await expect(page.getByRole('alert')).toContainText('没有找到这份资料')
})

test('real pagination retains search and order and is keyboard operable', async ({ page }) => {
  await page.goto('/')
  // Seed this scenario through the real approved client, in the isolated test DB.
  await page.evaluate(async () => {
    const modulePath = '/src/api/client.ts'
    const { api } = await import(modulePath)
    for (let i = 1; i <= 21; i++) {
      await api.request('/api/v1/resources', {
        method: 'POST',
        body: {
          source_type: 'WEB',
          title: `分页合成 ${String(i).padStart(2, '0')}`,
          source_url: 'https://example.com/pagination',
        },
      })
    }
  })
  await page.goto('/resources')
  await page.getByLabel('搜索资料').fill('分页合成')
  await page.getByLabel('排序').selectOption('title')
  await page.getByRole('button', { name: '搜索 / 应用筛选' }).click()
  await expect(page.getByText('共 21 份资料', { exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: '资料结果' }).getByRole('heading')).toHaveCount(20)
  await page.getByRole('button', { name: '下一页' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('link', { name: '分页合成 21' })).toBeVisible()
  await expect(page.getByRole('list', { name: '资料结果' }).getByRole('heading')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '下一页' })).toBeDisabled()
  await page.getByRole('button', { name: '上一页' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('link', { name: '分页合成 01' })).toBeVisible()
  await expect(page.getByRole('button', { name: '上一页' })).toBeDisabled()
})

test('a tag created while saving becomes a clickable filter that survives reload and Back', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const name = '就地新建 · ' + Date.now()

  await page.goto('/resources/new')
  await page.getByLabel('标题', { exact: true }).fill('带新标签的资料')
  await page.getByLabel('网页地址（必填）').fill('https://example.com/inline-tag')
  await page.getByRole('button', { name: '选择主题与标签（选填）' }).click()
  await page.getByLabel('新建标签').fill(name)
  await page.getByRole('button', { name: '新建并选用' }).click()
  // Created and selected in place: the half-written form is still standing.
  await expect(page.getByRole('button', { name: `移除已选标签 ${name} ×` })).toBeVisible()
  await expect(page.getByLabel('标题', { exact: true })).toHaveValue('带新标签的资料')
  await page.getByRole('button', { name: '保存到资料库' }).click()
  await expect(page.getByRole('heading', { name: '带新标签的资料' })).toBeVisible()

  await page.goto('/resources')
  await page.getByRole('link', { name, exact: true }).first().click()
  await expect(page).toHaveURL(/\/resources\?tag_id=[0-9a-f-]{36}$/)
  const filtered = page.getByRole('list', { name: '资料结果' })
  await expect(filtered.getByRole('heading', { name: '带新标签的资料' })).toBeVisible()
  await expect(page.getByRole('button', { name: `移除已选标签 ${name} ×` })).toBeVisible()

  const address = page.url()
  await page.reload()
  await expect(page).toHaveURL(address)
  await expect(filtered.getByRole('heading', { name: '带新标签的资料' })).toBeVisible()
  await expect(page.getByRole('button', { name: `移除已选标签 ${name} ×` })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/resources$/)
  await expect(page.getByText('已选 0 个标签')).toBeVisible()
  expect(errors).toEqual([])
})

test('a web resource can keep a pasted snapshot of its text alongside the link', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const suffix = String(Date.now())
  const body = `# 冻结正文 ${suffix}\n\n第一段。\n\n\`\`\`py\nprint('x')\n\`\`\`\n`

  await page.goto('/resources/new')
  await page.getByLabel('标题', { exact: true }).fill('带快照的资料 ' + suffix)
  await page.getByLabel('网页地址（必填）').fill('https://example.com/snapshot')
  await page.getByRole('button', { name: '保存到资料库' }).click()
  await expect(page.getByRole('heading', { name: '带快照的资料 ' + suffix })).toBeVisible()

  const section = page.getByRole('region', { name: '正文快照' })
  await expect(section).toContainText('还没有保存正文')
  await section.getByRole('button', { name: '粘贴正文' }).click()
  await page.getByLabel('正文（Markdown）').fill(body)
  await section.getByRole('button', { name: '保存正文' }).click()
  // TASK-046 删掉了「保存于… · 共 N 字 · 来源标识 … · 第 N 版」那行元信息（用户两次指出
  // 它没有用），所以「写进去了」的信号改为**渲染后的正文里看得见这段文字**。
  await expect(section.locator('.snapshot-rendered')).toContainText('冻结正文 ' + suffix)
  await expect(section).not.toContainText('来源标识')
  await expect(section).not.toContainText('这是保存当时的副本')
  // TASK-042 起默认展示的是**渲染后**的正文，不再是 `<pre>` 源码；TASK-046 起切换入口
  // 在工具条的 `⋯` 菜单里（正文页面上不再有任何按钮）。
  const fromMenu = async (name: string) => {
    await page.getByRole('button', { name: '更多操作' }).click()
    await page.getByRole('menuitem', { name }).click()
  }
  await fromMenu('看 Markdown 源码')
  await expect(section.locator('pre.snapshot-body')).toContainText('冻结正文 ' + suffix)
  await fromMenu('看渲染后的正文')
  await expect(section.locator('.snapshot-rendered')).toBeVisible()

  // The whole point of the shape: frozen text and the original link coexist.
  await expect(page.getByRole('link', { name: /原网页/ })).toHaveAttribute(
    'href',
    'https://example.com/snapshot',
  )
  await page.reload()
  // 刷新后回到渲染视图（源码/渲染的切换不持久，这是有意的：默认展示可读的那一面）。
  // 这一行守的是「刷新后正文还在」，所以断言渲染视图即可。
  await expect(section.locator('.snapshot-rendered')).toContainText('冻结正文 ' + suffix)

  // 删除正文现在先确认再删（它从正文下方搬进了 `⋯` 菜单，与普通动作只隔一条分隔线）。
  await fromMenu('删除正文…')
  await expect(section.getByRole('button', { name: '确认删除正文' })).toBeVisible()
  await section.getByRole('button', { name: '确认删除正文' }).click()
  await expect(section).toContainText('还没有保存正文')
  // Dropping the snapshot leaves the resource itself untouched.
  await expect(page.getByRole('heading', { name: '带快照的资料 ' + suffix })).toBeVisible()
  expect(errors).toEqual([])
})

test('resources can be deleted from the library, one or several at a time, through the real backend', async ({
  page,
}) => {
  // TASK-056（用户 2026-09-12 选定）：删除是模态弹窗、两次点击、资料库里就能删（单个 + 多选）。
  // 真实后端：预览取一次性令牌 → 持令牌删除；这里只看用户看得见的结果与后端的 404。
  await page.goto('/')
  const ids = await page.evaluate(async () => {
    const modulePath = '/src/api/client.ts'
    const { api } = await import(modulePath)
    const out: string[] = []
    for (const name of ['删除合成 甲', '删除合成 乙', '删除合成 丙']) {
      const created = (await api.request('/api/v1/resources', {
        method: 'POST',
        body: { source_type: 'WEB', title: name, source_url: 'https://example.com/delete' },
      })) as { data: { id: string } }
      out.push(created.data.id)
    }
    // 甲有两条心得：弹窗要把它们的数量报出来。
    for (const content of ['心得一', '心得二'])
      await api.request(`/api/v1/resources/${out[0]}/notes`, { method: 'POST', body: { content } })
    return out
  })
  await page.goto('/resources')
  await page.getByLabel('搜索资料').fill('删除合成')
  await page.getByRole('button', { name: '搜索 / 应用筛选' }).click()
  await expect(page.getByText('共 3 份资料', { exact: true })).toBeVisible()

  // 单个：每份资料旁的删除按钮 → 弹窗 → 删除。
  await page.getByRole('button', { name: '删除 删除合成 丙' }).click()
  const single = page.getByRole('dialog', { name: '删除“删除合成 丙”？' })
  await expect(single).toBeVisible()
  await expect(single.getByText('删除后不可恢复。')).toBeVisible()
  await expect(single.getByText(/心得会一起删除/)).toHaveCount(0)
  await single.getByRole('button', { name: '删除' }).click()
  await expect(single).toHaveCount(0)
  await expect(page.getByText('共 2 份资料', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '删除合成 丙' })).toHaveCount(0)

  // 多选：勾两份 → 删除所选 → 一次确认（心得数是两份之和）。
  await page.getByRole('checkbox', { name: '选择 删除合成 甲' }).check()
  await page.getByRole('checkbox', { name: '选择 删除合成 乙' }).check()
  await expect(page.getByText('已选 2 份')).toBeVisible()
  await page.getByRole('button', { name: '删除所选' }).click()
  const multi = page.getByRole('dialog', { name: '删除 2 份资料？' })
  await expect(multi).toBeVisible()
  await expect(multi.getByText('这些资料的 2 条心得会一起删除。')).toBeVisible()
  // 模态：弹窗外的页面不可聚焦（inert），Tab 不会溜出去。
  await expect(multi.getByRole('button', { name: '取消' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  expect(
    await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))),
  ).toBe(true)
  await multi.getByRole('button', { name: '删除' }).click()
  await expect(multi).toHaveCount(0)
  await expect(page.getByText('共 0 份资料', { exact: true })).toBeVisible()

  // 后端确实删了：三份都 404，令牌从未出现在页面上。
  const statuses = await page.evaluate(async (list) => {
    const modulePath = '/src/api/client.ts'
    const { api, ApiError } = await import(modulePath)
    const out: number[] = []
    for (const id of list) {
      try {
        await api.request(`/api/v1/resources/${id}`)
        out.push(200)
      } catch (e: unknown) {
        out.push(e instanceof ApiError ? ((e as { status?: number }).status ?? -1) : -1)
      }
    }
    return out
  }, ids)
  expect(statuses).toEqual([404, 404, 404])
})

test('the reader page deletes in two clicks and returns to the library', async ({ page }) => {
  await page.goto('/')
  const id = await page.evaluate(async () => {
    const modulePath = '/src/api/client.ts'
    const { api } = await import(modulePath)
    const created = (await api.request('/api/v1/resources', {
      method: 'POST',
      body: { source_type: 'WEB', title: '删除合成 详情页', source_url: 'https://example.com/d' },
    })) as { data: { id: string } }
    return created.data.id
  })
  await page.goto(`/resources/${id}`)
  await expect(page.getByRole('heading', { name: '删除合成 详情页', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('menuitem', { name: '删除资料…' }).click()
  const dialog = page.getByRole('dialog', { name: '删除“删除合成 详情页”？' })
  await expect(dialog).toBeVisible()
  // 旧流程的「删除这份资料」中间步骤没有了。
  await expect(page.getByRole('button', { name: '删除这份资料' })).toHaveCount(0)
  await dialog.getByRole('button', { name: '删除' }).click()
  await expect(page).toHaveURL(/\/resources$/)
  await expect(page.getByRole('heading', { name: '资料库', level: 1 })).toBeVisible()
})
