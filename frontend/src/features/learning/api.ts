import { api, ApiError } from '../../api/client'
import type { Resource, Status } from '../resources/api'
import {
  id,
  instant,
  integer,
  invalid,
  object,
  progress,
  status,
  string,
  type Progress,
} from './model'

export interface StudyCommand {
  expected_progress_version: number
  started_at: string
  duration_seconds: number
  progress_before: number
  progress_after: number
  status_before: Status
  status_after: Status
  summary: string | null
  questions_next: string | null
}
export interface StudyRecord extends Omit<StudyCommand, 'expected_progress_version'> {
  id: string
  resource_id: string
  created_at: string
}
export interface RecordPage {
  data: StudyRecord[]
  page: {
    number: number
    size: number
    total_items: number
    total_pages: number
    has_more: boolean
  }
}
function text(value: unknown): string | null {
  if (value === null) return null
  const result = string(value)
  return [...result].length <= 5000 ? result : invalid()
}
function record(value: unknown): StudyRecord {
  const row = object(value)
  return {
    id: id(row.id),
    resource_id: id(row.resource_id),
    started_at: instant(row.started_at),
    created_at: instant(row.created_at),
    duration_seconds: integer(row.duration_seconds, 86400),
    progress_before: integer(row.progress_before, 100),
    progress_after: integer(row.progress_after, 100),
    status_before: status(row.status_before),
    status_after: status(row.status_after),
    summary: text(row.summary),
    questions_next: text(row.questions_next),
  }
}
export async function listRecords(query: string, resourceId?: string): Promise<RecordPage> {
  const prefix = resourceId ? '/resources/' + id(resourceId) : ''
  const envelope = object(await api.request('/api/v1' + prefix + '/study-records?' + query))
  const page = object(envelope.page)
  if (!Array.isArray(envelope.data) || typeof page.has_more !== 'boolean') return invalid()
  const data = envelope.data.map(record)
  const size = integer(page.size, 100, 1)
  if (data.length > size || (resourceId && data.some((row) => row.resource_id !== resourceId)))
    return invalid()
  return {
    data,
    page: {
      number: integer(page.number, Number.MAX_SAFE_INTEGER, 1),
      size,
      total_items: integer(page.total_items),
      total_pages: integer(page.total_pages),
      has_more: page.has_more,
    },
  }
}
export function options(resource: Resource): Status[] {
  const current = resource.progress
  const states: Status[] =
    current.status === 'ARCHIVED'
      ? ['ARCHIVED', current.archived_from_status!]
      : current.status === 'UNREAD'
        ? ['UNREAD', 'IN_PROGRESS', 'ARCHIVED']
        : current.status === 'IN_PROGRESS'
          ? ['UNREAD', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED']
          : current.status === 'COMPLETED'
            ? ['IN_PROGRESS', 'COMPLETED', 'ARCHIVED']
            : ['REVIEW_DUE', 'ARCHIVED']
  if (
    resource.review_plan?.status === 'SCHEDULED' &&
    ['IN_PROGRESS', 'COMPLETED'].includes(current.status)
  )
    states.push('REVIEW_DUE')
  if (resource.review_plan?.status === 'PAUSED' && current.status === 'REVIEW_DUE')
    states.push('IN_PROGRESS', 'COMPLETED')
  return states
}
export async function createRecord(resource: Resource, command: StudyCommand): Promise<Progress> {
  id(resource.id)
  if (
    command.expected_progress_version !== resource.progress.version ||
    command.status_before !== resource.progress.status ||
    command.progress_before !== resource.progress.progress_percent
  )
    throw new ApiError('INVALID_REQUEST')
  const envelope = object(
    await api.request('/api/v1/resources/' + resource.id + '/study-records', {
      method: 'POST',
      body: { ...command },
    }),
  )
  const result = object(envelope.data)
  const saved = record(result.record)
  const current = progress(result.progress, resource.id)
  if (
    saved.resource_id !== resource.id ||
    current.status !== command.status_after ||
    current.progress_percent !== command.progress_after ||
    current.version < command.expected_progress_version ||
    saved.status_before !== command.status_before ||
    saved.status_after !== command.status_after ||
    saved.progress_before !== command.progress_before ||
    saved.progress_after !== command.progress_after ||
    saved.duration_seconds !== command.duration_seconds ||
    Date.parse(saved.started_at) !== Date.parse(command.started_at) ||
    saved.summary !== command.summary ||
    saved.questions_next !== command.questions_next
  )
    return invalid()
  return current
}
export function learningError(error: unknown, reading = false): string {
  if (!(error instanceof ApiError)) return '操作未完成，请检查连接后再试。'
  if (reading && (error.code === 'NETWORK_ERROR' || error.status >= 500))
    return '学习历史暂时无法读取，请检查本机后端连接后重试。'
  if (error.status === 404) return '没有找到这份资料，可能已不存在或暂时不可用。'
  if (error.status === 422) return '记录未通过检查，请检查时间、时长、进度及文本长度。'
  if (error.status === 409) return '进度或状态已变化，本次记录未保存。请读取最新进度并重新核对。'
  if (error.code === 'INVALID_RESPONSE')
    return '收到的数据无法确认，请先检查历史记录，避免重复提交。'
  if (error.code === 'NETWORK_ERROR' || error.status >= 500)
    return '保存结果尚未确认。请检查连接并读取最新进度和历史，避免重复记录。'
  return error.message
}
