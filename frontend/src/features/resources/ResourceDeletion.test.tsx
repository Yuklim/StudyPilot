import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from '../../App'
import { ApiError, api } from '../../api/client'
import { renderWithRouter } from '../../test/render'
import { resourceId, sample, sampleFile } from './fixtures'

const token = 't'.repeat(43)
const impact = {
  original_file_count: 1,
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
      await screen.findByRole('heading', { name: item.title, level: 2 })
      fireEvent.click(screen.getByRole('button', { name: '删除这份资料' }))
      expect(await screen.findByRole('dialog', { name: /确认删除/ })).toBeInTheDocument()
      expect(screen.getByText('原件')).toBeInTheDocument()
      expect(screen.getByText('心得')).toBeInTheDocument()
      expect(screen.getByText(/不可撤销/)).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: '删除这份资料' }))
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
    fireEvent.click(screen.getByRole('button', { name: '删除这份资料' }))
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
    fireEvent.click(screen.getByRole('button', { name: '删除这份资料' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }))
    expect(await screen.findByText(error.message)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新预览删除' })).toBeInTheDocument()
  })
})
