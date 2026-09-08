/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'

test.use({ trace: 'off' })

// Synthetic records in the isolated real backend; the session token stays in the browser.
async function call(page: Page, path: string, method = 'GET', body?: object) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const modulePath = '/src/api/client.ts'
      const { api } = await import(modulePath)
      return api.request('/api/v1' + path, { method, body })
    },
    { path, method, body },
  )
}
async function seed(page: Page, source: 'WEB' | 'PASTE' | 'FILE') {
  await page.goto('/resources')
  if (source === 'FILE')
    return page.evaluate(async () => {
      const modulePath = '/src/features/resources/api.ts'
      const { createFileResource } = await import(modulePath)
      const item = await createFileResource(
        { title: '资料编辑合成 · FILE', save_reason: '原简介' },
        new File(['synthetic original file'], 'synthetic.txt', { type: 'text/plain' }),
      )
      return item.id as string
    })
  return (
    await call(page, '/resources', 'POST', {
      source_type: source,
      title: `资料编辑合成 · ${source}`,
      source_name: '原来源',
      save_reason: '原简介',
      ...(source === 'WEB'
        ? { source_url: 'https://example.com/original' }
        : { pasted_content: '  原文\n ' }),
    })
  ).data.id as string
}

/**
 * TASK-043 起「编辑资料」在阅读器工具条的 `⋯` 菜单里：开菜单 → 选菜单项 → 面板里
 * 才是 `ResourceEditor` 自己的那个按钮。三步都要走到，少一步就说明入口没搬对。
 */
async function openEditor(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('menuitem', { name: '编辑资料' }).click()
  await page.getByRole('button', { name: '编辑资料', exact: true }).click()
}

for (const source of ['WEB', 'PASTE', 'FILE'] as const) {
  test(`${source} resource edits persist, keep notes/history/original files, and remain responsive`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = []
    const external: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => {
      if (!request.url().startsWith('http://127.0.0.1:15173/'))
        external.push(new URL(request.url()).origin)
    })
    const id = await seed(page, source)
    const path = '/resources/' + id
    const topic = (await call(page, '/topics', 'POST', { name: `资料修改主题 ${source}` })).data
    await call(page, path + '/notes', 'POST', { content: '编辑资料之前保存的心得' })
    const before = (await call(page, path)).data
    await page.goto(path)
    await expect(page.getByRole('button', { name: '更多操作' })).toBeVisible()
    await expect(page.getByRole('form', { name: '编辑资料表单' })).toHaveCount(0)
    // TASK-045：心得区默认收起，先点「心得」展开（开合 + 聚焦一体）。
    await page.locator('.reader-toolbar').getByRole('button', { name: '心得', exact: true }).click()
    await expect(page.getByRole('form', { name: '心得编辑' })).toBeVisible()
    const note = page.getByRole('form', { name: '心得编辑' }).getByRole('textbox')
    await note.fill('编辑资料时不能丢失的心得草稿')
    await openEditor(page)
    const form = page.getByRole('form', { name: '编辑资料表单' })
    await expect(form.getByRole('button', { name: '保存资料修改' })).toBeDisabled()
    await form.getByLabel('标题').fill(`整理好了 · ${source}`)
    await form.getByLabel('来源名称（选填）').fill('新的来源')
    await form.getByLabel('保存原因 / 简介（选填）').fill('')
    await form.getByRole('button', { name: '更改主要主题' }).click()
    await form.getByRole('radio', { name: topic.name, exact: true }).check()
    const original = '  # 修改后的原文\n<script>document.body.dataset.executed="yes"</script>\n '
    if (source === 'WEB') {
      await form.locator('summary').filter({ hasText: '修改原始网页链接' }).click()
      await form.getByLabel('网页地址（必填）').fill('https://example.com/edited?q=hello%20world')
    } else if (source === 'PASTE') {
      await form.locator('summary').filter({ hasText: '修改粘贴原文' }).click()
      await form.getByLabel('粘贴原文（必填）').fill(original)
    } else await expect(form.locator('input[type=file]')).toHaveCount(0)
    if (source === 'PASTE')
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: width === 1440 ? 1050 : 844 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        await page.screenshot({
          path: testInfo.outputPath(`resource-edit-${width}.png`),
          fullPage: true,
        })
      }
    await form.getByRole('button', { name: '保存资料修改' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: `整理好了 · ${source}` })).toBeVisible()
    await expect(note).toHaveValue('编辑资料时不能丢失的心得草稿')
    const after = (await call(page, path)).data
    expect(after).toMatchObject({
      title: `整理好了 · ${source}`,
      source_name: '新的来源',
      save_reason: null,
      topic_id: topic.id,
      version: before.version + 1,
      created_at: before.created_at,
    })
    expect(after.progress).toEqual(before.progress)
    expect(after.original_file).toEqual(before.original_file)
    expect(after.tags).toEqual(before.tags)
    expect(after.review_plan).toEqual(before.review_plan)
    expect((await call(page, path + '/notes')).data[0].content).toBe('编辑资料之前保存的心得')
    expect((await call(page, path + '/study-records')).page.total_items).toBe(0)
    if (source === 'PASTE') expect(after.pasted_content).toBe(original)
    await page.reload()
    await expect(page.getByRole('heading', { name: `整理好了 · ${source}` })).toBeVisible()
    if (source === 'WEB')
      await expect(page.getByRole('link', { name: /原网页/ })).toHaveAttribute(
        'href',
        'https://example.com/edited?q=hello%20world',
      )
    if (source === 'PASTE') {
      // TASK-043 起粘贴原文在工具条的面板里，先点开。
      await page.getByRole('button', { name: '粘贴原文', exact: true }).click()
      expect(await page.getByLabel('粘贴原文内容').textContent()).toBe(original)
    }
    if (source === 'FILE') {
      const content = await page.evaluate(async (fileId: string) => {
        const modulePath = '/src/api/client.ts'
        const { api } = await import(modulePath)
        const file = await api.downloadOriginal(fileId)
        return file.blob.text()
      }, after.original_file.id)
      expect(content).toBe('synthetic original file')
    }
    await openEditor(page)
    await form.getByRole('button', { name: '更改主要主题' }).click()
    await form.getByRole('radio', { name: '未分配主题', exact: true }).check()
    await form.getByRole('button', { name: '保存资料修改' }).click()
    await expect(page.getByText('资料修改已保存。')).toBeVisible()
    expect((await call(page, path)).data.topic_id).toBeNull()
    expect(await page.evaluate(() => document.body.dataset.executed)).toBeUndefined()
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
    expect(await page.context().cookies()).toEqual([])
    expect(errors).toEqual([])
    expect(external).toEqual([])
  })
}

