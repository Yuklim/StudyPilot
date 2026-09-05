/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function create(page: Page, kind: '主题' | '标签', name: string, description?: string) {
  await button(page, '新建' + kind).click()
  await page.getByLabel(kind + '名称', { exact: true }).fill(name)
  if (description) await page.getByLabel('主题说明（选填）').fill(description)
  await button(page, '保存' + kind).click()
  await expect(page.getByText('操作成功，已重新读取分类列表。')).toBeVisible()
}

test('classification UI manages real data and organizes resources with combined filters', async ({
  page,
}, info) => {
  const external: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== 'http://127.0.0.1:15173') external.push(url.origin)
  })
  await page.setViewportSize({ width: 1440, height: 1050 })
  await page.goto('/classifications')
  await create(page, '主题', '分类页面 · 阅读方法', '一页一页，积累自己的理解。')
  await button(page, '修改主题 分类页面 · 阅读方法').click()
  await page.getByLabel('主题说明（选填）').fill('')
  await button(page, '保存主题').click()
  await expect(page.getByText('操作成功，已重新读取分类列表。')).toBeVisible()
  await button(page, '新建主题').click()
  await page.getByLabel('主题名称', { exact: true }).fill('分类页面 · 阅读方法')
  await button(page, '保存主题').click()
  await expect(page.getByRole('alert')).toContainText('已有同名主题')
  await expect(page.getByLabel('主题名称', { exact: true })).toHaveValue('分类页面 · 阅读方法')
  await button(page, '取消').click()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1050 : 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: info.outputPath('classification-' + width + '.png'),
      fullPage: true,
    })
  }
  await button(page, '标签').click()
  await create(page, '标签', '分类页面 · 待读')
  await create(page, '标签', '分类页面 · 实践')
  await create(page, '标签', '分类页面 · 临时')
  await button(page, '删除标签 分类页面 · 临时').click()
  await expect(page.getByRole('heading', { name: '确认删除“分类页面 · 临时”？' })).toBeVisible()
  await button(page, '取消').click()
  await expect(page.getByRole('heading', { name: '分类页面 · 临时', exact: true })).toBeVisible()
  await button(page, '删除标签 分类页面 · 临时').click()
  await button(page, '确认删除标签').click()
  await expect(page.getByRole('heading', { name: '分类页面 · 临时', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: '添加资料', exact: true }).click()
  await page.getByLabel('标题').fill('分类页面 · 我的阅读卡')
  await page.getByLabel('网页地址（必填）').fill('https://example.com/classified')
  await button(page, '选择主题与标签（选填）').click()
  await page.getByRole('radio', { name: '分类页面 · 阅读方法', exact: true }).check()
  await page.getByRole('checkbox', { name: '分类页面 · 待读', exact: true }).check()
  await page.getByRole('checkbox', { name: '分类页面 · 实践', exact: true }).check()
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1050 : 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('picker-' + width + '.png'), fullPage: true })
  }
  await button(page, '保存到资料库').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/resources\/[0-9a-f-]{36}$/)
  await expect(page.getByText('分类页面 · 阅读方法', { exact: true })).toBeVisible()
  const detailUrl = page.url()
  await page.reload()
  await expect(page.getByText('分类页面 · 待读', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '返回资料库' }).click()
  await button(page, '按主题与标签筛选').click()
  await page.getByRole('radio', { name: '分类页面 · 阅读方法', exact: true }).check()
  await page.getByRole('checkbox', { name: '分类页面 · 待读', exact: true }).check()
  await page.getByRole('checkbox', { name: '分类页面 · 实践', exact: true }).check()
  await button(page, '搜索 / 应用筛选').click()
  await expect(page.getByText('共 1 份资料', { exact: true })).toBeVisible()
  await page.getByRole('radio', { name: '仅未分配主题', exact: true }).check()
  await button(page, '搜索 / 应用筛选').click()
  await expect(page.getByText('共 0 份资料', { exact: true })).toBeVisible()
  await page.goto('/classifications')
  await button(page, '删除主题 分类页面 · 阅读方法').click()
  await button(page, '确认删除主题').click()
  await expect(page.getByRole('alert')).toContainText('仍有 1 份资料')
  await page.goto(detailUrl)
  await button(page, '管理这份资料的标签').click()
  await button(page, '解除标签 分类页面 · 待读').click()
  await expect(button(page, '管理这份资料的标签')).toBeVisible()
  await expect(page.getByText('分类页面 · 待读', { exact: true })).toHaveCount(0)
  await button(page, '管理这份资料的标签').click()
  await button(page, '添加标签 分类页面 · 待读').click()
  await expect(button(page, '管理这份资料的标签')).toBeVisible()
  await expect(page.getByText('分类页面 · 待读', { exact: true })).toBeVisible()
  await expect(page.getByText('未开始 · 0%', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('classified-detail.png'), fullPage: true })
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
  expect(await page.context().cookies()).toEqual([])
  expect(external).toEqual([])
})

