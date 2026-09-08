import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import App from '../../App'
import { api, ApiError } from '../../api/client'
import type { Resource } from './api'
import { renderWithRouter } from '../../test/render'
import { resourceId, sample, sampleFile, samplePage } from './fixtures'
import { category, categoryPage, tagId } from '../taxonomy/fixtures'

function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
function submit() {
  fireEvent.submit(screen.getByRole('form', { name: '添加资料表单' }))
}
function openSupplementary() {
  fireEvent.click(screen.getByText('补充信息（选填）'))
}
function Address() {
  // Exposes the router's query string so the tests can assert what lands in the URL.
  return <output data-testid="address">{useLocation().search}</output>
}
const address = () => screen.getByTestId('address').textContent
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('resource form', () => {
  it('validates the source URL, lengths and blank paste without a request', () => {
    const request = vi.spyOn(api, 'request')
    renderWithRouter(<App />, '/resources/new')
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('http 或 https')
    change('网页地址（必填）', 'javascript:alert(1)')
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('http 或 https')
    change('网页地址（必填）', 'https://example.com')
    openSupplementary()
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
  it('keeps supplementary fields collapsed by default and reveals them when expanded', () => {
    renderWithRouter(<App />, '/resources/new')
    expect(screen.getByText('补充信息（选填）')).toBeInTheDocument()
    expect(screen.getByLabelText('来源名称（选填）')).not.toBeVisible()
    expect(screen.getByLabelText('保存原因（选填）')).not.toBeVisible()
    openSupplementary()
    expect(screen.getByLabelText('来源名称（选填）')).toBeVisible()
    expect(screen.getByLabelText('保存原因（选填）')).toBeVisible()
  })
  it('derives a file title from the file name only when the title is still empty', () => {
    renderWithRouter(<App />, '/resources/new')
    fireEvent.click(screen.getByRole('radio', { name: /上传文件/ }))
    fireEvent.change(screen.getByLabelText('原始文件（必填）'), {
      target: { files: [new File(['x'], 'Zotero入门指南.pdf', { type: 'application/pdf' })] },
    })
    expect(screen.getByLabelText('标题')).toHaveValue('Zotero入门指南')
  })
  it('does not overwrite a manually entered title when a file is chosen', () => {
    renderWithRouter(<App />, '/resources/new')
    change('标题', '我自己起的名字')
    fireEvent.click(screen.getByRole('radio', { name: /上传文件/ }))
    fireEvent.change(screen.getByLabelText('原始文件（必填）'), {
      target: { files: [new File(['x'], 'Another.pdf', { type: 'application/pdf' })] },
    })
    expect(screen.getByLabelText('标题')).toHaveValue('我自己起的名字')
  })
  it('derives a paste title from the first non-empty line and trims heading markers', () => {
    renderWithRouter(<App />, '/resources/new')
    fireEvent.click(screen.getByRole('radio', { name: /粘贴内容/ }))
    change('粘贴原文（必填）', '\n  # 一个 Markdown 标题\n正文开始\n')
    expect(screen.getByLabelText('标题')).toHaveValue('一个 Markdown 标题')
  })
  it('does not overwrite a manually entered title when pasting content', () => {
    renderWithRouter(<App />, '/resources/new')
    change('标题', '保留我写的标题')
    fireEvent.click(screen.getByRole('radio', { name: /粘贴内容/ }))
    change('粘贴原文（必填）', '# 应被忽略的标题\n')
    expect(screen.getByLabelText('标题')).toHaveValue('保留我写的标题')
  })
  it('leaves the WEB title for the user and never auto-fills it from the URL', () => {
    const request = vi.spyOn(api, 'request')
    renderWithRouter(<App />, '/resources/new')
    fireEvent.click(screen.getByRole('radio', { name: /网页链接/ }))
    change('网页地址（必填）', 'https://example.com/article')
    expect(screen.getByLabelText('标题')).toHaveValue('')
    expect(screen.getByLabelText('标题')).not.toHaveFocus()
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
    change('标题', ' 合成阅读资料 ')
    change('网页地址（必填）', 'https://example.com/article')
    openSupplementary()
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
    // **焦点落点仍在 h1 上，只是 TASK-044 起那个 h1 就是资料标题本身**（页头块在这一页
    // 不再渲染）。这比原来断言「资料详情」更强：它同时钉住了「标题是这份资料的名字」
    // 与「导航后焦点落在它上面」两件事。
    //
    // **它还顺带守住了一次真实的失效**：阅读器先渲染「正在打开资料」这个 h1 并拿到焦点，
    // 数据到了再换成真正的标题——旧节点一移除，焦点就掉到 `body`，导航过来的键盘用户
    // 在数据到达的一瞬间失去落点，而屏幕上完全看不出来。这条用例在 `App.tsx` 补上焦点
    // 交接之前是红的。
    const heading = await screen.findByRole('heading', { name: '合成阅读资料', level: 1 })
    expect(heading).toHaveFocus()
    expect(screen.queryByRole('heading', { name: '资料详情' })).toBeNull()
    expect(storage).not.toHaveBeenCalled()
  })
  it('saves a WEB link with a blank title as an untitled resource and shows the placeholder', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ data: sample({ title: null }) })
    renderWithRouter(<App />, '/resources/new')
    change('网页地址（必填）', 'https://example.com/article')
    submit()
    expect(await screen.findByRole('heading', { name: '未命名资料', level: 1 })).toBeInTheDocument()
    expect(request.mock.calls[0]).toEqual([
      '/api/v1/resources',
      { method: 'POST', body: { source_type: 'WEB', source_url: 'https://example.com/article' } },
    ])
  })
  it('preserves PASTE whitespace, serializes only the selected source and leaves failure inputs intact', async () => {
    const request = vi.spyOn(api, 'request').mockRejectedValue(new ApiError('NETWORK_ERROR'))
    renderWithRouter(<App />, '/resources/new')
    change('标题', '文字')
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
    change('标题', '合成')
    change('网页地址（必填）', 'https://example.com')
    submit()
    fireEvent.click(
      within(screen.getByRole('navigation', { name: '更多能力' })).getByRole('link', {
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
      progress: { ...sample().progress, status: 'IN_PROGRESS', progress_percent: 30 },
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
  it('shows the untitled placeholder in list and card views for resources without a title', async () => {
    vi.spyOn(api, 'request').mockResolvedValue(samplePage([sample({ title: null })]))
    renderWithRouter(<App />, '/resources')
    expect(await screen.findByRole('heading', { name: '未命名资料' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '卡片' }))
    expect(await screen.findByRole('heading', { name: '未命名资料' })).toBeInTheDocument()
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
    // TASK-043 起粘贴原文在工具条的面板里，要先点开。**先断言它默认不在**：
    // 「收进按钮」这件事本身就是本次改版的内容，默认就渲染出来等于没搬。
    await screen.findByRole('button', { name: '粘贴原文' })
    expect(screen.queryByLabelText('粘贴原文内容')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '粘贴原文' }))
    const original = await screen.findByLabelText('粘贴原文内容')
    expect(original.textContent).toBe(text)
    expect(container.querySelector('script, img, iframe')).toBeNull()
  })
  it.each(['javascript:alert(1)', 'https://example.com'])(
    'isolates safe external links and blocks unsafe ones',
    async (url) => {
      vi.spyOn(api, 'request').mockResolvedValue({ data: sample({ source_url: url }) })
      renderWithRouter(<App />, `/resources/${resourceId}`)
      // TASK-043 起原网页是工具条上的一个链接，不再是正文下方的「原始网页」区块。
      // 三件套（target / rel / referrerpolicy）与「伪协议不生成链接」一条不改。
      await screen.findByRole('button', { name: '更多操作' })
      const link = screen.queryByRole('link', { name: /原网页/ })
      if (url.startsWith('javascript:')) {
        expect(link).toBeNull()
        // 拒掉之后不能只是静默消失：用户要知道这条网址打不开。
        expect(screen.getByText('原网址无法安全打开')).toHaveAttribute('role', 'alert')
      } else {
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
        expect(link).toHaveAttribute('referrerpolicy', 'no-referrer')
      }
    },
  )
})

describe('resource library filters in the address bar', () => {
  it('applies filters to the URL, restores them on load and clears them on reset', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue(samplePage([]))
    renderWithRouter(
      <>
        <App />
        <Address />
      </>,
      '/resources?q=%E5%B7%B2%E5%AD%98&learning_status=ARCHIVED&sort=title&page=3',
    )
    // Seeded from the address bar: both the request and the form reflect it.
    await waitFor(() => expect(request).toHaveBeenCalled())
    const seeded = new URL(request.mock.lastCall![0], 'http://example.test')
    expect(Object.fromEntries(seeded.searchParams)).toEqual({
      page: '3',
      page_size: '20',
      sort: 'title',
      q: '已存',
      learning_status: 'ARCHIVED',
    })
    expect(screen.getByLabelText('搜索资料')).toHaveValue('已存')
    expect(screen.getByLabelText('学习状态')).toHaveValue('ARCHIVED')

    change('搜索资料', ' 新词 ')
    change('资料类型', 'PASTE')
    fireEvent.click(screen.getByRole('button', { name: '搜索 / 应用筛选' }))
    await waitFor(() => expect(address()).toContain('q=%E6%96%B0%E8%AF%8D'))
    // Applying a filter returns to the first page, so `page` drops out of the URL.
    expect(address()).toContain('source_type=PASTE')
    expect(address()).not.toContain('page=')

    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    await waitFor(() => expect(address()).toBe(''))
    expect(screen.getByLabelText('搜索资料')).toHaveValue('')
  })
  it('renders every tag as a link that filters the library by that tag', async () => {
    vi.spyOn(api, 'request').mockResolvedValue(
      samplePage([sample({ tags: [{ id: tagId, name: '合成标签' }] })]),
    )
    renderWithRouter(<App />, '/resources')
    const link = await screen.findByRole('link', { name: '合成标签' })
    expect(link).toHaveAttribute('href', `/resources?tag_id=${tagId}`)
    fireEvent.click(screen.getByRole('button', { name: '卡片' }))
    expect(await screen.findByRole('link', { name: '合成标签' })).toHaveAttribute(
      'href',
      `/resources?tag_id=${tagId}`,
    )
  })
  it('resolves the tag name behind an id in the URL and reports one it cannot read', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === `/api/v1/tags/${tagId}`)
        return { data: category({ id: tagId, name: '来自网址' }) }
      if (path.startsWith('/api/v1/tags/')) throw new ApiError('TAG_NOT_FOUND', 404)
      return samplePage([])
    })
    const missing = '00000000-0000-4000-8000-0000000000ff'
    renderWithRouter(<App />, `/resources?tag_id=${tagId}&tag_id=${missing}`)
    expect(await screen.findByText(/已不存在或读不到/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /移除已选标签 来自网址/ })).toBeInTheDocument()
    // The unreadable id keeps filtering; it is only its name that cannot be shown.
    const sent = new URL(
      request.mock.calls.filter(([path]) => path.startsWith('/api/v1/resources')).at(-1)![0],
      'http://example.test',
    )
    expect(sent.searchParams.getAll('tag_id')).toEqual([tagId, missing])
  })
  it('clears an unapplied draft on reset even when the address is already empty', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path.startsWith('/api/v1/tags?'))
        return categoryPage([category({ id: tagId, name: '合成标签' })])
      if (path.startsWith('/api/v1/topics?')) return categoryPage([])
      return samplePage([])
    })
    renderWithRouter(
      <>
        <App />
        <Address />
      </>,
      '/resources',
    )
    await waitFor(() => expect(request).toHaveBeenCalled())
    change('搜索资料', '还没应用的词')
    fireEvent.click(screen.getByRole('button', { name: '按主题与标签筛选' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: '合成标签' }))
    expect(screen.getByText(/已选 1 个标签/)).toBeInTheDocument()
    // The address never changed, so the render-time sync cannot do this for us.
    expect(address()).toBe('')
    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.getByLabelText('搜索资料')).toHaveValue('')
    expect(screen.getByText(/已选 0 个标签/)).toBeInTheDocument()
    expect(address()).toBe('')
  })
  it('makes the tag on a resource detail page a filter link too', async () => {
    vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path.startsWith(`/api/v1/resources/${resourceId}/notes?`))
        return {
          data: [],
          page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
        }
      if (path === `/api/v1/resources/${resourceId}`)
        return { data: sample({ tags: [{ id: tagId, name: '详情页标签' }] }) }
      return samplePage([])
    })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    expect(await screen.findByRole('link', { name: '详情页标签' })).toHaveAttribute(
      'href',
      `/resources?tag_id=${tagId}`,
    )
  })
  it('keeps the unreadable-classification warning while that id is still filtering', async () => {
    const missing = '00000000-0000-4000-8000-0000000000ff'
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path.startsWith('/api/v1/tags/')) throw new ApiError('TAG_NOT_FOUND', 404)
      return samplePage([sample()], { total_items: 21, total_pages: 2, has_more: true })
    })
    renderWithRouter(<App />, `/resources?tag_id=${missing}`)
    expect(await screen.findByText(/已不存在或读不到/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(request.mock.lastCall?.[0]).toContain('page=2'))
    // Paging must not quietly drop the warning: the bad id is still filtering.
    expect(screen.getByText(/已不存在或读不到/)).toBeInTheDocument()
    expect(
      new URL(request.mock.lastCall![0], 'http://x.test').searchParams.getAll('tag_id'),
    ).toEqual([missing])
  })
  it('ignores filter values in the address it cannot understand, and says so', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue(samplePage([]))
    renderWithRouter(
      <>
        <App />
        <Address />
      </>,
      `/resources?sort=bogus&source_type=BOGUS&learning_status=BOGUS&q=${'字'.repeat(201)}&page=2`,
    )
    const notice = await screen.findByText(/读不懂，已忽略/)
    for (const label of ['排序', '资料类型', '学习状态', '搜索词'])
      expect(notice).toHaveTextContent(label)
    // Nothing unusable reaches the backend; the page number is still honoured.
    const sent = new URL(request.mock.lastCall![0], 'http://x.test')
    expect(Object.fromEntries(sent.searchParams)).toEqual({
      page: '2',
      page_size: '20',
      sort: '-created_at',
    })
    expect(screen.getByLabelText('搜索资料')).toHaveValue('')
    expect(screen.getByLabelText('资料类型')).toHaveValue('')
  })
  it('leaves a legitimate filter address untouched', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue(samplePage([]))
    renderWithRouter(<App />, '/resources?sort=title&source_type=PASTE&learning_status=ARCHIVED')
    await waitFor(() => expect(request).toHaveBeenCalled())
    expect(screen.queryByText(/读不懂，已忽略/)).not.toBeInTheDocument()
    const sent = new URL(request.mock.lastCall![0], 'http://x.test')
    expect(Object.fromEntries(sent.searchParams)).toEqual({
      page: '1',
      page_size: '20',
      sort: 'title',
      source_type: 'PASTE',
      learning_status: 'ARCHIVED',
    })
  })
  it('offers no tag creation while filtering, only while choosing tags for a resource', async () => {
    vi.spyOn(api, 'request').mockImplementation(async (path) =>
      path.startsWith('/api/v1/tags?') || path.startsWith('/api/v1/topics?')
        ? categoryPage([])
        : samplePage([]),
    )
    renderWithRouter(<App />, '/resources')
    fireEvent.click(await screen.findByRole('button', { name: '按主题与标签筛选' }))
    expect(await screen.findByRole('heading', { name: '标签' })).toBeInTheDocument()
    expect(screen.queryByLabelText('新建标签')).not.toBeInTheDocument()
  })
})

