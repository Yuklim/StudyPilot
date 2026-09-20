import { api, ApiError } from '../../api/client'
import { isResourceId } from './api'

/**
 * 文献信息的受控客户端（TASK-078，接 TASK-074 交付的契约 4.16）。
 *
 * **整份替换，不是逐字段合并。** `PUT` 的语义是「这就是这份文献的全部信息」：省略的字段
 * 等于「这篇东西没有这一项」，会把原先记的值清掉。所以这里只有一个 `putCitation`，参数是
 * 完整的一份，不提供「只改某个字段」的写法——那会让调用方以为漏填是安全的。
 *
 * **清空用 `null`，不用空字符串。** 契约里每个字符串字段都要求去空白后非空，空串是 422。
 * 表单里留白的格子在这里统一折成 `null`，免得「未知」有两种写法，将来搜索和导出对不上。
 */

export const ITEM_TYPES = [
  'JOURNAL_ARTICLE',
  'PREPRINT',
  'CONFERENCE_PAPER',
  'BOOK',
  'BOOK_CHAPTER',
  'THESIS',
  'REPORT',
  'WEBPAGE',
  'OTHER',
] as const
export type ItemType = (typeof ITEM_TYPES)[number]

/** 九种类型的中文名。顺序与 `ITEM_TYPES` 一致，下拉框直接按这个顺序列。 */
export const ITEM_TYPE_LABELS: Readonly<Record<ItemType, string>> = {
  JOURNAL_ARTICLE: '期刊论文',
  PREPRINT: '预印本',
  CONFERENCE_PAPER: '会议论文',
  BOOK: '书',
  BOOK_CHAPTER: '书章节',
  THESIS: '学位论文',
  REPORT: '报告',
  WEBPAGE: '网页',
  OTHER: '其他',
}

// 与后端 modules/citations/contracts.py 的约束一一对应。写在这里是为了让用户在点保存
// 之前就看见「哪一格不合规」——服务端的 422 只回一个 VALIDATION_ERROR，不带字段明细。
export const MAX_AUTHORS = 100
export const MAX_AUTHOR = 200
export const MIN_YEAR = 1000
export const MAX_YEAR = 2200
export const MAX_LOCATOR = 50
export const MAX_STAMP = 32
export const MAX_NAME = 200
export const MAX_CONTAINER = 500
export const MAX_ABSTRACT = 20_000

export interface Citation {
  resource_id: string
  item_type: ItemType
  authors: string[] | null
  issued_year: number | null
  issued_date: string | null
  container_title: string | null
  volume: string | null
  issue: string | null
  pages: string | null
  publisher: string | null
  doi: string | null
  isbn: string | null
  abstract: string | null
  version: number
  created_at: string
  updated_at: string
}

/**
 * 表单能写的部分：`Citation` 去掉服务端维护的那几项。
 *
 * **`isbn` 与 `abstract` 在这一版没有输入框，但它们仍然留在这里**：`PUT` 是整份替换，
 * 读到什么就得写回什么，否则一条带 ISBN 的文献（将来由扩展抓取写入）只要在界面上按一次
 * 保存，ISBN 就被悄悄抹掉了。界面不编辑它们，但不许弄丢它们。
 */
export type CitationDraft = Omit<Citation, 'resource_id' | 'version' | 'created_at' | 'updated_at'>

export const EMPTY_DRAFT: CitationDraft = {
  item_type: 'OTHER',
  authors: null,
  issued_year: null,
  issued_date: null,
  container_title: null,
  volume: null,
  issue: null,
  pages: null,
  publisher: null,
  doi: null,
  isbn: null,
  abstract: null,
}

