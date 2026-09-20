import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import App from '../../App'
import { ApiError, api } from '../../api/client'
import { renderWithRouter } from '../../test/render'
import { resourceId, sample, samplePage } from '../resources/fixtures'
import type { Note } from './api'
import { note as boundNote, notePage } from './fixtures'

/**
 * 「我的心得」两栏管理 + 预览（TASK-061）。`GET /notes` 仍只列独立心得；TASK-070 起它多了
 * 一个按标题搜的 `q`，页面的搜索框改走接口（命中覆盖全部心得，不再只过滤已加载的几页）。
 * 这里守的是页面：列表/搜索/选中写网址/预览去重与转义/后贴/删除/加载更多/窄屏直接进编辑页。
 */
const note = (overrides: Partial<Note> = {}): Note => boundNote({ resource_id: null, ...overrides })
const A = '018f1f58-4eb2-4a0d-a716-fb81b19600a1'
const B = '018f1f58-4eb2-4a0d-a716-fb81b19600b2'
const C = '018f1f58-4eb2-4a0d-a716-fb81b19600c3'
const rows = () => [
  note({
    id: A,
    content: '# 甲的标题\n\n甲的**正文**第一段。',
    updated_at: '2026-09-14T03:00:00Z',
  }),
  note({ id: B, content: '乙只有一行', updated_at: '2026-09-13T03:00:00Z' }),
  note({
    id: C,
    content: '# 丙\n\n<script>alert(1)</script> 丙的正文',
    updated_at: '2026-09-12T03:00:00Z',
  }),
]
type Handler = (path: string, options?: { method?: string; body?: unknown }) => unknown
function mock(handler: Handler) {
  return vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
    const out = handler(path, options as { method?: string; body?: unknown })
    if (out instanceof Error) throw out
    return out
  })
}
function wide(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query.includes('1024') ? matches : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
}
const list = () => screen.getByRole('list', { name: '心得列表' })
const main = () => document.getElementById('main-content')!
function Address() {
  return <output data-testid="address">{useLocation().search}</output>
}
const address = () => screen.getByTestId('address').textContent
const mount = (route: string) =>
  renderWithRouter(
    <>
      <App />
      <Address />
    </>,
    route,
  )

