import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import { note as boundNote } from '../notes/fixtures'
import { ReaderHighlights } from './ReaderHighlights'
import type { Highlight } from './highlights'

/**
 * 右栏「注释」Tab（TASK-072 起是「高亮」Tab；TASK-098 合并了心得）：定位、上色、孤立、悬挂绑定、
 * 删除确认；TASK-094 起还有按样子分名上色、正文上的点选（气泡 / 橡皮 + 撤销）；TASK-098 起就地评论、
 * 顶部写作框（有选区 → 先标高亮再配对）、不挂高亮的心得排在高亮之后。
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
    page_number: null,
    style: 'mark',
    color: 'yellow',
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
// 不挂高亮的心得那一行有「整页编辑」链接：要一个路由上下文。
const panel = (rendered: Element | null, extra: Record<string, unknown> = {}) =>
  render(
    <ReaderHighlights
      resourceId={resourceId}
      rendered={rendered}
      revision={0}
      captureSelection={() => null}
      markSelection={async () => null}
      {...extra}
    />,
    { wrapper: MemoryRouter },
  )
/** 一条高亮下面的评论框（可访问名称 = 「评论：」+ 原文摘录）。 */
const commentOf = (item: HTMLElement) => within(item).getByRole('textbox', { name: /^评论：/ })

afterEach(() => {
  document.body.innerHTML = ''
})

