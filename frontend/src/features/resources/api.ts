import {
  api,
  ApiError,
  fileMediaTypes,
  MAX_FILE_BYTES,
  type DeletionImpact,
} from '../../api/client'
import { getClassification } from '../taxonomy/api'
import { fileIssue, type OriginalFile } from './files'
import {
  progress as parseProgress,
  reviewPlan,
  validateProgressPlan,
  type Progress,
  type ReviewPlan,
} from '../learning/model'

export const sourceLabels = { WEB: '网页', PASTE: '粘贴内容', FILE: '文件' } as const
export const statusLabels = {
  UNREAD: '未开始',
  IN_PROGRESS: '学习中',
  COMPLETED: '已完成',
  REVIEW_DUE: '待复习',
  ARCHIVED: '已归档',
} as const
export type Source = keyof typeof sourceLabels
export type Status = keyof typeof statusLabels
export interface Resource {
  id: string
  version: number
  title: string | null
  source_type: Source
  source_name: string | null
  save_reason: string | null
  created_at: string
  updated_at: string
  progress: Progress
  review_plan: ReviewPlan | null
  tags: { id: string; name: string }[]
  topic_id: string | null
  topic_name?: string
  source_url?: string
  pasted_content?: string
  original_file: OriginalFile | null
}
export interface ResourcePage {
  data: Resource[]
  page: {
    number: number
    size: number
    total_items: number
    total_pages: number
    has_more: boolean
  }
}
type ResourceMetadata = {
  title?: string
  source_name?: string
  save_reason?: string
  topic_id?: string
  tag_ids?: string[]
}
export type CreateResource = ResourceMetadata &
  ({ source_type: 'WEB'; source_url: string } | { source_type: 'PASTE'; pasted_content: string })

export type ResourceChanges = Partial<{
  title: string | null
  source_name: string | null
  save_reason: string | null
  topic_id: string | null
  source_url: string
  pasted_content: string
  // Whole replacement set: omitted leaves tags alone, [] clears them, null is rejected.
  tag_ids: string[]
}>

export interface DeletionPreview {
  resource_id: string
  resource_version: number
  impact_revision: string
  expires_at: string
  confirmation_token: string
  impact: DeletionImpact
}

function invalid(): never {
  throw new ApiError('INVALID_RESPONSE')
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
function string(value: unknown): string {
  if (typeof value !== 'string') return invalid()
  return value
}
function nullableString(value: unknown): string | null {
  return value === null ? null : string(value)
}
function integer(value: unknown, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) return invalid()
  return value
}
export function isResourceId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
function id(value: unknown): string {
  const result = string(value)
  if (!isResourceId(result)) return invalid()
  return result
}
function instant(value: unknown): string {
  const result = string(value)
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result))) return invalid()
  return result
}

function deletionImpact(value: unknown): DeletionImpact {
  const row = object(value)
  const keys = [
    'original_file_count',
    'note_count',
    'study_record_count',
    'active_review_plan_count',
    'review_record_count',
    'resource_tag_count',
  ] as const
  const result = {} as DeletionImpact
  for (const key of keys) {
    const count = row[key]
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return invalid()
    result[key] = count
  }
  if (result.original_file_count > 1 || result.active_review_plan_count > 1) return invalid()
  return result
}

function deletionPreview(value: unknown, resourceId: string): DeletionPreview {
  const row = object(value)
  if (
    id(row.resource_id) !== resourceId ||
    typeof row.resource_version !== 'number' ||
    !Number.isSafeInteger(row.resource_version) ||
    row.resource_version < 1 ||
    typeof row.impact_revision !== 'string' ||
    !/^[a-f0-9]{64}$/.test(row.impact_revision) ||
    typeof row.confirmation_token !== 'string' ||
    !/^[A-Za-z0-9_-]{43,256}$/.test(row.confirmation_token)
  )
    return invalid()
  return {
    resource_id: resourceId,
    resource_version: row.resource_version,
    impact_revision: row.impact_revision,
    expires_at: instant(row.expires_at),
    confirmation_token: row.confirmation_token,
    impact: deletionImpact(row.impact),
  }
}