test('real competing updates preserve the draft and never overwrite fields the user did not edit', async ({
  page,
}) => {
  const id = await seed(page, 'WEB')
  const path = '/resources/' + id
  await page.goto(path)
  await openEditor(page)
  const form = page.getByRole('form', { name: '编辑资料表单' })
  await form.getByLabel('标题').fill('本页明确修改的标题')
  await call(page, path, 'PATCH', {
    expected_version: 1,
    title: '另一处标题',
    save_reason: '另一处的新简介',
  })
  await form.getByRole('button', { name: '保存资料修改' }).click()
  await expect(form.getByText(/操作结果需要核对/)).toBeVisible()
  await expect(form.getByRole('button', { name: '保存资料修改' })).toBeDisabled()
  await form.getByRole('button', { name: '保留草稿，读取最新资料' }).click()
  await expect(form.getByRole('region', { name: '最新已保存资料' })).toContainText('另一处的新简介')
  await expect(form.getByLabel('标题')).toHaveValue('本页明确修改的标题')
  await form.getByRole('checkbox', { name: '我已核对最新资料，确认仍需保存本页修改' }).check()
  await form.getByRole('button', { name: '保存资料修改' }).click()
  await expect(page.getByRole('heading', { name: '本页明确修改的标题' })).toBeVisible()
  expect((await call(page, path)).data).toMatchObject({
    title: '本页明确修改的标题',
    save_reason: '另一处的新简介',
    version: 3,
  })
})

test('clearing the title in the editor saves an untitled resource', async ({ page }) => {
  const id = await seed(page, 'WEB')
  const path = '/resources/' + id
  await page.goto(path)
  await openEditor(page)
  const form = page.getByRole('form', { name: '编辑资料表单' })
  await form.getByLabel('标题').fill('')
  await form.getByRole('button', { name: '保存资料修改' }).click()
  await expect(page.getByRole('heading', { name: '未命名资料' })).toBeVisible()
  expect((await call(page, path)).data).toMatchObject({ title: null })
})

