/// <reference lib="dom" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, test, type Page } from '@playwright/test'

/**
 * 站内读 PDF（TASK-073），走真实后端与真实 Chromium：pdf.js 在 jsdom 里跑不起来，
 * 「第一页真的画出来了」只能在这里验。
 *
 * 夹具是仓库里自造的最小 PDF（每页一行文字），不引入任何真实文献。两份：
 * - `sample.pdf`：两页，够验「第一页真画出来了」与位置记忆；
 * - `sample-long.pdf`：**十二页**，专为 TASK-083 那条布局缺陷而造——两页时两页都在渲染
 *   窗口内、都有 canvas 撑着，压根压不出「没渲染的占位页被 flex 压扁」那个场景。
 */

const FIXTURE = fileURLToPath(new URL('./fixtures/sample.pdf', import.meta.url))
const LONG_FIXTURE = fileURLToPath(new URL('./fixtures/sample-long.pdf', import.meta.url))

/** 上传一份 PDF 原件，返回资料 id。 */
async function seedPdf(page: Page, title: string, fixture = FIXTURE) {
  await page.goto('/resources')
  const bytes = [...readFileSync(fixture)]
  const id = await page.evaluate(
    async ([name, data]) => {
      const bootstrap = await fetch('/api/v1/local-session', {
        headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' },
      })
      const token = ((await bootstrap.json()) as { data: { token: string } }).data.token
      const form = new FormData()
      form.append('source_type', 'FILE')
      form.append('title', name as string)
      form.append(
        'file',
        new File([new Uint8Array(data as number[])], 'sample.pdf', { type: 'application/pdf' }),
      )
      const response = await fetch('/api/v1/resources', {
        method: 'POST',
        headers: { 'X-StudyPilot-Token': token },
        body: form,
      })
      const body = (await response.json()) as { data: { id: string } }
      return body.data.id
    },
    [title, bytes] as const,
  )
  return id
}

/** 这一页的 canvas 是不是真画了东西（不是一张白板）。 */
async function painted(page: Page, label: string) {
  return page.getByLabel(label).evaluate((node) => {
    const canvas = node as HTMLCanvasElement
    const context = canvas.getContext('2d')
    if (!context || !canvas.width || !canvas.height) return false
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let at = 0; at < data.length; at += 4) {
      if (data[at] !== 255 || data[at + 1] !== 255 || data[at + 2] !== 255) return true
    }
    return false
  })
}

test('a PDF original is read inside the app, not just downloadable', async ({ page }) => {
  const id = await seedPdf(page, 'PDF 阅读器 · A')
  await page.goto(`/resources/${id}`)

  // 第一页真的渲染出来了：canvas 上有非白像素。
  await expect(page.getByLabel('第 1 页')).toBeVisible()
  await expect.poll(() => painted(page, '第 1 页')).toBe(true)
  await expect(page.getByLabel('页码')).toHaveValue('1')
  await expect(page.getByText('/ 2 页')).toBeVisible()

  // 门禁不接受浏览器发的文档/框架请求，所以页面里不能有 iframe/embed/object 直连接口。
  expect(await page.locator('iframe, embed, object').count()).toBe(0)

  // PDF 资料没有「高亮」Tab（用户 2026-09-20 看草图后确认）。
  await page.locator('.reader-toolbar').getByRole('button', { name: '心得', exact: true }).click()
  await expect(page.getByRole('tab', { name: '心得' })).toBeVisible()
  expect(await page.getByRole('tab', { name: /高亮/ }).count()).toBe(0)
})

test('it comes back to the page it was left on', async ({ page }) => {
  const id = await seedPdf(page, 'PDF 阅读器 · B')
  await page.goto(`/resources/${id}`)
  await expect(page.getByLabel('第 1 页')).toBeVisible()

  // 跳到第 2 页，位置随即写回本机。
  await page.getByLabel('页码').fill('2')
  await expect.poll(() => page.getByLabel('页码').inputValue()).toBe('2')
  await expect.poll(() => painted(page, '第 2 页')).toBe(true)

  await page.reload()
  // 回来还在第 2 页，不是从头开始。
  await expect.poll(() => page.getByLabel('页码').inputValue(), { timeout: 15000 }).toBe('2')
})

