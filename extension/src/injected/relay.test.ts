// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CAPTURE_IMAGE_REQUEST,
  CAPTURE_IMAGE_RESULT,
  CAPTURE_PAYLOAD,
  CAPTURE_READY,
  PENDING_KEY,
} from '../shared/protocol'

import { relayHandler } from './relay'

const stored = {
  title: '如何理解数据库索引',
  url: 'https://example.com/db-index',
  markdown: '# 如何理解数据库索引\n\n索引的本质是用空间换时间。\n',
  images: ['https://cdn.example.com/a.png'],
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

describe('relayHandler image requests', () => {
  let posted: unknown[]

  beforeEach(() => {
    posted = []
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      posted.push(message)
    })
  })

  function handlerWith(
    ask = vi.fn(async () => ({ ok: true, base64: 'AAA', mediaType: 'image/png' })),
  ) {
    return { handle: relayHandler(window, storageWith(stored), ask), ask }
  }

  async function ready(handle: (event: MessageEvent) => Promise<void>) {
    await handle(messageEvent())
  }

  it('serves only the addresses this capture actually offered', async () => {
    // 这条是这段新链路的信任边界：中转脚本跑在本机 UI 源上，而该源上的任何脚本
    // 都能向本窗口 postMessage。不限定范围，扩展就成了一个绕过 CORS 的通用代理。
    const { handle, ask } = handlerWith()
    await ready(handle)
    posted.length = 0

    await handle(
      messageEvent({
        data: { type: CAPTURE_IMAGE_REQUEST, url: 'https://evil.test/secret' },
      } as Partial<MessageEvent>),
    )
    expect(ask).not.toHaveBeenCalled()
    expect(posted).toEqual([
      {
        type: CAPTURE_IMAGE_RESULT,
        url: 'https://evil.test/secret',
        result: { ok: false, reason: 'not-offered' },
      },
    ])
  })

  it('asks the worker for an offered address and hands the result back', async () => {
    const { handle, ask } = handlerWith()
    await ready(handle)
    posted.length = 0

    await handle(
      messageEvent({
        data: { type: CAPTURE_IMAGE_REQUEST, url: 'https://cdn.example.com/a.png' },
      } as Partial<MessageEvent>),
    )
    expect(ask).toHaveBeenCalledWith('https://cdn.example.com/a.png')
    expect(posted).toEqual([
      {
        type: CAPTURE_IMAGE_RESULT,
        url: 'https://cdn.example.com/a.png',
        result: { ok: true, base64: 'AAA', mediaType: 'image/png' },
      },
    ])
  })

  it('answers even when the worker is gone, so the page never waits forever', async () => {
    const ask = vi.fn(async () => {
      throw new Error('service worker asleep')
    })
    const handle = relayHandler(window, storageWith(stored), ask)
    await ready(handle)
    posted.length = 0

    await handle(
      messageEvent({
        data: { type: CAPTURE_IMAGE_REQUEST, url: 'https://cdn.example.com/a.png' },
      } as Partial<MessageEvent>),
    )
    expect(posted).toEqual([
      {
        type: CAPTURE_IMAGE_RESULT,
        url: 'https://cdn.example.com/a.png',
        result: { ok: false, reason: 'no-worker' },
      },
    ])
  })

  it('refuses image requests that arrive before any capture was delivered', async () => {
    // 没交付过就没有允许清单，一律不服务。
    const { handle, ask } = handlerWith()
    await handle(
      messageEvent({
        data: { type: CAPTURE_IMAGE_REQUEST, url: 'https://cdn.example.com/a.png' },
      } as Partial<MessageEvent>),
    )
    expect(ask).not.toHaveBeenCalled()
    expect(posted).toEqual([
      {
        type: CAPTURE_IMAGE_RESULT,
        url: 'https://cdn.example.com/a.png',
        result: { ok: false, reason: 'not-offered' },
      },
    ])
  })

  it('ignores image requests from another window or origin', async () => {
    const { handle, ask } = handlerWith()
    await ready(handle)
    posted.length = 0
    await handle(
      messageEvent({
        source: {} as Window,
        data: { type: CAPTURE_IMAGE_REQUEST, url: 'https://cdn.example.com/a.png' },
      } as Partial<MessageEvent>),
    )
    await handle(
      messageEvent({
        origin: 'https://evil.test',
        data: { type: CAPTURE_IMAGE_REQUEST, url: 'https://cdn.example.com/a.png' },
      } as Partial<MessageEvent>),
    )
    expect(ask).not.toHaveBeenCalled()
    expect(posted).toEqual([])
  })
})
