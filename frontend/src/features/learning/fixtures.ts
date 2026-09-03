// Synthetic test data only.
import { resourceId, sample } from '../resources/fixtures'
import type { Resource } from '../resources/api'
import type { RecordPage, StudyCommand, StudyRecord } from './api'

export const recordId = '00000000-0000-4000-8000-000000000016'
export function command(resource = sample()): StudyCommand {
  return {
    expected_progress_version: resource.progress.version,
    started_at: '2026-09-03T01:00:00Z',
    duration_seconds: 1200,
    status_before: resource.progress.status,
    status_after: 'IN_PROGRESS',
    progress_before: resource.progress.progress_percent,
    progress_after: 30,
    summary: '合成总结 <script>不执行</script>',
    questions_next: '合成疑问',
  }
}
export function result(value = command(), resource: Resource = sample()) {
  const { expected_progress_version, ...fields } = value
  const record: StudyRecord = {
    ...fields,
    id: recordId,
    resource_id: resource.id,
    created_at: '2026-09-03T02:00:00Z',
  }
  return {
    data: {
      record,
      progress: {
        ...resource.progress,
        status: value.status_after,
        progress_percent: value.progress_after,
        version: expected_progress_version + 1,
        started_at: value.started_at,
        completed_at: value.status_after === 'COMPLETED' ? '2026-09-03T02:00:00Z' : null,
        archived_from_status: value.status_after === 'ARCHIVED' ? value.status_before : null,
      },
    },
  }
}
export function records(
  items = [result().data.record],
  page: Partial<RecordPage['page']> = {},
): RecordPage {
  return {
    data: items.map((row) => ({ ...row, resource_id: row.resource_id || resourceId })),
    page: {
      number: 1,
      size: 20,
      total_items: items.length,
      total_pages: items.length ? 1 : 0,
      has_more: false,
      ...page,
    },
  }
}
