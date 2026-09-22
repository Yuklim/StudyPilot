import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import App from '../../App'
import { renderWithRouter } from '../../test/render'
import { resourceId, sample, samplePage } from './fixtures'
import { readPosition, writePosition } from './readerPosition'
import { readSelection, toQuote } from './quoteSelection'
import { ReaderQuote } from './ReaderQuote'

// TASK-068：「记下这段」（正文选区 → 心得草稿）与「记为学习进度」（阅读位置 → 学习表单预填）。
// 都走整页（App + 路由 + 真正的 markdown 渲染），选区用 mock 的 `window.getSelection`。
// 这些 spy 由全局 `src/test/setup.ts` 的 `afterEach` 统一 `vi.restoreAllMocks()` 还原（TASK-068
// 复审 F3：这里不再各自 restore 一遍，单点还原比散落的 restore 更难漏）。

const detailPath = `/api/v1/resources/${resourceId}`
const article =
  '# 神经网络\n\n开头。\n\n## 1 什么是神经网络\n\n神经网络主要由输入层、隐藏层、输出层构成。\n当隐藏层只有一层时叫两层网络。\n\n## 2 目标函数\n\n第二节。\n'

function snapshotOf(content: string) {
  return {
    id: '018f1f58-4eb2-4a0d-a716-fb81b1960001',
    resource_id: resourceId,
    format: 'MARKDOWN',
    content,
    char_count: content.length,
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
}

const highlightId = '018f1f58-4eb2-4a0d-a716-fb81b1960201'
const savedNoteId = '018f1f58-4eb2-4a0d-a716-fb81b1960301'
/** 本次挂载里发出的高亮写请求，按顺序记下来。 */
let marked: { method: string; path: string; body: Record<string, unknown> }[] = []

function mount(initial = sample()) {
  marked = []
  // 保存学习记录后详情重读要拿到新进度（真实后端如此），否则「记为学习进度」不会消失。
  let item = initial
  const request = vi.spyOn(api, 'request').mockImplementation(async (path: string, init) => {
    if (path === `${detailPath}/snapshot`) return { data: snapshotOf(article) }
    // TASK-072：高亮。默认没有已存的，创建/改绑回一条最小可信的记录。
    if (path.startsWith(`${detailPath}/highlights`)) {
      if (init?.method === 'POST' || init?.method === 'PATCH') {
        const sent = (init.body ?? {}) as Record<string, unknown>
        marked.push({ method: init.method, path, body: sent })
        return {
          data: {
            id: highlightId,
            resource_id: resourceId,
            exact: typeof sent.exact === 'string' ? sent.exact : '输入层、隐藏层、输出层',
            prefix: (sent.prefix as string | null) ?? null,
            suffix: (sent.suffix as string | null) ?? null,
            start_offset: typeof sent.start_offset === 'number' ? sent.start_offset : 0,
            end_offset: typeof sent.end_offset === 'number' ? sent.end_offset : 11,
            note_id: (sent.note_id as string | null) ?? null,
            version: init.method === 'PATCH' ? 2 : 1,
            created_at: '2026-09-19T02:00:00Z',
            updated_at: '2026-09-19T02:00:00Z',
          },
        }
      }
      return {
        data: [],
        page: { number: 1, size: 100, total_items: 0, total_pages: 0, has_more: false },
      }
    }
    if (path === `${detailPath}/snapshot/assets`) return { data: [] }
    if (path.startsWith(`${detailPath}/notes?`))
      return {
        data: [],
        page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
      }
    if (path === `${detailPath}/study-records` && init?.method === 'POST') {
      const body = init.body as Record<string, unknown>
      const result = {
        data: {
          record: {
            id: '018f1f58-4eb2-4a0d-a716-fb81b1960006',
            resource_id: resourceId,
            started_at: body.started_at,
            duration_seconds: body.duration_seconds,
            progress_before: body.progress_before,
            progress_after: body.progress_after,
            status_before: body.status_before,
            status_after: body.status_after,
            summary: body.summary,
            questions_next: body.questions_next,
            created_at: '2026-09-17T00:00:00Z',
          },
          progress: {
            ...item.progress,
            status: body.status_after,
            progress_percent: body.progress_after,
            version: item.progress.version + 1,
          },
        },
      }
      item = {
        ...item,
        progress: {
          ...item.progress,
          status: body.status_after as typeof item.progress.status,
          progress_percent: body.progress_after as number,
          version: item.progress.version + 1,
        },
      }
      return result
    }
    if (path === `${detailPath}/notes` && init?.method === 'POST') {
      const sent = init.body as { content: string }
      return {
        data: {
          id: savedNoteId,
          resource_id: resourceId,
          content: sent.content,
          version: 1,
          created_at: '2026-09-19T02:10:00Z',
          updated_at: '2026-09-19T02:10:00Z',
        },
      }
    }
    if (path.startsWith(`${detailPath}/study-records`)) return samplePage([])
    if (path === detailPath) return { data: item }
    return samplePage([])
  })
  renderWithRouter(<App />, `/resources/${resourceId}`)
  return request
}

/**
 * 让 `window.getSelection` 报告一个落在 `node` 里的选区（jsdom 不会自己产生选区）。
 * TASK-072 起「标下来」要按真实 `Range` 取锚点，所以文本能在 `node` 里找到时给一个**真的**
 * `Range`；找不到（选的是别处、或空选区）就沿用只够判「在不在正文里」的替身。
 */
function selectText(text: string, node: Node | null) {
  const value = node?.nodeValue ?? ''
  const at = text && value ? value.indexOf(text.split('\n')[0]!) : -1
  const real = (() => {
    if (!node || at === -1) return null
    const range = document.createRange()
    range.setStart(node, at)
    range.setEnd(node, Math.min(at + text.length, value.length))
    return range
  })()
  const selection = {
    isCollapsed: !text,
    rangeCount: text ? 1 : 0,
    anchorNode: node,
    focusNode: node,
    toString: () => text,
    getRangeAt: () => real ?? ({ startContainer: node } as unknown as Range),
    // 真实浏览器清掉选区后 `selectionchange` 再来时选区是空的；mock 也照此。
    removeAllRanges: vi.fn(() => {
      selection.isCollapsed = true
      selection.rangeCount = 0
    }),
  }
  vi.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
  fireEvent(document, new Event('selectionchange'))
  return selection
}

const pill = () => screen.queryByRole('button', { name: '记下这段' })
const editor = () =>
  screen.getByRole('textbox', { name: '这次想记下什么？' }) as HTMLTextAreaElement

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(api, 'downloadSnapshotAsset').mockResolvedValue(new Blob([new Uint8Array([1])]))
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => cleanup())

