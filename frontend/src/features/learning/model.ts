import { ApiError } from '../../api/client'
import type { Status } from '../resources/api'

export interface Progress {
  resource_id: string
  status: Status
  progress_percent: number
  version: number
  started_at: string | null
  completed_at: string | null
  archived_from_status: Exclude<Status, 'ARCHIVED'> | null
  updated_at: string
}
export interface ReviewPlan {
  status: 'SCHEDULED' | 'PAUSED'
  due_date: string | null
}
export const statuses: Status[] = ['UNREAD', 'IN_PROGRESS', 'COMPLETED', 'REVIEW_DUE', 'ARCHIVED']
export function invalid(): never {
  throw new ApiError('INVALID_RESPONSE')
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
export function string(value: unknown): string {
  return typeof value === 'string' ? value : invalid()
}
export function integer(value: unknown, max = Number.MAX_SAFE_INTEGER, min = 0): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : invalid()
}
export function id(value: unknown): string {
  const result = string(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result)
    ? result
    : invalid()
}
export function instant(value: unknown): string {
  const result = string(value)
  return /^\d{4}-\d\d-\d\d[Tt]\d\d:\d\d:\d\d(?:\.\d+)?(?:[Zz]|[+-]\d\d:\d\d)$/.test(result) &&
    Number.isFinite(Date.parse(result))
    ? result
    : invalid()
}
export function status(value: unknown): Status {
  return statuses.includes(value as Status) ? (value as Status) : invalid()
}
export function progress(value: unknown, resourceId: string): Progress {
  const row = object(value)
  const state = status(row.status)
  const archived = row.archived_from_status === null ? null : status(row.archived_from_status)
  if (
    row.resource_id !== resourceId ||
    (state === 'ARCHIVED') !== (archived !== null) ||
    archived === 'ARCHIVED'
  )
    return invalid()
  const result: Progress = {
    resource_id: id(row.resource_id),
    status: state,
    progress_percent: integer(row.progress_percent, 100),
    version: integer(row.version, Number.MAX_SAFE_INTEGER, 1),
    archived_from_status: archived,
    started_at: row.started_at === null ? null : instant(row.started_at),
    completed_at: row.completed_at === null ? null : instant(row.completed_at),
    updated_at: instant(row.updated_at),
  }
  if (
    (state === 'UNREAD' && result.progress_percent !== 0) ||
    (state === 'COMPLETED' && !result.completed_at)
  )
    return invalid()
  return result
}
export function reviewPlan(value: unknown): ReviewPlan | null {
  if (value === null) return null
  const row = object(value)
  if (row.status === 'PAUSED' && row.due_date === null) return { status: 'PAUSED', due_date: null }
  if (
    row.status !== 'SCHEDULED' ||
    typeof row.due_date !== 'string' ||
    !/^\d{4}-\d\d-\d\d$/.test(row.due_date)
  )
    return invalid()
  return { status: 'SCHEDULED', due_date: row.due_date }
}

// datetime-local is in the browser's local timezone; reject normalized/gap dates.
export function localTime(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    'T' +
    pad(date.getHours()) +
    ':' +
    pad(date.getMinutes()) +
    ':' +
    pad(date.getSeconds())
  )
}
export function toInstant(value: string): string | null {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(value)) return null
  const date = new Date(value)
  const full = value.length === 16 ? value + ':00' : value
  return Number.isFinite(date.getTime()) && localTime(date) === full ? date.toISOString() : null
}
