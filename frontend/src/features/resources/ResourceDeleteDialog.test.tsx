import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from '../../App'
import { ApiError, api } from '../../api/client'
import { renderWithRouter } from '../../test/render'
import { resourceId, sample, sampleFile, samplePage } from './fixtures'
import { resourceTitle } from './resourceTitle'

/**
 * 删除资料的确认弹窗（TASK-056，用户 2026-09-12 选定）。
 *
 * 本文件由 `ResourceDeletion.test.tsx` 按新交互重写：入口从「⋯ → 删除资料… → 面板 →
 * 删除这份资料 → 确认删除」缩成「⋯ → 删除资料… → 删除」，确认由页面内面板改为模态弹窗，
 * 影响摘要只剩心得数。**契约层面的断言逐条保留**：预览先于删除、取消不发 DELETE、DELETE
 * 携带令牌、令牌不进 DOM、影响变化 (409) 必须重新预览并再确认、三种令牌错误给受控恢复。
 */
const token = 't'.repeat(43)
const impact = {
  original_file_count: 1,
  snapshot_asset_count: 0,
  note_count: 2,
  study_record_count: 3,
  active_review_plan_count: 1,
  review_record_count: 4,
  resource_tag_count: 2,
}
const preview = (id = resourceId, extra: Partial<typeof impact> = {}) => ({
  data: {
    resource_id: id,
    resource_version: 1,
    impact_revision: 'a'.repeat(64),
    expires_at: '2026-09-04T05:00:00Z',
    confirmation_token: token,
    impact: { ...impact, ...extra },
  },
})
const notesPage = {
  data: [],
  page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
}

type Handler = (path: string, options?: { method?: string; deletionToken?: string }) => unknown
function mock(handler: Handler) {
  return vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
    const out = handler(path, options as { method?: string; deletionToken?: string })
    if (out instanceof Error) throw out
    return out
  })
}
/** 详情页默认桩：读资料、预览、删除 204。 */
function detailMock(
  item = sample(),
  overrides: Partial<Record<'preview' | 'delete', unknown>> = {},
) {
  return mock((path, options) => {
    if (path === `/api/v1/resources/${item.id}` && options?.method === 'DELETE')
      return 'delete' in overrides ? overrides.delete : undefined
    if (path === `/api/v1/resources/${item.id}`) return { data: item }
    if (path === `/api/v1/resources/${item.id}/deletion-preview`)
      return 'preview' in overrides ? overrides.preview : preview(item.id)
    if (path.startsWith(`/api/v1/resources/${item.id}/notes?`)) return notesPage
    return samplePage([])
  })
}
function openFromMenu() {
  fireEvent.click(screen.getByRole('button', { name: '更多操作' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '删除资料…' }))
}
const dialog = () => screen.findByRole('dialog', { name: /^删除/ })
const deleteButton = (root: HTMLElement) => within(root).getByRole('button', { name: '删除' })

