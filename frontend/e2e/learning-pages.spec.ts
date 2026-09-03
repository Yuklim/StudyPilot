/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'

test.use({ timezoneId: 'Asia/Shanghai', trace: 'off' })

async function createResource(page: Page, title: string) {
  await page.goto('/resources/new')
  await page.getByLabel('标题（必填）').fill(title)
  await page.getByLabel('网页地址（必填）').fill('https://example.com/learning')
  await page.getByRole('button', { name: '保存到资料库' }).click()
  await expect(page).toHaveURL(/\/resources\/[0-9a-f-]{36}$/)
  await page.getByRole('button', { name: '查看旧学习历史' }).click()
  await page.getByRole('button', { name: '更多：状态与归档管理' }).click()
  await expect(page.getByRole('heading', { name: '这一页还没有学习记录' })).toBeVisible()
  return page.url().split('/').at(-1)!
}

test('real learning journal saves, refreshes, archives and restores with keyboard and narrow layouts', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  let posts = 0
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/study-records')) posts++
  })
  const id = await createResource(page, '学习手帐 · 读懂一小节')
  await page.getByLabel('学习开始时间', { exact: true }).fill('2026-08-20T09:30:07')
  await page.getByLabel('本次时长（秒）').fill('1200')
  await page.getByLabel('学习后状态').selectOption('IN_PROGRESS')
  await page.getByLabel('学习后进度（%）').fill('35')
  const summary = '读懂了第一小节。\n<script>document.body.dataset.executed="yes"</script>'
  await page.getByLabel('本次总结（选填）').fill(summary)
  await page.getByLabel('疑问与下一步（选填）').fill('明天试着用自己的话复述。')
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1050 : 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath('learning-form-' + width + '.png'),
      fullPage: true,
    })
  }
  await page.getByRole('button', { name: '保存学习记录', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toHaveText('学习记录已保存，当前进度已更新。')
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '35')
  await expect(page.getByLabel('本次总结（选填）')).toHaveValue('')
  expect(posts).toBe(1)
  await page.reload()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '35')
  await page.getByRole('button', { name: '查看旧学习历史' }).click()
  await page.getByRole('button', { name: '更多：状态与归档管理' }).click()
  const history = page.getByRole('list', { name: '学习历史结果' })
  await expect(history.locator('li')).toHaveCount(1)
  await expect(history).toContainText(summary)
  await expect(history).toContainText('1200 秒 · 20.0 分钟')
  await expect(history.locator('time').first()).toHaveAttribute('datetime', '2026-08-20T01:30:07Z')
  expect(await page.locator('body').getAttribute('data-executed')).toBeNull()
  await expect(page.locator('main script, main iframe, main img')).toHaveCount(0)
  await page.getByLabel('学习后状态').selectOption('ARCHIVED')
  await expect(page.getByLabel('学习后进度（%）')).toBeDisabled()
  await page.getByRole('button', { name: '保存学习记录', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('请确认归档或恢复')
  expect(posts).toBe(1)
  await page.getByRole('checkbox', { name: /归档后资料从默认资料库隐藏/ }).check()
  await page.getByRole('button', { name: '保存学习记录', exact: true }).click()
  await expect(history.locator('li')).toHaveCount(2)
  await page.reload()
  await expect(page.getByText('已归档 · 35%', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '查看旧学习历史' }).click()
  await page.getByRole('button', { name: '更多：状态与归档管理' }).click()
  await page.getByLabel('学习后状态').selectOption('IN_PROGRESS')
  await page.getByRole('checkbox', { name: /恢复到原来的/ }).check()
  await page.getByRole('button', { name: '保存学习记录', exact: true }).click()
  await expect(history.locator('li')).toHaveCount(3)
  await expect(page.getByText('学习中 · 35%', { exact: true })).toBeVisible()
  expect(posts).toBe(3)
  await page.goto('/study-records')
  await expect(page.getByRole('list', { name: '学习历史结果' })).toContainText(summary)
  await page.getByRole('link', { name: '打开这条记录对应的资料' }).first().click()
  await expect(page).toHaveURL(new RegExp('/resources/' + id + '$'))
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
  expect(errors).toEqual([])
})

