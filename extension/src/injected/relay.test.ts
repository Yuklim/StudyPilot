// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CAPTURE_PAYLOAD, CAPTURE_READY, PENDING_KEY } from '../shared/protocol'

import { relayHandler } from './relay'

const stored = {
  title: '如何理解数据库索引',
  url: 'https://example.com/db-index',
  markdown: '# 如何理解数据库索引\n\n索引的本质是用空间换时间。\n',
}

function storageWith(value: unknown) {
  return {
    get: vi.fn(async () => (value === undefined ? {} : { [PENDING_KEY]: value })),
    remove: vi.fn(async () => undefined),
  } as unknown as chrome.storage.StorageArea
}

function messageEvent(overrides: Partial<MessageEvent> = {}) {
  return {
    source: window,
    origin: window.location.origin,
    data: { type: CAPTURE_READY },
    ...overrides,
  } as MessageEvent
}

describe('relayHandler', () => {
  let posted: unknown[]
  let targets: unknown[]

  beforeEach(() => {
    posted = []
    targets = []
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown, target?: unknown) => {
      posted.push(message)
      targets.push(target)
    })
  })

  it('hands the stored capture to the page on its ready signal', async () => {
    const storage = storageWith(stored)
    await relayHandler(window, storage)(messageEvent())
    expect(posted).toEqual([{ type: CAPTURE_PAYLOAD, payload: stored }])
    // targetOrigin 是信任边界上的参数：改成 '*' 会把内容广播给任何监听者。
    expect(targets).toEqual([window.location.origin])
    expect(targets).not.toContain('*')
  })

  it('delivers a capture only once', async () => {
    // 交付即删除：页面刷新不该再被预填一次，否则用户会以为又采集了一遍。
    const storage = storageWith(stored)
    await relayHandler(window, storage)(messageEvent())
    expect(storage.remove).toHaveBeenCalledWith(PENDING_KEY)
  })

  it.each([
    ['来自别的窗口（跨源 opener/iframe）', { source: {} as Window }],
    ['来自别的源', { origin: 'https://evil.example' }],
    ['消息类型不对', { data: { type: 'something-else' } }],
    ['根本没有 type', { data: {} }],
    ['data 是 null', { data: null }],
  ])('ignores a message %s', async (_label, overrides) => {
    const storage = storageWith(stored)
    await relayHandler(window, storage)(messageEvent(overrides))
    expect(posted).toEqual([])
    expect(storage.get).not.toHaveBeenCalled()
  })

  it.each([
    ['什么都没存', undefined],
    ['结构不对', { title: '标题' }],
    ['正文是空的', { ...stored, markdown: '   ' }],
    ['网址不是 http(s)', { ...stored, url: 'javascript:alert(1)' }],
  ])('posts nothing when the stash holds %s', async (_label, value) => {
    await relayHandler(window, storageWith(value))(messageEvent())
    expect(posted).toEqual([])
  })
})
