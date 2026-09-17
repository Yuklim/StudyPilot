/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'

test.use({ timezoneId: 'Asia/Shanghai', trace: 'off' })

// TASK-045 起阅读器的写作区是**默认收起的右侧心得区**：资料详情页刚打开时它不在可访问
// 树里（CSS `display:none`，组件仍挂载）。这些流程第一步都是「心得区得可见」，所以统一
// 从这里进：点工具条「心得」= 展开并聚焦写作框（心得按钮＝开合 + 聚焦一体）。
async function openNotes(page: Page) {
  await page.locator('.reader-toolbar').getByRole('button', { name: '心得', exact: true }).click()
  await expect(page.getByRole('form', { name: '心得编辑' })).toBeVisible()
}
async function createResource(page: Page, title: string) {
  await page.goto('/resources/new')
  await page.getByLabel('标题').fill(title)
  await page.getByLabel('网页地址（必填）').fill('https://example.com/quick-notes')
  await page.getByRole('button', { name: '保存到资料库' }).click()
  await expect(page).toHaveURL(/\/resources\/[0-9a-f-]{36}$/)
  await openNotes(page)
  await expect(page.getByText('还没有心得，写下一句话就可以开始。')).toBeVisible()
  return page.url().split('/').at(-1)!
}

// Same-origin calls to the isolated real test backend. Credentials never leave this closure.
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

test('quick notes save, reopen, edit and delete without learning paperwork; responsive and keyboard usable', async ({
  page,
}, testInfo) => {
  let studyWrites = 0
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/study-records')) studyWrites++
  })
  const id = await createResource(page, '随手心得 · 留下一点理解')
  const original = await call(page, '/resources/' + id)
  const form = page.getByRole('form', { name: '心得编辑' })
  await expect(form.getByRole('textbox')).toHaveCount(1)
  await expect(form.locator('input,select')).toHaveCount(0)
  for (const label of ['学习开始时间', '本次时长（秒）', '学习后状态', '学习后进度（%）'])
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0)
  const content =
    '懂了一点：先提出问题，再回到原文找依据。\n<script>document.body.dataset.executed="yes"</script>'
  await form.getByRole('textbox').fill(content)
  await form.getByRole('button', { name: '保存心得', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(form.getByRole('status')).toContainText('心得已保存')
  await expect(page.getByRole('list', { name: '心得列表' })).toContainText(content)
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1050 : 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`quick-notes-${width}.png`), fullPage: true })
  }
  await page.reload()
  await openNotes(page) // 刷新后心得区回到默认收起
  const list = page.getByRole('list', { name: '心得列表' })
  await expect(list.locator('li')).toHaveCount(1)
  await expect(list).toContainText(content)
  expect(await page.evaluate(() => document.body.dataset.executed)).toBeUndefined()
  await list.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(form.getByRole('textbox')).toHaveValue(content)
  await form.getByRole('textbox').fill('补充：把自己的理解与原文分开放。')
  await form.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(form.getByRole('status')).toContainText('心得已保存')
  await expect(list).toContainText('补充：把自己的理解与原文分开放。')
  await expect(list).toContainText('更新于')
  await list.getByRole('button', { name: '删除', exact: true }).click()
  await expect(form.getByRole('button', { name: '确认删除心得' })).toBeDisabled()
  await form.getByRole('checkbox', { name: '我确认永久删除上方这条心得' }).check()
  await form.getByRole('button', { name: '确认删除心得' }).click()
  await expect(form.getByRole('status')).toContainText('这条心得已删除')
  await expect(page.getByText('还没有心得，写下一句话就可以开始。')).toBeVisible()
  const after = await call(page, '/resources/' + id)
  expect(after.body.data).toEqual(original.body.data)
  const history = await call(page, '/resources/' + id + '/study-records')
  expect(history.body.page.total_items).toBe(0)
  expect(studyWrites).toBe(0)
  expect(errors).toEqual([])
})