test('real stale version and a dropped write retain the draft and require explicit reread and confirmation', async ({
  page,
}) => {
  const id = await createResource(page, '学习手帐 · 两处进度')
  await page.getByLabel('学习后状态').selectOption('IN_PROGRESS')
  await page.getByLabel('学习后进度（%）').fill('65')
  await page.getByLabel('本次总结（选填）').fill('这是我正在编辑的草稿')
  // Advance the isolated backend through the approved browser client without exporting credentials.
  await page.evaluate(async (resourceId) => {
    const modulePath = '/src/api/client.ts'
    const { api } = await import(modulePath)
    await api.request('/api/v1/resources/' + resourceId + '/study-records', {
      method: 'POST',
      body: {
        expected_progress_version: 1,
        started_at: '2026-08-20T01:00:00Z',
        duration_seconds: 60,
        status_before: 'UNREAD',
        status_after: 'IN_PROGRESS',
        progress_before: 0,
        progress_after: 40,
        summary: '另一处已保存',
        questions_next: null,
      },
    })
  }, id)
  let posts = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/study-records')) posts++
  })
  await page.getByRole('button', { name: '保存学习记录', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('进度或状态已变化')
  await expect(page.getByLabel('本次总结（选填）')).toHaveValue('这是我正在编辑的草稿')
  await expect(page.getByRole('button', { name: '保存学习记录', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '保留草稿，读取最新进度' }).click()
  await expect(page.getByRole('list', { name: '学习历史结果' })).toContainText('另一处已保存')
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '40')
  await expect(page.getByRole('button', { name: '保存学习记录', exact: true })).toBeDisabled()
  expect(posts).toBe(1)
  await page.getByRole('checkbox', { name: /我已核对最新进度和历史/ }).check()
  await page.getByRole('button', { name: '保存学习记录', exact: true }).click()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '65')
  await expect(page.getByRole('list', { name: '学习历史结果' }).locator('li')).toHaveCount(2)
  expect(posts).toBe(2)
  await page.getByLabel('本次总结（选填）').fill('断网也应保留的草稿')
  await page.route('**/api/v1/resources/' + id + '/study-records', async (route) => {
    if (route.request().method() === 'POST') await route.abort()
    else await route.continue()
  })
  await page.getByRole('button', { name: '保存学习记录', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('保存结果尚未确认')
  await expect(page.getByLabel('本次总结（选填）')).toHaveValue('断网也应保留的草稿')
  await expect(page.getByRole('button', { name: '保存学习记录', exact: true })).toBeDisabled()
  await page.unroute('**/api/v1/resources/' + id + '/study-records')
  await page.getByRole('button', { name: '保留草稿，读取最新进度' }).click()
  await expect(page.getByRole('list', { name: '学习历史结果' }).locator('li')).toHaveCount(2)
  await expect(page.getByRole('button', { name: '保存学习记录', exact: true })).toBeDisabled()
  expect(posts).toBe(3)
})

test('global history uses real inclusive/exclusive local-time filters, sorting and keyboard pagination', async ({
  page,
}, testInfo) => {
  const id = await createResource(page, '学习手帐 · 历史分页')
  await page.evaluate(async (resourceId) => {
    const modulePath = '/src/api/client.ts'
    const { api } = await import(modulePath)
    for (let i = 0; i < 21; i++) {
      await api.request('/api/v1/resources/' + resourceId + '/study-records', {
        method: 'POST',
        body: {
          expected_progress_version: 1,
          started_at: '2026-08-21T00:' + String(i).padStart(2, '0') + ':00Z',
          duration_seconds: i,
          status_before: 'UNREAD',
          status_after: 'UNREAD',
          progress_before: 0,
          progress_after: 0,
          summary: '手帐分页 ' + String(i).padStart(2, '0'),
          questions_next: null,
        },
      })
    }
  }, id)
  await page.goto('/study-records')
  await page.getByLabel('记录开始时间起').fill('2026-08-21T08:00')
  await page.getByLabel('记录开始时间止').fill('2026-08-21T08:21')
  await page.getByLabel('记录排序').selectOption('duration_seconds')
  await page.getByRole('button', { name: '筛选记录', exact: true }).click()
  const rows = page.getByRole('list', { name: '学习历史结果' }).locator('li')
  await expect(page.getByText('第 1 页 · 共 21 条记录', { exact: true })).toBeVisible()
  await expect(rows).toHaveCount(20)
  await expect(rows.first()).toContainText('手帐分页 00')
  await page.getByRole('button', { name: '下一页记录', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('手帐分页 20')
  await expect(page.getByRole('button', { name: '下一页记录', exact: true })).toBeDisabled()
  await page.getByLabel('记录开始时间止').fill('2026-08-21T08:20')
  await page.getByRole('button', { name: '筛选记录', exact: true }).click()
  await expect(page.getByText('第 1 页 · 共 20 条记录', { exact: true })).toBeVisible()
  await expect(rows).toHaveCount(20)
  await expect(rows.last()).toContainText('手帐分页 19')
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1050 : 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath('learning-history-' + width + '.png'),
      fullPage: true,
    })
  }
})
