// @vitest-environment jsdom
import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CapturePayload } from '../shared/protocol'

/**
 * popup 的**接线**（TASK-085）。
 *
 * 纯函数（`needsPdfDecision`/`pdfFailureText`/`shouldAskAboutImages`）由 `popup.test.ts` 守着；
 * 这里守的是另一件事——**哪个按钮走哪条路**。独立 Review F3 指出完成条件写了「有用例」
 * 而接线其实零覆盖，这个文件补上。
 *
 * `main.ts` 在**模块顶层**查 DOM 并挂事件，所以每条用例都要先把真实的 popup.html 铺进
 * `document`，再 `resetModules()` + 动态 import 让它重新跑一遍。
 */

// jsdom 环境里 `import.meta.url` 不是 file: 协议，按工作目录读（vitest 的 cwd 是 extension/）。
const MARKUP = readFileSync('popup.html', 'utf8')

function payload(overrides: Partial<CapturePayload> = {}): CapturePayload {
  return { title: '', url: 'https://x.test/a', markdown: 'x', images: [], ...overrides }
}
const citation = {
  item_type: 'PREPRINT' as const,
  authors: [],
  issued_year: null,
  issued_date: null,
  container_title: null,
  volume: null,
  issue: null,
  pages: null,
  publisher: null,
  doi: null,
  isbn: null,
}

/** `runCapture` 的返回值由各用例摆布；`deliverCapture` 记录它有没有被调用、带不带图。 */
const runCapture = vi.fn<(bridge: unknown) => Promise<unknown>>()
const deliverCapture =
  vi.fn<
    (
      bridge: unknown,
      payload: CapturePayload,
      images: boolean,
    ) => Promise<{ images: number; refused: boolean }>
  >()

vi.mock('./capture', () => ({
  runCapture: (bridge: unknown) => runCapture(bridge),
  deliverCapture: (bridge: unknown, payload: CapturePayload, images: boolean) =>
    deliverCapture(bridge, payload, images),
}))
vi.mock('./bridge', () => ({ chromeBridge: () => ({}) }))

const el = (id: string) => document.querySelector(id) as HTMLElement
const visible = (id: string) => !el(id).hidden

async function openPopup() {
  document.body.innerHTML = MARKUP.slice(MARKUP.indexOf('<body>') + 6, MARKUP.indexOf('</body>'))
  vi.resetModules()
  await import('./main')
}

/** 点一次「保存这一页」并等接线把异步链跑完。 */
async function capture() {
  el('#capture').click()
  // `.then()` 链 + 内部 await：连让几个微任务轮次，够它跑到终态。
  for (let i = 0; i < 12; i++) await Promise.resolve()
  await new Promise((done) => setTimeout(done, 0))
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

beforeEach(() => {
  runCapture.mockReset()
  deliverCapture.mockReset()
  deliverCapture.mockResolvedValue({ images: 0, refused: false })
  vi.stubGlobal('chrome', { runtime: { getManifest: () => ({ version: '0.2.0.660' }) } })
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('popup 接线（TASK-085）', () => {
  it('shows the version the browser actually installed', async () => {
    await openPopup()
    // 范围修订 1：源码常量是 `0.2.0`，浏览器装着的是带构建号的那一个。
    expect(el('#status').textContent).toContain('0.2.0.660')
  })

  it('delivers straight away when the PDF came back', async () => {
    runCapture.mockResolvedValue({
      ok: true,
      payload: payload({ citation, pdf: { name: 'a.pdf', bytes: 3, base64: 'AAAA' } }),
    })
    await openPopup()
    await capture()
    // 抓到了就不该多一步——用户要的是一次点击。
    expect(visible('#pdf-failed')).toBe(false)
    expect(visible('#choices')).toBe(false)
    expect(deliverCapture).toHaveBeenCalledTimes(1)
  })

  it('stops and says why when the paper came without its PDF', async () => {
    runCapture.mockResolvedValue({
      ok: true,
      payload: payload({ citation, pdf_problem: 'failed' }),
    })
    await openPopup()
    await capture()
    expect(visible('#pdf-failed')).toBe(true)
    expect(el('#pdf-reason').textContent).toMatch(/先登录/)
    // **停住**就是字面意思：这一刻什么都还没交出去。
    expect(deliverCapture).not.toHaveBeenCalled()
    expect(visible('#capture')).toBe(false)
  })

  it('falls back to the page text only when the user asks for it', async () => {
    runCapture.mockResolvedValue({ ok: true, payload: payload({ citation, pdf_problem: 'slow' }) })
    await openPopup()
    await capture()
    el('#save-text').click()
    for (let i = 0; i < 12; i++) await Promise.resolve()
    expect(deliverCapture).toHaveBeenCalledTimes(1)
    // 没有图片，所以不该再问一次权限。
    expect(deliverCapture.mock.calls[0]![2]).toBe(false)
    expect(visible('#pdf-failed')).toBe(false)
  })

  it('saves nothing when the user gives up, and lets them try again', async () => {
    runCapture.mockResolvedValue({
      ok: true,
      payload: payload({ citation, pdf_problem: 'cross-origin' }),
    })
    await openPopup()
    await capture()
    el('#give-up').click()
    expect(deliverCapture).not.toHaveBeenCalled()
    expect(el('#hint').textContent).toMatch(/什么都没保存/)
    // 采集按钮要回来：否则这一次 popup 里再也点不了第二次（独立 Review 非阻断②）。
    expect(visible('#capture')).toBe(true)
  })

  it('still asks about images on an ordinary page', async () => {
    runCapture.mockResolvedValue({
      ok: true,
      payload: payload({ images: ['https://x.test/1.png'] }),
    })
    await openPopup()
    await capture()
    // 普通网页一字不变：不弹失败屏，照旧问图片。
    expect(visible('#pdf-failed')).toBe(false)
    expect(visible('#choices')).toBe(true)
    expect(deliverCapture).not.toHaveBeenCalled()
    el('#with-images').click()
    for (let i = 0; i < 12; i++) await Promise.resolve()
    expect(deliverCapture.mock.calls[0]![2]).toBe(true)
  })
})
