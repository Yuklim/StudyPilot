import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../api/client'
import { MAX_CANVAS_PIXELS, PdfReader, pixelDensity } from './PdfReader'
import { pdfPositionKey, scrollTopFor } from './pdfPosition'
import type { OriginalFile } from './files'

/**
 * 站内 PDF 阅读器（TASK-073）。pdf.js 在 jsdom 里跑不了（没有 canvas、没有 worker），
 * 所以用 `vi.mock` 换成替身：**这里守的是我们自己的逻辑**——字节从哪来、失败怎么分因、
 * 页码与位置怎么算。真实渲染由 e2e 在 Chromium 里验。
 */

const pages = [
  { width: 600, height: 800 },
  { width: 600, height: 800 },
  { width: 600, height: 800 },
]
let opened: { fail?: unknown } = {}

vi.mock('pdfjs-dist', () => {
  /**
   * 文字层的替身（TASK-087）：真的 `TextLayer` 要量字体、算变换，jsdom 里做不了。
   * 这里只保留我们依赖的那件事——**把每段文字放成容器里的一个 span**，
   * 真实排版由 e2e 在 Chromium 里验。
   */
  class TextLayer {
    private options: {
      textContentSource: { items: { str: string }[] }
      container: HTMLElement
    }
    constructor(options: {
      textContentSource: { items: { str: string }[] }
      container: HTMLElement
    }) {
      this.options = options
    }
    render() {
      for (const item of this.options.textContentSource.items) {
        const span = document.createElement('span')
        span.textContent = item.str
        this.options.container.append(span)
      }
      return Promise.resolve()
    }
    cancel() {}
  }
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    TextLayer,
    getDocument: () => ({
      promise: opened.fail
        ? Promise.reject(opened.fail)
        : Promise.resolve({
            numPages: pages.length,
            getPage: (number: number) =>
              Promise.resolve({
                getViewport: ({ scale }: { scale: number }) => ({
                  width: pages[number - 1]!.width * scale,
                  height: pages[number - 1]!.height * scale,
                }),
                render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
                getTextContent: () =>
                  Promise.resolve({ items: [{ str: `第 ${number} 页的文字` }], styles: {} }),
                cleanup: () => {},
              }),
            destroy: () => Promise.resolve(),
          }),
    }),
  }
})
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }))

const resourceId = '018f1f58-4eb2-4a0d-a716-fb81b1960001'
const file: OriginalFile = {
  id: '018f1f58-4eb2-4a0d-a716-fb81b1960777',
  original_name: 'paper.pdf',
  size_bytes: 12,
  media_type: 'application/pdf',
  status: 'READY',
}
function bytes(size = file.size_bytes) {
  return new Blob([new Uint8Array(size)], { type: 'application/pdf' })
}

