import { describe, expect, it, vi } from 'vitest'

import { FETCH_IMAGE, MAX_IMAGE_BYTES } from '../shared/protocol'

import { fetchImage, imageHandler, toBase64, type FetchImageResult } from './worker'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

function respondWith(body: Uint8Array, init: ResponseInit & { url?: string } = {}) {
  const response = new Response(body as unknown as BodyInit, init)
  Object.defineProperty(response, 'url', { value: init.url ?? 'https://cdn.example.com/a.png' })
  return response
}

describe('fetchImage', () => {
  it('never carries site credentials, and follows redirects', async () => {
    // 不带凭证是「StudyPilot 永不接触站点登录态」这条承诺在取图路径上的落点。
    const fetcher = vi.fn(async () => respondWith(PNG))
    const result = await fetchImage('https://cdn.example.com/a.png', {
      fetch: fetcher as unknown as typeof fetch,
    })
    expect(result).toEqual({ ok: true, base64: toBase64(PNG), mediaType: '' })
    expect(fetcher).toHaveBeenCalledWith(
      'https://cdn.example.com/a.png',
      expect.objectContaining({ credentials: 'omit', redirect: 'follow' }),
    )
  })

  it('re-checks the address it actually landed on, not just the one it was given', async () => {
    // 图床普遍用重定向，所以不能禁掉；但只校验初始地址等于没校验。
    const fetcher = vi.fn(async () =>
      respondWith(PNG, { url: 'file:///etc/passwd' as unknown as string }),
    )
    await expect(
      fetchImage('https://cdn.example.com/a.png', { fetch: fetcher as unknown as typeof fetch }),
    ).resolves.toEqual({ ok: false, reason: 'unsafe-url' })
  })

  it.each([
    ['data: 地址', 'data:image/png;base64,AAAA'],
    ['file: 地址', 'file:///etc/passwd'],
    ['相对地址', '/img/a.png'],
    ['带凭据的地址', 'https://u:p@cdn.example.com/a.png'],
  ])('refuses %s without making any request', async (_label, url) => {
    const fetcher = vi.fn()
    await expect(fetchImage(url, { fetch: fetcher as unknown as typeof fetch })).resolves.toEqual({
      ok: false,
      reason: 'unsafe-url',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('stops reading a body that grows past the ceiling instead of buffering it', async () => {
    // 要害在「读到一半就停」：先读完再判断的话，一张恶意巨图在判断发生之前
    // 就已经把内存吃光了。用一个无限流来证明它确实中途停下 —— 若实现改成
    // 先 arrayBuffer() 再判断，这条会挂起而不是通过。
    let produced = 0
    const chunk = new Uint8Array(1024 * 1024)
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        produced += chunk.length
        controller.enqueue(chunk)
      },
    })
    const response = new Response(body)
    Object.defineProperty(response, 'url', { value: 'https://cdn.example.com/big.png' })
    await expect(
      fetchImage('https://cdn.example.com/big.png', { fetch: async () => response }),
    ).resolves.toEqual({ ok: false, reason: 'too-large' })
    expect(produced).toBeLessThan(MAX_IMAGE_BYTES * 2)
  })

  it('trusts a declared content-length only to refuse early, never to accept', async () => {
    const oversize = respondWith(PNG, {
      headers: { 'content-length': String(MAX_IMAGE_BYTES + 1) },
    })
    await expect(
      fetchImage('https://cdn.example.com/a.png', { fetch: async () => oversize }),
    ).resolves.toEqual({ ok: false, reason: 'too-large' })

    // 声明撒谎说很小，实际很大 —— 仍然被逐块计数拦下。
    const lying = new Response(new Uint8Array(MAX_IMAGE_BYTES + 1) as unknown as BodyInit, {
      headers: { 'content-length': '10' },
    })
    Object.defineProperty(lying, 'url', { value: 'https://cdn.example.com/a.png' })
    await expect(
      fetchImage('https://cdn.example.com/a.png', { fetch: async () => lying }),
    ).resolves.toEqual({ ok: false, reason: 'too-large' })
  })

  it('reports an http error rather than storing an error page as an image', async () => {
    const missing = respondWith(new Uint8Array([1]), { status: 404 })
    await expect(
      fetchImage('https://cdn.example.com/a.png', { fetch: async () => missing }),
    ).resolves.toEqual({ ok: false, reason: 'http-error' })
  })

  it('gives up on a request that never finishes', async () => {
    const hang = (_url: unknown, init?: { signal?: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    await expect(
      fetchImage('https://cdn.example.com/a.png', {
        fetch: hang as unknown as typeof fetch,
        timeoutMs: 10,
      }),
    ).resolves.toEqual({ ok: false, reason: 'failed' })
  })

  it('does not leak why a site refused, only that the image was not taken', async () => {
    const boom = async () => {
      throw new Error('ECONNREFUSED 10.0.0.1:443 while loading https://internal/secret')
    }
    const result = await fetchImage('https://cdn.example.com/a.png', {
      fetch: boom as unknown as typeof fetch,
    })
    expect(result).toEqual({ ok: false, reason: 'failed' })
    expect(JSON.stringify(result)).not.toContain('internal')
  })
})

describe('imageHandler', () => {
  it('answers only its own message type', () => {
    const send = vi.fn(async () => ({ ok: true, base64: '', mediaType: '' }) as FetchImageResult)
    const handle = imageHandler(send)
    expect(handle({ type: 'something-else', url: 'https://a.test/x.png' }, null, () => {})).toBe(
      false,
    )
    expect(handle({ type: FETCH_IMAGE }, null, () => {})).toBe(false)
    expect(send).not.toHaveBeenCalled()
    expect(handle({ type: FETCH_IMAGE, url: 'https://a.test/x.png' }, null, () => {})).toBe(true)
    expect(send).toHaveBeenCalledWith('https://a.test/x.png')
  })

  it('still answers when the fetch itself throws', async () => {
    const replies: FetchImageResult[] = []
    const handle = imageHandler(async () => {
      throw new Error('boom')
    })
    handle({ type: FETCH_IMAGE, url: 'https://a.test/x.png' }, null, (r) => replies.push(r))
    await vi.waitFor(() => expect(replies).toEqual([{ ok: false, reason: 'failed' }]))
  })
})

describe('toBase64', () => {
  it('round-trips bytes that are larger than one chunk', () => {
    const bytes = new Uint8Array(0x8000 * 2 + 5).map((_value, index) => index % 256)
    const decoded = Uint8Array.from(atob(toBase64(bytes)), (char) => char.charCodeAt(0))
    expect(decoded).toEqual(bytes)
  })
})

describe('the default fetch dependency', () => {
  it('calls fetch with the global as its receiver', async () => {
    // 浏览器的 fetch 是 receiver 绑定的：`{ fetch: globalThis.fetch }` 这样取出来再调，
    // 会抛 `Illegal invocation`，而且是**每一次调用都抛**。Node 的 fetch 没这个约束，
    // 所以这条用例故意把全局 fetch 换成一个同样挑剔 receiver 的实现 —— 让浏览器里
    // 才会发生的失败在这里也能发生。上一版的默认值就是那样写的，全部单测照样绿，
    // 而扩展里一张图都取不回来。
    const real = globalThis.fetch
    const strict = function (this: unknown) {
      if (this !== globalThis && this !== undefined) throw new TypeError('Illegal invocation')
      return Promise.resolve(respondWith(PNG))
    }
    globalThis.fetch = strict as unknown as typeof fetch
    try {
      // **不传第二个实参**：这一行才真的走 `fetchImage` 自己的默认依赖。
      // 上一版这里传的是手写的正确写法副本，于是把默认值改回出 bug 的写法，
      // 全部单测照样绿 —— 回归用例钉住的是「应有的写法」，不是被测代码本身。
      // （node 下 `chrome` 未定义，`granted()` 直接返回 true，不影响这条断言。）
      await expect(fetchImage('https://cdn.example.com/a.png')).resolves.toMatchObject({
        ok: true,
      })

      const result = await fetchImage('https://cdn.example.com/a.png', {
        fetch: (input, init) => globalThis.fetch(input, init),
        hasPermission: async () => true,
      })
      expect(result.ok).toBe(true)
      // 直接把全局 fetch 当值取出来传进去，就是上一版的写法：必须失败。
      const detached = await fetchImage('https://cdn.example.com/a.png', {
        fetch: { fetch: globalThis.fetch }.fetch,
        hasPermission: async () => true,
      })
      expect(detached).toEqual({ ok: false, reason: 'failed' })
    } finally {
      globalThis.fetch = real
    }
  })
})
