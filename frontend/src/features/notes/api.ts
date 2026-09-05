import { api, ApiError } from '../../api/client'
import { isResourceId } from '../resources/api'

export interface Note {
  id: string
  /** 独立心得为 null；绑定资料心得为其资源 id。 */
  resource_id: string | null
  content: string
  version: number
  created_at: string
  updated_at: string
}
export interface NotePage {
  data: Note[]
  page: {
    number: number
    size: number
    total_items: number
    total_pages: number
    has_more: boolean
  }
}
export function cleanContent(content: string): string {
  const whitespace = (char: string) =>
    char.trim() === '' || [0x85, 0x1c, 0x1d, 0x1e, 0x1f].includes(char.charCodeAt(0))
  let start = 0
  let end = content.length
  while (start < end && whitespace(content[start])) start++
  while (end > start && whitespace(content[end - 1])) end--
  return content.slice(start, end)
}
function invalid(): never {
  throw new ApiError('INVALID_RESPONSE')
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : invalid()
}
function instant(value: unknown): string {
  return typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
    ? value
    : invalid()
}
function uuid(value: unknown): string | null {
  if (value === null) return null
  return typeof value === 'string' && isResourceId(value) ? value : invalid()
}
function note(value: unknown, resourceId: string | null): Note {
  const row = object(value)
  const rid = uuid(row.resource_id)
  if (
    typeof row.id !== 'string' ||
    !isResourceId(row.id) ||
    (resourceId === null ? rid !== null : rid !== resourceId) ||
    typeof row.content !== 'string' ||
    !cleanContent(row.content) ||
    [...row.content].length > 50000
  )
    return invalid()
  return {
    id: row.id,
    resource_id: rid,
    content: row.content,
    version: integer(row.version, 1),
    created_at: instant(row.created_at),
    updated_at: instant(row.updated_at),
  }
}
function path(resourceId: string | null, noteId?: string): string {
  if (
    (resourceId !== null && !isResourceId(resourceId)) ||
    (noteId !== undefined && !isResourceId(noteId))
  )
    throw new ApiError('INVALID_REQUEST')
  const base = resourceId === null ? '/api/v1/notes' : `/api/v1/resources/${resourceId}/notes`
  return base + (noteId ? '/' + noteId : '')
}
export async function listNotes(resourceId: string | null, number = 1): Promise<NotePage> {
  if (!Number.isSafeInteger(number) || number < 1) throw new ApiError('INVALID_REQUEST')
  const envelope = object(
    await api.request(path(resourceId) + `?page=${number}&page_size=20&sort=-created_at`),
  )
  const page = object(envelope.page)
  if (!Array.isArray(envelope.data) || typeof page.has_more !== 'boolean' || page.number !== number)
    return invalid()
  const data = envelope.data.map((row) => note(row, resourceId))
  const size = integer(page.size, 1, 100)
  const total = integer(page.total_items)
  if (
    data.length > size ||
    data.length > total ||
    new Set(data.map((row) => row.id)).size !== data.length
  )
    return invalid()
  return {
    data,
    page: {
      number,
      size,
      total_items: total,
      total_pages: integer(page.total_pages),
      has_more: page.has_more,
    },
  }
}
export async function getNote(resourceId: string | null, noteId: string): Promise<Note> {
  const result = note(object(await api.request(path(resourceId, noteId))).data, resourceId)
  return result.id === noteId ? result : invalid()
}
export async function saveNote(
  resourceId: string | null,
  content: string,
  previous: Note | null,
): Promise<Note> {
  const cleaned = cleanContent(content)
  if (
    !cleaned ||
    [...cleaned].length > 50000 ||
    (previous &&
      (previous.resource_id !== resourceId ||
        !Number.isSafeInteger(previous.version) ||
        previous.version < 1))
  )
    throw new ApiError('INVALID_REQUEST')
  const result = note(
    object(
      await api.request(path(resourceId, previous?.id), {
        method: previous ? 'PATCH' : 'POST',
        body: { content: cleaned, ...(previous ? { expected_version: previous.version } : {}) },
      }),
    ).data,
    resourceId,
  )
  const version = previous ? previous.version + (cleaned === previous.content ? 0 : 1) : 1
  if (
    result.content !== cleaned ||
    result.version !== version ||
    (previous && (result.id !== previous.id || result.created_at !== previous.created_at))
  )
    return invalid()
  return result
}
export async function deleteNote(resourceId: string | null, previous: Note): Promise<void> {
  if (
    previous.resource_id !== resourceId ||
    !Number.isSafeInteger(previous.version) ||
    previous.version < 1
  )
    throw new ApiError('INVALID_REQUEST')
  const result = await api.request(path(resourceId, previous.id), {
    method: 'DELETE',
    ifMatchVersion: previous.version,
  })
  if (result !== undefined) return invalid()
}
export function noteError(error: unknown): string {
  return error instanceof ApiError ? error.message : '操作未能完成，请检查本机连接。'
}
export function needsRecovery(error: unknown): boolean {
  return (
    !(error instanceof ApiError) ||
    error.status === 409 ||
    error.status === 428 ||
    error.status >= 500 ||
    ['NETWORK_ERROR', 'INVALID_RESPONSE', 'REQUEST_FAILED'].includes(error.code)
  )
}