// Validate only fields consumed by these pages, not the entire future API schema.
function resource(value: unknown, detail: boolean): Resource {
  const item = object(value)
  const source = string(item.source_type)
  const progress = object(item.progress)
  const status = string(progress.status)
  if (!Object.hasOwn(sourceLabels, source) || !Object.hasOwn(statusLabels, status)) return invalid()
  const percent = integer(progress.progress_percent)
  if (percent > 100 || !Array.isArray(item.tags)) return invalid()
  const file = item.original_file === null ? null : object(item.original_file)
  if ((source === 'FILE') !== (file !== null)) return invalid()
  if (
    file &&
    (file.status !== 'READY' ||
      integer(file.size_bytes, 1) > MAX_FILE_BYTES ||
      !fileMediaTypes.includes(string(file.media_type)))
  )
    return invalid()
  const result: Resource = {
    id: id(item.id),
    version: integer(item.version, 1),
    title: nullableString(item.title),
    source_type: source as Source,
    source_name: nullableString(item.source_name),
    save_reason: nullableString(item.save_reason),
    created_at: instant(item.created_at),
    updated_at: instant(item.updated_at),
    progress: parseProgress(item.progress, id(item.id)),
    review_plan: reviewPlan(item.review_plan),
    tags: item.tags.map((tag) => {
      const row = object(tag)
      return { id: id(row.id), name: string(row.name) }
    }),
    topic_id: item.topic_id === null ? null : id(item.topic_id),
    original_file:
      file === null
        ? null
        : {
            id: id(file.id),
            status: 'READY',
            original_name: string(file.original_name),
            size_bytes: integer(file.size_bytes),
            media_type: string(file.media_type),
          },
  }
  validateProgressPlan(result.progress, result.review_plan)
  if (detail && source === 'WEB') result.source_url = string(item.source_url)
  if (detail && source === 'PASTE') result.pasted_content = string(item.pasted_content)
  return result
}

// The approved resource projection contains topic_id, not a joined topic name.
// Resolve each distinct topic once per read; a failed label lookup must not hide the resource.
async function withTopics(items: Resource[]): Promise<Resource[]> {
  const ids = [...new Set(items.flatMap((item) => (item.topic_id ? [item.topic_id] : [])))]
  const names = new Map(
    await Promise.all(
      ids.map(async (topicId) => {
        try {
          return [topicId, (await getClassification('topics', topicId)).name] as const
        } catch {
          return [topicId, undefined] as const
        }
      }),
    ),
  )
  return items.map((item) => ({
    ...item,
    topic_name: item.topic_id ? names.get(item.topic_id) : undefined,
  }))
}

export async function listResources(query: string): Promise<ResourcePage> {
  const envelope = object(await api.request(`/api/v1/resources?${query}`))
  if (!Array.isArray(envelope.data)) return invalid()
  const page = object(envelope.page)
  if (typeof page.has_more !== 'boolean') return invalid()
  return {
    data: await withTopics(envelope.data.map((row) => resource(row, false))),
    page: {
      number: integer(page.number, 1),
      size: integer(page.size, 1),
      total_items: integer(page.total_items),
      total_pages: integer(page.total_pages),
      has_more: page.has_more,
    },
  }
}
export async function getResource(resourceId: string): Promise<Resource> {
  if (!isResourceId(resourceId)) throw new ApiError('REQUEST_FAILED', 404)
  const envelope = object(await api.request(`/api/v1/resources/${resourceId}`))
  const result = resource(envelope.data, true)
  if (result.id !== resourceId) return invalid()
  return (await withTopics([result]))[0]
}
export async function createResource(body: CreateResource): Promise<Resource> {
  const envelope = object(await api.request('/api/v1/resources', { method: 'POST', body }))
  return resource(envelope.data, true)
}

