import { describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../../api/client'
import {
  attachNote,
  cleanContent,
  deleteNote,
  detachNote,
  getNote,
  listNotes,
  saveNote,
} from './api'
import { note, notePage } from './fixtures'

const resourceId = note().resource_id
const url = `/api/v1/resources/${resourceId}/notes`

describe('controlled note API', () => {
  it('writes only content and version; uses versioned deletion and stable pagination', async () => {
    const request = vi.spyOn(api, 'request')
    request.mockResolvedValueOnce({ data: note() })
    await saveNote(resourceId, '  这是合成心得。\n', null)
    expect(request).toHaveBeenLastCalledWith(url, {
      method: 'POST',
      body: { content: '这是合成心得。' },
    })
    request.mockResolvedValueOnce({ data: note({ content: '更新', version: 2 }) })
    await saveNote(resourceId, '更新', note())
    expect(request).toHaveBeenLastCalledWith(url + '/' + note().id, {
      method: 'PATCH',
      body: { expected_version: 1, content: '更新' },
    })
    request.mockResolvedValueOnce({ data: note() })
    await saveNote(resourceId, note().content, note())
    request.mockResolvedValueOnce(undefined)
    await deleteNote(resourceId, note())
    expect(request).toHaveBeenLastCalledWith(url + '/' + note().id, {
      method: 'DELETE',
      ifMatchVersion: 1,
    })
    request.mockResolvedValueOnce(notePage([], 2))
    await listNotes(resourceId, 2)
    expect(request).toHaveBeenLastCalledWith(url + '?page=2&page_size=20&sort=-created_at')
  })
  it.each([
    { resource_id: '018f1f58-4eb2-4a0d-a716-fb81b1960999' },
    { id: '../wrong' },
    { version: 0 },
    { version: 1.5 },
    { content: '' },
    { content: ' '.repeat(3) },
    { content: 'x'.repeat(50001) },
    { created_at: '2026-09-03T02:00:00' },
    { updated_at: 'wrong' },
  ])('rejects malformed or wrong-parent notes %j', async (override) => {
    vi.spyOn(api, 'request').mockResolvedValue({ data: { ...note(), ...override } })
    await expect(getNote(resourceId, note().id)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('rejects wrong ID, content or version in successful write responses', async () => {
    const request = vi
      .spyOn(api, 'request')
      .mockResolvedValue({ data: note({ id: '018f1f58-4eb2-4a0d-a716-fb81b1960999' }) })
    await expect(getNote(resourceId, note().id)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    request.mockResolvedValue({ data: note({ content: 'not mine' }) })
    await expect(saveNote(resourceId, 'mine', null)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
    request.mockResolvedValue({ data: note({ content: 'mine', version: 1 }) })
    await expect(saveNote(resourceId, 'mine', note())).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
    request.mockResolvedValue({ data: note() })
    await expect(deleteNote(resourceId, note())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it.each([0, 3, 50001])(
    'rejects invalid content without a request (length %s)',
    async (length) => {
      const content = length < 4 ? ' '.repeat(length) : 'x'.repeat(length)
      const request = vi.spyOn(api, 'request')
      await expect(saveNote(resourceId, content, null)).rejects.toBeInstanceOf(ApiError)
      expect(request).not.toHaveBeenCalled()
    },
  )
  it('counts Unicode characters and preserves internal whitespace', async () => {
    const content = '🌱'.repeat(50000)
    vi.spyOn(api, 'request').mockResolvedValue({ data: note({ content }) })
    await expect(saveNote(resourceId, content, null)).resolves.toMatchObject({ content })
    expect(cleanContent('\u0085\u001f one\n  two \u0085')).toBe('one\n  two')
  })
  it.each([
    { data: [note(), note()], page: notePage([], 1, 2).page },
    { data: [note()], page: { ...notePage().page, number: 2 } },
    { data: [note()], page: { ...notePage().page, size: 0 } },
    { data: [], page: { ...notePage().page, has_more: 'false' } },
    { data: [], page: { ...notePage().page, total_items: -1 } },
  ])('rejects malformed pages', async (value) => {
    vi.spyOn(api, 'request').mockResolvedValue(value)
    await expect(listNotes(resourceId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('rejects bad paths, pages and cross-resource writes before sending', async () => {
    const request = vi.spyOn(api, 'request')
    await expect(listNotes('../bad')).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(listNotes(resourceId, 0)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(saveNote(resourceId, 'x', note({ resource_id: 'other' }))).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    })
    await expect(deleteNote(resourceId, note({ version: 0 }))).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    })
    expect(request).not.toHaveBeenCalled()
  })
})

describe('standalone note API (resource_id null)', () => {
  const standaloneUrl = '/api/v1/notes'
  const standalone = note({ resource_id: null, id: '018f1f58-4eb2-4a0d-a716-fb81b1960100' })

  it('uses the top-level collection path for create/list/detail/update/delete', async () => {
    const request = vi.spyOn(api, 'request')
    request.mockResolvedValueOnce({
      data: note({ resource_id: null, id: standalone.id, content: '独立心得' }),
    })
    await saveNote(null, '  独立心得\n', null)
    expect(request).toHaveBeenLastCalledWith(standaloneUrl, {
      method: 'POST',
      body: { content: '独立心得' },
    })
    request.mockResolvedValueOnce({
      data: note({ resource_id: null, content: '改', version: 2, id: standalone.id }),
    })
    await saveNote(null, '改', standalone)
    expect(request).toHaveBeenLastCalledWith(standaloneUrl + '/' + standalone.id, {
      method: 'PATCH',
      body: { expected_version: 1, content: '改' },
    })
    request.mockResolvedValueOnce(undefined)
    await deleteNote(null, standalone)
    expect(request).toHaveBeenLastCalledWith(standaloneUrl + '/' + standalone.id, {
      method: 'DELETE',
      ifMatchVersion: 1,
    })
    request.mockResolvedValueOnce(notePage([standalone]))
    await listNotes(null, 1)
    expect(request).toHaveBeenLastCalledWith(
      standaloneUrl + '?page=1&page_size=20&sort=-created_at',
    )
    request.mockResolvedValueOnce({ data: standalone })
    await getNote(null, standalone.id)
    expect(request).toHaveBeenLastCalledWith(standaloneUrl + '/' + standalone.id)
  })

  it('rejects a bound note under the standalone scope and a null-note under a bound scope', async () => {
    const request = vi.spyOn(api, 'request')
    // A standalone scope must never accept a note carrying a non-null resource_id.
    request.mockResolvedValue({ data: note() })
    await expect(getNote(null, standalone.id)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
    // A bound scope must never accept a standalone (null) note.
    request.mockResolvedValue({ data: note({ resource_id: null }) })
    await expect(getNote(resourceId, standalone.id)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
})

describe('note scope moves (attach/detach)', () => {
  // Matches the bound fixture's resource id (note().resource_id at runtime).
  const target = '00000000-0000-4000-8000-000000000001'
  const standalone = note({ resource_id: null, id: '018f1f58-4eb2-4a0d-a716-fb81b1960100' })

  it('attaches a standalone note to a resource with a versioned POST', async () => {
    const request = vi.spyOn(api, 'request')
    request.mockResolvedValueOnce({ data: { ...standalone, resource_id: target, version: 2 } })
    await attachNote(standalone, target)
    expect(request).toHaveBeenLastCalledWith(`/api/v1/notes/${standalone.id}/attach`, {
      method: 'POST',
      body: { resource_id: target, expected_version: 1 },
    })
  })

  it('detaches a bound note back to standalone with a versioned POST', async () => {
    const bound = note({ id: standalone.id })
    const request = vi.spyOn(api, 'request')
    request.mockResolvedValueOnce({ data: { ...bound, resource_id: null, version: 2 } })
    await detachNote(bound)
    expect(request).toHaveBeenLastCalledWith(
      `/api/v1/resources/${bound.resource_id}/notes/${bound.id}/detach`,
      { method: 'POST', body: { expected_version: 1 } },
    )
  })

  it('rejects malformed move responses and out-of-scope inputs before sending', async () => {
    const request = vi.spyOn(api, 'request')
    // attach response still standalone or stale version -> invalid
    request.mockResolvedValue({ data: standalone })
    await expect(attachNote(standalone, target)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
    // attach response changed the content -> invalid
    request.mockResolvedValue({
      data: { ...standalone, resource_id: target, version: 2, content: '别的字' },
    })
    await expect(attachNote(standalone, target)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
    // detach response still bound or content changed -> invalid
    request.mockResolvedValue({ data: note({ version: 2 }) })
    await expect(detachNote(note())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    // must not fire for an already-bound note (attach) or a standalone note (detach)
    await expect(attachNote(note(), target)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(detachNote(standalone)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })
})
