import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../api/client'
import { PdfReader } from './PdfReader'
import { pdfPositionKey } from './pdfPosition'
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

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
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
              cleanup: () => {},
            }),
          destroy: () => Promise.resolve(),
        }),
  }),
}))
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