test('a real committed update with a lost response is read back before an explicit no-op retry', async ({
  page,
}) => {
  const id = await seed(page, 'PASTE')
  const path = '/resources/' + id
  await page.goto(path)
  await openEditor(page)
  const form = page.getByRole('form', { name: '编辑资料表单' })
  await form.getByLabel('标题').fill('已经保存但回执丢失')
  await page.evaluate((target) => {
    const nativeFetch = window.fetch.bind(window)
    let dropped = false
    window.fetch = async (input, init) => {
      const response = await nativeFetch(input, init)
      if (!dropped && String(input) === '/api/v1' + target && init?.method === 'PATCH') {
        dropped = true
        if (!response.ok) throw new Error('Expected a real successful update')
        throw new TypeError('Synthetic lost response after commit')
      }
      return response
    }
  }, path)
  let writes = 0
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && r.url().endsWith('/api/v1' + path)) writes++
  })
  await form.getByRole('button', { name: '保存资料修改' }).click()
  await expect(form.getByText(/操作结果需要核对/)).toBeVisible()
  await expect(form.getByRole('button', { name: '保存资料修改' })).toBeDisabled()
  expect((await call(page, path)).data).toMatchObject({ title: '已经保存但回执丢失', version: 2 })
  expect(writes).toBe(1)
  await form.getByRole('button', { name: '保留草稿，读取最新资料' }).click()
  await expect(form.getByRole('region', { name: '最新已保存资料' })).toContainText(
    '已经保存但回执丢失',
  )
  await form.getByRole('checkbox', { name: '我已核对最新资料，确认仍需保存本页修改' }).check()
  await form.getByRole('button', { name: '保存资料修改' }).click()
  await expect(page.getByText('资料修改已保存。')).toBeVisible()
  expect((await call(page, path)).data.version).toBe(2)
  expect(writes).toBe(2)
})

test('tags can be filled in later from the edit page, as a whole replacement set', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const id = await seed(page, 'WEB')
  const path = '/resources/' + id
  // Sequential writes: the isolated SQLite backend serialises writers, so parallel
  // POSTs here would race the write lock instead of testing anything about tags.
  const kept = (await call(page, '/tags', 'POST', { name: '后补标签 · 保留' })).data
  const added = (await call(page, '/tags', 'POST', { name: '后补标签 · 新增' })).data
  const dropped = (await call(page, '/tags', 'POST', { name: '后补标签 · 移除' })).data
  for (const tag of [kept, dropped])
    expect(await call(page, `/resources/${id}/tags/${tag.id}`, 'PUT')).toBeTruthy()
  const before = (await call(page, path)).data
  expect(before.tags.map((tag: { name: string }) => tag.name).sort()).toEqual([
    '后补标签 · 保留',
    '后补标签 · 移除',
  ])

  await page.goto(path)
  await openEditor(page)
  const form = page.getByRole('form', { name: '编辑资料表单' })
  await expect(form.getByText('标签：后补标签 · 保留、后补标签 · 移除')).toBeVisible()
  await form.getByRole('button', { name: '移除已选标签 后补标签 · 移除 ×' }).click()
  await form.getByRole('button', { name: '更改标签' }).click()
  // The browser pages at 20 and the whole suite shares one backend, so filter by name
  // instead of assuming the new tag lands on the first page.
  await form.getByRole('searchbox', { name: '搜索标签' }).fill(added.name)
  await form.getByRole('button', { name: '查找标签' }).click()
  await form.getByRole('checkbox', { name: added.name, exact: true }).check()
  await form.getByRole('button', { name: '保存资料修改' }).click()
  await expect(page.getByText('资料修改已保存。')).toBeVisible()

  const after = (await call(page, path)).data
  expect(after.tags.map((tag: { name: string }) => tag.name).sort()).toEqual([
    '后补标签 · 保留',
    '后补标签 · 新增',
  ])
  // One PATCH, one version step. Detaching must not delete the tag itself; read it back
  // by id rather than counting /tags, which the whole suite shares with other specs.
  expect(after.version).toBe(before.version + 1)
  expect((await call(page, '/tags/' + dropped.id)).data).toMatchObject({ name: dropped.name })
  await page.reload()
  await expect(page.getByText('后补标签 · 新增')).toBeVisible()
  expect(errors).toEqual([])
})
