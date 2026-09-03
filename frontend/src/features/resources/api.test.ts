import { describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import { createResource, getResource, listResources, safeWebUrl } from './api'
import { resourceId, sample, samplePage } from './fixtures'

describe('resource view adapter', () => {
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
