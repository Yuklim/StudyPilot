import type { Resource } from './api'

/** UI-only placeholder for a resource stored with a NULL title; never persisted. */
export const UNTITLED_RESOURCE = '未命名资料'

/** Title for display: trimmed title, or the untitled placeholder when blank/null. */
export function resourceTitle(resource: Pick<Resource, 'title'>): string {
  return resource.title?.trim() || UNTITLED_RESOURCE
}