export async function updateResource(
  original: Resource,
  changes: ResourceChanges,
  expectedVersion: number,
): Promise<Resource> {
  if (
    !isResourceId(original.id) ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1 ||
    !Object.keys(changes).length
  )
    throw new ApiError('INVALID_REQUEST')
  const envelope = object(
    await api.request(`/api/v1/resources/${original.id}`, {
      method: 'PATCH',
      body: { ...changes, expected_version: expectedVersion },
    }),
  )
  const saved = resource(envelope.data, true)
  if (
    saved.id !== original.id ||
    saved.source_type !== original.source_type ||
    saved.version < expectedVersion
  )
    return invalid()
  return saved
}

export async function previewResourceDeletion(resourceId: string): Promise<DeletionPreview> {
  if (!isResourceId(resourceId)) throw new ApiError('INVALID_REQUEST')
  const envelope = object(
    await api.request(`/api/v1/resources/${resourceId}/deletion-preview`, { method: 'POST' }),
  )
  return deletionPreview(envelope.data, resourceId)
}

export async function deleteResource(resourceId: string, confirmationToken: string): Promise<void> {
  if (!isResourceId(resourceId) || !/^[A-Za-z0-9_-]{43,256}$/.test(confirmationToken))
    throw new ApiError('INVALID_REQUEST')
  const result = await api.request(`/api/v1/resources/${resourceId}`, {
    method: 'DELETE',
    deletionToken: confirmationToken,
  })
  if (result !== undefined) throw new ApiError('INVALID_RESPONSE')
}

export async function createFileResource(
  metadata: ResourceMetadata,
  file: File,
): Promise<Resource> {
  if (fileIssue(file)) throw new ApiError('INVALID_REQUEST')
  const form = new FormData()
  form.append('source_type', 'FILE')
  const title = metadata.title?.trim()
  if (title) form.append('title', title)
  for (const key of ['source_name', 'save_reason', 'topic_id'] as const)
    if (metadata[key] !== undefined) form.append(key, metadata[key])
  for (const tag of metadata.tag_ids ?? []) form.append('tag_ids', tag)
  form.append('file', file)
  const envelope = object(await api.uploadResource(form))
  const result = resource(envelope.data, true)
  if (result.source_type !== 'FILE') return invalid()
  return result
}

export function safeWebUrl(value: string): string | null {
  if (
    !/^https?:\/\//i.test(value) ||
    /[\s\\#]/u.test(value) ||
    [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    return null
  try {
    const url = new URL(value)
    return url.hostname && !url.username && !url.password ? value : null
  } catch {
    return null
  }
}
export function failureText(error: unknown): string {
  if (!(error instanceof ApiError)) return '暂时无法完成请求，请稍后重试。'
  if (error.code.startsWith('FILE_') || error.code === 'STORAGE_PATH_UNAVAILABLE')
    return error.message
  if (error.code === 'TOPIC_NOT_FOUND' || error.code === 'TAG_NOT_FOUND') return error.message
  if (error.code === 'DELETION_IMPACT_CHANGED') return '删除影响已经变化，请重新预览并确认。'
  if (error.code === 'DELETION_TOKEN_REPLAYED') return '这次删除确认已经使用，请重新预览。'
  if (error.code === 'DELETION_TOKEN_EXPIRED') return '删除确认已过期，请重新预览。'
  if (error.code === 'DELETION_TOKEN_REQUIRED' || error.code === 'DELETION_TOKEN_INVALID')
    return '删除确认已失效，请重新预览。'
  if (error.status === 404) return '没有找到这份资料。它可能已不存在，或地址有误。'
  if (error.status === 422) return '资料内容未通过检查，请检查输入的格式和长度。'
  if (error.code === 'INVALID_RESPONSE') return '收到的数据格式不正确，暂时无法显示。'
  if (error.code === 'NETWORK_ERROR') return '连接失败。请确认本机后端已启动，再重试。'
  if (error.status === 500) return '本机服务暂时不可用。请确认已按启动说明创建数据库。'
  return error.message
}
export function displayTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