describe('reader highlights panel', () => {
  const base = `/api/v1/resources/${resourceId}/highlights`
  it('paints located passages through the highlight registry without touching the body', async () => {
    const registry = paint()
    mock([highlight()])
    const rendered = body()
    panel(rendered)
    await screen.findByRole('list', { name: '注释列表' })
    await waitFor(() => expect(registry.has('studypilot-mark-yellow')).toBe(true))
    const painted = registry.get('studypilot-mark-yellow') as { ranges: Range[] }
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
    expect(await screen.findByText(/1 条 · 按文中顺序/)).toBeInTheDocument()
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
    // 配了心得的那条：评论框里就是心得内容；配着的心得不再另外作为「未挂高亮」列一遍。
    expect(items).toHaveLength(2)
    expect(commentOf(items[0]!)).toHaveValue('# 三层结构\n要记牢')
    // 悬挂绑定：按「没配心得」展示——评论框空着，写了就会配一条新的。
    expect(commentOf(items[1]!)).toHaveValue('')
    expect(screen.queryByText(/未挂高亮/)).toBeNull()
  })

  it('lists notes bound to no highlight after the highlights, newest first, editable in place (TASK-098)', async () => {
    paint()
    const older = boundNote({
      id: '018f1f58-4eb2-4a0d-a716-fb81b1960401',
      content: '先记下的',
      created_at: '2026-09-01T00:00:00Z',
    })
    const newer = boundNote({
      id: '018f1f58-4eb2-4a0d-a716-fb81b1960402',
      content: '后记下的',
      created_at: '2026-09-02T00:00:00Z',
    })
    const request = mock([highlight()], [newer, older])
    panel(body())
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[1]).toHaveTextContent('未挂高亮')
    expect(within(items[1]!).getByRole('textbox', { name: '心得：后记下的' })).toHaveValue(
      '后记下的',
    )
    expect(within(items[2]!).getByRole('textbox', { name: '心得：先记下的' })).toHaveValue(
      '先记下的',
    )
    // 角标数 = 高亮 + 不挂高亮的心得。
    // 就地改：失焦即 PATCH，带版本。
    const box = within(items[2]!).getByRole('textbox', { name: '心得：先记下的' })
    request.mockResolvedValueOnce({ data: { ...older, content: '先记下的，改过', version: 2 } })
    fireEvent.change(box, { target: { value: '先记下的，改过' } })
    fireEvent.blur(box)
    await waitFor(() =>
      expect(request).toHaveBeenLastCalledWith(
        `/api/v1/resources/${resourceId}/notes/${older.id}`,
        {
          method: 'PATCH',
          body: { content: '先记下的，改过', expected_version: 1 },
        },
      ),
    )
    expect(await within(items[2]!).findByText('已保存')).toBeInTheDocument()
    // 菜单里能整页编辑、删心得（删要确认一次）。
    fireEvent.click(within(items[2]!).getByRole('button', { name: /^更多：心得/ }))
    expect(within(items[2]!).getByRole('link', { name: '整页编辑' })).toHaveAttribute(
      'href',
      `/notes/${older.id}?resource=${resourceId}`,
    )
    fireEvent.click(within(items[2]!).getByRole('button', { name: '删除心得' }))
    request.mockResolvedValueOnce(undefined)
    fireEvent.click(within(items[2]!).getByRole('button', { name: '确认删除心得' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(request).toHaveBeenLastCalledWith(`/api/v1/resources/${resourceId}/notes/${older.id}`, {
      method: 'DELETE',
      ifMatchVersion: 2,
    })
  })

  it('reports highlights plus unbound notes as the count', async () => {
    paint()
    mock(
      [highlight({ note_id: boundNote().id })],
      [boundNote(), boundNote({ id: '018f1f58-4eb2-4a0d-a716-fb81b1960403' })],
    )
    const counts: number[] = []
    panel(body(), { onCount: (total: number) => counts.push(total) })
    await screen.findAllByRole('listitem')
    await waitFor(() => expect(counts.at(-1)).toBe(2))
  })

  it('does not call a passage lost while there is no body to look in (Review F1)', async () => {
    paint()
    mock([highlight()])
    // 正文还没渲染（快照在读、源码视图、这份资料没有快照）：不能说「原文位置已找不到」。
    panel(null)
    const item = (await screen.findAllByRole('listitem'))[0]!
    expect(within(item).queryByText(/原文位置已找不到/)).toBeNull()
    expect(item.className).not.toContain('orphaned')
    expect(screen.getByText(/正文还没就绪/)).toBeInTheDocument()
    expect(screen.queryByText(/条找不到原文/)).toBeNull()
  })

  it('still paints and lists when the note list cannot be read (Review F2)', async () => {
    const registry = paint()
    vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path.includes('/highlights')) {
        return {
          data: [highlight()],
          page: { number: 1, size: 100, total_items: 1, total_pages: 1, has_more: false },
        }
      }
      throw new Error('notes are unavailable')
    })
    panel(body())
    // 心得列表只用来显示「配了哪条」，它挂了不该让整个 Tab 变错误页、更不该不上色。
    await screen.findByRole('list', { name: '注释列表' })
    await waitFor(() => expect(registry.has('studypilot-mark-yellow')).toBe(true))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('asks once before deleting and drops the row afterwards', async () => {
    paint()
    const request = mock([highlight()])
    panel(body())
    const item = (await screen.findAllByRole('listitem'))[0]!
    // 删除藏在 ⋯ 菜单里；点「删除高亮」只是问一句，不发请求。
    fireEvent.click(within(item).getByRole('button', { name: /^更多：/ }))
    fireEvent.click(within(item).getByRole('button', { name: '删除高亮' }))
    expect(request.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0)
    request.mockResolvedValueOnce(undefined)
    fireEvent.click(within(item).getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(screen.queryByRole('list', { name: '注释列表' })).toBeNull())
    const [path, init] = request.mock.calls.at(-1)!
    expect(path).toBe(`/api/v1/resources/${resourceId}/highlights/${highlight().id}`)
    expect(init).toMatchObject({ method: 'DELETE', ifMatchVersion: 1 })
    expect(screen.getByText('还没有注释')).toBeInTheDocument()
  })

  it('a comment under a highlight without a note creates the note and binds it; a second edit only PATCHes the note (TASK-098)', async () => {
    paint()
    const request = mock([highlight()])
    panel(body())
    const item = (await screen.findAllByRole('listitem'))[0]!
    const box = commentOf(item)
    // 清空或原样不发请求。
    fireEvent.blur(box)
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
    const created = boundNote({
      id: '018f1f58-4eb2-4a0d-a716-fb81b1960501',
      content: '这一段要记牢',
    })
    request
      .mockResolvedValueOnce({ data: created })
      .mockResolvedValueOnce({ data: highlight({ note_id: created.id, version: 2 }) })
    fireEvent.change(box, { target: { value: '这一段要记牢' } })
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true })
    // 先建心得，再把它配到这条高亮上（版本化 PATCH）。
    await waitFor(() =>
      expect(request).toHaveBeenLastCalledWith(`${base}/${highlight().id}`, {
        method: 'PATCH',
        body: { note_id: created.id, expected_version: 1 },
      }),
    )
    expect(request).toHaveBeenCalledWith(`/api/v1/resources/${resourceId}/notes`, {
      method: 'POST',
      body: { content: '这一段要记牢' },
    })
    expect(await within(item).findByText('已保存')).toBeInTheDocument()
    // 这条心得现在是「配着的」：不再另列为未挂高亮。
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    // 再改：只 PATCH 心得，不再碰高亮。
    request.mockResolvedValueOnce({
      data: { ...created, content: '这一段要记牢，还有下一段', version: 2 },
    })
    fireEvent.change(box, { target: { value: '这一段要记牢，还有下一段' } })
    fireEvent.blur(box)
    await waitFor(() =>
      expect(request).toHaveBeenLastCalledWith(
        `/api/v1/resources/${resourceId}/notes/${created.id}`,
        {
          method: 'PATCH',
          body: { content: '这一段要记牢，还有下一段', expected_version: 1 },
        },
      ),
    )
  })

  it('keeps the text and shows the reason when a comment cannot be saved', async () => {
    paint()
    const request = mock([highlight({ note_id: boundNote().id })], [boundNote()])
    panel(body())
    const item = (await screen.findAllByRole('listitem'))[0]!
    const box = commentOf(item)
    request.mockRejectedValueOnce(new ApiError('VERSION_CONFLICT', 409))
    fireEvent.change(box, { target: { value: '改一下' } })
    fireEvent.blur(box)
    expect(await within(item).findByRole('alert')).toHaveTextContent('内容已被修改')
    expect(box).toHaveValue('改一下')
  })

  it('the composer: with a captured selection it marks first, then creates the note and binds it; without, just the note', async () => {
    paint()
    const request = mock([])
    const rendered = body()
    const range = document.createRange()
    range.selectNodeContents(rendered.querySelector('p')!.firstChild!)
    range.setStart(rendered.querySelector('p')!.firstChild!, 7)
    range.setEnd(rendered.querySelector('p')!.firstChild!, 18)
    let selection: { quote: string; range: Range } | null = {
      quote: '输入层、隐藏层、输出层',
      range,
    }
    const markSelection = vi.fn(async () =>
      highlight({ id: '018f1f58-4eb2-4a0d-a716-fb81b1960601' }),
    )
    panel(rendered, { captureSelection: () => selection, markSelection })
    await screen.findByText('还没有注释')
    const box = screen.getByRole('textbox', { name: '写心得' })
    // 点进去那一刻记住选区，显示成小片。
    fireEvent.mouseDown(box)
    fireEvent.focus(box)
    expect(screen.getByText(/将配到：『输入层、隐藏层、输出层』/)).toBeInTheDocument()
    const created = boundNote({ id: '018f1f58-4eb2-4a0d-a716-fb81b1960602', content: '三层' })
    request.mockResolvedValueOnce({ data: created }).mockResolvedValueOnce({
      data: highlight({
        id: '018f1f58-4eb2-4a0d-a716-fb81b1960601',
        note_id: created.id,
        version: 2,
      }),
    })
    fireEvent.change(box, { target: { value: '三层' } })
    fireEvent.blur(box)
    await waitFor(() => expect(markSelection).toHaveBeenCalledWith(range))
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(`${base}/018f1f58-4eb2-4a0d-a716-fb81b1960601`, {
        method: 'PATCH',
        body: { note_id: created.id, expected_version: 1 },
      }),
    )
    expect(await screen.findByText('心得已保存，并配到刚标下的那段。')).toBeInTheDocument()
    expect(box).toHaveValue('')
    // 没选区：只建心得。「不配」也走这条路。
    selection = null
    request.mockResolvedValueOnce({
      data: boundNote({ id: '018f1f58-4eb2-4a0d-a716-fb81b1960603', content: '独立的' }),
    })
    fireEvent.mouseDown(box)
    fireEvent.change(box, { target: { value: '独立的' } })
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
    expect(await screen.findByText('心得已保存。')).toBeInTheDocument()
    expect(markSelection).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(`/api/v1/resources/${resourceId}/notes`, {
      method: 'POST',
      body: { content: '独立的' },
    })
  })

  it('focuses the comment box of the highlight the parent points at (TASK-098)', async () => {
    paint()
    mock([highlight()])
    const { rerender } = panel(body())
    const item = (await screen.findAllByRole('listitem'))[0]!
    rerender(
      <ReaderHighlights
        resourceId={resourceId}
        rendered={document.querySelector('.snapshot-rendered')}
        revision={0}
        captureSelection={() => null}
        markSelection={async () => null}
        focusHighlight={{ id: highlight().id, token: 1 }}
      />,
    )
    await waitFor(() => expect(commentOf(item)).toHaveFocus())
  })
})

