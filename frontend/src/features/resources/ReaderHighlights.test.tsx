import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../api/client'
import { note as boundNote } from '../notes/fixtures'
import { ReaderHighlights } from './ReaderHighlights'
import type { Highlight } from './highlights'

/**
 * 右栏「高亮」Tab（TASK-072）：定位、上色、孤立、悬挂绑定、删除确认。
 * 上色用的 CSS Custom Highlight API 在 jsdom 里不存在，用例自己塞一个替身来断言
 * 「交给它的是 Range、而且正文 DOM 一个节点都没多」；不塞替身时组件必须照常工作。
 */

const resourceId = boundNote().resource_id!
const ARTICLE = '神经网络主要由输入层、隐藏层、输出层构成。当隐藏层只有一层时称为两层网络。'

function highlight(overrides: Partial<Highlight> = {}): Highlight {
  return {
    id: '018f1f58-4eb2-4a0d-a716-fb81b1960201',
    resource_id: resourceId,
    exact: '输入层、隐藏层、输出层',
    prefix: '神经网络主要由',
    suffix: '构成。',
    start_offset: 7,
    end_offset: 18,
    note_id: null,
    version: 1,
    created_at: '2026-09-19T02:00:00Z',
    updated_at: '2026-09-19T02:00:00Z',
    ...overrides,
  }
}
function body(text = ARTICLE) {
  const root = document.createElement('div')
  root.className = 'snapshot-rendered'
  root.innerHTML = `<p>${text}</p>`
  document.body.append(root)
  return root
}
function mock(highlights: Highlight[], notes: ReturnType<typeof boundNote>[] = []) {
  return vi.spyOn(api, 'request').mockImplementation(async (path) => {
    if (path.includes('/highlights')) {
      return {
        data: highlights,
        page: {
          number: 1,
          size: 100,
          total_items: highlights.length,
          total_pages: 1,
          has_more: false,
        },
      }
    }
    return {
      data: notes,
      page: { number: 1, size: 100, total_items: notes.length, total_pages: 1, has_more: false },
    }
  })
}
function paint() {
  const registry = new Map<string, unknown>()
  class FakeHighlight {
    ranges: Range[]
    constructor(...ranges: Range[]) {
      this.ranges = ranges
    }
  }
  vi.stubGlobal('CSS', { highlights: registry })
  vi.stubGlobal('Highlight', FakeHighlight)
  return registry
}
const panel = (rendered: Element | null, extra: Record<string, unknown> = {}) =>
  render(
    <ReaderHighlights
      resourceId={resourceId}
      rendered={rendered}
      revision={0}
      onWriteNote={() => {}}
      onOpenNote={() => {}}
      {...extra}
    />,
  )

afterEach(() => {
  document.body.innerHTML = ''
})

describe('reader highlights panel', () => {
  it('paints located passages through the highlight registry without touching the body', async () => {
    const registry = paint()
    mock([highlight()])
    const rendered = body()
    panel(rendered)
    await screen.findByRole('list', { name: '高亮列表' })
    await waitFor(() => expect(registry.has('studypilot-mark')).toBe(true))
    const painted = registry.get('studypilot-mark') as { ranges: Range[] }
    expect(painted.ranges).toHaveLength(1)
    expect(painted.ranges[0]!.toString()).toBe('输入层、隐藏层、输出层')
    // 判别性：上色若改成往正文里插标签，这一条会红。
    expect(rendered.querySelectorAll('mark, span').length).toBe(0)
    expect(rendered.textContent).toBe(ARTICLE)
  })

  it('works with no highlight API at all: the list still lists', async () => {
    vi.stubGlobal('CSS', undefined)
    vi.stubGlobal('Highlight', undefined)
    mock([highlight()])
    panel(body())
    expect(await screen.findByText(/共 1 条 · 按文中顺序/)).toBeInTheDocument()
  })

  it('keeps a passage whose text is gone, marks it and puts it last', async () => {
    paint()
    mock([
      highlight(),
      highlight({
        id: '018f1f58-4eb2-4a0d-a716-fb81b1960202',
        exact: '这段话已经不在正文里了',
        start_offset: 2,
        end_offset: 13,
      }),
    ])
    panel(body())
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(2)
    // 孤立的排最后，即使它的偏移更靠前。
    expect(within(items[1]!).getByText(/原文位置已找不到/)).toBeInTheDocument()
    expect(items[1]!.textContent).toContain('这段话已经不在正文里了')
    // 孤立的没有「跳到正文」——那里没有位置可跳。
    expect(within(items[1]!).queryByRole('button', { name: '跳到正文' })).toBeNull()
    expect(within(items[0]!).getByRole('button', { name: '跳到正文' })).toBeInTheDocument()
    expect(screen.getByText(/1 条找不到原文/)).toBeInTheDocument()
  })

  it('shows the bound note, and treats a note that left this resource as unbound (TASK-071 F5)', async () => {
    paint()
    const kept = boundNote({
      id: '018f1f58-4eb2-4a0d-a716-fb81b1960301',
      content: '# 三层结构\n要记牢',
    })
    mock(
      [
        highlight({ note_id: kept.id }),
        highlight({
          id: '018f1f58-4eb2-4a0d-a716-fb81b1960202',
          exact: '当隐藏层只有一层时称为两层网络',
          start_offset: 21,
          end_offset: 36,
          // 这条心得已经被解绑/后贴去了别的资料：本资料的心得列表里没有它。
          note_id: '018f1f58-4eb2-4a0d-a716-fb81b1960999',
        }),
      ],
      [kept],
    )
    panel(body())
    const items = await screen.findAllByRole('listitem')
    expect(within(items[0]!).getByText('✎ 三层结构')).toBeInTheDocument()
    expect(within(items[0]!).getByRole('button', { name: '改写心得' })).toBeInTheDocument()
    // 悬挂绑定：按「没配心得」展示，并且可以重新配一条。
    expect(within(items[1]!).queryByText(/^✎/)).toBeNull()
    expect(within(items[1]!).getByRole('button', { name: '写心得' })).toBeInTheDocument()
  })

  it('asks once before deleting and drops the row afterwards', async () => {
    paint()
    const request = mock([highlight()])
    panel(body())
    const item = (await screen.findAllByRole('listitem'))[0]!
    fireEvent.click(within(item).getByRole('button', { name: '删除' }))
    // 一次确认：直接点「删除」不发请求。
    expect(request.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0)
    request.mockResolvedValueOnce(undefined)
    fireEvent.click(within(item).getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(screen.queryByRole('list', { name: '高亮列表' })).toBeNull())
    const [path, init] = request.mock.calls.at(-1)!
    expect(path).toBe(`/api/v1/resources/${resourceId}/highlights/${highlight().id}`)
    expect(init).toMatchObject({ method: 'DELETE', ifMatchVersion: 1 })
    expect(screen.getByRole('heading', { name: '还没有标下任何一段' })).toBeInTheDocument()
  })

  it('hands the highlight back when the reader wants to write about it', async () => {
    paint()
    mock([highlight()])
    const wanted: string[] = []
    panel(body(), { onWriteNote: (row: Highlight) => wanted.push(row.id) })
    const item = (await screen.findAllByRole('listitem'))[0]!
    await act(async () => {
      fireEvent.click(within(item).getByRole('button', { name: '写心得' }))
    })
    expect(wanted).toEqual([highlight().id])
  })
})
