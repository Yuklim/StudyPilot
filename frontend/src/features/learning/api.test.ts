import { describe, expect, it, vi } from 'vitest'
import { api } from '../../api/client'
import { resourceId, sample } from '../resources/fixtures'
import { getResource } from '../resources/api'
import { createRecord, listRecords, options } from './api'
import { command, records, result } from './fixtures'
import { localTime, toInstant } from './model'

describe('learning adapters', () => {
  it('uses approved read/write paths, version/before values and exact fields', async () => {
    const request = vi
      .spyOn(api, 'request')
      .mockResolvedValueOnce(records())
      .mockResolvedValueOnce(records())
      .mockResolvedValue(result())
    await listRecords('page=1')
    await listRecords('sort=-started_at', resourceId)
    expect(await createRecord(sample(), command())).toEqual(result().data.progress)
    expect(request.mock.calls).toEqual([
      ['/api/v1/study-records?page=1'],
      ['/api/v1/resources/' + resourceId + '/study-records?sort=-started_at'],
      ['/api/v1/resources/' + resourceId + '/study-records', { method: 'POST', body: command() }],
    ])
  })
  it('rejects an incorrect baseline without making a request', async () => {
    const request = vi.spyOn(api, 'request')
    for (const extra of [
      { expected_progress_version: 99 },
      { progress_before: 99 },
      { status_before: 'COMPLETED' as const },
    ])
      await expect(createRecord(sample(), { ...command(), ...extra })).rejects.toMatchObject({
        code: 'INVALID_REQUEST',
      })
    await expect(listRecords('', '../escape')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(request).not.toHaveBeenCalled()
  })
  it.each([
    {},
    { data: [] },
    { ...records(), page: { size: 0 } },
    records([{ ...result().data.record, resource_id: 'invalid' }]),
    records([{ ...result().data.record, progress_after: 101 }]),
    records([{ ...result().data.record, duration_seconds: -1 }]),
    records([{ ...result().data.record, started_at: 'bad' }]),
    records([{ ...result().data.record, summary: 'x'.repeat(5001) }]),
  ])('rejects malformed history data without printing its content', async (value) => {
    vi.spyOn(api, 'request').mockResolvedValue(value)
    await expect(listRecords('')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('rejects mismatched records and returned progress instead of claiming success', async () => {
    const mismatched = result()
    mismatched.data.progress.progress_percent = 99
    const wrong = result()
    wrong.data.record.summary = 'different record'
    const badVersion = result()
    badVersion.data.progress.version = 0
    const request = vi.spyOn(api, 'request')
    for (const value of [mismatched, wrong, badVersion]) {
      request.mockResolvedValueOnce(value)
      await expect(createRecord(sample(), command())).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      })
    }
    request.mockResolvedValueOnce(
      records([{ ...result().data.record, resource_id: '00000000-0000-4000-8000-000000000099' }]),
    )
    await expect(listRecords('', resourceId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it.each([
    { version: undefined },
    { resource_id: 'wrong' },
    { version: 0 },
    { version: 1.5 },
    { archived_from_status: 'UNREAD' },
    { status: 'ARCHIVED', archived_from_status: null },
    { status: 'COMPLETED', completed_at: null },
    { started_at: 'bad' },
  ])('requires a real complete resource snapshot: %s', async (value) => {
    const item = sample()
    vi.spyOn(api, 'request').mockResolvedValue({
      data: { ...item, progress: { ...item.progress, ...value } },
    })
    await expect(getResource(resourceId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('limits archive restoration and review states using actual snapshot conditions', () => {
    expect(options(sample())).toEqual(['UNREAD', 'IN_PROGRESS', 'ARCHIVED'])
    const item = sample({
      progress: { ...sample().progress, status: 'ARCHIVED', archived_from_status: 'COMPLETED' },
    })
    expect(options(item)).toEqual(['ARCHIVED', 'COMPLETED'])
    expect(
      options(sample({ progress: { ...sample().progress, status: 'IN_PROGRESS' } })),
    ).not.toContain('REVIEW_DUE')
  })
  it('converts local times without silently normalizing impossible dates', () => {
    const valid = '2026-09-03T12:34:56'
    expect(localTime(new Date(toInstant(valid)!))).toBe(valid)
    expect(toInstant('2026-09-03T12:34')).toBe(new Date('2026-09-03T12:34:00').toISOString())
    for (const value of ['', '2026-02-30T12:00', '2026-09-03', '2026-09-03T25:00'])
      expect(toInstant(value)).toBeNull()
  })
})
