import { api, ApiError } from '../../api/client'

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
  title: string
  source_type: Source
  source_name: string | null
  save_reason: string | null
  created_at: string
  updated_at: string
  progress: { status: Status; progress_percent: number }
  tags: { id: string; name: string }[]
  source_url?: string
  pasted_content?: string
  original_file: { original_name: string; size_bytes: number; media_type: string } | null
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
export type CreateResource = {
  title: string
  source_name?: string
  save_reason?: string
} & ({ source_type: 'WEB'; source_url: string } | { source_type: 'PASTE'; pasted_content: string })

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
  const result: Resource = {
    id: id(item.id),
    title: string(item.title),
    source_type: source as Source,
    source_name: nullableString(item.source_name),
    save_reason: nullableString(item.save_reason),
    created_at: instant(item.created_at),
    updated_at: instant(item.updated_at),
    progress: { status: status as Status, progress_percent: percent },
    tags: item.tags.map((tag) => {
      const row = object(tag)
      return { id: id(row.id), name: string(row.name) }
    }),
    original_file:
      file === null
        ? null
        : {
            original_name: string(file.original_name),
            size_bytes: integer(file.size_bytes),
            media_type: string(file.media_type),
          },
  }
  if (detail && source === 'WEB') result.source_url = string(item.source_url)
  if (detail && source === 'PASTE') result.pasted_content = string(item.pasted_content)
  return result
}

export async function listResources(query: string): Promise<ResourcePage> {
  const envelope = object(await api.request(`/api/v1/resources?${query}`))
  if (!Array.isArray(envelope.data)) return invalid()
  const page = object(envelope.page)
  if (typeof page.has_more !== 'boolean') return invalid()
  return {
    data: envelope.data.map((row) => resource(row, false)),
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
  return result
}
export async function createResource(body: CreateResource): Promise<Resource> {
  const envelope = object(await api.request('/api/v1/resources', { method: 'POST', body }))
  return resource(envelope.data, true)
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
