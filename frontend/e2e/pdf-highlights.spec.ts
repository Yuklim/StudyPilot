/// <reference lib="dom" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, test, type Page } from '@playwright/test'

/**
 * PDF 上的高亮（TASK-089），走真实后端与真实 Chromium：pdf.js 的文字层、真实选区、
 * CSS Custom Highlight API 都只能在这里验。
 *
 * 夹具 `sample.pdf` 两页：第一页一行「StudyPilot page one」，第二页一行「StudyPilot page two」。
 * 上色不插节点，所以断言的是浏览器注册表里 `studypilot-mark-yellow-pdf` 覆盖的文字。
 */

const FIXTURE = fileURLToPath(new URL('./fixtures/sample.pdf', import.meta.url))
/** 十二页、每页一行「StudyPilot page N」：第 9 页在 ±2 页的渲染窗口之外，专为「跳到未渲染的页」而用。 */
const LONG_FIXTURE = fileURLToPath(new URL('./fixtures/sample-long.pdf', import.meta.url))

async function call(page: Page, path: string, method = 'GET', body?: unknown) {
  return page.evaluate(
    async ([target, verb, payload]) => {
      const bootstrap = await fetch('/api/v1/local-session', {
        headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' },
      })
      const token = ((await bootstrap.json()) as { data: { token: string } }).data.token
      const response = await fetch('/api/v1' + target, {
        method: verb as string,
        headers: { 'X-StudyPilot-Token': token, 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      })
      return { status: response.status, ...(await response.json().catch(() => ({}))) }
    },
    [path, method, body] as const,
  )
}

async function seedPdf(page: Page, title: string, fixture = FIXTURE) {
  await page.goto('/resources')
  const bytes = [...readFileSync(fixture)]
  return page.evaluate(
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
      return ((await response.json()) as { data: { id: string } }).data.id
    },
    [title, bytes] as const,
  )
}

/** 在第 N 页的文字层里选中包含 `text` 的那个 span（真实选区）。 */
async function selectOnPage(page: Page, pageNumber: number, text: string) {
  const layer = page.locator(`.pdf-page[data-page="${pageNumber}"] .pdf-text-layer`)
  await expect(layer).toContainText(text)
  await page.evaluate(
    ([at, wanted]) => {
      const span = [
        ...document.querySelectorAll(`.pdf-page[data-page="${at}"] .pdf-text-layer span`),
      ].find((node) => node.textContent?.includes(wanted as string))!
      const range = document.createRange()
      range.selectNodeContents(span)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    },
    [pageNumber, text] as const,
  )
}

async function openHighlights(page: Page) {
  const tab = page.getByRole('tab', { name: /高亮/ })
  if (!(await tab.isVisible())) {
    await page.locator('.reader-toolbar').getByRole('button', { name: '心得', exact: true }).click()
  }
  await tab.click()
}

/** 注册表里 PDF 那份高亮当前覆盖的文字。 */
async function painted(page: Page) {
  return page.evaluate(() => {
    const registry = (CSS as unknown as { highlights?: Map<string, Iterable<Range>> }).highlights
    const mark = registry?.get('studypilot-mark-yellow-pdf')
    return mark ? [...mark].map((range) => range.toString()) : []
  })
}

test('a passage on a PDF page can be marked, is painted, and survives a reload', async ({
  page,
}) => {
  const id = await seedPdf(page, 'PDF 高亮 · A')
  await page.goto(`/resources/${id}`)
  await expect(page.getByLabel('第 1 页')).toBeVisible()

  // ① 一页之内的选区：开着荧光笔，松手即落色（TASK-094）；胶囊不出。
  await page.getByRole('button', { name: '荧光笔' }).click()
  await selectOnPage(page, 1, 'StudyPilot page one')
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })))
  expect(await page.getByRole('button', { name: '记下这段' }).count()).toBe(0)

  // ② 打开右栏「高亮」Tab，条目带页码；接口里存的也带 page_number。
  await openHighlights(page)
  const list = page.getByRole('list', { name: '高亮列表' })
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(list).toContainText('StudyPilot page one')
  await expect(list).toContainText('第 1 页')
  const stored = (await call(page, `/resources/${id}/highlights`)).data
  expect(stored).toHaveLength(1)
  expect(stored[0].page_number).toBe(1)

  // ③ 上色交给浏览器，用的是 PDF 专用的高亮名；文字层里没有多出节点。
  await expect.poll(() => painted(page)).toEqual(['StudyPilot page one'])
  expect(await page.locator('.pdf-text-layer mark').count()).toBe(0)

  // ④ 刷新后按页重新定位：锚点是存下来的，位置是现算的。
  await page.reload()
  await expect(page.getByLabel('第 1 页')).toBeVisible()
  await openHighlights(page)
  await expect(page.getByRole('list', { name: '高亮列表' })).toContainText('StudyPilot page one')
  await expect.poll(() => painted(page)).toEqual(['StudyPilot page one'])
  // 没有被判成孤立。
  expect(await page.locator('.reader-highlight-orphan').count()).toBe(0)
})

