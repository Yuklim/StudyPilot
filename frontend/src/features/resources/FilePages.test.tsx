import { act, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from '../../App'
import { api, ApiError, MAX_FILE_BYTES, type FileDownload } from '../../api/client'
import { renderWithRouter } from '../../test/render'
import { FileOriginal } from './FileOriginal'
import { fileId, sample, sampleFile } from './fixtures'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function selectFile(file = new File(['original'], '合成原件.txt', { type: 'text/plain' })) {
  fireEvent.change(screen.getByLabelText('原始文件（必填）'), { target: { files: [file] } })
}
function form() {
  renderWithRouter(<App />, '/resources/new')
  fireEvent.change(screen.getByLabelText('标题'), { target: { value: '合成文件资料' } })
  fireEvent.click(screen.getByRole('radio', { name: /上传文件/ }))
}
function submit() {
  fireEvent.submit(screen.getByRole('form', { name: '添加资料表单' }))
}
function openSupplementary() {
  fireEvent.click(screen.getByText('补充信息（选填）'))
}
function urls() {
  const create = vi.fn(() => 'blob:http://localhost/synthetic')
  const revoke = vi.fn()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create
      static revokeObjectURL = revoke
    },
  )
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  return { create, revoke, click }
}
const downloaded = (): FileDownload => ({
  blob: new Blob(['original'], { type: 'text/plain; charset=utf-8' }),
  fileName: '合成原件.txt',
})

describe('file upload form', () => {
  it('validates missing/empty/type/size before sending, and permits clearing the choice', () => {
    const send = vi.spyOn(api, 'uploadResource')
    form()
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('请选择')
    selectFile(new File([], 'empty.txt'))
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('空文件')
    selectFile(new File(['x'], 'unsupported.html'))
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('PDF')
    const large = new File(['x'], 'large.txt')
    Object.defineProperty(large, 'size', { value: MAX_FILE_BYTES + 1 })
    selectFile(large)
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('25 MiB')
    fireEvent.click(screen.getByRole('button', { name: '移除文件' }))
    expect(screen.queryByText('large.txt')).not.toBeInTheDocument()
    expect(send).not.toHaveBeenCalled()
  })
  it('sends one file form, locks input, preserves metadata and navigates only after success', async () => {
    const pending = deferred<unknown>()
    const send = vi.spyOn(api, 'uploadResource').mockReturnValue(pending.promise)
    vi.spyOn(api, 'request').mockResolvedValue({ data: sampleFile({ title: '合成文件资料' }) })
    const persist = vi.spyOn(Storage.prototype, 'setItem')
    form()
    selectFile()
    openSupplementary()
    fireEvent.change(screen.getByLabelText('来源名称（选填）'), { target: { value: '合成书屋' } })
    submit()
    submit()
    expect(send).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '正在上传并保存…' })).toBeDisabled()
    expect(screen.getByLabelText('原始文件（必填）')).toBeDisabled()
    expect(send.mock.calls[0][0].get('source_name')).toBe('合成书屋')
    expect(send.mock.calls[0][0].has('source_url')).toBe(false)
    expect(send.mock.calls[0][0].has('pasted_content')).toBe(false)
    await act(async () => pending.resolve({ data: sampleFile() }))
    // TASK-043 起原件在工具条的「原件」面板里，要先点开才看得到下载按钮。
    fireEvent.click(await screen.findByRole('button', { name: '原件' }))
    expect(await screen.findByRole('button', { name: '下载原件' })).toBeEnabled()
    expect(screen.getByText('合成原件.txt')).toBeInTheDocument()
    expect(persist).not.toHaveBeenCalled()
  })
  it.each([new ApiError('NETWORK_ERROR'), new ApiError('FILE_TYPE_UNSUPPORTED', 415)])(
    'retains file and title on failure without replaying or fabricating success',
    async (error) => {
      const send = vi.spyOn(api, 'uploadResource').mockRejectedValue(error)
      form()
      selectFile()
      submit()
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(error.status === 415 ? '格式' : '保存结果尚未确认')
      if (error.status === 415) expect(alert).not.toHaveTextContent('保存结果尚未确认')
      expect(screen.getByLabelText('标题')).toHaveValue('合成文件资料')
      expect(screen.getByText('合成原件.txt')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '保存到资料库' })).toBeEnabled()
      expect(send).toHaveBeenCalledTimes(1)
    },
  )
  it('does not send a retained file when another source is selected', async () => {
    const fileSend = vi.spyOn(api, 'uploadResource')
    const jsonSend = vi.spyOn(api, 'request').mockResolvedValue({ data: sample() })
    form()
    selectFile()
    fireEvent.click(screen.getByRole('radio', { name: /网页链接/ }))
    fireEvent.change(screen.getByLabelText('网页地址（必填）'), {
      target: { value: 'https://example.test/' },
    })
    submit()
    // 保存成功后进到详情页：TASK-043 起它是阅读器，认它的标志是工具条上的「原网页」
    // 链接与「更多操作」按钮，不再是正文下方的「原始网页」区块。
    await screen.findByRole('link', { name: /原网页/ })
    expect(fileSend).not.toHaveBeenCalled()
    expect(jsonSend.mock.calls[0][1]?.body).toEqual({
      title: '合成文件资料',
      source_type: 'WEB',
      source_url: 'https://example.test/',
    })
  })
  it('ignores an upload completion after leaving the form', async () => {
    const pending = deferred<unknown>()
    vi.spyOn(api, 'uploadResource').mockReturnValue(pending.promise)
    form()
    selectFile()
    submit()
    fireEvent.click(
      within(screen.getByRole('navigation', { name: '更多能力' })).getByRole('link', {
        name: '学习记录',
      }),
    )
    await act(async () => pending.resolve({ data: sampleFile() }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('学习记录')
  })
})