describe('content snapshot', () => {
  const detailPath = `/api/v1/resources/${resourceId}`
  const snapshotPath = `${detailPath}/snapshot`
  const frozen = {
    id: tagId,
    resource_id: resourceId,
    format: 'MARKDOWN',
    content: '# 冻结的标题\n\n正文。\n',
    char_count: 12,
    sha256: 'a'.repeat(64),
    captured_at: '2026-09-06T00:00:00Z',
    captured_from_url: null,
    extractor: 'manual',
    status: 'READY',
    failure_code: null,
    version: 1,
    created_at: '2026-09-06T00:00:00Z',
    updated_at: '2026-09-06T00:00:00Z',
  }
  const detail = (path: string) =>
    path.startsWith(`${detailPath}/notes?`)
      ? { data: [], page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false } }
      : path === detailPath
        ? { data: sample() }
        : undefined

  it('offers to paste the text when a resource has none, and saves it without a version', async () => {
    let stored: unknown = undefined
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (path === snapshotPath && options?.method === 'PUT') {
        stored = options.body
        return { data: frozen }
      }
      if (path === snapshotPath) {
        if (stored === undefined) throw new ApiError('SNAPSHOT_NOT_FOUND', 404)
        return { data: frozen }
      }
      return detail(path) ?? samplePage([])
    })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    expect(await screen.findByText(/还没有保存正文/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '粘贴正文' }))
    fireEvent.change(screen.getByLabelText('正文（Markdown）'), {
      target: { value: '# 冻结的标题\n\n正文。\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存正文' }))
    // Wait for the stored metadata, not the text: the draft textarea holds the same
    // characters, so matching on the body would pass before the write finished.
    await screen.findByText(/共 12 字/)
    // First write carries no expected_version: there is nothing to replace yet.
    expect(request.mock.calls.find(([, o]) => o?.method === 'PUT')?.[1]?.body).toEqual({
      content: '# 冻结的标题\n\n正文。\n',
    })
    expect(screen.getByRole('region', { name: '正文快照' })).toHaveTextContent('不随原文更新')
  })
  it('replaces an existing snapshot with its version and can delete it', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (path === snapshotPath && options?.method === 'PUT')
        return { data: { ...frozen, content: '# 换过了\n', version: 2 } }
      if (path === snapshotPath && options?.method === 'DELETE') return undefined
      if (path === snapshotPath) return { data: frozen }
      return detail(path) ?? samplePage([])
    })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByText(/共 12 字/)
    fireEvent.click(screen.getByRole('button', { name: '替换正文' }))
    fireEvent.change(screen.getByLabelText('正文（Markdown）'), { target: { value: '# 换过了\n' } })
    fireEvent.click(screen.getByRole('button', { name: '替换正文' }))
    await waitFor(() =>
      expect(request.mock.calls.find(([, o]) => o?.method === 'PUT')?.[1]?.body).toEqual({
        content: '# 换过了\n',
        expected_version: 1,
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: '删除正文' }))
    await waitFor(() =>
      expect(request.mock.calls.find(([, o]) => o?.method === 'DELETE')?.[1]).toEqual({
        method: 'DELETE',
        ifMatchVersion: 1,
      }),
    )
  })
  // TASK-036 shipped WEB-only wording for all three source types and the existing
  // assertions could not catch it: they checked that a sentence was on screen, not
  // that it was true. These pin the sentence each source type should get, and the
  // WEB-only ones it must not get.
  // TASK-043 把原文/原件的入口搬到了上方工具条，因此这里的方位词由「下方」改为
  // 「上方工具条」，锚点也由「下方的区块」改为「工具条上的那个控件」。
  const sources = [
    ['WEB', sample(), '上方工具条的「原网页」', '只存链接的话', 'link', '原网页'],
    [
      'PASTE',
      sample({ source_type: 'PASTE', pasted_content: '合成原文' }),
      '上方工具条里的「粘贴原文」',
      '粘贴的原文在上方工具条里',
      'button',
      '粘贴原文',
    ],
    ['FILE', sampleFile(), '上方工具条里的原件', '原件在上方工具条里', 'button', '原件'],
  ] as const

  // 「上方」是一句关于版面的陈述，不是一句文案。只断言字符串的话，把被指向的控件
  // 挪到快照下面，这句话当场变假而断言全绿 —— 那正是 TASK-036 那个 bug 的复发形态。
  // 所以把方位词和 DOM 实际顺序绑成一条：被指向的控件必须真的排在快照区块之前。
  // **本次改版正是被这条守卫拦下的**：入口搬上去之后旧文案「见下方」变假，它先红了。
  const assertAbove = (region: HTMLElement, role: string, controlName: string) => {
    const control = screen.getByRole(role, { name: controlName })
    expect(region.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  }

  const mount = (item: Resource, snapshot: typeof frozen | undefined) => {
    vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === snapshotPath) {
        if (!snapshot) throw new ApiError('SNAPSHOT_NOT_FOUND', 404)
        return { data: snapshot }
      }
      if (path.startsWith(`${detailPath}/notes?`))
        return {
          data: [],
          page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
        }
      if (path === detailPath) return { data: item }
      return samplePage([])
    })
    renderWithRouter(<App />, `/resources/${resourceId}`)
  }

  it.each(sources)(
    'points a %s resource at the original it actually has',
    async (source, item, hint, _empty, role, controlName) => {
      mount(item, frozen)
      await screen.findByText(/共 12 字/)
      const region = screen.getByRole('region', { name: '正文快照' })
      expect(region).toHaveTextContent(hint)
      // The link only exists for WEB, and it sits above this block, never below.
      if (source !== 'WEB') expect(region).not.toHaveTextContent('原网页')
      expect(region).not.toHaveTextContent('下方')
      assertAbove(region, role, controlName)
    },
  )

  it.each(sources)(
    'tells a %s resource with no snapshot what it is missing',
    async (source, item, _hint, empty, role, controlName) => {
      mount(item, undefined)
      const region = await screen.findByRole('region', { name: '正文快照' })
      await waitFor(() => expect(region).toHaveTextContent(empty))
      // "只存链接的话" is only true of a WEB resource: PASTE and FILE keep their own
      // original in the record, so losing the link is not what is at stake for them.
      if (source !== 'WEB') expect(region).not.toHaveTextContent('只存链接的话')
      // The empty-state copy says 上方 too, so it needs the same guard.
      assertAbove(region, role, controlName)
    },
  )

  it('reports a version conflict without retrying', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (path === snapshotPath && options?.method === 'PUT')
        throw new ApiError('VERSION_CONFLICT', 409, undefined, { current_version: 3 })
      if (path === snapshotPath) return { data: frozen }
      return detail(path) ?? samplePage([])
    })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByText(/共 12 字/)
    fireEvent.click(screen.getByRole('button', { name: '替换正文' }))
    fireEvent.change(screen.getByLabelText('正文（Markdown）'), { target: { value: '新的' } })
    fireEvent.click(screen.getByRole('button', { name: '替换正文' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('没有自动重试')
    expect(request.mock.calls.filter(([, o]) => o?.method === 'PUT')).toHaveLength(1)
  })
})