function invalid(): never {
  throw new ApiError('INVALID_RESPONSE')
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
function instant(value: unknown): string {
  return typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
    ? value
    : invalid()
}
function text(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null
  return typeof value === 'string' && value.length >= 1 && [...value].length <= max
    ? value
    : invalid()
}
function citationAt(value: unknown, resourceId: string): Citation {
  const row = object(value)
  const authors = row.authors
  if (
    row.resource_id !== resourceId ||
    !ITEM_TYPES.includes(row.item_type as ItemType) ||
    (authors !== null &&
      authors !== undefined &&
      (!Array.isArray(authors) ||
        authors.length > MAX_AUTHORS ||
        authors.some((name) => typeof name !== 'string' || !name || [...name].length > MAX_AUTHOR)))
  )
    return invalid()
  const year = row.issued_year
  if (
    year !== null &&
    year !== undefined &&
    (typeof year !== 'number' || !Number.isSafeInteger(year) || year < MIN_YEAR || year > MAX_YEAR)
  )
    return invalid()
  const version = row.version
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) return invalid()
  return {
    resource_id: resourceId,
    item_type: row.item_type as ItemType,
    authors: authors === null || authors === undefined ? null : (authors as string[]),
    issued_year: year === undefined ? null : (year as number | null),
    issued_date: text(row.issued_date, MAX_STAMP),
    container_title: text(row.container_title, MAX_CONTAINER),
    volume: text(row.volume, MAX_LOCATOR),
    issue: text(row.issue, MAX_LOCATOR),
    pages: text(row.pages, MAX_LOCATOR),
    publisher: text(row.publisher, MAX_NAME),
    doi: text(row.doi, MAX_NAME),
    isbn: text(row.isbn, MAX_STAMP),
    abstract: text(row.abstract, MAX_ABSTRACT),
    version,
    created_at: instant(row.created_at),
    updated_at: instant(row.updated_at),
  }
}

function path(resourceId: string): string {
  if (!isResourceId(resourceId)) throw new ApiError('INVALID_REQUEST')
  return `/api/v1/resources/${resourceId}/citation`
}

/** 读这份资料的文献信息；**还没填**时服务端回 404 `CITATION_NOT_FOUND`，这里折成 `null`。 */
export async function getCitation(resourceId: string): Promise<Citation | null> {
  try {
    return citationAt(object(await api.request(path(resourceId))).data, resourceId)
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'CITATION_NOT_FOUND') return null
    throw cause
  }
}

/**
 * 整份写入。`expected_version` 首次写入时不带（还没有东西可替换），已有时必须带，
 * 与快照那边同一条规则（契约 4.16）。
 */
export async function putCitation(
  resourceId: string,
  draft: CitationDraft,
  expectedVersion: number | null,
): Promise<Citation> {
  const problems = draftProblems(draft)
  if (problems.length) throw new ApiError('INVALID_REQUEST')
  if (expectedVersion !== null && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1))
    throw new ApiError('INVALID_REQUEST')
  const body: { [key: string]: string | number | string[] } = { item_type: draft.item_type }
  // 只把有值的字段放进请求体：契约要求清空用「省略」，不是空串。
  for (const [key, value] of Object.entries(draft)) {
    if (key === 'item_type' || value === null) continue
    body[key] = value as string | number | string[]
  }
  if (expectedVersion !== null) body.expected_version = expectedVersion
  return citationAt(
    object(await api.request(path(resourceId), { method: 'PUT', body })).data,
    resourceId,
  )
}

/** 删掉整份文献信息。`If-Match` 由共享客户端按版本写头（契约 4.16 的 428/409）。 */
export async function deleteCitation(resourceId: string, version: number): Promise<void> {
  if (!Number.isSafeInteger(version) || version < 1) throw new ApiError('INVALID_REQUEST')
  const result = await api.request(path(resourceId), { method: 'DELETE', ifMatchVersion: version })
  if (result !== undefined) return invalid()
}

export interface DraftProblem {
  field: keyof CitationDraft | 'authors'
  message: string
}

/**
 * 按契约的边界在本地判一遍，把问题定位到具体字段。
 *
 * 服务端当然也会判，但它只回一个不带明细的 `VALIDATION_ERROR`——那句话没法告诉用户是
 * 年份写错了还是某位作者的名字太长。这里判的是**同一组边界**，不是更松的一组。
 */