test('a long PDF keeps every page box at full height, so the end is reachable', async ({
  page,
}) => {
  // **TASK-083：这条只能在真浏览器里验。** jsdom 量不出高度，单测天然抓不到布局缺陷。
  //
  // 缺陷是这样的：页容器是 column 方向的 flex，而 flex 子项默认 `flex-shrink: 1`；内容
  // 总高超出容器时浏览器会压扁子项。已渲染的页有 canvas 撑着不缩，**没渲染的占位页里
  // 只有一个页码文字，于是从 400pt 塌到 17px**。占位框没占住位置 → 滚动高度只剩零头 →
  // 页码判定失准 → 「只渲染视口附近 ±2 页」永远算不到后面 → 后半本一辈子画不出来
  // （用户 2026-09-21 的原话是「只能出现前 7 页内容」）。
  const id = await seedPdf(page, 'PDF 阅读器 · 长文档', LONG_FIXTURE)
  await page.goto(`/resources/${id}`)
  await expect(page.getByText('/ 12 页')).toBeVisible()
  await expect(page.getByLabel('第 1 页')).toBeVisible()

  const boxes = page.locator('.pdf-page')
  await expect(boxes).toHaveCount(12)

  // ① 每一个页框都占住它该占的高度——**包括还没渲染的那些**。
  const heights = await boxes.evaluateAll((nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
  )
  const tallest = Math.max(...heights)
  expect(tallest).toBeGreaterThan(100)
  // 塌陷时这里会是 [400, 400, 400, 17, 17, …]：最矮的和最高的差一个数量级。
  expect(Math.min(...heights)).toBeGreaterThan(tallest * 0.9)

  // ② 滚动高度与页数相称，而不是只剩被渲染的那几页。
  const scrollable = await page
    .locator('.pdf-reader-pages')
    .evaluate((node) => node.scrollHeight - node.clientHeight)
  expect(scrollable).toBeGreaterThan(tallest * 8)

  // ③ 最要紧的一条：滚到底真能读到最后一页。
  await page.locator('.pdf-reader-pages').evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  await expect.poll(() => page.getByLabel('页码').inputValue(), { timeout: 15000 }).toBe('12')
  await expect(page.getByLabel('第 12 页')).toBeVisible()
  await expect.poll(() => painted(page, '第 12 页'), { timeout: 15000 }).toBe(true)
})

test('a non-PDF original keeps the existing behaviour', async ({ page }) => {
  await page.goto('/resources')
  const id = await page.evaluate(async () => {
    const bootstrap = await fetch('/api/v1/local-session', {
      headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' },
    })
    const token = ((await bootstrap.json()) as { data: { token: string } }).data.token
    const form = new FormData()
    form.append('source_type', 'FILE')
    form.append('title', 'PDF 阅读器 · 非 PDF')
    form.append('file', new File(['# 一份 Markdown\n'], 'note.md', { type: 'text/markdown' }))
    const response = await fetch('/api/v1/resources', {
      method: 'POST',
      headers: { 'X-StudyPilot-Token': token },
      body: form,
    })
    return ((await response.json()) as { data: { id: string } }).data.id
  })
  await page.goto(`/resources/${id}`)
  // 站内阅读器只处理 PDF：别的格式仍旧是既有的快照空态 + 工具条里的原件。
  expect(await page.locator('.pdf-reader').count()).toBe(0)
  await expect(page.getByRole('tab', { name: /高亮/ })).toHaveCount(0)
  await expect(page.getByText(/还没有保存正文|原件/).first()).toBeVisible()
})
