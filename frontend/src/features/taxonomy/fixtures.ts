// Synthetic fixtures, never imported by production components.
import type { Classification, ClassificationPage } from './api'
export const topicId = '00000000-0000-4000-8000-000000000010'
export const tagId = '00000000-0000-4000-8000-000000000020'
export function category(overrides: Partial<Classification> = {}): Classification {
  return {
    id: topicId,
    name: '合成主题',
    description: null,
    version: 1,
    created_at: '2026-09-03T00:00:00Z',
    updated_at: '2026-09-03T00:00:00Z',
    ...overrides,
  }
}
export function categoryPage(
  data = [category()],
  page: Partial<ClassificationPage['page']> = {},
): ClassificationPage {
  return {
    data,
    page: {
      number: 1,
      total_pages: data.length ? 1 : 0,
      total_items: data.length,
      has_more: false,
      ...page,
    },
  }
}