test('real concurrent edits and deletes retain the draft and require latest-version confirmation', async ({
  page,
}) => {
  const id = await createResource(page, '随手心得 · 多处编辑')
  const form = page.getByRole('form', { name: '心得编辑' })
  await form.getByRole('textbox').fill('初稿')
  await form.getByRole('button', { name: '保存心得', exact: true }).click()
  const list = page.getByRole('list', { name: '心得列表' })
  await expect(list.locator('li')).toHaveCount(1)
  const saved = (await call(page, '/resources/' + id + '/notes')).body.data[0]
  const path = `/resources/${id}/notes/${saved.id}`
  await list.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(form.getByRole('textbox')).toHaveValue('初稿')
  await form.getByRole('textbox').fill('本页不能丢的草稿')
  expect(
    (await call(page, path, 'PATCH', { expected_version: 1, content: '另一处的更新' })).status,
  ).toBe(200)
  await form.getByRole('button', { name: '保存修改' }).click()
  await expect(form.getByRole('alert')).toContainText('操作结果需要核对')
  await expect(form.getByRole('textbox')).toHaveValue('本页不能丢的草稿')
  await expect(form.getByRole('button', { name: '保存修改' })).toBeDisabled()
  await form.getByRole('button', { name: '保留草稿，读取最新心得' }).click()
  await expect(form.getByRole('region', { name: '最新已保存内容' })).toContainText('另一处的更新')
  await form.getByRole('checkbox', { name: '我已核对最新心得，确认仍需保存当前草稿' }).check()
  await form.getByRole('button', { name: '保存修改' }).click()
  await expect(form.getByRole('status')).toContainText('心得已保存')
  await expect(list).toContainText('本页不能丢的草稿')
  await list.getByRole('button', { name: '删除', exact: true }).click()
  await expect(form.getByText('删除这条心得？')).toBeVisible()
  expect(
    (await call(page, path, 'PATCH', { expected_version: 3, content: '删除前又改了一次' })).status,
  ).toBe(200)
  await form.getByRole('checkbox', { name: '我确认永久删除上方这条心得' }).check()
  await form.getByRole('button', { name: '确认删除心得' }).click()
  await expect(form.getByRole('alert')).toContainText('操作结果需要核对')
  await form.getByRole('button', { name: '保留草稿，读取最新心得' }).click()
  await expect(form).toContainText('删除前又改了一次')
  await expect(form.getByRole('button', { name: '确认删除心得' })).toBeDisabled()
  await form.getByRole('checkbox', { name: '我确认永久删除上方这条心得' }).check()
  await form.getByRole('button', { name: '确认删除心得' }).click()
  await expect(form.getByRole('status')).toContainText('这条心得已删除')
})

