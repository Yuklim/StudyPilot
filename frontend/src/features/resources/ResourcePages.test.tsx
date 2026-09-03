import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from '../../App'
import { api, ApiError } from '../../api/client'
import { renderWithRouter } from '../../test/render'
import { resourceId, sample, samplePage } from './fixtures'

function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
function submit() {
  fireEvent.submit(screen.getByRole('form', { name: '添加资料表单' }))
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('resource form', () => {
  it('validates required fields, URL safety, lengths and blank paste without a request', () => {
    const request = vi.spyOn(api, 'request')
    renderWithRouter(<App />, '/resources/new')
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('1～200')
    change('标题（必填）', '合成标题')
    change('网页地址（必填）', 'javascript:alert(1)')
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('http 或 https')
    change('网页地址（必填）', 'https://example.com')
    change('来源名称（选填）', '字'.repeat(121))
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('最多 120 字')
    change('来源名称（选填）', '')
    fireEvent.click(screen.getByRole('radio', { name: /粘贴内容/ }))
    change('粘贴原文（必填）', ' \n ')
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('非空原文')
    expect(request).not.toHaveBeenCalled()
  })
  it('submits WEB once while pending, excludes paste fields and navigates to real detail', async () => {
    const pending = deferred<unknown>()
    const request = vi
      .spyOn(api, 'request')
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ data: sample() })
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    renderWithRouter(<App />, '/resources/new')
    change('标题（必填）', ' 合成阅读资料 ')
    change('网页地址（必填）', 'https://example.com/article')
    change('保存原因（选填）', '慢慢理解')
    submit()
    submit()
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/api/v1/resources', {
      method: 'POST',
      body: {
        source_type: 'WEB',
        title: '合成阅读资料',
        source_url: 'https://example.com/article',
        save_reason: '慢慢理解',
      },
    })
    expect(screen.getByRole('button', { name: '正在保存…' })).toBeDisabled()
    await act(async () => pending.resolve({ data: sample() }))
    expect(
      await screen.findByRole('heading', { name: '合成阅读资料', level: 2 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '资料详情', level: 1 })).toHaveFocus()
    expect(storage).not.toHaveBeenCalled()
  })
  it('preserves PASTE whitespace, serializes only the selected source and leaves failure inputs intact', async () => {
    const request = vi.spyOn(api, 'request').mockRejectedValue(new ApiError('NETWORK_ERROR'))
    renderWithRouter(<App />, '/resources/new')
    change('标题（必填）', '文字')
    change('网页地址（必填）', 'https://example.com')
    fireEvent.click(screen.getByRole('radio', { name: /粘贴内容/ }))
    const text = '  # 合成原文\n<script>bad()</script>\n '
    change('粘贴原文（必填）', text)
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('保存结果尚未确认')
    expect(screen.getByLabelText('粘贴原文（必填）')).toHaveValue(text)
    expect(request).toHaveBeenCalledExactlyOnceWith('/api/v1/resources', {
      method: 'POST',
      body: { source_type: 'PASTE', title: '文字', pasted_content: text },
    })
    expect(screen.getByRole('button', { name: '保存到资料库' })).toBeEnabled()
  })
  it('does not navigate on a late save after the user leaves', async () => {
    const pending = deferred<unknown>()
    vi.spyOn(api, 'request').mockReturnValue(pending.promise)
    renderWithRouter(<App />, '/resources/new')
    change('标题（必填）', '合成')
    change('网页地址（必填）', 'https://example.com')
    submit()
    fireEvent.click(
      within(screen.getByRole('navigation', { name: '主要导航' })).getByRole('link', {
        name: '学习记录',
      }),
    )
    await act(async () => pending.resolve({ data: sample() }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('学习记录')
  })
})