describe('PDF：按页定位（TASK-089）', () => {
  /** 一页文字层：`.pdf-page[data-page=N] > .pdf-text-layer > span…`，与 PdfReader 的形状一致。 */
  function pageLayer(number: number, text: string) {
    const page = document.createElement('div')
    page.className = 'pdf-page'
    page.setAttribute('data-page', String(number))
    const layer = document.createElement('div')
    layer.className = 'pdf-text-layer'
    const span = document.createElement('span')
    span.textContent = text
    layer.append(span)
    page.append(layer)
    document.body.append(page)
    return layer
  }

  it('locates each highlight in its own page, paints under the PDF name and tags the page', async () => {
    const registry = paint()
    mock([
      highlight({
        id: '018f1f58-4eb2-4a0d-a716-fb81b1960301',
        exact: 'page one',
        prefix: null,
        suffix: null,
        start_offset: 11,
        end_offset: 19,
        page_number: 1,
      }),
      highlight({
        id: '018f1f58-4eb2-4a0d-a716-fb81b1960302',
        exact: 'page two',
        prefix: null,
        suffix: null,
        start_offset: 11,
        end_offset: 19,
        page_number: 2,
      }),
    ])
    const pages = new Map<number, Element>([
      [1, pageLayer(1, 'StudyPilot page one')],
      [2, pageLayer(2, 'StudyPilot page two')],
    ])
    panel(null, { pages })
    const list = await screen.findByRole('list', { name: '注释列表' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('第 1 页')
    expect(items[1]).toHaveTextContent('第 2 页')
    // 两条都在各自那一页里找到了：交给注册表的是两个 Range，名字是 PDF 专用的那个。
    await waitFor(() => expect(registry.has('studypilot-mark-yellow-pdf')).toBe(true))
    const painted = registry.get('studypilot-mark-yellow-pdf') as { ranges: Range[] }
    expect(painted.ranges.map((range) => range.toString())).toEqual(['page one', 'page two'])
    expect(registry.has('studypilot-mark-yellow')).toBe(false)
    expect(screen.queryByText(/已找不到/)).toBeNull()
  })

  it('does not call a highlight lost while its page is not rendered, and offers to jump there', async () => {
    paint()
    mock([
      highlight({
        id: '018f1f58-4eb2-4a0d-a716-fb81b1960303',
        exact: 'page one',
        prefix: null,
        suffix: null,
        start_offset: 11,
        end_offset: 19,
        page_number: 1,
      }),
      highlight({
        id: '018f1f58-4eb2-4a0d-a716-fb81b1960304',
        exact: 'page nine',
        prefix: null,
        suffix: null,
        start_offset: 11,
        end_offset: 20,
        page_number: 9,
      }),
    ])
    const onJumpPage = vi.fn()
    // 只有第 1 页在渲染窗口里；第 9 页在视口外、没渲染——那条只是「还没看」，不是孤立。
    panel(null, {
      pages: new Map<number, Element>([[1, pageLayer(1, 'StudyPilot page one')]]),
      onJumpPage,
    })
    const list = await screen.findByRole('list', { name: '注释列表' })
    expect(within(list).queryByText(/已找不到/)).toBeNull()
    expect(list.querySelectorAll('li.orphaned')).toHaveLength(0)
    const jump = within(list).getByRole('button', { name: '跳到第 9 页' })
    fireEvent.click(jump)
    expect(onJumpPage).toHaveBeenCalledWith(9)
  })

  it('calls a highlight lost only when its page is rendered and the text is not there', async () => {
    paint()
    mock([
      highlight({
        id: '018f1f58-4eb2-4a0d-a716-fb81b1960305',
        exact: '不在这一页的话',
        prefix: null,
        suffix: null,
        start_offset: 0,
        end_offset: 7,
        page_number: 1,
      }),
    ])
    panel(null, { pages: new Map<number, Element>([[1, pageLayer(1, 'StudyPilot page one')]]) })
    const list = await screen.findByRole('list', { name: '注释列表' })
    expect(within(list).getByText(/在那一页上已找不到/)).toBeInTheDocument()
    expect(list.querySelectorAll('li.orphaned')).toHaveLength(1)
  })
})

describe('样子与正文上的点选（TASK-094）', () => {
  const base = `/api/v1/resources/${resourceId}/highlights`
  /**
   * jsdom 没有 `caretPositionFromPoint`（lib.dom 里声明了，运行时是 undefined）；点选按坐标反查
   * 落点，这里让任何坐标都落在给定的文字位置上，用完还原。
   */
  const original = document.caretPositionFromPoint
  function caretAt(node: Node, offset: number) {
    document.caretPositionFromPoint = (() => ({
      offsetNode: node,
      offset,
    })) as unknown as typeof document.caretPositionFromPoint
  }
  afterEach(() => {
    document.caretPositionFromPoint = original
  })

  it('paints each look under its own registry name and says the kind in the list', async () => {
    const registry = paint()
    mock([
      highlight(),
      highlight({
        id: '018f1f58-4eb2-4a0d-a716-fb81b1960202',
        exact: '两层网络',
        prefix: '称为',
        suffix: '。',
        start_offset: 32,
        end_offset: 36,
        style: 'underline',
        color: 'green',
      }),
    ])
    panel(body())
    await waitFor(() =>
      expect([...registry.keys()].sort()).toEqual([
        'studypilot-mark-yellow',
        'studypilot-underline-green',
      ]),
    )
    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('高亮')
    expect(items[1]).toHaveTextContent('下划线')
  })

  it('clicking a painted passage opens the bubble; recolouring and restyling are PATCHes that repaint', async () => {
    const registry = paint()
    const request = mock([highlight()])
    const rendered = body()
    const onOpenPanel = vi.fn()
    panel(rendered, { onOpenPanel })
    await waitFor(() => expect(registry.has('studypilot-mark-yellow')).toBe(true))
    const text = rendered.querySelector('p')!.firstChild!
    // 落点在 7..18 之外：什么都不出。
    caretAt(text, 3)
    fireEvent.click(rendered, { clientX: 10, clientY: 10 })
    expect(screen.queryByRole('dialog', { name: '这条高亮' })).toBeNull()
    // 落点在那段里：出气泡。
    caretAt(text, 10)
    fireEvent.click(rendered, { clientX: 40, clientY: 20 })
    const bubble = await screen.findByRole('dialog', { name: '这条高亮' })
    // 换色：只发 color，回来的那条盖住本地的，注册表名跟着换、旧名字删掉。
    request.mockResolvedValueOnce({ data: highlight({ color: 'blue', version: 2 }) })
    fireEvent.click(within(bubble).getByRole('radio', { name: '蓝色' }))
    await waitFor(() =>
      expect(request).toHaveBeenLastCalledWith(`${base}/${highlight().id}`, {
        method: 'PATCH',
        body: { color: 'blue', expected_version: 1 },
      }),
    )
    await waitFor(() => expect(registry.has('studypilot-mark-blue')).toBe(true))
    expect(registry.has('studypilot-mark-yellow')).toBe(false)
    expect(within(bubble).getByRole('radio', { name: '蓝色' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    // 改型：同一条高亮变成下划线。
    request.mockResolvedValueOnce({
      data: highlight({ color: 'blue', style: 'underline', version: 3 }),
    })
    fireEvent.click(within(bubble).getByRole('button', { name: '改为下划线' }))
    await waitFor(() => expect(registry.has('studypilot-underline-blue')).toBe(true))
    expect(registry.has('studypilot-mark-blue')).toBe(false)
    expect(within(bubble).getByRole('button', { name: '改为高亮' })).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('下划线')
    // 写评论：让父级打开右栏，焦点落进这条的评论框，气泡关掉。
    fireEvent.click(within(bubble).getByRole('button', { name: '写评论' }))
    expect(onOpenPanel).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '这条高亮' })).toBeNull())
    await waitFor(() => expect(commentOf(screen.getByRole('listitem'))).toHaveFocus())
    // 再点开、按 Esc 关掉。
    fireEvent.click(rendered, { clientX: 40, clientY: 20 })
    await screen.findByRole('dialog', { name: '这条高亮' })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '这条高亮' })).toBeNull())
  })

  it('a drag that ends on a passage, or a click while text is selected, opens nothing (Review F1/F2)', async () => {
    const registry = paint()
    mock([highlight()])
    const rendered = body()
    panel(rendered)
    await waitFor(() => expect(registry.has('studypilot-mark-yellow')).toBe(true))
    caretAt(rendered.querySelector('p')!.firstChild!, 10)
    // 按下点与松开点离得远：是拖选（工具开着时选区在 mouseup 里已被清掉，只能靠位移判）。
    fireEvent.mouseDown(rendered, { clientX: 10, clientY: 20 })
    fireEvent.click(rendered, { clientX: 60, clientY: 20 })
    expect(screen.queryByRole('dialog', { name: '这条高亮' })).toBeNull()
    // 选区还在：也是在选文字，不是点选。
    const selection = vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
    } as unknown as Selection)
    fireEvent.mouseDown(rendered, { clientX: 40, clientY: 20 })
    fireEvent.click(rendered, { clientX: 40, clientY: 20 })
    expect(screen.queryByRole('dialog', { name: '这条高亮' })).toBeNull()
    selection.mockRestore()
    // 原地点一下才算。
    fireEvent.mouseDown(rendered, { clientX: 40, clientY: 20 })
    fireEvent.click(rendered, { clientX: 41, clientY: 21 })
    expect(await screen.findByRole('dialog', { name: '这条高亮' })).toBeInTheDocument()
    // 关掉再走：气泡是 portal 到 body 的，留着会在这份文件的 afterEach 清空 body 时撞上卸载。
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '这条高亮' })).toBeNull())
  })

  it('撤销 falls back to recreating without the note when that note is no longer bindable (Review F4)', async () => {
    const registry = paint()
    const request = mock([highlight({ note_id: boundNote().id })], [boundNote()])
    const rendered = body()
    panel(rendered, { tool: 'eraser' })
    await waitFor(() => expect(registry.has('studypilot-mark-yellow')).toBe(true))
    caretAt(rendered.querySelector('p')!.firstChild!, 10)
    request.mockResolvedValueOnce(undefined)
    fireEvent.mouseDown(rendered, { clientX: 40, clientY: 20 })
    fireEvent.click(rendered, { clientX: 40, clientY: 20 })
    await screen.findByText('已删除一条高亮')
    // 第一次带心得重建被拒（心得已配给别的高亮）；第二次不带心得再建，标下的那段话不丢。
    request.mockRejectedValueOnce(new ApiError('REQUEST_FAILED', 409)).mockResolvedValueOnce({
      data: highlight({ id: '018f1f58-4eb2-4a0d-a716-fb81b1960210', note_id: null }),
    })
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    await waitFor(() => expect(screen.queryByText('已删除一条高亮')).toBeNull())
    const posts = request.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts).toHaveLength(2)
    expect((posts[0]![1]!.body as Record<string, unknown>).note_id).toBe(boundNote().id)
    expect((posts[1]![1]!.body as Record<string, unknown>).note_id).toBeUndefined()
    expect(screen.queryByText(/已经配给/)).toBeNull()
  })

  it('with the eraser on, a click deletes at once and 撤销 recreates the same anchor with the same look', async () => {
    const registry = paint()
    const request = mock(
      [highlight({ note_id: boundNote().id, style: 'underline', color: 'pink' })],
      [boundNote()],
    )
    const rendered = body()
    panel(rendered, { tool: 'eraser' })
    await waitFor(() => expect(registry.has('studypilot-underline-pink')).toBe(true))
    caretAt(rendered.querySelector('p')!.firstChild!, 10)
    request.mockResolvedValueOnce(undefined)
    fireEvent.mouseDown(rendered, { clientX: 40, clientY: 20 })
    fireEvent.click(rendered, { clientX: 40, clientY: 20 })
    // 不问就删：颜色消失、条目消失、DELETE 带版本。
    await waitFor(() => expect(registry.has('studypilot-underline-pink')).toBe(false))
    expect(request).toHaveBeenLastCalledWith(`${base}/${highlight().id}`, {
      method: 'DELETE',
      ifMatchVersion: 1,
    })
    expect(screen.queryByRole('dialog', { name: '这条高亮' })).toBeNull()
    expect(screen.getByText('已删除一条下划线')).toBeInTheDocument()
    // 撤销：按同样的锚点、样子重建，原来配的心得一并接回。
    request.mockResolvedValueOnce({
      data: highlight({
        id: '018f1f58-4eb2-4a0d-a716-fb81b1960209',
        note_id: boundNote().id,
        style: 'underline',
        color: 'pink',
      }),
    })
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(base, {
        method: 'POST',
        body: {
          exact: highlight().exact,
          prefix: highlight().prefix,
          suffix: highlight().suffix,
          start_offset: highlight().start_offset,
          end_offset: highlight().end_offset,
          style: 'underline',
          color: 'pink',
          note_id: boundNote().id,
        },
      }),
    )
    await waitFor(() => expect(screen.queryByText('已删除一条下划线')).toBeNull())
  })
})