export function draftProblems(draft: CitationDraft): DraftProblem[] {
  const problems: DraftProblem[] = []
  if (!ITEM_TYPES.includes(draft.item_type))
    problems.push({ field: 'item_type', message: '请选择一个类型。' })
  const authors = draft.authors
  if (authors !== null) {
    if (authors.length > MAX_AUTHORS)
      problems.push({ field: 'authors', message: `作者最多 ${MAX_AUTHORS} 位。` })
    if (authors.some((name) => !name.trim()))
      problems.push({ field: 'authors', message: '有一行作者是空的，删掉它或填上名字。' })
    if (authors.some((name) => [...name.trim()].length > MAX_AUTHOR))
      problems.push({ field: 'authors', message: `单个作者名最多 ${MAX_AUTHOR} 字。` })
  }
  const year = draft.issued_year
  if (year !== null && (!Number.isSafeInteger(year) || year < MIN_YEAR || year > MAX_YEAR))
    problems.push({ field: 'issued_year', message: `年份要在 ${MIN_YEAR}–${MAX_YEAR} 之间。` })
  const limits: [keyof CitationDraft, number, string][] = [
    ['issued_date', MAX_STAMP, '出版日期'],
    ['container_title', MAX_CONTAINER, '出处'],
    ['volume', MAX_LOCATOR, '卷'],
    ['issue', MAX_LOCATOR, '期'],
    ['pages', MAX_LOCATOR, '页'],
    ['publisher', MAX_NAME, '出版方'],
    ['doi', MAX_NAME, 'DOI'],
    ['isbn', MAX_STAMP, 'ISBN'],
    ['abstract', MAX_ABSTRACT, '摘要'],
  ]
  for (const [field, max, label] of limits) {
    const value = draft[field]
    if (typeof value === 'string' && [...value.trim()].length > max)
      problems.push({ field, message: `${label}最多 ${max} 字。` })
  }
  return problems
}

/** 把表单里的空格子折成 `null`，作者行里的空行丢掉——「未知」只留一种写法。 */
export function normalizeDraft(draft: CitationDraft): CitationDraft {
  const trimmed = (value: string | null) => {
    const text = (value ?? '').trim()
    return text ? text : null
  }
  const authors = (draft.authors ?? []).map((name) => name.trim()).filter(Boolean)
  return {
    item_type: draft.item_type,
    authors: authors.length ? authors : null,
    issued_year: draft.issued_year,
    issued_date: trimmed(draft.issued_date),
    container_title: trimmed(draft.container_title),
    volume: trimmed(draft.volume),
    issue: trimmed(draft.issue),
    pages: trimmed(draft.pages),
    publisher: trimmed(draft.publisher),
    doi: trimmed(draft.doi),
    isbn: trimmed(draft.isbn),
    abstract: trimmed(draft.abstract),
  }
}

/**
 * `https://doi.org/<doi>` 的链接地址。
 *
 * **斜杠必须原样留着**：DOI 形如 `10.1038/s42256-024-00812-x`，前缀与后缀之间的 `/` 是
 * 地址的一部分，`encodeURIComponent` 会把它编成 `%2F`，解析出来就不是同一个 DOI 了。
 * 这里用 `encodeURI`（保留 `/` 与 `:`，转义空格和非 ASCII），再单独处理 `#` 与 `?`——
 * 它们会把后面的内容变成片段或查询串，而 DOI 里确实允许出现这两个字符。
 */
export function doiUrl(doi: string): string {
  const encoded = encodeURI(doi).replace(/#/g, '%23').replace(/\?/g, '%3F')
  return `https://doi.org/${encoded}`
}

/** 已填态里「出处 · 卷(期), 页」那一行；缺哪块就跳过哪块，不留下孤零零的标点。 */
export function containerLine(citation: Citation): string {
  const volumeIssue = citation.volume
    ? citation.issue
      ? `${citation.volume}(${citation.issue})`
      : citation.volume
    : citation.issue
      ? `第 ${citation.issue} 期`
      : ''
  const tail = [volumeIssue, citation.pages].filter(Boolean).join(', ')
  return [citation.container_title, tail].filter(Boolean).join(' · ')
}