test('uncertain response never replays writes and latest-list evidence survives refresh errors', async ({
  page,
}) => {
  const id = await createResource(page, '随手心得 · 断网不重复')
  const form = page.getByRole('form', { name: '心得编辑' })
  let writes = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/resources/${id}/notes`)) writes++
  })
  // The real backend commits; only the response is lost.
  await page.evaluate((id) => {
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init)
      if (
        typeof input === 'string' &&
        input.endsWith(`/resources/${id}/notes`) &&
        init?.method === 'POST' &&
        response.status === 201
      )
        throw new TypeError('Synthetic response loss after a real committed write')
      return response
    }
  }, id)
  await form.getByRole('textbox').fill('已经送出但响应丢失的心得')
  await form.getByRole('button', { name: '保存心得', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('操作结果需要核对')
  await expect(form.getByRole('button', { name: '保存心得', exact: true })).toBeDisabled()
  await expect(form.getByRole('textbox')).toHaveValue('已经送出但响应丢失的心得')
  await form.getByRole('button', { name: '保留草稿，读取最新心得' }).click()
  await expect(form.getByRole('region', { name: '刚读取的最新心得' })).toContainText(
    '已经送出但响应丢失的心得',
  )
  expect(writes).toBe(1)
  expect((await call(page, '/resources/' + id + '/notes')).body.page.total_items).toBe(1)
  await page.context().setOffline(true)
  await form.getByRole('button', { name: '保留草稿，读取最新心得' }).click()
  await expect(form.getByRole('alert')).toContainText('无法连接本机服务')
  await expect(form.getByRole('button', { name: '保存心得', exact: true })).toBeDisabled()
  await page.context().setOffline(false)
  expect(writes).toBe(1)
})

test('real note pages keep drafts when paging, and legacy history remains reachable', async ({
  page,
}) => {
  const id = await createResource(page, '随手心得 · 继续翻页')
  for (let i = 1; i <= 21; i++) {
    expect(
      (await call(page, `/resources/${id}/notes`, 'POST', { content: '合成心得 ' + i })).status,
    ).toBe(201)
  }
  await page.reload()
  await openNotes(page) // 刷新后心得区回到默认收起
  const list = page.getByRole('list', { name: '心得列表' })
  await expect(list.locator('li')).toHaveCount(20)
  await page.getByRole('textbox', { name: '这次想记下什么？' }).fill('翻页也要留着的草稿')
  await page.getByRole('button', { name: '下一页心得' }).click()
  await expect(list.locator('li')).toHaveCount(1)
  await expect(page.getByRole('textbox', { name: '这次想记下什么？' })).toHaveValue(
    '翻页也要留着的草稿',
  )
  await expect(page.getByRole('button', { name: '下一页心得' })).toBeDisabled()
  expect((await call(page, '/tags', 'POST', { name: '000心得草稿保全' })).status).toBe(201)
  // TASK-043 起编辑标签在阅读器工具条的 ⋯ 菜单里；改完标签面板不再被刷新掀掉，
  // 所以这里看常驻标签行有没有跟着变，而不是看面板有没有折叠回按钮。
  await page.getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('menuitem', { name: '编辑标签' }).click()
  await page.getByRole('button', { name: '管理这份资料的标签' }).click()
  await page.getByRole('button', { name: '添加标签 000心得草稿保全' }).click()
  // TASK-067 起标签行在右栏「信息」Tab；心得侧栏此时已开着（草稿正在里面）。
  await page.getByRole('tab', { name: '信息' }).click()
  await expect(
    page.getByRole('navigation', { name: '资料标签' }).getByText('000心得草稿保全'),
  ).toBeVisible()
  await page.getByRole('tab', { name: '心得' }).click()
  // 这才是本条要守的东西：改标签这一串操作不能把心得草稿冲掉。
  await expect(page.getByRole('textbox', { name: '这次想记下什么？' })).toHaveValue(
    '翻页也要留着的草稿',
  )
  // 学习状态改由工具条上的徽章进入，且**直接落在状态表单上**（用户选「点开即改」）。
  await page.getByRole('button', { name: '未开始 · 0%' }).click()
  await expect(page.getByLabel('学习后状态')).toBeVisible()
  await expect(page.getByRole('heading', { name: '这一页还没有学习记录' })).toBeVisible()
})

test('top-level notes page manages standalone notes: write, list, preview, edit, delete', async ({
  page,
}) => {
  // TASK-061：「我的心得」是独立心得的管理 + 预览页（备忘录式两栏）；写与改都进整页编辑器。
  // 契约断言原样保留：独立列表计数、编辑后列表内容、删除后计数为 0。
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/notes')
  await expect(page.getByRole('heading', { name: '我的心得', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: '还没有独立心得' })).toBeVisible()
  await expect(page.getByRole('form', { name: '心得编辑' })).toHaveCount(0)
  // TASK-062：页内不再有写入口（用户「做成心得查询即可」）；写走侧栏「写心得」/ ⌘J。
  await expect(page.getByRole('main').getByRole('link', { name: /写心得|写一条/ })).toHaveCount(0)

  // 写：侧栏「写心得」→ 整页编辑器 → 自动保存 → 返回。
  await page
    .getByRole('complementary', { name: '学习空间导航' })
    .getByRole('link', { name: '写心得' })
    .click()
  await expect(page).toHaveURL(/\/notes\/new$/)
  const editor = page.getByRole('textbox', { name: '心得正文（Markdown）' })
  await editor.fill('# 不先收藏资料也能记下的想法\n\n第一段正文。')
  await expect(page.getByRole('status')).toContainText('已保存', { timeout: 5000 })
  await page.getByRole('link', { name: '返回我的心得' }).click()
  const list = page.getByRole('list', { name: '心得列表' })
  await expect(list.locator('li')).toHaveCount(1)
  await expect(list).toContainText('不先收藏资料也能记下的想法')
  await expect(list).toContainText('第一段正文。')
  expect((await call(page, '/notes')).body.page.total_items).toBe(1)

  // 预览：选中写进网址、右栏渲染。
  await list.getByRole('link', { name: /不先收藏资料/ }).click()
  await expect(page).toHaveURL(/\/notes\?note=[0-9a-f-]{36}$/)
  const preview = page.getByRole('article', { name: '心得预览' })
  await expect(preview.getByRole('heading', { name: '不先收藏资料也能记下的想法' })).toBeVisible()
  await expect(preview).toContainText('第一段正文。')
  await page.reload()
  await expect(page.getByRole('article', { name: '心得预览' })).toBeVisible()

  // 编辑：进整页编辑器改，回来列表已更新。
  await preview.getByRole('link', { name: '编辑' }).click()
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/)
  await editor.fill('# 补充的独立心得\n\n改过的正文。')
  await expect(page.getByRole('status')).toContainText('已保存', { timeout: 5000 })
  await page.getByRole('link', { name: '返回我的心得' }).click()
  await expect(list).toContainText('补充的独立心得')
  await expect(list).not.toContainText('不先收藏资料')

  // 搜索只在前端过滤。
  await page.getByRole('searchbox', { name: '搜索心得' }).fill('没有这个词')
  await expect(page.getByText(/没有包含「没有这个词」/)).toBeVisible()
  await page.getByRole('searchbox', { name: '搜索心得' }).fill('')

  // 删除：预览里一次确认。
  await list.getByRole('link', { name: /补充的独立心得/ }).click()
  await page
    .getByRole('article', { name: '心得预览' })
    .getByRole('button', { name: '删除' })
    .click()
  await page
    .getByRole('dialog', { name: /^删除“补充的独立心得”/ })
    .getByRole('button', { name: '删除' })
    .click()
  await expect(page.getByRole('heading', { name: '还没有独立心得' })).toBeVisible()
  expect((await call(page, '/notes')).body.page.total_items).toBe(0)
})

test('deleting a resource cascades only its own notes and leaves standalone notes intact', async ({
  page,
}) => {
  const id = await createResource(page, '独立心得隔离 · 删除测试')
  // Attach one note to the resource.
  const form = page.getByRole('form', { name: '心得编辑' })
  await form.getByRole('textbox').fill('这条会随资料一起删除')
  await form.getByRole('button', { name: '保存心得', exact: true }).click()
  await expect(page.getByRole('list', { name: '心得列表' })).toContainText('这条会随资料一起删除')
  // Add a standalone note through the full-page editor (TASK-061: the notes page itself
  // no longer has a composer). Clear leftovers first so the count below is this test's own.
  await page.goto('/notes')
  for (const note of (await call(page, '/notes')).body.data)
    expect((await call(page, `/notes/${note.id}`, 'DELETE', undefined, note.version)).status).toBe(
      204,
    )
  await page.goto('/notes/new')
  await page.getByRole('textbox', { name: '心得正文（Markdown）' }).fill('这条独立心得要留下')
  await expect(page.getByRole('status')).toContainText('已保存', { timeout: 5000 })
  await page.goto('/notes')
  expect((await call(page, '/notes')).body.page.total_items).toBe(1)

  // Preview then confirm deletion of the resource through the API.
  const preview = (await call(page, `/resources/${id}/deletion-preview`, 'POST')).body.data
  expect(preview.impact.note_count).toBe(1) // only the attached note counts
  expect(
    await page.evaluate(
      async ({ path, token }) => {
        const session = await fetch('/api/v1/local-session', {
          mode: 'cors',
          cache: 'no-store',
          credentials: 'omit',
        }).then((r) => r.json())
        const headers: Record<string, string> = {
          'X-StudyPilot-Token': session.data.token,
          'X-StudyPilot-Deletion-Token': token,
        }
        const response = await fetch('/api/v1' + path, {
          method: 'DELETE',
          headers,
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
        })
        return response.status
      },
      { path: `/resources/${id}`, token: preview.confirmation_token },
    ),
  ).toBe(204)

  // The standalone note is still there; the resource and its note are gone.
  await page.reload()
  await expect(page.getByRole('list', { name: '心得列表' })).toContainText('这条独立心得要留下')
  expect((await call(page, '/notes')).body.page.total_items).toBe(1)
  expect((await call(page, `/resources/${id}/notes`)).status).toBe(404)
})

test('standalone note attaches to a resource and detaches back through the real UI', async ({
  page,
}) => {
  const title = '随笔资料 · 后贴往返'
  const standaloneNote = '先独立记下，再后贴到资料'
  const id = await createResource(page, title)
  // Remove any standalone notes left by earlier tests so this test is self-contained.
  await page.goto('/notes')
  const leftover = (await call(page, '/notes')).body.data
  for (const note of leftover)
    expect((await call(page, `/notes/${note.id}`, 'DELETE', undefined, note.version)).status).toBe(
      204,
    )
  await page.reload()
  await expect(page.getByRole('heading', { name: '还没有独立心得' })).toBeVisible()
  // TASK-061：独立心得在整页编辑器里写，在「我的心得」预览里后贴。
  await page
    .getByRole('complementary', { name: '学习空间导航' })
    .getByRole('link', { name: '写心得' })
    .click()
  await page.getByRole('textbox', { name: '心得正文（Markdown）' }).fill(standaloneNote)
  await expect(page.getByRole('status')).toContainText('已保存', { timeout: 5000 })
  await page.getByRole('link', { name: '返回我的心得' }).click()
  const list = page.getByRole('list', { name: '心得列表' })
  await expect(list).toContainText(standaloneNote)
  expect((await call(page, '/notes')).body.page.total_items).toBe(1)

  await list.getByRole('link', { name: new RegExp(standaloneNote.slice(0, 6)) }).click()
  const preview = page.getByRole('article', { name: '心得预览' })
  await preview.getByRole('button', { name: '后贴到资料', exact: true }).click()
  await page.getByLabel('资料标题关键词').fill(title)
  await page.getByRole('button', { name: '搜索资料', exact: true }).click()
  await page.getByRole('button', { name: `后贴到《${title}》`, exact: true }).click()
  const attached = page.getByText(/已后贴到资料/)
  await expect(attached).toBeVisible()
  const openLink = page.getByRole('link', { name: `打开《${title}》查看` })
  await expect(openLink).toHaveAttribute('href', `/resources/${id}`)
  // The standalone list refreshes at once: it was the only standalone note, so the empty
  // state shows up while the notice stays.
  await expect(page.getByRole('heading', { name: '还没有独立心得' })).toBeVisible()
  await expect(list).toHaveCount(0)
  await expect(attached).toBeVisible()
  expect((await call(page, '/notes')).body.page.total_items).toBe(0)

  // Open the resource detail from the notice; the note now lives under the resource.
  await openLink.click()
  await expect(page).toHaveURL(new RegExp(`/resources/${id}$`))
  await openNotes(page) // 详情页的心得区默认收起
  const boundList = page.getByRole('list', { name: '心得列表' })
  await expect(boundList).toContainText(standaloneNote)
  expect((await call(page, `/resources/${id}/notes`)).body.page.total_items).toBe(1)
  // TASK-062：绑定心得卡上有「整页编辑」，去编辑页并带着这份资料作为返回处。
  const fullPage = boundList.getByRole('link', { name: '整页编辑' })
  await expect(fullPage).toHaveAttribute('href', new RegExp(`^/notes/[0-9a-f-]+\\?resource=${id}$`))
  await fullPage.click()
  await expect(page.getByRole('textbox', { name: '心得正文（Markdown）' })).toHaveValue(
    standaloneNote,
  )
  await page.getByRole('link', { name: '返回资料' }).click()
  await expect(page).toHaveURL(new RegExp(`/resources/${id}$`))
  await openNotes(page)

  // Detach it back to standalone from the bound list, confirming the dialog.
  page.once('dialog', (dialog) => void dialog.accept())
  await boundList.getByRole('button', { name: '解除绑定', exact: true }).click()
  const boundEditor = page.getByRole('form', { name: '心得编辑' })
  const detached = boundEditor.getByRole('status')
  await expect(detached).toContainText('已解除为独立心得')
  await expect(boundList).not.toContainText(standaloneNote)
  expect((await call(page, `/resources/${id}/notes`)).body.page.total_items).toBe(0)

  // Following the notice back to 我的心得, the note is standalone once more.
  await detached.getByRole('link', { name: '去「我的心得」查看' }).click()
  await expect(page).toHaveURL(/\/notes$/)
  await expect(page.getByRole('list', { name: '心得列表' })).toContainText(standaloneNote)
  expect((await call(page, '/notes')).body.page.total_items).toBe(1)
})

test('the full-page note editor: shortcut, autosave, reload, preview, delete', async ({ page }) => {
  // TASK-060（用户 2026-09-14「像备忘录 / Typora 那样的编辑页面」，Markdown 选 B）。真实后端。
  await page.goto('/resources')
  await page.waitForSelector('.resource-filters')
  // ⌘J（headless Chromium 报 MacIntel）→ 新建独立心得，焦点直接在写作框。
  await page.keyboard.press('Meta+j')
  await expect(page).toHaveURL(/\/notes\/new$/)
  const editor = page.getByRole('textbox', { name: '心得正文（Markdown）' })
  await expect(editor).toBeFocused()
  await expect(page.getByRole('heading', { name: '新心得', level: 1 })).toBeVisible()
  // 沉浸式：没有左栏，出口是「返回我的心得」。
  await expect(page.locator('.sidebar')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '返回我的心得' })).toBeVisible()
  await editor.fill('# 编辑器合成 · 首行\n\n先分清状态的性质。\n\n- **本地状态**：用 `useState`\n')
  // 停笔 → 自动保存 → 地址换成这条心得；标题跟第一行走。
  await expect(page.getByRole('status')).toContainText('已保存', { timeout: 5000 })
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: '编辑器合成 · 首行', level: 1 })).toBeVisible()
  const address = page.url()
  // 预览：Markdown 渲染、脚本转义、标题不重复。
  await editor.fill(
    '# 编辑器合成 · 首行\n\n先分清状态的性质。\n\n- **本地状态**：用 `useState`\n\n<script>alert(1)</script>\n',
  )
  await page.getByRole('button', { name: '预览' }).click()
  const preview = page.getByLabel('预览')
  await expect(preview.locator('strong')).toHaveText('本地状态')
  await expect(preview.locator('h1')).toHaveCount(0)
  expect(await preview.locator('script').count()).toBe(0)
  await expect(preview).toContainText('<script>alert(1)</script>')
  await page.getByRole('button', { name: '编辑' }).click()
  // 刷新还在（切换预览时已保存）。
  await page.reload()
  await expect(page.getByRole('textbox', { name: '心得正文（Markdown）' })).toHaveValue(
    /alert\(1\)/,
  )
  // 出现在「我的心得」列表里。
  await page.getByRole('link', { name: '返回我的心得' }).click()
  await expect(page.getByRole('heading', { name: '我的心得', level: 1 })).toBeVisible()
  await expect(page.getByText('编辑器合成 · 首行', { exact: false }).first()).toBeVisible()
  // 回到编辑页删除 → 回到「我的心得」，列表里没了。
  await page.goto(address)
  await page.getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('menuitem', { name: '删除心得…' }).click()
  await page
    .getByRole('dialog', { name: /^删除“编辑器合成/ })
    .getByRole('button', { name: '删除' })
    .click()
  await expect(page).toHaveURL(/\/notes$/)
  await expect(page.getByText('编辑器合成 · 首行', { exact: false })).toHaveCount(0)
  // 侧栏「写心得」入口也在。
  await expect(
    page.getByRole('complementary', { name: '学习空间导航' }).getByRole('link', { name: '写心得' }),
  ).toHaveAttribute('href', '/notes/new')
})

test('a note started from the reader is bound to that resource', async ({ page }) => {
  const id = await createResource(page, '编辑器合成 · 绑定资料')
  await page.keyboard.press('Meta+j')
  await expect(page).toHaveURL(new RegExp(`/notes/new\\?resource=${id}$`))
  await expect(page.getByRole('link', { name: '返回资料' })).toHaveAttribute(
    'href',
    `/resources/${id}`,
  )
  await page.getByRole('textbox', { name: '心得正文（Markdown）' }).fill('从阅读器按快捷键写下的')
  await expect(page.getByRole('status')).toContainText('已保存', { timeout: 5000 })
  await page.getByRole('link', { name: '返回资料' }).click()
  await expect(page).toHaveURL(`/resources/${id}`)
  await openNotes(page)
  await expect(page.getByRole('list', { name: '心得列表' })).toContainText('从阅读器按快捷键写下的')
})

test('an image pasted into the editor is embedded as base64, previewed, saved and shown on the notes page', async ({
  page,
}) => {
  // TASK-063（用户 2026-09-15：「不能粘贴图片」→ 选定「直接内嵌进正文」）。真实浏览器走完整条链：
  // 剪贴板图片 → canvas 缩放/WebP → data URI 插进正文 → 自动保存 → 预览与心得页显示。
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/notes/new')
  const editor = page.getByRole('textbox', { name: '心得正文（Markdown）' })
  await editor.fill('# 带图的心得\n\n下面是一张截图：\n')
  await expect(page.getByRole('status')).toContainText('已保存', { timeout: 5000 })
  // 在页面里画一张 2400×1500 的 PNG 当作剪贴板内容，派发真实的 paste 事件。
  await editor.evaluate(async (element) => {
    const canvas = document.createElement('canvas')
    canvas.width = 2400
    canvas.height = 1500
    const context = canvas.getContext('2d')!
    context.fillStyle = '#4a6c4f'
    context.fillRect(0, 0, 2400, 1500)
    context.fillStyle = '#fff'
    context.font = '200px sans-serif'
    context.fillText('StudyPilot', 300, 800)
    // 一条噪点带：纯色图压成 WebP 只有几 KB，要一张真截图量级（> 旧上限 50,000 字符）的才算数。
    const noise = context.createImageData(2400, 400)
    for (let i = 0; i < noise.data.length; i += 1) noise.data[i] = (i * 2654435761) >>> 24
    context.putImageData(noise, 0, 1000)
    const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/png'))
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], 'shot.png', { type: 'image/png' }))
    const area = element as HTMLTextAreaElement
    area.focus()
    area.setSelectionRange(area.value.length, area.value.length)
    area.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }))
  })
  // TASK-064：写作框里只显示占位符，不是那串 base64；真正的 data URI 走保存。
  await expect(editor).toHaveValue(/!\[图片\]\(image:1\)/, { timeout: 10000 })
  const value = await editor.inputValue()
  expect(value).not.toContain('base64')
  await expect(page.getByText(/图片在这里显示为/)).toBeVisible()
  // 切换预览触发保存；服务端读回的正文里是完整的 data URI。
  await expect(page.getByRole('status')).toContainText('已保存', { timeout: 5000 })
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/)
  const id = page.url().split('/').pop()!
  let stored = ''
  await expect
    .poll(async () => {
      stored = (await call(page, `/notes/${id}`)).body.data.content as string
      return /!\[图片\]\(data:image\/webp;base64,[A-Za-z0-9+/=]+\)/.test(stored)
    })
    .toBe(true)
  const dataUrl = /\((data:image\/webp;base64,[^)]+)\)/.exec(stored)![1]!
  // 缩到最长边 1600：解码出来的宽高证明缩放确实发生在浏览器里。
  const size = await page.evaluate(
    (url) =>
      new Promise<{ w: number; h: number }>((done) => {
        const img = new Image()
        img.onload = () => done({ w: img.naturalWidth, h: img.naturalHeight })
        img.src = url
      }),
    dataUrl,
  )
  expect(size).toEqual({ w: 1600, h: 1000 })
  // 预览里是一张真实渲染的 <img>。
  await page.getByRole('button', { name: '预览' }).click()
  const img = page.getByLabel('预览').locator('img')
  await expect(img).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await expect(img).toHaveAttribute('alt', '图片')
  expect(await img.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBe(1600)
  // 存下来的正文超过旧上限 50,000 字符（证明迁移后的 CHECK 放行）。
  expect(stored.length).toBeGreaterThan(50_000)
  // 心得页：列表摘要不带 base64，右栏预览显示图片。
  await page.goto(`/notes?note=${id}`)
  const list = page.getByRole('list', { name: '心得列表' })
  await expect(list).toContainText('下面是一张截图')
  await expect(list).not.toContainText('base64')
  await expect(page.getByRole('article', { name: '心得预览' }).locator('img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  // 清理。
  const current = (await call(page, `/notes/${id}`)).body.data
  expect((await call(page, `/notes/${id}`, 'DELETE', undefined, current.version)).status).toBe(204)
})
