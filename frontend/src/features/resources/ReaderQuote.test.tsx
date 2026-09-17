import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import App from '../../App'
import { renderWithRouter } from '../../test/render'
import { resourceId, sample, samplePage } from './fixtures'
import { readPosition, writePosition } from './readerPosition'
import { readSelection, toQuote } from './quoteSelection'

// TASK-068：「记下这段」（正文选区 → 心得草稿）与「记为学习进度」（阅读位置 → 学习表单预填）。
// 都走整页（App + 路由 + 真正的 markdown 渲染），选区用 mock 的 `window.getSelection`。

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

function mount(initial = sample()) {
  // 保存学习记录后详情重读要拿到新进度（真实后端如此），否则「记为学习进度」不会消失。
  let item = initial
  const request = vi.spyOn(api, 'request').mockImplementation(async (path: string, init) => {
    if (path === `${detailPath}/snapshot`) return { data: snapshotOf(article) }
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
    if (path.startsWith(`${detailPath}/study-records`)) return samplePage([])
    if (path === detailPath) return { data: item }
    return samplePage([])
  })
  renderWithRouter(<App />, `/resources/${resourceId}`)
  return request
}

/** 让 `window.getSelection` 报告一个落在 `node` 里的选区（jsdom 不会自己产生选区）。 */
function selectText(text: string, node: Node | null) {
  const selection = {
    isCollapsed: !text,
    rangeCount: text ? 1 : 0,
    anchorNode: node,
    focusNode: node,
    toString: () => text,
    getRangeAt: () => ({ startContainer: node }),
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