describe('记下这段', () => {
  it('shows the pill only for a non-empty selection inside the rendered body', async () => {
    mount()
    const paragraph = await screen.findByText(/神经网络主要由输入层/)
    expect(pill()).toBeNull()
    selectText('神经网络主要由输入层、隐藏层、输出层构成。', paragraph.firstChild)
    expect(pill()).not.toBeNull()
    // 选到页面标题（正文之外）不算。
    selectText(
      '合成阅读资料',
      screen.getByRole('heading', { name: '合成阅读资料', level: 1 }).firstChild,
    )
    expect(pill()).toBeNull()
    // 空选区也不算；Esc 收起。
    selectText('神经网络', paragraph.firstChild)
    expect(pill()).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(pill()).toBeNull()
    selectText('', null)
    expect(pill()).toBeNull()
  })

  it('appends the quote to the notes draft, opens the notes tab and focuses the editor', async () => {
    mount()
    const paragraph = await screen.findByText(/神经网络主要由输入层/)
    // 右栏收起时草稿也在（组件常驻）；先写点东西，验证引文是**追加**、以空行分隔。
    fireEvent.change(editor(), { target: { value: '已有的一句。  ' } })
    const selection = selectText(
      '神经网络主要由输入层、隐藏层、输出层构成。\n当隐藏层只有一层时叫两层网络。',
      paragraph.firstChild,
    )
    fireEvent.click(pill()!)
    expect(screen.getByRole('tab', { name: '心得' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: '记录与理解' })).toBeVisible()
    expect(editor()).toHaveValue(
      '已有的一句。\n\n> 神经网络主要由输入层、隐藏层、输出层构成。\n> 当隐藏层只有一层时叫两层网络。\n\n',
    )
    await waitFor(() => expect(editor()).toHaveFocus())
    expect(editor().selectionStart).toBe(editor().value.length)
    expect(selection.removeAllRanges).toHaveBeenCalled()
    expect(pill()).toBeNull()
    // 再记一段：接在后面，不覆盖。
    selectText('第二节。', screen.getByText('第二节。').firstChild)
    fireEvent.click(pill()!)
    expect(editor().value.endsWith('> 当隐藏层只有一层时叫两层网络。\n\n> 第二节。\n\n')).toBe(true)
  })

  it('marks the passage without opening the composer (TASK-072)', async () => {
    mount()
    const paragraph = await screen.findByText(/神经网络主要由输入层/)
    selectText('神经网络主要由输入层、隐藏层、输出层构成。', paragraph.firstChild)
    fireEvent.click(screen.getByRole('button', { name: '标下来' }))
    // 锚点按渲染后的正文取：原文 + 前后文 + 偏移，一起发出去。
    await waitFor(() => expect(marked).toHaveLength(1))
    expect(marked[0]!.method).toBe('POST')
    expect(marked[0]!.body.exact).toBe('神经网络主要由输入层、隐藏层、输出层构成。')
    expect(typeof marked[0]!.body.start_offset).toBe('number')
    expect(marked[0]!.body.end_offset).toBe(
      (marked[0]!.body.start_offset as number) +
        '神经网络主要由输入层、隐藏层、输出层构成。'.length,
    )
    // 只标记：右栏落在「高亮」Tab 上，心得 Tab 没被选中。
    expect(screen.getByRole('tab', { name: /高亮/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '心得' })).toHaveAttribute('aria-selected', 'false')
    // 切回心得看一眼：草稿一个字都没多。
    fireEvent.click(screen.getByRole('tab', { name: '心得' }))
    expect(editor()).toHaveValue('')
  })

  it('marks what was quoted and binds the note that gets saved for it (TASK-072)', async () => {
    mount()
    const paragraph = await screen.findByText(/神经网络主要由输入层/)
    selectText('神经网络主要由输入层、隐藏层、输出层构成。', paragraph.firstChild)
    fireEvent.click(pill()!)
    // 「记下这段」= 引文进草稿 + 顺手标下来。
    await waitFor(() => expect(marked).toHaveLength(1))
    expect(marked[0]!.method).toBe('POST')
    expect(editor().value).toContain('> 神经网络主要由输入层、隐藏层、输出层构成。')

    fireEvent.change(editor(), { target: { value: '这段要记住。' } })
    fireEvent.submit(screen.getByRole('form', { name: '心得编辑' }))
    // 心得一保存就配到刚标下的那条高亮上；解绑与改绑都走同一个 PATCH。
    await waitFor(() => expect(marked).toHaveLength(2))
    expect(marked[1]!.method).toBe('PATCH')
    expect(marked[1]!.path).toBe(`${detailPath}/highlights/${highlightId}`)
    expect(marked[1]!.body).toMatchObject({ expected_version: 1 })
    expect(marked[1]!.body.note_id).toBe(savedNoteId)
  })

  it('drops a pending pairing when the reader turns to an existing note (Review F3)', async () => {
    mount()
    const paragraph = await screen.findByText(/神经网络主要由输入层/)
    // 先「记下这段」——这条高亮开始等一条心得。
    selectText('神经网络主要由输入层、隐藏层、输出层构成。', paragraph.firstChild)
    fireEvent.click(pill()!)
    await waitFor(() => expect(marked).toHaveLength(1))
    // 改主意：只标一下别的段落（明确不想配心得）。
    selectText('第二节。', screen.getByText('第二节。').firstChild)
    fireEvent.click(screen.getByRole('button', { name: '标下来' }))
    await waitFor(() => expect(marked).toHaveLength(2))
    // 之后随手写的一条心得不该被配到任何一条高亮上。
    fireEvent.click(screen.getByRole('tab', { name: '心得' }))
    fireEvent.change(editor(), { target: { value: '与上面两段都无关的一句。' } })
    fireEvent.submit(screen.getByRole('form', { name: '心得编辑' }))
    await waitFor(() => expect(screen.getByText(/心得已保存/)).toBeInTheDocument())
    expect(marked.filter((call) => call.method === 'PATCH')).toHaveLength(0)
  })

  it('formats multi-line selections as a Markdown blockquote and ignores oversized ones', () => {
    expect(toQuote('  a\n\n b \n')).toBe('> a\n>\n> b')
    const root = document.createElement('div')
    root.className = 'snapshot-rendered'
    root.textContent = 'x'.repeat(10)
    document.body.append(root)
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      anchorNode: root.firstChild,
      focusNode: root.firstChild,
      toString: () => 'x'.repeat(2001),
      getRangeAt: () => ({ startContainer: root.firstChild }),
    } as unknown as Selection)
    expect(readSelection(root)).toBeNull()
    root.remove()
  })
})