describe('original-file download', () => {
  it('downloads only on click, prevents duplicate pending requests and revokes URLs on exit', async () => {
    const { create, revoke, click } = urls()
    const pending = deferred<FileDownload>()
    const send = vi.spyOn(api, 'downloadOriginal').mockReturnValue(pending.promise)
    const { unmount, container } = renderWithRouter(
      <FileOriginal file={sampleFile().original_file!} />,
    )
    expect(send).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '下载原件' }))
    fireEvent.click(screen.getByRole('button', { name: '正在校验并下载…' }))
    expect(send).toHaveBeenCalledExactlyOnceWith(fileId)
    await act(async () => pending.resolve(downloaded()))
    expect(create).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    const anchor = click.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('合成原件.txt')
    expect(anchor.href).toMatch(/^blob:/)
    expect(screen.getByRole('status')).toHaveTextContent('浏览器下载列表')
    expect(container.querySelector('iframe, object, embed')).toBeNull()
    unmount()
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:http://localhost/synthetic')
  })
  it('releases the object URL after the browser has received the click', async () => {
    const { revoke } = urls()
    vi.spyOn(api, 'downloadOriginal').mockResolvedValue(downloaded())
    vi.useFakeTimers()
    try {
      renderWithRouter(<FileOriginal file={sampleFile().original_file!} />)
      await act(async () => fireEvent.click(screen.getByRole('button', { name: '下载原件' })))
      expect(revoke).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(1000))
      expect(revoke).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
  it.each([
    'FILE_CORRUPTED',
    'FILE_NOT_FOUND',
    'FILE_STATE_UNAVAILABLE',
    'STORAGE_PATH_UNAVAILABLE',
  ] as const)('shows controlled %s without attempting a save', async (code) => {
    const { create, click } = urls()
    const send = vi.spyOn(api, 'downloadOriginal').mockRejectedValue(new ApiError(code, 409))
    renderWithRouter(<FileOriginal file={sampleFile().original_file!} />)
    fireEvent.click(screen.getByRole('button', { name: '下载原件' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(new ApiError(code).message)
    expect(create).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('does not download when an in-flight request completes after unmount', async () => {
    const { create, click } = urls()
    const pending = deferred<FileDownload>()
    vi.spyOn(api, 'downloadOriginal').mockReturnValue(pending.promise)
    const { unmount } = renderWithRouter(<FileOriginal file={sampleFile().original_file!} />)
    fireEvent.click(screen.getByRole('button', { name: '下载原件' }))
    unmount()
    await act(async () => pending.resolve(downloaded()))
    expect(create).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
  })
})
