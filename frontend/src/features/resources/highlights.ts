import { api, ApiError } from '../../api/client'
import { isResourceId } from './api'
import { MAX_CONTEXT, MAX_EXACT, type Anchor } from './highlightAnchor'

/**
 * 高亮接口的受控客户端（TASK-072，契约 4.15 / 10 节）。
 *
 * 五个操作里本页用到四个：列表、新增、改（心得绑定 / 样式 / 颜色）、删除。锚点创建后不可改，
 * 所以这里没有「改锚点」的写法。`PATCH`（TASK-093 起）三个字段任选至少一个、省略的不动：
 * `note_id` 给 `null` 才是解绑；`style`/`color` 不可为 null。
 */

/** 标注的样子（TASK-093 契约 4.15 / TASK-094 工具栏）：样式 × 四色。 */
export const HIGHLIGHT_STYLES = ['mark', 'underline'] as const
export type HighlightStyle = (typeof HIGHLIGHT_STYLES)[number]
export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]
export type HighlightLook = { style: HighlightStyle; color: HighlightColor }
export const DEFAULT_LOOK: HighlightLook = { style: 'mark', color: 'yellow' }
export const COLOR_LABELS: Record<HighlightColor, string> = {
  yellow: '黄',
  green: '绿',
  blue: '蓝',
  pink: '粉',
}
export const STYLE_LABELS: Record<HighlightStyle, string> = { mark: '高亮', underline: '下划线' }
/** 顶栏工具（TASK-094）：荧光笔、下划线各按当前色落标注；橡皮点一下即删。 */
export type AnnotationTool = 'mark' | 'underline' | 'eraser'
/**
 * CSS Custom Highlight API 的注册表名：一种样子一个名字，CSS 里各一条 `::highlight()` 规则。
 * PDF 的另起一套（只给底色/线色、不给字色，见 `styles.css`）。
 */
export function registryName(look: HighlightLook, pdf: boolean): string {
  return `studypilot-${look.style}-${look.color}${pdf ? '-pdf' : ''}`
}
/** `PATCH` 能改的三样；省略的不动。 */
export type HighlightChanges = {
  note_id?: string | null
  style?: HighlightStyle
  color?: HighlightColor
}

export interface Highlight extends Anchor, HighlightLook {
  id: string
  resource_id: string
  /** 锚在哪里（TASK-089）：null = 正文快照；数字 = PDF 原件的第 N 页（1 起），偏移按那一页算。 */
  page_number: number | null
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
    // 契约把 page_number 列为必有字段：缺了就是响应不对，不当成 null 混过去。
    !(
      row.page_number === null ||
      (typeof row.page_number === 'number' &&
        Number.isSafeInteger(row.page_number) &&
        row.page_number >= 1)
    ) ||
    (row.note_id !== null && (typeof row.note_id !== 'string' || !isResourceId(row.note_id))) ||
    // 样子是闭集（TASK-093）：不认识的样式或颜色不是「按默认画」，是响应不对。
    !(HIGHLIGHT_STYLES as readonly unknown[]).includes(row.style) ||
    !(HIGHLIGHT_COLORS as readonly unknown[]).includes(row.color)
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
    page_number: row.page_number,
    style: row.style as HighlightStyle,
    color: row.color as HighlightColor,
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
  /** PDF 上标的高亮要说在第几页（1 起）；正文快照上的不传（TASK-089）。 */
  pageNumber: number | null = null,
  /** 样子（TASK-094）；默认的黄色高亮不发字段——契约默认值就是它，与既有示例一致。 */
  look: HighlightLook = DEFAULT_LOOK,
): Promise<Highlight> {
  if (
    !anchor.exact ||
    [...anchor.exact].length > MAX_EXACT ||
    anchor.end_offset <= anchor.start_offset ||
    anchor.start_offset < 0 ||
    (noteId !== null && !isResourceId(noteId)) ||
    (pageNumber !== null && (!Number.isSafeInteger(pageNumber) || pageNumber < 1))
  )
    throw new ApiError('INVALID_REQUEST')
  const body: { [key: string]: string | number | null } = {
    exact: anchor.exact,
    prefix: anchor.prefix,
    suffix: anchor.suffix,
    start_offset: anchor.start_offset,
    end_offset: anchor.end_offset,
  }
  // 快照上的高亮**不发**这个字段（省略即 null），与契约示例一致；PDF 上的才带。
  if (pageNumber !== null) body.page_number = pageNumber
  if (look.style !== DEFAULT_LOOK.style) body.style = look.style
  if (look.color !== DEFAULT_LOOK.color) body.color = look.color
  if (noteId !== null) body.note_id = noteId
  return highlightAt(
    object(await api.request(path(resourceId), { method: 'POST', body })).data,
    resourceId,
  )
}

/**
 * 改心得绑定、样式或颜色（TASK-093 契约）：只发点名的字段，至少一个；`note_id` 传 null 即解绑。
 * 锚点不可改，所以只有这一个写法。
 */
export async function updateHighlight(
  resourceId: string,
  previous: Highlight,
  changes: HighlightChanges,
): Promise<Highlight> {
  if (previous.resource_id !== resourceId || previous.version < 1)
    throw new ApiError('INVALID_REQUEST')
  const body: { [key: string]: string | number | null } = { expected_version: previous.version }
  if ('note_id' in changes) {
    const noteId = changes.note_id ?? null
    if (noteId !== null && !isResourceId(noteId)) throw new ApiError('INVALID_REQUEST')
    body.note_id = noteId
  }
  if (changes.style !== undefined) {
    if (!HIGHLIGHT_STYLES.includes(changes.style)) throw new ApiError('INVALID_REQUEST')
    body.style = changes.style
  }
  if (changes.color !== undefined) {
    if (!HIGHLIGHT_COLORS.includes(changes.color)) throw new ApiError('INVALID_REQUEST')
    body.color = changes.color
  }
  // 什么都不改的请求服务端会 422；在这里就拦下，省一次往返。
  if (Object.keys(body).length === 1) throw new ApiError('INVALID_REQUEST')
  const updated = highlightAt(
    object(await api.request(path(resourceId, previous.id), { method: 'PATCH', body })).data,
    resourceId,
  )
  // 锚点是不可变的：回来的若不是同一段话，说明读到的不是这条高亮。
  if (updated.id !== previous.id || updated.exact !== previous.exact) return invalid()
  return updated
}

/** 配心得或解绑（`noteId` 传 null 即解绑）：`updateHighlight` 只点名 `note_id` 的写法。 */
export function bindHighlightNote(
  resourceId: string,
  previous: Highlight,
  noteId: string | null,
): Promise<Highlight> {
  return updateHighlight(resourceId, previous, { note_id: noteId })
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