describe('记为学习进度', () => {
  it('writes a study record on one click when the reading position is ahead, then the button goes away', async () => {
    // 用户 2026-09-17：「点了保存进度直接保存就可以，不要再返回确认」。
    const request = mount()
    await screen.findByRole('heading', { name: '2 目标函数', level: 2 })
    // 还没滚动：没有阅读百分比，不给按钮。
    expect(screen.queryByRole('button', { name: /记为学习进度/ })).toBeNull()
    // 滚动 → 位置写回（jsdom 的正文高度为 0 → 百分比 100）。
    fireEvent.scroll(window)
    const button = await screen.findByRole('button', { name: '记为学习进度 100%' })
    await waitFor(() => expect(readPosition(resourceId)?.percent).toBe(100))
    expect(request.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    fireEvent.click(button)
    // 立刻写：走既有 createRecord，未开始 → 学习中，时长 0，总结注明来源。
    await waitFor(() =>
      expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1),
    )
    const [path, init] = request.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(path).toBe(`${detailPath}/study-records`)
    expect(init!.body).toMatchObject({
      expected_progress_version: 1,
      duration_seconds: 0,
      progress_before: 0,
      progress_after: 100,
      status_before: 'UNREAD',
      status_after: 'IN_PROGRESS',
      summary: '阅读到 100%（阅读器位置）',
      questions_next: null,
    })
    // 没有弹表单。
    expect(screen.queryByRole('form', { name: '记录学习表单' })).toBeNull()
    // 资料重读 → 徽章更新、阅读位置不再领先、按钮消失。
    expect(await screen.findByRole('button', { name: '学习中 · 100%' })).toBeVisible()
    await waitFor(() => expect(screen.queryByRole('button', { name: /记为学习进度/ })).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the status when already 学习中, and shows the conflict message instead of retrying', async () => {
    const item = sample({
      progress: { ...sample().progress, status: 'IN_PROGRESS', progress_percent: 20 },
    })
    const request = mount(item)
    await screen.findByRole('heading', { name: '2 目标函数', level: 2 })
    // 这次让后端报 409（别处刚改过进度）。
    request.mockImplementation(async (path: string, init) => {
      if (path === `${detailPath}/study-records` && init?.method === 'POST')
        throw new ApiError('VERSION_CONFLICT', 409)
      if (path === `${detailPath}/snapshot`) return { data: snapshotOf(article) }
      if (path === `${detailPath}/snapshot/assets`) return { data: [] }
      if (path.startsWith(`${detailPath}/notes?`))
        return {
          data: [],
          page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
        }
      if (path === detailPath) return { data: item }
      return samplePage([])
    })
    fireEvent.scroll(window)
    fireEvent.click(await screen.findByRole('button', { name: '记为学习进度 100%' }))
    const post = await waitFor(() => {
      const call = request.mock.calls.find(([, init]) => init?.method === 'POST')
      expect(call).toBeDefined()
      return call!
    })
    expect(post[1]!.body).toMatchObject({
      status_before: 'IN_PROGRESS',
      status_after: 'IN_PROGRESS',
      progress_before: 20,
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('进度或状态已变化')
    // 不自动重试：仍只有 1 次 POST；按钮还在，用户可读最新进度后再点。
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '记为学习进度 100%' })).toBeEnabled()
  })

  it('does not offer the button when the learning progress is already ahead', async () => {
    mount(
      sample({ progress: { ...sample().progress, status: 'IN_PROGRESS', progress_percent: 100 } }),
    )
    await screen.findByRole('heading', { name: '2 目标函数', level: 2 })
    fireEvent.scroll(window)
    await waitFor(() => expect(readPosition(resourceId)?.percent).toBe(100))
    expect(screen.queryByRole('button', { name: /记为学习进度/ })).toBeNull()
  })

  it('uses the remembered percent right after restoring the position', async () => {
    // 上次读到 40%：一进来（正文一到、恢复位置）就给按钮，不必先滚一下。
    mount()
    await screen.findByRole('heading', { name: '2 目标函数', level: 2 })
    const fingerprint = document.querySelector('.snapshot-rendered')!.textContent!.length
    cleanup()
    writePosition(resourceId, {
      top: 300,
      percent: 40,
      fingerprint,
      savedAt: '2026-09-17T00:00:00Z',
    })
    mount()
    expect(await screen.findByRole('button', { name: '记为学习进度 40%' })).toBeVisible()
  })
})

