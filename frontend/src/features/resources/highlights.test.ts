import { describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import {
  bindHighlightNote,
  createHighlight,
  deleteHighlight,
  listHighlights,
  type Highlight,
} from './highlights'

/** 高亮接口的受控客户端（TASK-072）：请求形状、响应校验、以及契约里那几条不许含糊的规矩。 */

const resourceId = '018f1f58-4eb2-4a0d-a716-fb81b1960001'
const noteId = '018f1f58-4eb2-4a0d-a716-fb81b1960005'
const base = `/api/v1/resources/${resourceId}/highlights`

function row(overrides: Partial<Highlight> = {}): Highlight {
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

describe('controlled highlight API', () => {
  it('lists in reading order and rejects a page that is not what was asked for', async () => {
    const request = vi.spyOn(api, 'request')
    request.mockResolvedValueOnce({
      data: [row()],
      page: { number: 1, size: 100, total_items: 1, total_pages: 1, has_more: false },
    })
    const page = await listHighlights(resourceId)
    expect(request).toHaveBeenLastCalledWith(base + '?page=1&page_size=100')
    expect(page.data[0]!.exact).toBe('输入层、隐藏层、输出层')

    request.mockResolvedValueOnce({
      data: [row(), row()],
      page: { number: 1, size: 100, total_items: 2, total_pages: 1, has_more: false },
    })
    // 同一个 id 出现两次：读到的不是一份可信的列表。
    await expect(listHighlights(resourceId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })

    request.mockResolvedValueOnce({
      data: [row({ resource_id: '018f1f58-4eb2-4a0d-a716-fb81b1960999' })],
      page: { number: 1, size: 100, total_items: 1, total_pages: 1, has_more: false },
    })
    await expect(listHighlights(resourceId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('sends the anchor as the contract spells it and omits note_id when there is none', async () => {
    const request = vi.spyOn(api, 'request')
    request.mockResolvedValueOnce({ data: row() })
    await createHighlight(resourceId, {
      exact: '输入层、隐藏层、输出层',
      prefix: '神经网络主要由',
      suffix: '构成。',
      start_offset: 7,
      end_offset: 18,
    })
    expect(request).toHaveBeenLastCalledWith(base, {
      method: 'POST',
      body: {
        exact: '输入层、隐藏层、输出层',
        prefix: '神经网络主要由',
        suffix: '构成。',
        start_offset: 7,
        end_offset: 18,
      },
    })
  })

  it('always states note_id on a patch, because leaving it out would unbind', async () => {
    const request = vi.spyOn(api, 'request')
    request.mockResolvedValueOnce({ data: row({ note_id: noteId, version: 2 }) })
    const bound = await bindHighlightNote(resourceId, row(), noteId)
    expect(request).toHaveBeenLastCalledWith(base + '/' + row().id, {
      method: 'PATCH',
      body: { note_id: noteId, expected_version: 1 },
    })
    expect(bound.note_id).toBe(noteId)

    request.mockResolvedValueOnce({ data: row({ version: 3 }) })
    await bindHighlightNote(resourceId, row({ note_id: noteId, version: 2 }), null)
    expect(request).toHaveBeenLastCalledWith(base + '/' + row().id, {
      method: 'PATCH',
      body: { note_id: null, expected_version: 2 },
    })
  })

  it('refuses a patch answer whose anchor moved: the anchor is immutable', async () => {
    const request = vi.spyOn(api, 'request')
    request.mockResolvedValueOnce({ data: row({ exact: '换了一段别的话', version: 2 }) })
    await expect(bindHighlightNote(resourceId, row(), noteId)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('deletes with the version it read and accepts no body back', async () => {
    const request = vi.spyOn(api, 'request')
    request.mockResolvedValueOnce(undefined)
    await deleteHighlight(resourceId, row({ version: 4 }))
    expect(request).toHaveBeenLastCalledWith(base + '/' + row().id, {
      method: 'DELETE',
      ifMatchVersion: 4,
    })
    request.mockResolvedValueOnce({ data: row() })
    await expect(deleteHighlight(resourceId, row())).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('rejects impossible anchors and foreign ids before sending', async () => {
    const request = vi.spyOn(api, 'request')
    const anchor = {
      exact: 'x'.repeat(10),
      prefix: null,
      suffix: null,
      start_offset: 5,
      end_offset: 9,
    }
    // 区间反了、空原文、负偏移：都不该发出去。
    await expect(createHighlight(resourceId, { ...anchor, end_offset: 5 })).rejects.toBeInstanceOf(
      ApiError,
    )
    await expect(createHighlight(resourceId, { ...anchor, exact: '' })).rejects.toBeInstanceOf(
      ApiError,
    )
    await expect(
      createHighlight(resourceId, { ...anchor, start_offset: -1 }),
    ).rejects.toBeInstanceOf(ApiError)
    await expect(createHighlight(resourceId, anchor, 'not-a-uuid')).rejects.toBeInstanceOf(ApiError)
    await expect(createHighlight('../bad', anchor)).rejects.toBeInstanceOf(ApiError)
    await expect(
      bindHighlightNote('018f1f58-4eb2-4a0d-a716-fb81b1960999', row(), null),
    ).rejects.toBeInstanceOf(ApiError)
    expect(request).not.toHaveBeenCalled()
  })
})
