import { describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../../api/client'
import { createResource, getResource, listResources } from '../resources/api'
import { resourceId, sample, samplePage } from '../resources/fixtures'
import {
  changeResourceTag,
  deleteClassification,
  getClassification,
  listClassifications,
  saveClassification,
} from './api'
import { category, categoryPage, tagId, topicId } from './fixtures'

describe('taxonomy adapter', () => {
  it('uses frozen create/update/delete fields and preserves explicit description clearing', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ data: category() })
    await saveClassification('topics', ' 合成主题 ', '', category())
    expect(request).toHaveBeenLastCalledWith(`/api/v1/topics/${topicId}`, {
      method: 'PATCH',
      body: { name: '合成主题', description: null, expected_version: 1 },
    })
    await saveClassification('tags', '新标签', 'must not be sent')
    expect(request).toHaveBeenLastCalledWith('/api/v1/tags', {
      method: 'POST',
      body: { name: '新标签' },
    })
    request.mockResolvedValue(undefined)
    await deleteClassification('topics', category())
    expect(request).toHaveBeenLastCalledWith(`/api/v1/topics/${topicId}`, {
      method: 'DELETE',
      ifMatchVersion: 1,
    })
  })
  it.each([
    {},
    { data: [], page: {} },
    categoryPage([category({ version: 0 })]),
    categoryPage([category({ created_at: 'bad' })]),
    categoryPage([category({ id: 'unsafe' })]),
    categoryPage([category({ name: '' })]),
    categoryPage([category({ description: undefined })]),
  ])('rejects malformed pages', async (payload) => {
    vi.spyOn(api, 'request').mockResolvedValue(payload)
    await expect(listClassifications('topics', 'page=1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
  it('rejects mismatched item/association ids and invalid delete responses', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ data: category({ id: tagId }) })
    await expect(getClassification('topics', topicId)).rejects.toBeInstanceOf(ApiError)
    await expect(saveClassification('topics', '合成', '', category())).rejects.toBeInstanceOf(
      ApiError,
    )
    await expect(deleteClassification('topics', category())).rejects.toBeInstanceOf(ApiError)
    request.mockResolvedValue({
      data: {
        resource_id: resourceId,
        tag_id: topicId,
        association_version: 1,
        created_at: category().created_at,
      },
    })
    await expect(changeResourceTag(resourceId, tagId, true)).rejects.toBeInstanceOf(ApiError)
    request.mockClear()
    await expect(changeResourceTag('../escape', tagId, true)).rejects.toBeInstanceOf(ApiError)
    expect(request).not.toHaveBeenCalled()
  })
  it('uses per-tag operations, validates association and never sends a full replacement list', async () => {
    const request = vi
      .spyOn(api, 'request')
      .mockResolvedValueOnce({
        data: {
          resource_id: resourceId,
          tag_id: tagId,
          association_version: 1,
          created_at: category().created_at,
        },
      })
      .mockResolvedValue(undefined)
    await changeResourceTag(resourceId, tagId, true)
    await changeResourceTag(resourceId, tagId, false)
    expect(request.mock.calls).toEqual([
      [`/api/v1/resources/${resourceId}/tags/${tagId}`, { method: 'PUT' }],
      [`/api/v1/resources/${resourceId}/tags/${tagId}`, { method: 'DELETE' }],
    ])
  })
  it('resolves one name per distinct topic and keeps resources visible on a label lookup failure', async () => {
    const request = vi
      .spyOn(api, 'request')
      .mockResolvedValueOnce(
        samplePage([sample({ topic_id: topicId }), sample({ topic_id: topicId })]),
      )
      .mockResolvedValue({ data: category() })
    expect((await listResources('page=1')).data.map((item) => item.topic_name)).toEqual([
      '合成主题',
      '合成主题',
    ])
    expect(request).toHaveBeenCalledTimes(2)
    request
      .mockResolvedValueOnce({ data: sample({ topic_id: topicId }) })
      .mockRejectedValueOnce(new ApiError('NETWORK_ERROR'))
    expect(await getResource(resourceId)).toMatchObject({
      topic_id: topicId,
      topic_name: undefined,
    })
  })
  it('saves optional classification in the original single resource transaction', async () => {
    const request = vi
      .spyOn(api, 'request')
      .mockResolvedValue({ data: sample({ topic_id: topicId }) })
    const body = {
      source_type: 'WEB' as const,
      title: '合成',
      source_url: 'https://example.com',
      topic_id: topicId,
      tag_ids: [tagId],
    }
    await createResource(body)
    expect(request).toHaveBeenCalledExactlyOnceWith('/api/v1/resources', { method: 'POST', body })
  })
})