describe('删除资料', () => {
  it('clears the remembered reading position', async () => {
    writePosition(resourceId, {
      top: 300,
      percent: 40,
      fingerprint: 1,
      savedAt: '2026-09-17T00:00:00Z',
    })
    vi.spyOn(api, 'request').mockImplementation(async (path: string, init) => {
      if (path === `${detailPath}/deletion-preview`)
        return {
          data: {
            resource_id: resourceId,
            resource_version: 1,
            impact_revision: 'a'.repeat(64),
            expires_at: '2026-09-18T05:00:00Z',
            confirmation_token: 'b'.repeat(64),
            impact: {
              original_file_count: 0,
              snapshot_asset_count: 0,
              note_count: 0,
              highlight_count: 0,
              study_record_count: 0,
              active_review_plan_count: 0,
              review_record_count: 0,
              resource_tag_count: 0,
            },
          },
        }
      if (path === detailPath && init?.method === 'DELETE') return undefined
      if (path === `${detailPath}/snapshot`) return { data: snapshotOf(article) }
      if (path === `${detailPath}/snapshot/assets`) return { data: [] }
      if (path.startsWith(`${detailPath}/notes?`))
        return {
          data: [],
          page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
        }
      if (path === detailPath) return { data: sample() }
      return samplePage([])
    })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByRole('button', { name: '更多操作' })
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '删除资料…' }))
    const dialog = await screen.findByRole('dialog', { name: /^删除/ })
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))
    await waitFor(() => expect(readPosition(resourceId)).toBeNull())
  })
})

