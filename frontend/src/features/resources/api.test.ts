import { describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import { createResource, getResource, listResources, safeWebUrl, updateResource } from './api'
import { resourceId, sample, samplePage } from './fixtures'

describe('resource view adapter', () => {
  it('updates only requested fields with the resource version in the JSON body', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ data: sample({ version: 2 }) })
    await updateResource(sample(), { source_name: null, title: '新标题' }, 1)
    expect(request).toHaveBeenCalledExactlyOnceWith(`/api/v1/resources/${resourceId}`, {
      method: 'PATCH',
      body: { source_name: null, title: '新标题', expected_version: 1 },
    })
  })
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, undefined, null, '1'])(
    'rejects unusable resource response version %s',
    async (version) => {
      vi.spyOn(api, 'request').mockResolvedValue({ data: { ...sample(), version } })
      await expect(getResource(resourceId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    },
  )
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'blocks invalid write version %s',
    async (version) => {
      const request = vi.spyOn(api, 'request')
      await expect(updateResource(sample(), { title: '修改' }, version)).rejects.toMatchObject({
        code: 'INVALID_REQUEST',
      })
      expect(request).not.toHaveBeenCalled()
    },
  )
  it.each([
    sample({ id: '00000000-0000-4000-8000-000000000009' }),
    sample({ source_type: 'PASTE', pasted_content: '合成' }),
    sample({ version: 1 }),
  ])('rejects wrong identity, source or stale update response', async (payload) => {
    vi.spyOn(api, 'request').mockResolvedValue({ data: payload })
    await expect(updateResource(sample(), { title: '修改' }, 2)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
  it('rejects empty updates and invalid ids before requesting', async () => {
    const request = vi.spyOn(api, 'request')
    await expect(updateResource(sample(), {}, 1)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(
      updateResource(sample({ id: '../escape' }), { title: '改' }, 1),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(request).not.toHaveBeenCalled()
  })
  it('uses only the approved same-origin paths and preserves pagination', async () => {
    const request = vi
      .spyOn(api, 'request')
      .mockResolvedValueOnce(samplePage())
      .mockResolvedValue({ data: sample() })
    expect((await listResources('page=1')).page.total_items).toBe(1)
    await getResource(resourceId)
    await createResource({ source_type: 'WEB', title: '合成', source_url: 'https://example.com' })
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/resources?page=1',
      `/api/v1/resources/${resourceId}`,
      '/api/v1/resources',
    ])
  })
  it.each([
    {},
    { data: null },
    { data: [sample()], page: {} },
    samplePage([
      sample({ progress: { ...sample().progress, status: 'UNREAD', progress_percent: 101 } }),
    ]),
  ])('rejects malformed envelopes without exposing values', async (payload) => {
    vi.spyOn(api, 'request').mockResolvedValue(payload)
    await expect(listResources('page=1')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('rejects mismatched detail ids, invalid timestamps, and missing source fields', async () => {
    const request = vi
      .spyOn(api, 'request')
      .mockResolvedValueOnce({ data: sample({ id: '00000000-0000-4000-8000-000000000002' }) })
      .mockResolvedValueOnce({ data: sample({ created_at: 'broken date' }) })
      .mockResolvedValueOnce({ data: sample({ source_url: undefined }) })
    for (let i = 0; i < 3; i++)
      await expect(getResource(resourceId)).rejects.toBeInstanceOf(ApiError)
    request.mockClear()
    await expect(getResource('../escape')).rejects.toMatchObject({ status: 404 })
    expect(request).not.toHaveBeenCalled()
  })
  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    'https://user:pass@example.com',
    'https://example.com/#part',
    'https://example.com/\\evil',
    'https://example.com/a b',
    'https://example.com/\n',
  ])('never makes an unsafe URL clickable: %s', (url) => {
    expect(safeWebUrl(url)).toBeNull()
  })
  it('permits explicit http(s) navigation with query parameters', () => {
    expect(safeWebUrl('https://example.com/read?q=hello%20world')).toBe(
      'https://example.com/read?q=hello%20world',
    )
  })
})