describe('notes manager page', () => {
  it('lists standalone notes newest-updated first with a title, a snippet and a time', async () => {
    wide(true)
    const request = mock((path) => {
      if (path.startsWith('/api/v1/notes?')) return notePage(rows())
      return samplePage([])
    })
    mount('/notes')
    expect(await screen.findByText('共 3 条独立心得', { exact: false })).toBeInTheDocument()
    const sent = request.mock.calls.map(([p]) => p).find((p) => p.startsWith('/api/v1/notes?'))
    expect(sent).toBe('/api/v1/notes?page=1&page_size=100&sort=-updated_at')
    const items = within(list()).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(within(items[0]!).getByText('甲的标题')).toBeInTheDocument()
    expect(within(items[0]!).getByText('甲的正文第一段。')).toBeInTheDocument()
    expect(within(items[1]!).getByText('乙只有一行')).toBeInTheDocument()
    expect(within(list()).queryByText(/\*\*/)).toBeNull()
    // 未选中：右栏提示。
    expect(screen.getByText('从左边选一条，在这里预览。')).toBeInTheDocument()
    // 没有旧页面的写作框，页内也不放写入口（TASK-062）：写心得走侧栏按钮 / ⌘J。
    expect(screen.queryByRole('form', { name: '心得编辑' })).toBeNull()
    expect(within(main()).queryByRole('link', { name: /写心得|写一条/ })).toBeNull()
  })

  it('selecting a note writes ?note= to the address and previews it with escaping and no repeated title', async () => {
    wide(true)
    mock((path) => (path.startsWith('/api/v1/notes?') ? notePage(rows()) : samplePage([])))
    mount('/notes')
    await screen.findByText('甲的标题')
    fireEvent.click(within(list()).getByRole('link', { name: /丙/ }))
    await waitFor(() => expect(address()).toBe(`?note=${C}`))
    const preview = await screen.findByRole('article', { name: '心得预览' })
    expect(within(preview).getByRole('heading', { name: '丙', level: 2 })).toBeInTheDocument()
    const body = preview.querySelector('.notes-preview-body')!
    expect(body.querySelector('script')).toBeNull()
    expect(body.textContent).toContain('<script>alert(1)</script> 丙的正文')
    expect(body.querySelector('h1')).toBeNull()
    expect(within(preview).getByRole('link', { name: '编辑' })).toHaveAttribute(
      'href',
      `/notes/${C}`,
    )
    expect(within(list()).getByRole('link', { name: /丙/ })).toHaveAttribute('aria-current', 'true')
  })

  it('restores the selection from the address on load', async () => {
    wide(true)
    mock((path) => (path.startsWith('/api/v1/notes?') ? notePage(rows()) : samplePage([])))
    mount(`/notes?note=${B}`)
    const preview = await screen.findByRole('article', { name: '心得预览' })
    expect(
      within(preview).getByRole('heading', { name: '乙只有一行', level: 2 }),
    ).toBeInTheDocument()
  })

  it('sends the search to the backend, debounced, and shows what comes back', async () => {
    wide(true)
    // 判别性：`q` 不透传到请求里（或不带防抖多打几次）本例即红。
    const request = mock((path) => {
      if (!path.startsWith('/api/v1/notes?')) return samplePage([])
      const q = new URLSearchParams(path.slice(path.indexOf('?'))).get('q')
      if (q === null) return notePage(rows())
      // 后端按标题匹配；这里只认「甲」，用来证明显示的是接口给的结果。
      return notePage(q === '甲' ? [rows()[0]!] : [])
    })
    mount('/notes')
    await screen.findByText('甲的标题')
    const before = request.mock.calls.length
    const box = screen.getByRole('searchbox', { name: '按标题搜索心得' })
    // 连着敲三下：防抖之后只该多出一次请求，且带的是最终的词。
    fireEvent.change(box, { target: { value: '甲' } })
    fireEvent.change(box, { target: { value: '甲的' } })
    fireEvent.change(box, { target: { value: '甲' } })
    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(1))
    const searches = request.mock.calls
      .map(([path]) => String(path))
      .filter((path) => path.startsWith('/api/v1/notes?') && path.includes('q='))
    expect(searches).toEqual([
      '/api/v1/notes?page=1&page_size=100&sort=-updated_at&q=' + encodeURIComponent('甲'),
    ])
    expect(request.mock.calls.length).toBe(before + 1)
    expect(screen.getByText(/只按标题搜索/)).toBeInTheDocument()

    // 没有命中的词：接口回空页，界面说清楚「只看标题」。
    fireEvent.change(box, { target: { value: '没有的词' } })
    await screen.findByText(/没有标题含「没有的词」的独立心得/)
    expect(screen.queryByRole('list', { name: '心得列表' })).toBeNull()

    // 清空搜索框回到完整列表（不再带 q）。
    fireEvent.change(box, { target: { value: '' } })
    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(3))
  })

  it('still offers more pages after a search replaces an already-paged list (Review F1)', async () => {
    wide(true)
    // 回归：翻过页之后再搜索。旧写法把「上一批说没有下一页」带进新的搜索结果，命中再多也
    // 只停在第一页——正是本任务要解决的「翻不到的旧心得」那个区间。
    // 判别性：把 has_more 改回不随第一页作废的独立 state，本例即红。
    mock((path) => {
      if (!path.startsWith('/api/v1/notes?')) return samplePage([])
      const params = new URLSearchParams(path.slice(path.indexOf('?')))
      if (params.get('q') === null)
        // 未搜索：第一页还有下一页，第二页到底。
        return params.get('page') === '2'
          ? notePage([rows()[1]!], 2, 21)
          : notePage([rows()[0]!], 1, 21)
      // 搜索命中很多条：第一页之后仍然有。
      return notePage([rows()[2]!], 1, 21)
    })
    mount('/notes')
    await screen.findByText('甲的标题')
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }))
    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(2))
    // 这一步之后「加载更多」已经消失（第二页到底了）。
    expect(screen.queryByRole('button', { name: '加载更多' })).toBeNull()
    fireEvent.change(screen.getByRole('searchbox', { name: '按标题搜索心得' }), {
      target: { value: '丙' },
    })
    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(1))
    // 搜索结果自己说还有下一页，按钮必须回来。
    expect(screen.getByRole('button', { name: '加载更多' })).toBeInTheDocument()
  })

  it('keeps the search term while loading the next page of matches', async () => {
    wide(true)
    const request = mock((path) => {
      if (!path.startsWith('/api/v1/notes?')) return samplePage([])
      const params = new URLSearchParams(path.slice(path.indexOf('?')))
      if (params.get('q') !== '周报') return notePage(rows())
      // total 21 > 一页 20：第一页才会给出「加载更多」。
      return params.get('page') === '2'
        ? notePage([rows()[1]!], 2, 21)
        : notePage([rows()[0]!], 1, 21)
    })
    mount('/notes')
    await screen.findByText('甲的标题')
    fireEvent.change(screen.getByRole('searchbox', { name: '按标题搜索心得' }), {
      target: { value: '周报' },
    })
    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }))
    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(2))
    const second = request.mock.calls
      .map(([path]) => String(path))
      .find((path) => path.includes('page=2'))
    // 第二页必须带着同一个搜索词，否则翻出来的是没搜索时的下一页。
    expect(second).toContain('q=' + encodeURIComponent('周报'))
  })

  it('loads the next page on demand', async () => {
    wide(true)
    mock((path) => {
      if (path.startsWith('/api/v1/notes?page=1'))
        return notePage([rows()[0]!], 1, 2) as unknown as { data: Note[]; page: unknown } & {
          page: { has_more: boolean }
        }
      if (path.startsWith('/api/v1/notes?page=2')) return notePage([rows()[1]!], 2, 2)
      return samplePage([])
    })
    // notePage 的 has_more 按 total 算；这里手动给第一页 has_more。
    vi.mocked(api.request).mockImplementation(async (path: string) => {
      if (path.startsWith('/api/v1/notes?page=1'))
        return {
          data: [rows()[0]!],
          page: { number: 1, size: 100, total_items: 2, total_pages: 2, has_more: true },
        }
      if (path.startsWith('/api/v1/notes?page=2'))
        return {
          data: [rows()[1]!],
          page: { number: 2, size: 100, total_items: 2, total_pages: 2, has_more: false },
        }
      return samplePage([])
    })
    mount('/notes')
    await screen.findByText('甲的标题')
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }))
    expect(await screen.findByText('乙只有一行')).toBeInTheDocument()
    expect(within(list()).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: '加载更多' })).toBeNull()
  })

  it('attaches the previewed note to a resource and drops it from the standalone list', async () => {
    wide(true)
    let attached = false
    const request = mock((path, options) => {
      if (path.startsWith('/api/v1/notes?')) return notePage(attached ? rows().slice(1) : rows())
      if (path === `/api/v1/notes/${A}/attach` && options?.method === 'POST') {
        attached = true
        return {
          data: boundNote({
            id: A,
            content: rows()[0]!.content,
            resource_id: resourceId,
            version: 2,
          }),
        }
      }
      if (path.startsWith('/api/v1/resources?')) return samplePage([sample({ title: '目标资料' })])
      return samplePage([])
    })
    mount(`/notes?note=${A}`)
    const preview = await screen.findByRole('article', { name: '心得预览' })
    fireEvent.click(within(preview).getByRole('button', { name: '后贴到资料' }))
    fireEvent.change(screen.getByLabelText('资料标题关键词'), { target: { value: '目标' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索资料' }))
    fireEvent.click(await screen.findByRole('button', { name: '后贴到《目标资料》' }))
    // `<output>` 也是 status 角色：按文字找到那条提示。
    const done = (await screen.findByText(/已后贴到资料/)).closest<HTMLElement>('[role="status"]')!
    expect(within(done).getByRole('link', { name: '打开《目标资料》查看' })).toHaveAttribute(
      'href',
      `/resources/${resourceId}`,
    )
    expect(request.mock.calls).toContainEqual([
      `/api/v1/notes/${A}/attach`,
      { method: 'POST', body: { resource_id: resourceId, expected_version: 1 } },
    ])
    // 列表立刻刷新（这条已不是独立心得），提示块仍在，直到「回到列表」或点别的条目。
    await waitFor(() => expect(within(list()).queryByText('甲的标题')).toBeNull())
    expect(address()).toBe('')
    expect(screen.getByText(/已后贴到资料/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '回到列表' }))
    expect(screen.queryByText(/已后贴到资料/)).toBeNull()
    expect(screen.getByText('从左边选一条，在这里预览。')).toBeInTheDocument()
  })

  it('deletes the previewed note after one confirmation and refreshes the list', async () => {
    wide(true)
    let deleted = false
    const request = mock((path, options) => {
      if (path.startsWith('/api/v1/notes?')) return notePage(deleted ? rows().slice(1) : rows())
      if (path === `/api/v1/notes/${A}` && options?.method === 'DELETE') {
        deleted = true
        return undefined
      }
      return samplePage([])
    })
    mount(`/notes?note=${A}`)
    const preview = await screen.findByRole('article', { name: '心得预览' })
    fireEvent.click(within(preview).getByRole('button', { name: '删除' }))
    const dialog = screen.getByRole('dialog', { name: '删除“甲的标题”？' })
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))
    await waitFor(() => expect(within(list()).queryByText('甲的标题')).toBeNull())
    expect(request.mock.calls).toContainEqual([
      `/api/v1/notes/${A}`,
      { method: 'DELETE', ifMatchVersion: 1 },
    ])
    expect(screen.queryByRole('article', { name: '心得预览' })).toBeNull()
    expect(address()).toBe('')
  })

  it('renders inline images in the preview and does not match search against their data (TASK-063)', async () => {
    wide(true)
    const data = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='
    const withImage = note({
      id: A,
      content: `# 看图\n\n![截图](${data})\n\n配文 zzqq`,
      updated_at: '2026-09-15T03:00:00Z',
    })
    mock((path) =>
      path.startsWith('/api/v1/notes?')
        ? notePage([withImage, ...rows().slice(1)])
        : samplePage([]),
    )
    mount(`/notes?note=${A}`)
    const preview = await screen.findByRole('article', { name: '心得预览' })
    const img = preview.querySelector('img')
    expect(img?.getAttribute('src')).toBe(data)
    expect(img?.getAttribute('alt')).toBe('截图')
    // 列表里的摘要不带 base64。
    expect(within(list()).getByText('截图 配文 zzqq')).toBeInTheDocument()
    // 「base64 不该被当成可搜文本」自 TASK-070 起由后端的标题派生负责（backend/tests/test_notes.py），
    // 页面不再自己过滤，这里只守渲染与摘要。
  })

  it('closes the delete dialog on Escape and hands focus back to the trigger (TASK-062)', async () => {
    wide(true)
    mock((path) => (path.startsWith('/api/v1/notes?') ? notePage(rows()) : samplePage([])))
    mount(`/notes?note=${A}`)
    const preview = await screen.findByRole('article', { name: '心得预览' })
    const trigger = within(preview).getByRole('button', { name: '删除' })
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: '删除“甲的标题”？' })
    expect(within(dialog).getByRole('button', { name: '取消' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('says so when ?note= points at a note that is not in the loaded list (TASK-062)', async () => {
    wide(true)
    mock((path) => (path.startsWith('/api/v1/notes?') ? notePage(rows()) : samplePage([])))
    const gone = '018f1f58-4eb2-4a0d-a716-fb81b1960aaa'
    mount(`/notes?note=${gone}`)
    await screen.findByText('甲的标题')
    // `<output>`/aria-live 提示也是 status：按文字找这条。
    const status = (await screen.findByText(/不在独立心得列表里/)).closest<HTMLElement>(
      '[role="status"]',
    )!
    expect(within(status).getByRole('link', { name: '直接打开' })).toHaveAttribute(
      'href',
      `/notes/${gone}`,
    )
    expect(screen.queryByText('从左边选一条，在这里预览。')).toBeNull()
    expect(screen.queryByRole('article', { name: '心得预览' })).toBeNull()
  })

  it('links straight to the editor on a narrow screen', async () => {
    wide(false)
    mock((path) => (path.startsWith('/api/v1/notes?') ? notePage(rows()) : samplePage([])))
    mount('/notes')
    await screen.findByText('甲的标题')
    expect(within(list()).getByRole('link', { name: /甲的标题/ })).toHaveAttribute(
      'href',
      `/notes/${A}`,
    )
    expect(screen.queryByText('从左边选一条，在这里预览。')).toBeNull()
  })

  it('shows the empty state and a controlled error with retry', async () => {
    wide(true)
    let fail = true
    mock((path) => {
      if (path.startsWith('/api/v1/notes?'))
        return fail ? new ApiError('NETWORK_ERROR') : notePage([])
      return samplePage([])
    })
    mount('/notes')
    expect(await screen.findByRole('alert')).toHaveTextContent('连接失败')
    fail = false
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    expect(await screen.findByRole('heading', { name: '还没有独立心得' })).toBeInTheDocument()
    expect(within(main()).queryByRole('link', { name: /写心得|写一条/ })).toBeNull()
    expect(screen.getByText(/用左侧「写心得」或快捷键记一条/)).toBeInTheDocument()
  })
})