test('a selection that crosses two pages can be quoted but not marked', async ({ page }) => {
  // 用户 2026-09-22 选定：文字层按页给，跨页的选区不落色，只留「记下这段」。TASK-094 起开着
  // 荧光笔松手也不落，胶囊说明原因。
  const id = await seedPdf(page, 'PDF 高亮 · B')
  await page.goto(`/resources/${id}`)
  await expect(page.getByLabel('第 1 页')).toBeVisible()
  await page.getByRole('button', { name: '荧光笔' }).click()
  await expect(page.locator('.pdf-page[data-page="2"] .pdf-text-layer')).toContainText(
    'StudyPilot page two',
  )
  await page.evaluate(() => {
    const first = document.querySelector('.pdf-page[data-page="1"] .pdf-text-layer span')!
    const spans = document.querySelectorAll('.pdf-page[data-page="2"] .pdf-text-layer span')
    const last = spans[spans.length - 1]!
    const range = document.createRange()
    range.setStart(first, 0)
    range.setEnd(last, last.childNodes.length)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  })
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })))
  await expect(page.getByRole('button', { name: '记下这段' })).toBeVisible()
  expect(await page.getByRole('button', { name: '标下来' }).count()).toBe(0)
  await expect(page.getByText('选区跨页或落到页外，只能记下这段')).toBeVisible()
  expect((await call(page, `/resources/${id}/highlights`)).data).toEqual([])

  // 引文照走：两页的文字都进了草稿，但没有高亮被创建。
  await page.getByRole('button', { name: '记下这段' }).click()
  const draft = page.getByRole('textbox', { name: '这次想记下什么？' })
  await expect(draft).toHaveValue(/StudyPilot page one[\s\S]*StudyPilot page two/)
  expect((await call(page, `/resources/${id}/highlights`)).data).toHaveLength(0)
})

test('quoting a passage on a PDF page pairs the saved note with its highlight', async ({
  page,
}) => {
  // 用户 2026-09-22 的原话：「加了心得之后高亮也不会保存」——现在「记下这段」既标高亮也进草稿，
  // 心得保存后自动配对。
  const id = await seedPdf(page, 'PDF 高亮 · C')
  await page.goto(`/resources/${id}`)
  await expect(page.getByLabel('第 1 页')).toBeVisible()
  await selectOnPage(page, 1, 'StudyPilot page one')
  await page.getByRole('button', { name: '记下这段' }).click()

  const draft = page.getByRole('textbox', { name: '这次想记下什么？' })
  await expect(draft).toHaveValue(/> StudyPilot page one/)
  await draft.fill('> StudyPilot page one\n\n这一页值得记。')
  await page.getByRole('button', { name: '保存心得' }).click()

  await expect
    .poll(async () => {
      const rows = (await call(page, `/resources/${id}/highlights`)).data as {
        page_number: number
        note_id: string | null
      }[]
      return rows.map((row) => [row.page_number, row.note_id !== null])
    })
    .toEqual([[1, true]])
})

test('a highlight on a page outside the render window is not called lost, and jumps there', async ({
  page,
}) => {
  // 视口外的页没有文字层，那条高亮只是「还没看」：不判孤立，给「跳到第 N 页」；
  // 跳过去、那一页渲染完，就在那一页里定位上色。
  const id = await seedPdf(page, 'PDF 高亮 · D', LONG_FIXTURE)
  const made = await call(page, `/resources/${id}/highlights`, 'POST', {
    exact: 'StudyPilot page 9',
    prefix: null,
    suffix: null,
    start_offset: 0,
    end_offset: 17,
    page_number: 9,
  })
  expect(made.status).toBe(201)

  await page.goto(`/resources/${id}`)
  await expect(page.getByLabel('第 1 页')).toBeVisible()
  await expect(page.getByLabel('页码')).toHaveValue('1')
  // 第 9 页还没渲染：没有它的文字层。
  expect(await page.locator('.pdf-page[data-page="9"] .pdf-text-layer').count()).toBe(0)

  await openHighlights(page)
  const list = page.getByRole('list', { name: '高亮列表' })
  await expect(list).toContainText('第 9 页')
  expect(await page.locator('.reader-highlight-orphan').count()).toBe(0)
  expect(await painted(page)).toEqual([])

  await list.getByRole('button', { name: '跳到第 9 页' }).click()
  await expect.poll(() => page.getByLabel('页码').inputValue()).toBe('9')
  // 渲染完成后在那一页里定位上色；「跳到第 9 页」让位给「跳到正文」。
  await expect.poll(() => painted(page), { timeout: 10_000 }).toEqual(['StudyPilot page 9'])
  await expect(list.getByRole('button', { name: '跳到正文' })).toBeVisible()
  expect(await page.locator('.reader-highlight-orphan').count()).toBe(0)
})
