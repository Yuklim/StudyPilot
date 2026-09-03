import { sample } from '../resources/fixtures'
import type { Note, NotePage } from './api'

export function note(overrides: Partial<Note> = {}): Note {
  return {
    id: '018f1f58-4eb2-4a0d-a716-fb81b1960005',
    resource_id: sample().id,
    content: '这是合成心得。',
    version: 1,
    created_at: '2026-09-03T02:00:00Z',
    updated_at: '2026-09-03T02:00:00Z',
    ...overrides,
  }
}
export function notePage(data: Note[] = [], number = 1, total = data.length): NotePage {
  return {
    data,
    page: {
      number,
      size: 20,
      total_items: total,
      total_pages: Math.ceil(total / 20),
      has_more: number * 20 < total,
    },
  }
}
