import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from '../../App'
import { ApiError, api } from '../../api/client'
import { renderWithRouter } from '../../test/render'
import { resourceId, sample, sampleFile } from './fixtures'
import { resourceTitle } from './resourceTitle'

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
const preview = {
  resource_id: resourceId,
  resource_version: 1,
  impact_revision: 'a'.repeat(64),
  expires_at: '2026-09-04T05:00:00Z',
  confirmation_token: token,
  impact,
}

function resourceResponse(item = sample()) {
  return { data: item }
}
const notesPage = {
  data: [],
  page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
}

function mockDeletion(item = sample(), response: unknown = { data: preview }) {
  return vi
    .spyOn(api, 'request')
    .mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === `/api/v1/resources/${item.id}` && options?.method === 'DELETE') return response
      if (path === `/api/v1/resources/${item.id}`) return resourceResponse(item)
      if (path === `/api/v1/resources/${item.id}/deletion-preview`) return response
      if (path.startsWith(`/api/v1/resources/${item.id}/notes?`)) return notesPage
      return { data: [] }
    })
}

/**
 * TASK-043 起「删除这份资料」在阅读器工具条的 `⋯` 菜单底部（用户 2026-09-07 选定），
 * 不再是详情页上的常驻按钮。因此本文件每条用例都先开菜单再点删除。
 *
 * **这是入口多了一步，不是断言放宽**：删除的三步流程（预览影响 → 一次性令牌 → 确认）
 * 与本文件此前的每一条断言原样保留。开菜单这一步本身也是新行为的断言——菜单打不开
 * 或删除项不在里面，下面每条用例都会红。
 */
function openDeletion() {
  fireEvent.click(screen.getByRole('button', { name: '更多操作' }))
  // 菜单项只负责**打开面板**；删除流程渲染在菜单之外，点别处不会把令牌丢掉。
  fireEvent.click(screen.getByRole('menuitem', { name: '删除资料…' }))
  fireEvent.click(screen.getByRole('button', { name: '删除这份资料' }))
}

describe('resource deletion page', () => {
  it.each([
    ['WEB', sample()],
    ['PASTE', sample({ source_type: 'PASTE', pasted_content: '合成原文' })],
    ['FILE', sampleFile()],
  ])(
    'previews %s deletion before any confirm request and supports cancellation',
    async (_, item) => {
      const request = mockDeletion(item, { data: { ...preview, resource_id: item.id } })
      renderWithRouter(<App />, `/resources/${item.id}`)
      await screen.findByRole('heading', { name: resourceTitle(item), level: 2 })
      openDeletion()
      const dialog = await screen.findByRole('dialog', { name: /确认删除/ })
      // **影响摘要的每一项都在这个对话框里查**，不在整页里查：TASK-043 之后
      // 「原件」「心得」这些词在工具条上也会出现，全页查会撞上它们。
      // 这是把断言收紧到该在的地方，不是放宽。
      expect(within(dialog).getByText('原件')).toBeInTheDocument()
      // TASK-039 遗留 G：后端从那时起就返回图片张数，但界面上三处解析器/标签表都
      // 忽略它，带图资料的删除预览会**少报**将被删除的东西。扩展一旦开始写图片，
      // 这就是用户可见的漏报，所以本条与后端那侧的计数一起钉住。
      expect(within(dialog).getByText('已冻结的图片')).toBeInTheDocument()
      expect(within(dialog).getByText('心得')).toBeInTheDocument()
      expect(within(dialog).getByText(/不可撤销/)).toBeInTheDocument()
      expect(request.mock.calls.map(([path]) => path)).toContain(
        `/api/v1/resources/${item.id}/deletion-preview`,
      )
      expect(request.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false)
      const beforeCancel = request.mock.calls.length
      fireEvent.click(screen.getByRole('button', { name: '取消' }))
      expect(screen.queryByRole('dialog', { name: /确认删除/ })).not.toBeInTheDocument()
      expect(request).toHaveBeenCalledTimes(beforeCancel)
    },
  )

  it('shows the untitled placeholder in the detail heading and deletion confirmation', async () => {
    mockDeletion(sample({ title: null }))
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByRole('heading', { name: '未命名资料', level: 2 })
    openDeletion()
    expect(
      await screen.findByRole('dialog', { name: '确认删除“未命名资料”？' }),
    ).toBeInTheDocument()
  })

  it('confirms once, then returns to the library after a 204 response', async () => {
    const request = mockDeletion(sample())
    request.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === `/api/v1/resources/${resourceId}` && options?.method === 'DELETE')
        return undefined
      if (path === `/api/v1/resources/${resourceId}`) return resourceResponse()
      if (path === `/api/v1/resources/${resourceId}/deletion-preview`) return { data: preview }
      if (path.startsWith(`/api/v1/resources/${resourceId}/notes?`)) return notesPage
      return { data: [] }
    })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByRole('heading', { name: '合成阅读资料', level: 2 })
    openDeletion()
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }))
    expect(await screen.findByRole('heading', { name: '资料库', level: 1 })).toBeInTheDocument()
    expect(request.mock.calls).toContainEqual([
      `/api/v1/resources/${resourceId}`,
      { method: 'DELETE', deletionToken: token },
    ])
    expect(screen.queryByText(token)).not.toBeInTheDocument()
  })

  it('clears an invalidated token and shows the current impact without exposing a replacement token', async () => {
    const changed = {
      resource_id: resourceId,
      resource_version: 2,
      impact_revision: 'b'.repeat(64),
      impact,
    }
    const request = mockDeletion(sample())
    request.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === `/api/v1/resources/${resourceId}` && options?.method === 'DELETE')
        throw new ApiError('DELETION_IMPACT_CHANGED', 409, undefined, { current_impact: changed })
      if (path === `/api/v1/resources/${resourceId}`) return resourceResponse()
      if (path === `/api/v1/resources/${resourceId}/deletion-preview`) return { data: preview }
      if (path.startsWith(`/api/v1/resources/${resourceId}/notes?`)) return notesPage
      return { data: [] }
    })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByRole('heading', { name: '合成阅读资料', level: 2 })
    openDeletion()
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }))
    expect(await screen.findByText('删除影响已经变化，请重新预览并确认。')).toBeInTheDocument()
    expect(screen.getByText('最新影响摘要：')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新预览删除' })).toBeInTheDocument()
    expect(screen.queryByText(token)).not.toBeInTheDocument()
    expect(request.mock.calls).toContainEqual([
      `/api/v1/resources/${resourceId}`,
      { method: 'DELETE', deletionToken: token },
    ])
  })

  it.each([
    new ApiError('DELETION_TOKEN_EXPIRED', 410),
    new ApiError('DELETION_TOKEN_REPLAYED', 409),
    new ApiError('DELETION_TOKEN_INVALID', 403),
  ])('shows a controlled recovery for %s', async (error) => {
    const request = mockDeletion(sample())
    request.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === `/api/v1/resources/${resourceId}` && options?.method === 'DELETE') throw error
      if (path === `/api/v1/resources/${resourceId}`) return resourceResponse()
      if (path === `/api/v1/resources/${resourceId}/deletion-preview`) return { data: preview }
      if (path.startsWith(`/api/v1/resources/${resourceId}/notes?`)) return notesPage
      return { data: [] }
    })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByRole('heading', { name: '合成阅读资料', level: 2 })
    openDeletion()
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }))
    expect(await screen.findByText(error.message)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新预览删除' })).toBeInTheDocument()
  })
})
