import { api, ApiError } from '../../api/client'
import { isResourceId } from './api'
import { MAX_CONTEXT, MAX_EXACT, type Anchor } from './highlightAnchor'

/**
 * 高亮接口的受控客户端（TASK-072，契约 4.15 / 10 节）。
 *
 * 五个操作里本页用到四个：列表、新增、改绑或解绑心得、删除。锚点创建后不可改，所以这里
 * 没有「改锚点」的写法；`PATCH` 的 `note_id` 必须显式给出（`null` 才是解绑），省略是 422，
 * 客户端也照此要求调用方传值。
 */

export interface Highlight extends Anchor {
  id: string
  resource_id: string
  note_id: string | null
  version: number
  created_at: string
  updated_at: string
}
export interface HighlightPage {
  data: Highlight[]
  page: {
    number: number
    size: number
    total_items: number
    total_pages: number
    has_more: boolean
  }
}

function invalid(): never {
  throw new ApiError('INVALID_RESPONSE')
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
function integer(value: unknown, min = 0): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min
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
function context(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return typeof value === 'string' && [...value].length <= MAX_CONTEXT ? value : invalid()
}
function highlightAt(value: unknown, resourceId: string): Highlight {
  const row = object(value)
  const exact = row.exact
  const start = integer(row.start_offset)
  const end = integer(row.end_offset, 1)
  if (
    typeof row.id !== 'string' ||
    !isResourceId(row.id) ||
    row.resource_id !== resourceId ||
    typeof exact !== 'string' ||
    !exact ||
    [...exact].length > MAX_EXACT ||
    end <= start ||
    (row.note_id !== null && (typeof row.note_id !== 'string' || !isResourceId(row.note_id)))
  )
    return invalid()
  return {
    id: row.id,
    resource_id: resourceId,
    exact,
    prefix: context(row.prefix),
    suffix: context(row.suffix),
    start_offset: start,
    end_offset: end,
    note_id: row.note_id,
    version: integer(row.version, 1),
    created_at: instant(row.created_at),
    updated_at: instant(row.updated_at),
  }
}
function path(resourceId: string, highlightId?: string): string {
  if (!isResourceId(resourceId) || (highlightId !== undefined && !isResourceId(highlightId)))
    throw new ApiError('INVALID_REQUEST')
  const base = `/api/v1/resources/${resourceId}/highlights`
  return base + (highlightId ? '/' + highlightId : '')
}

/** 一页高亮，默认按文中顺序（契约 2.3 的默认 `start_offset,id`）。 */
export async function listHighlights(
  resourceId: string,
  number = 1,
  pageSize = 100,
): Promise<HighlightPage> {
  if (!Number.isSafeInteger(number) || number < 1 || pageSize < 1 || pageSize > 100)
    throw new ApiError('INVALID_REQUEST')
  const envelope = object(
    await api.request(path(resourceId) + `?page=${number}&page_size=${pageSize}`),
  )
  const page = object(envelope.page)
  if (!Array.isArray(envelope.data) || typeof page.has_more !== 'boolean' || page.number !== number)
    return invalid()
  const data = envelope.data.map((row) => highlightAt(row, resourceId))
  if (new Set(data.map((row) => row.id)).size !== data.length) return invalid()
  return {
    data,
    page: {
      number,
      size: integer(page.size, 1),
      total_items: integer(page.total_items),
      total_pages: integer(page.total_pages),
      has_more: page.has_more,
    },
  }
}

export async function createHighlight(
  resourceId: string,
  anchor: Anchor,
  noteId: string | null = null,
): Promise<Highlight> {
  if (
    !anchor.exact ||
    [...anchor.exact].length > MAX_EXACT ||
    anchor.end_offset <= anchor.start_offset ||
    anchor.start_offset < 0 ||
    (noteId !== null && !isResourceId(noteId))
  )
    throw new ApiError('INVALID_REQUEST')
  const body: { [key: string]: string | number | null } = {
    exact: anchor.exact,
    prefix: anchor.prefix,
    suffix: anchor.suffix,
    start_offset: anchor.start_offset,
    end_offset: anchor.end_offset,
  }
  if (noteId !== null) body.note_id = noteId
  return highlightAt(
    object(await api.request(path(resourceId), { method: 'POST', body })).data,
    resourceId,
  )
}

/** 配心得或解绑（`noteId` 传 null 即解绑）。锚点不可改，所以只有这一个写法。 */
export async function bindHighlightNote(
  resourceId: string,
  previous: Highlight,
  noteId: string | null,
): Promise<Highlight> {
  if (previous.resource_id !== resourceId || previous.version < 1)
    throw new ApiError('INVALID_REQUEST')
  if (noteId !== null && !isResourceId(noteId)) throw new ApiError('INVALID_REQUEST')
  const updated = highlightAt(
    object(
      await api.request(path(resourceId, previous.id), {
        method: 'PATCH',
        body: { note_id: noteId, expected_version: previous.version },
      }),
    ).data,
    resourceId,
  )
  // 锚点是不可变的：回来的若不是同一段话，说明读到的不是这条高亮。
  if (updated.id !== previous.id || updated.exact !== previous.exact) return invalid()
  return updated
}

export async function deleteHighlight(resourceId: string, previous: Highlight): Promise<void> {
  if (previous.resource_id !== resourceId || previous.version < 1)
    throw new ApiError('INVALID_REQUEST')
  const result = await api.request(path(resourceId, previous.id), {
    method: 'DELETE',
    ifMatchVersion: previous.version,
  })
  if (result !== undefined) return invalid()
}