describe('resource library', () => {
  it('distinguishes loading, service errors, retries and an empty library', async () => {
    const request = vi
      .spyOn(api, 'request')
      .mockRejectedValueOnce(new ApiError('UNKNOWN_ERROR', 500))
      .mockResolvedValue(samplePage([]))
    renderWithRouter(<App />, '/resources')
    expect(screen.getByRole('status')).toHaveTextContent('正在翻开')
    expect(await screen.findByRole('alert')).toHaveTextContent('创建数据库')
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    expect(
      await screen.findByRole('heading', { name: '给想学的内容，留一个位置' }),
    ).toBeInTheDocument()
    expect(request).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  })
  it('applies combined queries, resets pagination, shows tags/progress and switches views', async () => {
    const item = sample({
      tags: [{ id: resourceId, name: '合成标签' }],
      progress: { status: 'IN_PROGRESS', progress_percent: 30 },
    })
    const request = vi
      .spyOn(api, 'request')
      .mockResolvedValueOnce(
        samplePage([item], { total_items: 21, total_pages: 2, has_more: true }),
      )
      .mockResolvedValueOnce(
        samplePage([sample({ title: '第二页' })], { number: 2, total_items: 21, total_pages: 2 }),
      )
      .mockResolvedValue(samplePage([]))
    renderWithRouter(<App />, '/resources')
    expect(await screen.findByText('学习中 · 30%')).toBeInTheDocument()
    expect(screen.getByText('合成标签')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '列表' }))
    expect(screen.getByRole('list', { name: '资料结果' })).toHaveClass('list')
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(await screen.findByText('第二页')).toBeInTheDocument()
    expect(request.mock.lastCall?.[0]).toContain('page=2')
    change('搜索资料', ' 合成 & 标题 ')
    change('资料类型', 'PASTE')
    change('学习状态', 'ARCHIVED')
    change('排序', '-progress_percent')
    fireEvent.click(screen.getByRole('button', { name: '搜索 / 应用筛选' }))
    expect(await screen.findByRole('heading', { name: '这一页没有找到资料' })).toBeInTheDocument()
    const url = new URL(request.mock.lastCall![0], 'http://example.test')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '1',
      page_size: '20',
      sort: '-progress_percent',
      q: '合成 & 标题',
      source_type: 'PASTE',
      learning_status: 'ARCHIVED',
    })
    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    await waitFor(() =>
      expect(request.mock.lastCall![0]).toBe(
        '/api/v1/resources?page=1&page_size=20&sort=-created_at',
      ),
    )
    expect(screen.getByLabelText('搜索资料')).toHaveValue('')
  })
  it('ignores older search responses and rejects oversized search without sending it', async () => {
    const old = deferred<unknown>()
    const request = vi
      .spyOn(api, 'request')
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue(samplePage([sample({ title: '新的结果' })]))
    renderWithRouter(<App />, '/resources')
    change('搜索资料', '字'.repeat(201))
    fireEvent.click(screen.getByRole('button', { name: '搜索 / 应用筛选' }))
    expect(screen.getByRole('alert')).toHaveTextContent('最多 200 字')
    expect(request).toHaveBeenCalledTimes(1)
    change('搜索资料', '新的')
    fireEvent.click(screen.getByRole('button', { name: '搜索 / 应用筛选' }))
    expect(await screen.findByText('新的结果')).toBeInTheDocument()
    await act(async () => old.resolve(samplePage([sample({ title: '过期的结果' })])))
    expect(screen.queryByText('过期的结果')).not.toBeInTheDocument()
  })
})

describe('resource detail', () => {
  it.each([
    new ApiError('REQUEST_FAILED', 404),
    new ApiError('NETWORK_ERROR'),
    new ApiError('INVALID_RESPONSE'),
  ])('shows a recoverable controlled error', async (error) => {
    vi.spyOn(api, 'request').mockRejectedValue(error)
    renderWithRouter(<App />, `/resources/${resourceId}`)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeEnabled()
    expect(screen.getByRole('link', { name: '返回资料库' })).toBeInTheDocument()
  })
  it('renders original text rather than executing markup', async () => {
    const text = '\n<script>alert("合成")</script>\n<img src=x onerror=bad()>\n '
    vi.spyOn(api, 'request').mockResolvedValue({
      data: sample({ source_type: 'PASTE', pasted_content: text }),
    })
    const { container } = renderWithRouter(<App />, `/resources/${resourceId}`)
    const original = await screen.findByLabelText('粘贴原文内容')
    expect(original.textContent).toBe(text)
    expect(container.querySelector('script, img, iframe')).toBeNull()
  })
  it.each(['javascript:alert(1)', 'https://example.com'])(
    'isolates safe external links and blocks unsafe ones',
    async (url) => {
      vi.spyOn(api, 'request').mockResolvedValue({ data: sample({ source_url: url }) })
      renderWithRouter(<App />, `/resources/${resourceId}`)
      await screen.findByText('原始网页')
      const link = screen.queryByRole('link', { name: /打开原网页/ })
      if (url.startsWith('javascript:')) expect(link).toBeNull()
      else {
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
        expect(link).toHaveAttribute('referrerpolicy', 'no-referrer')
      }
    },
  )
})