describe('deleting from the reader page', () => {
  it.each([
    ['WEB', sample()],
    ['PASTE', sample({ source_type: 'PASTE', pasted_content: '合成原文' })],
    ['FILE', sampleFile()],
  ])('previews %s silently, shows only the note count, and cancels cleanly', async (_, item) => {
    const request = detailMock(item)
    renderWithRouter(<App />, `/resources/${item.id}`)
    await screen.findByRole('heading', { name: resourceTitle(item), level: 1 })
    openFromMenu()
    // 弹窗**立刻**出现（不用再点一次「删除这份资料」），预览在后台跑。
    const box = await dialog()
    expect(box).toHaveAccessibleName(`删除“${resourceTitle(item)}”？`)
    expect(within(box).getByText('删除后不可恢复。')).toBeInTheDocument()
    // 预览到达后只报心得数；原件/图片/学习历史等一律不列（用户明示）。
    expect(await within(box).findByText('这份资料的 2 条心得会一起删除。')).toBeInTheDocument()
    expect(within(box).queryByText('原件')).toBeNull()
    expect(within(box).queryByText('已冻结的图片')).toBeNull()
    expect(within(box).queryByText(/有效至/)).toBeNull()
    expect(request.mock.calls.map(([path]) => path)).toContain(
      `/api/v1/resources/${item.id}/deletion-preview`,
    )
    expect(request.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false)
    // 令牌绝不进 DOM。
    expect(document.body.textContent).not.toContain(token)
    const before = request.mock.calls.length
    fireEvent.click(within(box).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(request).toHaveBeenCalledTimes(before)
  })

  it('omits the note line when there are no notes', async () => {
    detailMock(sample(), { preview: preview(resourceId, { note_count: 0 }) })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByRole('heading', { name: '合成阅读资料', level: 1 })
    openFromMenu()
    const box = await dialog()
    await waitFor(() => expect(deleteButton(box)).toBeEnabled())
    expect(within(box).queryByText(/心得会一起删除/)).toBeNull()
    expect(within(box).getByText('删除后不可恢复。')).toBeInTheDocument()
  })

  it('shows the untitled placeholder in the dialog name', async () => {
    detailMock(sample({ title: null }))
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByRole('heading', { name: '未命名资料', level: 1 })
    openFromMenu()
    expect(await dialog()).toHaveAccessibleName('删除“未命名资料”？')
  })

  it('deletes with the token in two clicks and returns to the library', async () => {
    const request = detailMock(sample())
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByRole('heading', { name: '合成阅读资料', level: 1 })
    openFromMenu()
    const box = await dialog()
    await waitFor(() => expect(deleteButton(box)).toBeEnabled())
    fireEvent.click(deleteButton(box))
    expect(await screen.findByRole('heading', { name: '资料库', level: 1 })).toBeInTheDocument()
    expect(request.mock.calls).toContainEqual([
      `/api/v1/resources/${resourceId}`,
      { method: 'DELETE', deletionToken: token },
    ])
    expect(document.body.textContent).not.toContain(token)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is modal: the rest of the page is inert, focus lands on cancel and returns to the opener', async () => {
    detailMock(sample())
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByRole('heading', { name: '合成阅读资料', level: 1 })
    const more = screen.getByRole('button', { name: '更多操作' })
    more.focus()
    openFromMenu()
    const box = await dialog()
    expect(box).toHaveAttribute('aria-modal', 'true')
    expect(within(box).getByRole('button', { name: '取消' })).toHaveFocus()
    // 弹窗之外的 body 直接子节点全部 inert；弹窗自己的宿主不 inert。
    const others = [...document.body.children].filter((el) => !el.contains(box))
    expect(others.length).toBeGreaterThan(0)
    others.forEach((el) => expect(el).toHaveAttribute('inert'))
    expect(box.closest('[inert]')).toBeNull()
    // 点弹窗**外**的页面（不是遮罩本身）不会关掉它——旧面板时代那条「误点不丢令牌」的守卫。
    fireEvent.pointerDown(document.body)
    fireEvent.mouseDown(document.body)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    others.forEach((el) => expect(el).not.toHaveAttribute('inert'))
    expect(more).toHaveFocus()
  })

  it('cannot be closed while a deletion is in flight, including the re-preview window after a 409', async () => {
    // 独立 Review F1：多选批次里某份撞上 409 会先回到 previewing 再重预览，那一瞬 rows 里
    // 没有 deleting 项；若「进行中」从 rows 派生，Esc/取消/遮罩会在那个窗口把弹窗关掉，
    // 而循环随后仍会对下一份发 DELETE。这里用挂起的 Promise 把两个窗口都钉住。
    let releaseDelete: (() => void) | undefined
    let releasePreview: (() => void) | undefined
    let previews = 0
    mock((path, options) => {
      if (path === `/api/v1/resources/${resourceId}` && options?.method === 'DELETE') {
        return new Promise<never>((_, reject) => {
          releaseDelete = () =>
            reject(
              new ApiError('DELETION_IMPACT_CHANGED', 409, undefined, {
                current_impact: {
                  resource_id: resourceId,
                  resource_version: 2,
                  impact_revision: 'b'.repeat(64),
                  impact,
                },
              }),
            )
        })
      }
      if (path === `/api/v1/resources/${resourceId}`) return { data: sample() }
      if (path === `/api/v1/resources/${resourceId}/deletion-preview`) {
        previews += 1
        if (previews === 1) return preview()
        return new Promise((resolve) => {
          releasePreview = () => resolve(preview(resourceId, { note_count: 3 }))
        })
      }
      if (path.startsWith(`/api/v1/resources/${resourceId}/notes?`)) return notesPage
      return samplePage([])
    })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByRole('heading', { name: '合成阅读资料', level: 1 })
    openFromMenu()
    const box = await dialog()
    await waitFor(() => expect(deleteButton(box)).toBeEnabled())
    fireEvent.click(deleteButton(box))
    // 窗口一：DELETE 在途。
    expect(await within(box).findByRole('button', { name: '正在删除…' })).toBeDisabled()
    expect(within(box).getByRole('button', { name: '取消' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.mouseDown(box.parentElement!)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // 窗口二：409 之后重预览在途。
    releaseDelete!()
    await waitFor(() => expect(previews).toBe(2))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.mouseDown(box.parentElement!)
    fireEvent.click(within(box).getByRole('button', { name: '取消' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // 重预览回来：解除锁定，要求再确认。
    releasePreview!()
    expect(await within(box).findByText('内容有变化，请再确认一次。')).toBeInTheDocument()
    expect(within(box).getByRole('button', { name: '取消' })).toBeEnabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('re-previews and asks to confirm again when the impact changed, without replaying the old token', async () => {
    let deletes = 0
    const request = mock((path, options) => {
      if (path === `/api/v1/resources/${resourceId}` && options?.method === 'DELETE') {
        deletes += 1
        if (deletes === 1)
          return new ApiError('DELETION_IMPACT_CHANGED', 409, undefined, {
            current_impact: {
              resource_id: resourceId,
              resource_version: 2,
              impact_revision: 'b'.repeat(64),
              impact,
            },
          })
        return undefined
      }
      if (path === `/api/v1/resources/${resourceId}`) return { data: sample() }
      if (path === `/api/v1/resources/${resourceId}/deletion-preview`)
        return preview(resourceId, { note_count: deletes === 0 ? 2 : 3 })
      if (path.startsWith(`/api/v1/resources/${resourceId}/notes?`)) return notesPage
      return samplePage([])
    })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByRole('heading', { name: '合成阅读资料', level: 1 })
    openFromMenu()
    const box = await dialog()
    await waitFor(() => expect(deleteButton(box)).toBeEnabled())
    fireEvent.click(deleteButton(box))
    // 409 → 自动重新预览、更新心得数、要求再确认；**没有**自动再删。
    expect(await within(box).findByText('内容有变化，请再确认一次。')).toBeInTheDocument()
    expect(within(box).getByText('这份资料的 3 条心得会一起删除。')).toBeInTheDocument()
    expect(request.mock.calls.filter(([p]) => p.endsWith('/deletion-preview'))).toHaveLength(2)
    expect(deletes).toBe(1)
    expect(document.body.textContent).not.toContain(token)
    fireEvent.click(deleteButton(box))
    expect(await screen.findByRole('heading', { name: '资料库', level: 1 })).toBeInTheDocument()
    expect(deletes).toBe(2)
  })

  it.each([
    new ApiError('DELETION_TOKEN_EXPIRED', 410),
    new ApiError('DELETION_TOKEN_REPLAYED', 409),
    new ApiError('DELETION_TOKEN_INVALID', 403),
  ])('shows a controlled recovery for %s', async (error) => {
    detailMock(sample(), { delete: error })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByRole('heading', { name: '合成阅读资料', level: 1 })
    openFromMenu()
    const box = await dialog()
    await waitFor(() => expect(deleteButton(box)).toBeEnabled())
    fireEvent.click(deleteButton(box))
    expect(await within(box).findByText(new RegExp(error.message))).toBeInTheDocument()
    expect(within(box).getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(token)
    // 弹窗还在、资料还在：没有静默离开页面。
    expect(screen.getByRole('heading', { name: '合成阅读资料', level: 1 })).toBeInTheDocument()
  })
})

describe('deleting from the library', () => {
  const a = sample({ id: '018f1f58-4eb2-4a0d-a716-fb81b19600a1', title: '资料甲' })
  const b = sample({ id: '018f1f58-4eb2-4a0d-a716-fb81b19600b2', title: '资料乙' })
  const c = sample({ id: '018f1f58-4eb2-4a0d-a716-fb81b19600c3', title: '资料丙' })

  function libraryMock(options: { failDelete?: string[]; notes?: Record<string, number> } = {}) {
    let items = [a, b, c]
    const deleted: string[] = []
    const request = mock((path, o) => {
      const m = path.match(/^\/api\/v1\/resources\/([0-9a-f-]{36})(\/deletion-preview)?$/)
      if (m && m[2]) return preview(m[1], { note_count: options.notes?.[m[1]!] ?? 1 })
      if (m && o?.method === 'DELETE') {
        if (options.failDelete?.includes(m[1]!)) return new ApiError('NETWORK_ERROR')
        deleted.push(m[1]!)
        items = items.filter((item) => item.id !== m[1])
        return undefined
      }
      if (path.startsWith('/api/v1/resources?')) return samplePage(items)
      return samplePage([])
    })
    return { request, deleted: () => deleted }
  }

  it('offers a per-item delete that opens the same dialog and refreshes the list', async () => {
    const { deleted } = libraryMock({ notes: { [b.id]: 0 } })
    renderWithRouter(<App />, '/resources')
    await screen.findByRole('link', { name: '资料乙' })
    fireEvent.click(screen.getByRole('button', { name: '删除 资料乙' }))
    const box = await dialog()
    expect(box).toHaveAccessibleName('删除“资料乙”？')
    await waitFor(() => expect(deleteButton(box)).toBeEnabled())
    fireEvent.click(deleteButton(box))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(deleted()).toEqual([b.id])
    // 列表刷新：乙没了，甲丙还在。
    await waitFor(() => expect(screen.queryByRole('link', { name: '资料乙' })).toBeNull())
    expect(screen.getByRole('link', { name: '资料甲' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '资料丙' })).toBeInTheDocument()
  })

  it('deletes a multi-selection in one confirmation with the summed note count', async () => {
    const { request, deleted } = libraryMock({ notes: { [a.id]: 2, [c.id]: 3 } })
    renderWithRouter(<App />, '/resources')
    await screen.findByRole('link', { name: '资料甲' })
    // 未选时没有「删除所选」。
    expect(screen.queryByRole('button', { name: '删除所选' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 资料甲' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 资料丙' }))
    expect(screen.getByText('已选 2 份')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '删除所选' }))
    const box = await dialog()
    expect(box).toHaveAccessibleName('删除 2 份资料？')
    expect(await within(box).findByText('这些资料的 5 条心得会一起删除。')).toBeInTheDocument()
    // 两份都预览了、都还没删。
    expect(request.mock.calls.filter(([p]) => p.endsWith('/deletion-preview'))).toHaveLength(2)
    expect(deleted()).toEqual([])
    fireEvent.click(deleteButton(box))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(deleted()).toEqual([a.id, c.id])
    await waitFor(() => expect(screen.queryByRole('link', { name: '资料甲' })).toBeNull())
    expect(screen.getByRole('link', { name: '资料乙' })).toBeInTheDocument()
    expect(screen.queryByText(/已选 \d+ 份/)).toBeNull()
  })

  it('reports a partial failure, keeps the failed one, and retries only that one', async () => {
    const { request, deleted } = libraryMock({ failDelete: [c.id] })
    renderWithRouter(<App />, '/resources')
    await screen.findByRole('link', { name: '资料甲' })
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 资料甲' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 资料丙' }))
    fireEvent.click(screen.getByRole('button', { name: '删除所选' }))
    const box = await dialog()
    await waitFor(() => expect(deleteButton(box)).toBeEnabled())
    fireEvent.click(deleteButton(box))
    // 甲删了、丙没删：弹窗留着，说清楚哪份没删、为什么。
    expect(await within(box).findByText('已删除 1 份。')).toBeInTheDocument()
    expect(within(box).getByText(/“资料丙”未删除：/)).toBeInTheDocument()
    expect(deleted()).toEqual([a.id])
    const retry = within(box).getByRole('button', { name: '重试' })
    const previewsBefore = request.mock.calls.filter(([p]) =>
      p.endsWith('/deletion-preview'),
    ).length
    fireEvent.click(retry)
    // 重试只重新预览失败的那一份，已删除的不重放。
    await waitFor(() =>
      expect(request.mock.calls.filter(([p]) => p.endsWith('/deletion-preview'))).toHaveLength(
        previewsBefore + 1,
      ),
    )
    expect(request.mock.calls.filter(([p]) => p.endsWith('/deletion-preview')).at(-1)?.[0]).toBe(
      `/api/v1/resources/${c.id}/deletion-preview`,
    )
    expect(deleted()).toEqual([a.id])
  })

  it('offers the same controls in the cards view, and select-all / clear work on the page', async () => {
    const { deleted } = libraryMock()
    renderWithRouter(<App />, '/resources')
    await screen.findByRole('link', { name: '资料甲' })
    fireEvent.click(screen.getByRole('button', { name: '卡片' }))
    expect(screen.getByRole('button', { name: '删除 资料甲' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: '全选本页' }))
    expect(screen.getByText('已选 3 份')).toBeInTheDocument()
    for (const name of ['资料甲', '资料乙', '资料丙'])
      expect(screen.getByRole('checkbox', { name: `选择 ${name}` })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: '清除选择' }))
    expect(screen.queryByText(/已选 \d+ 份/)).toBeNull()
    expect(screen.getByRole('checkbox', { name: '全选本页' })).not.toBeChecked()
    // 卡片视图的单个删除走同一个弹窗。
    fireEvent.click(screen.getByRole('button', { name: '删除 资料甲' }))
    const box = await dialog()
    expect(box).toHaveAccessibleName('删除“资料甲”？')
    await waitFor(() => expect(deleteButton(box)).toBeEnabled())
    fireEvent.click(deleteButton(box))
    await waitFor(() => expect(deleted()).toEqual([a.id]))
  })

  it('clears the selection when the query changes', async () => {
    libraryMock()
    renderWithRouter(<App />, '/resources')
    await screen.findByRole('link', { name: '资料甲' })
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 资料甲' }))
    expect(screen.getByText('已选 1 份')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索资料' }), {
      target: { value: '甲' },
    })
    fireEvent.click(screen.getByRole('button', { name: '搜索 / 应用筛选' }))
    await waitFor(() => expect(screen.queryByText(/已选 \d+ 份/)).toBeNull())
  })
})
