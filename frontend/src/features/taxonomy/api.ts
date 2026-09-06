import { api, ApiError } from '../../api/client'
import { isResourceId } from '../resources/api'

export type Kind = 'topics' | 'tags'
export const labels = { topics: '主题', tags: '标签' } as const
export interface Choice {
  id: string
  name: string
}
export interface Classification extends Choice {
  version: number
  description?: string | null
  created_at: string
  updated_at: string
  // How many resources use this classification. Read-only, taxonomy endpoints only:
  // the tags embedded in resource responses deliberately do not carry it.
  resource_count: number
}
export interface ClassificationPage {
  data: Classification[]
  page: { number: number; total_pages: number; total_items: number; has_more: boolean }
}
function invalid(): never {
  throw new ApiError('INVALID_RESPONSE')
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
function integer(value: unknown, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) return invalid()
  return value
}
function instant(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    return invalid()
  return value
}
function classification(value: unknown, kind: Kind): Classification {
  const item = object(value)
  if (
    typeof item.id !== 'string' ||
    !isResourceId(item.id) ||
    typeof item.name !== 'string' ||
    !item.name.trim() ||
    Array.from(item.name).length > (kind === 'topics' ? 80 : 50)
  )
    return invalid()
  if (
    kind === 'topics' &&
    item.description !== null &&
    (typeof item.description !== 'string' || Array.from(item.description).length > 500)
  )
    return invalid()
  return {
    id: item.id,
    name: item.name,
    version: integer(item.version, 1),
    created_at: instant(item.created_at),
    updated_at: instant(item.updated_at),
    resource_count: integer(item.resource_count),
    ...(kind === 'topics' ? { description: item.description as string | null } : {}),
  }
}
function target(kind: Kind, id: string): string {
  if (!isResourceId(id)) throw new ApiError('INVALID_REQUEST')
  return `/api/v1/${kind}/${id}`
}
export async function listClassifications(kind: Kind, query: string): Promise<ClassificationPage> {
  const envelope = object(await api.request(`/api/v1/${kind}?${query}`))
  if (!Array.isArray(envelope.data)) return invalid()
  const page = object(envelope.page)
  if (typeof page.has_more !== 'boolean') return invalid()
  return {
    data: envelope.data.map((item) => classification(item, kind)),
    page: {
      number: integer(page.number, 1),
      total_pages: integer(page.total_pages),
      total_items: integer(page.total_items),
      has_more: page.has_more,
    },
  }
}
export async function getClassification(kind: Kind, id: string): Promise<Classification> {
  const data = classification(object(await api.request(target(kind, id))).data, kind)
  if (data.id !== id) return invalid()
  return data
}
export async function saveClassification(
  kind: Kind,
  name: string,
  description: string,
  previous?: Classification,
): Promise<Classification> {
  const data = classification(
    object(
      await api.request(previous ? target(kind, previous.id) : `/api/v1/${kind}`, {
        method: previous ? 'PATCH' : 'POST',
        body: {
          name: name.trim(),
          ...(kind === 'topics' ? { description: description || null } : {}),
          ...(previous ? { expected_version: previous.version } : {}),
        },
      }),
    ).data,
    kind,
  )
  if (previous && data.id !== previous.id) return invalid()
  return data
}
export async function deleteClassification(kind: Kind, item: Classification): Promise<void> {
  const result = await api.request(target(kind, item.id), {
    method: 'DELETE',
    ifMatchVersion: item.version,
  })
  if (result !== undefined) return invalid()
}
export async function changeResourceTag(
  resourceId: string,
  tagId: string,
  attach: boolean,
): Promise<void> {
  if (!isResourceId(resourceId) || !isResourceId(tagId)) throw new ApiError('INVALID_REQUEST')
  const result = await api.request(`/api/v1/resources/${resourceId}/tags/${tagId}`, {
    method: attach ? 'PUT' : 'DELETE',
  })
  if (!attach) {
    if (result !== undefined) return invalid()
    return
  }
  const data = object(object(result).data)
  if (data.resource_id !== resourceId || data.tag_id !== tagId || data.association_version !== 1)
    return invalid()
  instant(data.created_at)
}
export function classificationError(error: unknown): string {
  if (!(error instanceof ApiError)) return '暂时无法完成操作，请稍后重试。'
  if (error.code === 'TAXONOMY_IN_USE' && error.details.resource_count !== undefined)
    return `仍有 ${error.details.resource_count} 份资料使用这个分类，不能删除；资料不会被连带删除。`
  return error.message
}