afterEach(() => {
  opened = {}
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('canvas 像素密度（TASK-082）', () => {
  it('matches the screen instead of settling for half of it', () => {
    // 画布按 CSS 像素开、CSS 又拉伸到同样大时，高分屏上每个 CSS 像素只有一个采样点，
    // 被放大 dpr 倍显示——那就是「糊」。实测 Retina 上像素利用率只有 50%。
    expect(pixelDensity(600, 800, 2)).toBe(2)
    expect(pixelDensity(600, 800, 3)).toBe(3)
    // 普通屏不多画：1 就是 1，不浪费四倍内存。
    expect(pixelDensity(600, 800, 1)).toBe(1)
  })

  it('never goes below 1, whatever the screen claims', () => {
    // 低于 1 会比不做还糊。`devicePixelRatio` 在某些缩放设置下确实会小于 1。
    expect(pixelDensity(600, 800, 0.75)).toBe(1)
    expect(pixelDensity(600, 800, 0)).toBe(1)
  })

  it('spends no more than the pixel budget on one page', () => {
    // 浏览器对 canvas 面积有硬上限（Safari 约 16.7M），撞上直接画不出来；内存同理。
    // 超预算时按面积开方降密度，而不是无上限地开。
    const big = { w: 2000, h: 2600 } // 5.2M CSS 像素，dpr 2 要 20.8M —— 超预算
    const density = pixelDensity(big.w, big.h, 2)
    expect(density).toBeGreaterThan(1)
    expect(density).toBeLessThan(2)
    expect(big.w * density * (big.h * density)).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 1)
  })

  it('still fits the common case at full density', () => {
    // 「适合宽度」那一档实测需要 9.3M（1340×1734 CSS，dpr 2）——预算就是照它定的，
    // 这一档必须**完全清晰**，否则这次修复在最常用的位置上打了折。
    expect(pixelDensity(1340, 1734, 2)).toBe(2)
  })
})

describe('in-app pdf reader', () => {
  it('takes the bytes through the controlled download, never through a direct src', async () => {
    const download = vi
      .spyOn(api, 'downloadOriginal')
      .mockResolvedValue({ blob: bytes(), fileName: 'paper.pdf' })
    const view = render(<PdfReader resourceId={resourceId} file={file} />)
    await screen.findByLabelText('第 1 页')
    expect(download).toHaveBeenCalledWith(file.id)
    // 本机门禁不接受浏览器发的文档/框架请求：页面里不能有指向接口的 iframe/embed/object。
    expect(view.container.querySelectorAll('iframe, embed, object')).toHaveLength(0)
  })

  it('lays out every page up front and renders only the ones near the viewport', async () => {
    vi.spyOn(api, 'downloadOriginal').mockResolvedValue({ blob: bytes(), fileName: 'paper.pdf' })
    render(<PdfReader resourceId={resourceId} file={file} />)
    await screen.findByLabelText('第 1 页')
    // 三页都占了位（滚动条不会随渲染跳动），远处的页只占位不画。
    expect(document.querySelectorAll('.pdf-page')).toHaveLength(3)
    const box = screen.getByLabelText('页码') as HTMLInputElement
    expect(box.value).toBe('1')
    expect(box.max).toBe('3')
  })

  it('opens the canvas at device pixels while the page box keeps its CSS size', async () => {
    vi.spyOn(api, 'downloadOriginal').mockResolvedValue({ blob: bytes(), fileName: 'paper.pdf' })
    const original = window.devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    // jsdom 没装 canvas 包，`getContext` 返回 null，尺寸那段会被早退跳过——给它一个
    // 替身，这里验的是**我们自己算的画布尺寸**，不是真实绘制（那由 e2e 在 Chromium 里看）。
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as unknown as CanvasRenderingContext2D,
    )
    try {
      render(<PdfReader resourceId={resourceId} file={file} />)
      const canvas = (await screen.findByLabelText('第 1 页')) as HTMLCanvasElement
      await waitFor(() => expect(canvas.width).toBeGreaterThan(0))
      // 夹具每页 600×800、scale 1：画布应当是 1200×1600，而**不是** 600×800。
      expect(canvas.width).toBe(1200)
      expect(canvas.height).toBe(1600)
      // 显示尺寸由 CSS 的 100% 锁在 `.pdf-page` 的框上，这里不设内联尺寸——
      // 两边都写会在缩放时各自舍入、互相打架。
      expect(canvas.style.width).toBe('')
      expect(canvas.style.height).toBe('')
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { value: original, configurable: true })
    }
  })

  it('redraws when the window moves to a screen with a different pixel ratio', async () => {
    // 把窗口从内置高分屏拖到外接的普通屏（或反过来）时 `devicePixelRatio` 会变。
    // 不跟着重画的话，要么一直糊着，要么白白多画四倍像素。
    vi.spyOn(api, 'downloadOriginal').mockResolvedValue({ blob: bytes(), fileName: 'paper.pdf' })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as unknown as CanvasRenderingContext2D,
    )
    const original = window.devicePixelRatio
    // jsdom 没有 matchMedia，自己造一个能触发 change 的替身。
    const listeners = new Set<() => void>()
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
      addListener: (fn: () => void) => listeners.add(fn),
      removeListener: (fn: () => void) => listeners.delete(fn),
    }))
    try {
      Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true })
      render(<PdfReader resourceId={resourceId} file={file} />)
      const canvas = (await screen.findByLabelText('第 1 页')) as HTMLCanvasElement
      await waitFor(() => expect(canvas.width).toBe(600))

      Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
      act(() => listeners.forEach((fn) => fn()))
      await waitFor(() => expect(canvas.width).toBe(1200))
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { value: original, configurable: true })
    }
  })

  it('tells the three kinds of failure apart and keeps the original reachable', async () => {
    vi.spyOn(api, 'downloadOriginal').mockResolvedValue({ blob: bytes(), fileName: 'paper.pdf' })
    opened = { fail: Object.assign(new Error('password'), { name: 'PasswordException' }) }
    const locked = render(<PdfReader resourceId={resourceId} file={file} />)
    expect(await within(locked.container).findByRole('alert')).toHaveTextContent(/打开口令/)
    locked.unmount()

    opened = { fail: Object.assign(new Error('broken'), { name: 'InvalidPDFException' }) }
    const broken = render(<PdfReader resourceId={resourceId} file={file} />)
    expect(await within(broken.container).findByRole('alert')).toHaveTextContent(/结构损坏/)
    expect(within(broken.container).getByText(/可以用工具条里的「原件」/)).toBeInTheDocument()
    broken.unmount()

    opened = {}
    vi.spyOn(api, 'downloadOriginal').mockRejectedValue(new Error('network'))
    const unread = render(<PdfReader resourceId={resourceId} file={file} />)
    expect(await within(unread.container).findByRole('alert')).toBeInTheDocument()
  })

  it('does not re-download when the parent hands over an equal-but-new file object (Review F1)', async () => {
    // 改标签、存学习记录、编辑资料都会让父级重读资料，给出一个内容相同的新对象。按引用
    // 依赖会整份重下重解析，而清理又会销毁此刻仍在用的文档——那个窗口里一滚动就是空白页。
    const download = vi
      .spyOn(api, 'downloadOriginal')
      .mockResolvedValue({ blob: bytes(), fileName: 'paper.pdf' })
    const view = render(<PdfReader resourceId={resourceId} file={file} />)
    await screen.findByLabelText('第 1 页')
    expect(download).toHaveBeenCalledTimes(1)
    view.rerender(<PdfReader resourceId={resourceId} file={{ ...file }} />)
    await screen.findByLabelText('第 1 页')
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('treats an emptied page box as unfinished input, not as page zero (Review F3)', async () => {
    vi.spyOn(api, 'downloadOriginal').mockResolvedValue({ blob: bytes(), fileName: 'paper.pdf' })
    render(<PdfReader resourceId={resourceId} file={file} />)
    await screen.findByLabelText('第 1 页')
    const box = screen.getByLabelText('页码') as HTMLInputElement
    fireEvent.change(box, { target: { value: '3' } })
    expect(box.value).toBe('3')
    // 清空输入框：`Number('')` 是 0，但那不是「跳到第 0 页」。
    fireEvent.change(box, { target: { value: '' } })
    expect(box.value).toBe('3')
  })

  it('remembers where a jump really left the reader, not half a screen above it (第二轮 Review)', async () => {
    vi.spyOn(api, 'downloadOriginal').mockResolvedValue({ blob: bytes(), fileName: 'paper.pdf' })
    render(<PdfReader resourceId={resourceId} file={file} />)
    await screen.findByLabelText('第 1 页')
    const node = document.querySelector('.pdf-reader-pages') as HTMLElement
    // jsdom 不排版：给滚动容器一个视口高度和一个真的存得住的 scrollTop。
    let top = 0
    Object.defineProperty(node, 'clientHeight', { configurable: true, get: () => 600 })
    Object.defineProperty(node, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        top = value
      },
    })
    fireEvent.change(screen.getByLabelText('页码'), { target: { value: '2' } })
    // 每页 800 高、页间 16：第 2 页顶部在 816，跳页把它带到视口顶。
    expect(node.scrollTop).toBe(816)
    fireEvent.scroll(node)
    await waitFor(() => expect(localStorage.getItem(pdfPositionKey(resourceId))).not.toBeNull())
    const saved = JSON.parse(localStorage.getItem(pdfPositionKey(resourceId))!) as {
      page: number
      ratio: number
    }
    expect(saved.page).toBe(2)
    // 关键：存下的位置要能原样回到离开处。钉住时写死 `ratio: 0` 的话这里是 516——高半屏。
    expect(scrollTopFor(saved, [0, 816, 1632], [816, 816, 816], 600)).toBeCloseTo(816)
  })

  it('comes back to the page it was left on, and ignores a position saved for another file', async () => {
    vi.spyOn(api, 'downloadOriginal').mockResolvedValue({ blob: bytes(), fileName: 'paper.pdf' })
    localStorage.setItem(
      pdfPositionKey(resourceId),
      JSON.stringify({
        page: 3,
        ratio: 0.5,
        fingerprint: file.id,
        savedAt: '2026-09-20T00:00:00Z',
      }),
    )
    const back = render(<PdfReader resourceId={resourceId} file={file} />)
    await waitFor(() => expect((screen.getByLabelText('页码') as HTMLInputElement).value).toBe('3'))
    back.unmount()

    // 另一份文件存下的位置不作数：跳到一个无关的地方比从第一页开始更糟。
    localStorage.setItem(
      pdfPositionKey(resourceId),
      JSON.stringify({
        page: 3,
        ratio: 0.5,
        fingerprint: 'another-file',
        savedAt: '2026-09-20T00:00:00Z',
      }),
    )
    render(<PdfReader resourceId={resourceId} file={file} />)
    await screen.findByLabelText('第 1 页')
    expect((screen.getByLabelText('页码') as HTMLInputElement).value).toBe('1')
  })
})