describe('PDF 上的胶囊（TASK-087）', () => {
  /**
   * 直接渲染组件（不走整页）：PDF 那条路的正文根是 `.pdf-reader-pages`，里面是 pdf.js
   * 文字层的 span。这里造一个同形状的 DOM，验的是**正文根可换**与**按钮少一个**。
   */
  function harness(canMark: boolean) {
    const host = document.createElement('div')
    const pages = document.createElement('div')
    pages.className = 'pdf-reader-pages'
    const span = document.createElement('span')
    span.textContent = '注意力机制在算什么'
    pages.append(span)
    host.append(pages)
    document.body.append(host)
    const onQuote = vi.fn()
    const onMark = vi.fn()
    render(
      <ReaderQuote
        container={host}
        selector=".pdf-reader-pages"
        canMark={canMark}
        onQuote={onQuote}
        onMark={onMark}
      />,
    )
    return { host, pages, span, onQuote, onMark }
  }

  it('reads the selection from the pdf text layer, not from the snapshot body', () => {
    const { span, onQuote } = harness(false)
    selectText('注意力机制在算什么', span.firstChild)
    const button = screen.getByRole('button', { name: '记下这段' })
    fireEvent.mouseDown(button)
    fireEvent.click(button)
    // 引文照走 Markdown 引用；PDF 上没有锚点可取，`range` 交出去也不会被拿去标高亮。
    expect(onQuote).toHaveBeenCalledWith('> 注意力机制在算什么', expect.anything())
  })

  it('hides 「标下来」 where there is nowhere to put a highlight', () => {
    const { span, onMark } = harness(false)
    selectText('注意力机制在算什么', span.firstChild)
    expect(screen.queryByRole('button', { name: '标下来' })).toBeNull()
    expect(onMark).not.toHaveBeenCalled()
    // 分隔线跟着一起消失，胶囊里不留一条孤零零的竖线。
    expect(document.querySelector('.reader-quote-divider')).toBeNull()
  })

  it('still offers both hands where highlights do have a home', () => {
    const { span } = harness(true)
    selectText('注意力机制在算什么', span.firstChild)
    expect(screen.getByRole('button', { name: '标下来' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '记下这段' })).not.toBeNull()
  })

  it('follows a selection that scrolls inside the reader, not just the window', () => {
    // PDF 在 `.pdf-reader-pages` 这个内层容器里滚，而 scroll 事件不冒泡：只听 window
    // 的话，滚动时胶囊会钉在原地不动。
    const { pages, span } = harness(false)
    selectText('注意力机制在算什么', span.firstChild)
    expect(screen.queryByRole('button', { name: '记下这段' })).not.toBeNull()
    // 选区没了之后只发一个内层滚动事件：胶囊必须跟着重算、随之消失。
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: true,
      rangeCount: 0,
      anchorNode: null,
      focusNode: null,
      toString: () => '',
    } as unknown as Selection)
    fireEvent.scroll(pages)
    expect(screen.queryByRole('button', { name: '记下这段' })).toBeNull()
  })
})
