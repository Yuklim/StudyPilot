// Synthetic data for tests only; never imported by the running application.
import type { Resource, ResourcePage } from './api'

export const resourceId = '00000000-0000-4000-8000-000000000001'
export const fileId = '00000000-0000-4000-8000-000000000002'
export function sampleFile(overrides: Partial<Resource> = {}): Resource {
  return sample({
    source_type: 'FILE',
    original_file: {
      id: fileId,
      status: 'READY',
      original_name: '合成原件.txt',
      size_bytes: 8,
      media_type: 'text/plain; charset=utf-8',
    },
    ...overrides,
  })
}
export function sample(overrides: Partial<Resource> = {}): Resource {
  return {
    id: resourceId,
    title: '合成阅读资料',
    source_type: 'WEB',
    source_name: '示例书屋',
    save_reason: '慢慢理解',
    created_at: '2026-09-03T00:00:00Z',
    updated_at: '2026-09-03T00:00:00Z',
    progress: {
      resource_id: overrides.id ?? resourceId,
      status: 'UNREAD',
      progress_percent: 0,
      version: 1,
      started_at: null,
      completed_at: null,
      archived_from_status: null,
      updated_at: '2026-09-03T00:00:00Z',
    },
    review_plan: null,
    tags: [],
    topic_id: null,
    original_file: null,
    source_url: 'https://example.com/article',
    ...overrides,
  }
}
export function samplePage(
  items = [sample()],
  page: Partial<ResourcePage['page']> = {},
): ResourcePage {
  return {
    data: items,
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