test('stale UI edits and deletes cannot overwrite newer taxonomy versions', async ({ page }) => {
  await page.goto('/classifications')
  await create(page, '主题', '版本页面 · 初稿')
  await button(page, '修改主题 版本页面 · 初稿').click()
  await page.getByLabel('主题名称', { exact: true }).fill('版本页面 · 旧草稿')
  // Simulate a second window using the real shared client, never exporting a token.
  await page.evaluate(async () => {
    const modulePath = '/src/api/client.ts'
    const { api } = await import(modulePath)
    const rows = await api.request('/api/v1/topics?q=' + encodeURIComponent('版本页面 · 初稿'))
    const item = rows.data[0]
    await api.request('/api/v1/topics/' + item.id, {
      method: 'PATCH',
      body: { name: '版本页面 · 新版', expected_version: item.version },
    })
  })
  await button(page, '保存主题').click()
  await expect(page.getByRole('alert')).toContainText('内容已被修改')
  await expect(page.getByLabel('主题名称', { exact: true })).toHaveValue('版本页面 · 旧草稿')
  await button(page, '放弃草稿，载入最新版本').click()
  await expect(page.getByLabel('主题名称', { exact: true })).toHaveValue('版本页面 · 新版')
  await button(page, '保存主题').click()
  await expect(page.getByText('操作成功，已重新读取分类列表。')).toBeVisible()
  await button(page, '删除主题 版本页面 · 新版').click()
  await page.evaluate(async () => {
    const modulePath = '/src/api/client.ts'
    const { api } = await import(modulePath)
    const rows = await api.request('/api/v1/topics?q=' + encodeURIComponent('版本页面 · 新版'))
    const item = rows.data[0]
    await api.request('/api/v1/topics/' + item.id, {
      method: 'PATCH',
      body: { description: '并行修改后的说明', expected_version: item.version },
    })
  })
  await button(page, '确认删除主题').click()
  await expect(page.getByRole('alert')).toContainText('内容已被修改')
  await button(page, '放弃草稿，载入最新版本').click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await button(page, '确认删除主题').click()
  await expect(page.getByText('操作成功，已重新读取分类列表。')).toBeVisible()
  await expect(page.getByRole('heading', { name: '版本页面 · 新版', exact: true })).toHaveCount(0)
})

test('classification search, paging and uncertain writes use the real backend', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const modulePath = '/src/api/client.ts'
    const { api } = await import(modulePath)
    for (let i = 1; i <= 21; i++)
      await api.request('/api/v1/tags', {
        method: 'POST',
        body: { name: '标签分页 ' + String(i).padStart(2, '0') },
      })
  })
  await page.goto('/classifications')
  await button(page, '标签').click()
  await page.getByLabel('搜索标签', { exact: true }).fill('标签分页')
  await button(page, '查找标签').click()
  await expect(page.getByRole('list', { name: '标签结果' }).getByRole('heading')).toHaveCount(20)
  await button(page, '下一页标签').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '标签分页 21', exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: '标签排序', exact: true }).selectOption('-name')
  await expect(button(page, '上一页标签')).toBeDisabled()
  let attempts = 0
  await page.route('**/api/v1/tags', async (route) => {
    if (route.request().method() === 'POST') {
      attempts++
      await route.abort()
    } else await route.continue()
  })
  await button(page, '新建标签').click()
  await page.getByLabel('标签名称', { exact: true }).fill('保留失败草稿')
  await button(page, '保存标签').click()
  await expect(page.getByRole('alert')).toContainText('没有自动重试')
  await expect(page.getByLabel('标签名称', { exact: true })).toHaveValue('保留失败草稿')
  expect(attempts).toBe(1)
})
