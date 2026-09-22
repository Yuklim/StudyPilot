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

test('text on a PDF page can be selected and quoted into a note', async ({ page }) => {
  // **TASK-087 只能在真浏览器里验**：jsdom 没有选区、没有布局，文字层对不对得齐、
  // 选不选得中，单测都看不见。
  const id = await seedPdf(page, 'PDF 阅读器 · 文字层')
  await page.goto(`/resources/${id}`)
  await expect(page.getByLabel('第 1 页')).toBeVisible()

  // ① 这一页的文字真的进了文字层（夹具第一页写的是 StudyPilot page one）。
  const layer = page.locator('.pdf-page[data-page="1"] .pdf-text-layer')
  await expect(layer).toContainText('StudyPilot page one')

  // ② 文字层与 canvas 严丝合缝——差一点点，选区就会偏在字的旁边。
  const boxes = await page.locator('.pdf-page[data-page="1"]').evaluate((node) => {
    const canvas = node.querySelector('canvas')!.getBoundingClientRect()
    const text = node.querySelector('.pdf-text-layer')!.getBoundingClientRect()
    return { canvas, text }
  })
  expect(Math.abs(boxes.text.left - boxes.canvas.left)).toBeLessThan(1.5)
  expect(Math.abs(boxes.text.top - boxes.canvas.top)).toBeLessThan(1.5)
  expect(Math.abs(boxes.text.width - boxes.canvas.width)).toBeLessThan(1.5)

  // ③ 选中那一行：真的选区，`selectionchange` 由浏览器自己发。
  await page.evaluate(() => {
    const span = [...document.querySelectorAll('.pdf-text-layer span')].find((node) =>
      node.textContent?.includes('StudyPilot page one'),
    )!
    const range = document.createRange()
    range.selectNodeContents(span)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })

  // ④ 胶囊只有「记下这段」：PDF 上还没有高亮的落点。
  await expect(page.getByRole('button', { name: '记下这段' })).toBeVisible()
  expect(await page.getByRole('button', { name: '标下来' }).count()).toBe(0)

  // ⑤ **选区不能盖住字**（用户 2026-09-21 实测：第一版的不透明底色把整行抹掉了）。
  //    选区由浏览器合成，canvas 的 `getImageData` 看不见它——只能截图再数像素。
  //    把截图交回页面里解码：深色像素（字）选中前后必须基本还在，同时要出现黄色（选区确实画了）。
  const count = async (shot: Buffer) =>
    page.evaluate(async (data) => {
      const image = new Image()
      image.src = 'data:image/png;base64,' + data
      await image.decode()
      const board = document.createElement('canvas')
      board.width = image.width
      board.height = image.height
      const context = board.getContext('2d')!
      context.drawImage(image, 0, 0)
      const { data: pixels } = context.getImageData(0, 0, board.width, board.height)
      let dark = 0
      let marked = 0
      for (let at = 0; at < pixels.length; at += 4) {
        const [r, g, b] = [pixels[at]!, pixels[at + 1]!, pixels[at + 2]!]
        if (r + g + b < 180) dark += 1
        // 淡黄：红绿高、蓝明显低，且不是纸白。
        if (r > 200 && g > 190 && b < 215 && b < g - 15) marked += 1
      }
      return { dark, marked }
    }, shot.toString('base64'))

  const page1 = page.locator('.pdf-page[data-page="1"]')
  // 上面第 ③ 步已经选中了这一行；先取消选区量一次「本来的样子」，再选回来量一次。
  await page.evaluate(() => window.getSelection()!.removeAllRanges())
  const before = await count(await page1.screenshot())
  await page.evaluate(() => {
    const span = [...document.querySelectorAll('.pdf-text-layer span')].find((node) =>
      node.textContent?.includes('StudyPilot page one'),
    )!
    const range = document.createRange()
    range.selectNodeContents(span)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
  const after = await count(await page1.screenshot())
  expect(before.dark).toBeGreaterThan(200) // 这一页本来就有字
  expect(after.marked).toBeGreaterThan(200) // 选区确实画出来了
  // 盖住字的那一版这里会塌到接近 0。
  expect(after.dark).toBeGreaterThan(before.dark * 0.8)

  // ⑥ 点下去，引文进右栏心得草稿。
  await page.getByRole('button', { name: '记下这段' }).click()
  const draft = page.getByRole('textbox', { name: '这次想记下什么？' })
  await expect(draft).toHaveValue(/> StudyPilot page one/)
})
