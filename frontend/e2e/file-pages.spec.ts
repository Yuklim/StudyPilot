/// <reference lib="dom" />

import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test.use({ trace: 'off' })

test('file page saves an original, filters it and downloads identical bytes after reload', async ({
  page,
}, testInfo) => {
  const original = Buffer.from('仅用于页面测试的合成原件\n# 保持原样\n', 'utf-8')
  const fileName = '合成学习笔记-保留原件与生活里的小小发现.txt'
  let writes = 0
  const external: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== 'http://127.0.0.1:15173') external.push(url.origin)
    if (url.pathname === '/api/v1/resources' && request.method() === 'POST') writes++
  })
  await page.goto('/resources/new')
  await page.getByRole('radio', { name: /上传文件/ }).check()
  await page.getByLabel('标题').fill('原件端到端 · 日常小记')
  await page.getByLabel('保存原因（选填）').fill('在页边收好一个小问题')
  await page
    .getByLabel('原始文件（必填）')
    .setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: original })
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath('file-form-' + width + '.png'),
      fullPage: true,
    })
  }
  await page.getByRole('button', { name: '保存到资料库' }).click()
  await expect(page.getByRole('button', { name: '下载原件' })).toBeVisible()
  expect(writes).toBe(1)
  await page.reload()
  await expect(page.getByText(fileName, { exact: true })).toBeVisible()
  await expect(page.getByText('未开始 · 0%', { exact: true })).toBeVisible()
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath('file-detail-' + width + '.png'),
      fullPage: true,
    })
  }
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载原件' }).focus()
  await page.keyboard.press('Enter')
  const download = await downloading
  expect(download.suggestedFilename()).toBe(fileName)
  expect(await download.failure()).toBeNull()
  expect(await readFile((await download.path())!)).toEqual(original)
  await expect(page.getByRole('status')).toContainText('浏览器下载列表')
  await page.getByRole('link', { name: '返回资料库' }).click()
  await page.getByLabel('资料类型').selectOption('FILE')
  await page.getByLabel('搜索资料').fill('原件端到端')
  await page.getByRole('button', { name: '搜索 / 应用筛选' }).click()
  await expect(page.getByText('共 1 份资料', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '原件端到端 · 日常小记' }).click()
  await expect(page.getByRole('button', { name: '下载原件' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
  expect(await page.context().cookies()).toEqual([])
  expect(external).toEqual([])
})

test('file form preserves failed inputs, rejects invalid content and does not replay uploads', async ({
  page,
}) => {
  await page.goto('/resources/new')
  await page.getByRole('radio', { name: /上传文件/ }).check()
  await page.getByLabel('标题').fill('失败保留的合成文件')
  await page.getByLabel('原始文件（必填）').setInputFiles({
    name: 'forged.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('not a PDF'),
  })
  await page.getByRole('button', { name: '保存到资料库' }).click()
  await expect(page.getByRole('alert')).toContainText('内容与扩展名不一致')
  await expect(page.getByText('forged.pdf', { exact: true })).toBeVisible()
  await expect(page.getByLabel('标题')).toHaveValue('失败保留的合成文件')
  await page.getByRole('button', { name: '移除文件' }).click()
  await expect(page.getByText('forged.pdf', { exact: true })).toHaveCount(0)
  await page
    .getByLabel('原始文件（必填）')
    .setInputFiles({ name: 'retry.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic') })
  let attempts = 0
  await page.route('**/api/v1/resources', async (route) => {
    if (route.request().method() === 'POST') {
      attempts++
      await route.abort()
    } else await route.continue()
  })
  await page.getByRole('button', { name: '保存到资料库' }).click()
  await expect(page.getByRole('alert')).toContainText('保存结果尚未确认')
  await expect(page.getByText('retry.txt', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存到资料库' })).toBeEnabled()
  expect(attempts).toBe(1)
})

test('download failure gives no false success and only an explicit retry downloads', async ({
  page,
}) => {
  await page.goto('/resources/new')
  await page.getByRole('radio', { name: /上传文件/ }).check()
  await page.getByLabel('标题').fill('下载保护合成')
  await page.getByLabel('原始文件（必填）').setInputFiles({
    name: 'protected.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# synthetic'),
  })
  await page.getByRole('button', { name: '保存到资料库' }).click()
  await expect(page.getByRole('button', { name: '下载原件' })).toBeVisible()
  let attempts = 0
  let downloads = 0
  page.on('download', () => {
    downloads++
  })
  await page.route('**/api/v1/files/*/download', async (route) => {
    attempts++
    await route.fulfill({
      status: 409,
      json: { error: { code: 'FILE_CORRUPTED', message: '/private/synthetic-path', details: {} } },
    })
  })
  await page.getByRole('button', { name: '下载原件' }).click()
  await expect(page.getByRole('alert')).toContainText('已停止下载')
  await expect(page.getByRole('alert')).not.toContainText('/private')
  await expect(page.getByText('已交给浏览器下载', { exact: false })).toHaveCount(0)
  expect(attempts).toBe(1)
  expect(downloads).toBe(0)
  await page.unroute('**/api/v1/files/*/download')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载原件' }).click()
  expect((await downloading).suggestedFilename()).toBe('protected.md')
})