describe('文字层（TASK-087）', () => {
  /** jsdom 没装 canvas 包，`getContext` 返回 null 会让整段渲染早退——文字层也就不挂。 */
  function stubCanvas() {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as unknown as CanvasRenderingContext2D,
    )
  }

  it('puts the page text on top of the canvas so it can be selected', async () => {
    vi.spyOn(api, 'downloadOriginal').mockResolvedValue({ blob: bytes(), fileName: 'paper.pdf' })
    stubCanvas()
    render(<PdfReader resourceId={resourceId} file={file} />)
    await screen.findByLabelText('第 1 页')
    const first = document.querySelector('.pdf-page[data-page="1"] .pdf-text-layer')
    await waitFor(() => expect(first?.textContent).toContain('第 1 页的文字'))
    // 文字层必须在这一页的框里、与 canvas 同级——选区落在它上面才算「落在正文里」。
    expect(first?.parentElement?.querySelector('canvas')).not.toBeNull()
  })

  it('scales the text by what the canvas actually shows, not by the raw zoom', async () => {
    // 全局 `box-sizing: border-box` 让 `.pdf-page` 的 1px 边框吃掉内容宽度，canvas 按 100%
    // 跟着缩。字号若按 `scale` 换算，文字层会比 canvas 宽 2px，右边的选区整体偏出去。
    vi.spyOn(api, 'downloadOriginal').mockResolvedValue({ blob: bytes(), fileName: 'paper.pdf' })
    stubCanvas()
    // jsdom 里所有盒子都是 0×0，取不到显示宽度时退回 CSS 宽度（600 ÷ 600 = 1）。
    render(<PdfReader resourceId={resourceId} file={file} />)
    await screen.findByLabelText('第 1 页')
    const layer = document.querySelector<HTMLElement>('.pdf-page[data-page="1"] .pdf-text-layer')
    await waitFor(() => expect(layer?.style.getPropertyValue('--total-scale-factor')).toBe('1'))
    // `setLayerDimensions` 用 `round()` 算宽高，少了步长整条 calc 会失效、层撑不到一页大。
    expect(layer?.style.getPropertyValue('--scale-round-x')).toBe('1px')
    expect(layer?.style.getPropertyValue('--scale-round-y')).toBe('1px')
  })

  it('drops the text layer on pages that are far from the viewport', async () => {
    // 与 canvas 同生命周期：离视口远的页只占位。常驻会把几十页的 DOM 撑爆。
    vi.spyOn(api, 'downloadOriginal').mockResolvedValue({ blob: bytes(), fileName: 'paper.pdf' })
    stubCanvas()
    const extra = [
      { width: 600, height: 800 },
      { width: 600, height: 800 },
      { width: 600, height: 800 },
    ]
    pages.push(...extra)
    try {
      render(<PdfReader resourceId={resourceId} file={file} />)
      await screen.findByLabelText('第 1 页')
      await waitFor(() =>
        expect(document.querySelectorAll('.pdf-text-layer').length).toBeGreaterThan(0),
      )
      // 停在第 1 页：只有 1–3 页在渲染窗口内（NEAR_PAGES = 2），4–6 页只占位。
      expect(document.querySelectorAll('.pdf-page')).toHaveLength(6)
      expect(document.querySelectorAll('.pdf-text-layer')).toHaveLength(3)
      expect(document.querySelector('.pdf-page[data-page="6"] .pdf-text-layer')).toBeNull()
      expect(
        document.querySelector('.pdf-page[data-page="6"] .pdf-page-placeholder'),
      ).not.toBeNull()
    } finally {
      pages.length -= extra.length
    }
  })
})
