/// <reference lib="dom" />

import { expect, test } from '@playwright/test'

test('real browser loads the honest shell and reaches the backend through the proxy', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByText('网页、文件与粘贴资料已开放')).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(0)

  // This is a real browser fetch through Vite to the real FastAPI middleware.
  // Never mock an unfinished business endpoint to make the smoke test pass.
  const denied = await page.evaluate(async () => {
    const response = await fetch('/api/v1/unknown', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'synthetic test input',
    })
    return { status: response.status, body: await response.json() }
  })
  expect(denied.status).toBe(403)
  expect(denied.body.error.code).toBe('LOCAL_TOKEN_REQUIRED')
  expect(denied.body.error.details).toEqual({})
  expect(denied.body.error.request_id).toMatch(/^req_[a-f0-9]{32}$/)
})

test('navigation, history, direct links and keyboard focus use only approved resource requests', async ({
  page,
}, testInfo) => {
  const unexpectedRequests: string[] = []
  let resourcePageOpened = false
  page.on('request', (request) => {
    const url = new URL(request.url())
    const isApi = url.pathname.startsWith('/api/')
    const approvedRead =
      resourcePageOpened &&
      request.method() === 'GET' &&
      ['/api/v1/local-session', '/api/v1/resources'].includes(url.pathname)
    if (url.origin !== 'http://127.0.0.1:15173' || (isApi && !approvedRead)) {
      unexpectedRequests.push(url.origin + url.pathname)
    }
  })
  await page.setViewportSize({ width: 1440, height: 1050 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '学习概览', level: 1 })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('desktop-overview.png'), fullPage: true })
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: '跳到主要内容' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  const nav = page.getByRole('navigation', { name: '主要导航' })
  await nav.getByRole('link', { name: '资料库' }).focus()
  resourcePageOpened = true
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/resources$/)
  await expect(page.getByRole('heading', { name: '资料库', level: 1 })).toBeFocused()
  await page.getByRole('link', { name: '添加资料', exact: true }).click()
  await expect(page).toHaveURL(/\/resources\/new$/)
  await expect(page.getByRole('form', { name: '添加资料表单' })).toBeVisible()
  await expect(
    page.getByText('原件只保存、不解析。可先在分类整理中创建主题与标签，再回来选择。'),
  ).toBeVisible()
  await expect(nav.getByRole('link', { name: '资料库' })).toHaveAttribute('aria-current', 'page')
  await page.goBack()
  await expect(page.getByRole('heading', { name: '资料库', level: 1 })).toBeFocused()
  await page.goForward()
  await expect(page.getByRole('heading', { name: '添加资料', level: 1 })).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('desktop-add-form.png'), fullPage: true })
  await page.goto('/resources/synthetic-id')
  await page.reload()
  await expect(page.getByRole('heading', { name: '资料详情', level: 1 })).toBeVisible()
  await expect(page).toHaveTitle('资料详情 · StudyPilot')
  await page.getByRole('link', { name: '返回资料库' }).click()
  for (const title of ['学习记录', '复习安排', '主题统计']) {
    await nav.getByRole('link', { name: title }).click()
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeFocused()
  }
  await page.goto('/unknown-page')
  await expect(page.getByRole('heading', { name: '没有找到这个页面', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: '返回学习概览' }).click()
  await expect(page.getByRole('heading', { name: '学习概览', level: 1 })).toBeVisible()
  expect(unexpectedRequests).toEqual([])
})

for (const width of [390, 320]) {
  test(`all pages fit a ${width}px viewport with reduced motion`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const route of [
      '/',
      '/resources',
      '/resources/new',
      '/resources/synthetic-id',
      '/study-records',
      '/reviews',
      '/topics',
      '/unknown-page',
    ]) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText('网页、文件与粘贴资料已开放')).toBeVisible()
      if (route === '/resources')
        await expect(page.getByRole('navigation', { name: '资料分页' })).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      const nav = page.getByRole('navigation', { name: '主要导航' })
      for (const link of await nav.getByRole('link').all()) {
        const box = await link.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.height).toBeGreaterThanOrEqual(44)
        expect(await link.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
          '0s',
        )
      }
      if (route === '/') {
        await page.screenshot({
          path: testInfo.outputPath(`mobile-${width}-overview.png`),
          fullPage: true,
        })
      }
    }
    await page.getByRole('link', { name: '添加资料', exact: true }).click()
    await expect(page.getByRole('heading', { name: '添加资料', level: 1 })).toBeFocused()
    await page.getByRole('link', { name: '返回资料库' }).click()
    await expect(page.getByRole('heading', { name: '资料库', level: 1 })).toBeVisible()
  })
}
