import { describe, expect, it, vi } from 'vitest'

import { CAPTURE_IMAGE_REQUEST, CAPTURE_IMAGE_RESULT } from './protocol'
import { askExtensionForImage, base64ToBlob, freezeImages } from './freeze'

const A = 'https://cdn.example.com/a.png'
const B = 'https://cdn.example.com/b.png'
const BYTES = btoa('\x89PNG\r\n\x1a\n')

describe('freezeImages', () => {
  it('takes one image at a time, in order', async () => {
    // 逐张不是风格问题：base64 有 33% 放大，并发会让峰值内存随图片数线性增长。
    const order: string[] = []
    const ask = vi.fn(async (url: string) => {
      order.push(`ask:${url}`)
      return { url, ok: true, base64: BYTES }
    })
    const upload = vi.fn(async (_id: string, _bytes: Blob, url: string) => {
      order.push(`upload:${url}`)
    })
    await expect(freezeImages('r1', [A, B], 3, { ask, upload })).resolves.toEqual({
      frozen: 2,
      failed: 0,
    })
    expect(order).toEqual([`ask:${A}`, `upload:${A}`, `ask:${B}`, `upload:${B}`])
  })

  it('passes the snapshot version through to every upload', async () => {
    // 前置条件是**快照**的版本，不是资料的；上传不推进它，所以多张都用同一个值。
    const versions: number[] = []
    await freezeImages('r1', [A, B], 7, {
      ask: async (url) => ({ url, ok: true, base64: BYTES }),
      upload: async (_id, _bytes, _url, version) => {
        versions.push(version)
      },
    })
    expect(versions).toEqual([7, 7])
  })

  it('keeps going when one image cannot be fetched', async () => {
    const upload = vi.fn(async () => undefined)
    await expect(
      freezeImages('r1', [A, B], 1, {
        ask: async (url) => (url === A ? { url, ok: false } : { url, ok: true, base64: BYTES }),
        upload,
      }),
    ).resolves.toEqual({ frozen: 1, failed: 1 })
    expect(upload).toHaveBeenCalledTimes(1)
  })

  it('keeps going when the backend refuses one image', async () => {
    // 后端拒收（类型不符、超限）与取不到，对用户的处置完全相同：这张保留原链接。
    await expect(
      freezeImages('r1', [A, B], 1, {
        ask: async (url) => ({ url, ok: true, base64: BYTES }),
        upload: async (_id, _bytes, url) => {
          if (url === A) throw new Error('ASSET_TYPE_UNSUPPORTED')
        },
      }),
    ).resolves.toEqual({ frozen: 1, failed: 1 })
  })

  it('reports progress so the page can say where it is', async () => {
    const seen: Array<[number, number]> = []
    await freezeImages('r1', [A, B], 1, {
      ask: async (url) => ({ url, ok: true, base64: BYTES }),
      upload: async () => undefined,
      onProgress: (done, total) => seen.push([done, total]),
    })
    expect(seen).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ])
  })
})

describe('askExtensionForImage', () => {
  it('asks the relay and resolves with the matching answer only', async () => {
    const posted: unknown[] = []
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      posted.push(message)
    })
    const pending = askExtensionForImage(window)(A)
    expect(posted).toEqual([{ type: CAPTURE_IMAGE_REQUEST, url: A }])

    // 另一张图的答复不该结束这次等待。
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: CAPTURE_IMAGE_RESULT, url: B, result: { ok: true, base64: BYTES } },
        origin: window.location.origin,
        source: window,
      }),
    )
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: CAPTURE_IMAGE_RESULT, url: A, result: { ok: true, base64: BYTES } },
        origin: window.location.origin,
        source: window,
      }),
    )
    await expect(pending).resolves.toEqual({ url: A, ok: true, base64: BYTES })
  })

  it('gives up rather than waiting forever when the extension never answers', async () => {
    // 扩展被禁用、service worker 唤不醒、消息过大而丢失 —— 没有超时的话，页面
    // 会为一张取不到的图永远停在「正在下载图片」。
    vi.spyOn(window, 'postMessage').mockImplementation(() => {})
    await expect(askExtensionForImage(window, 5)(A)).resolves.toEqual({ url: A, ok: false })
  })
})

describe('base64ToBlob', () => {
  it('round-trips the bytes it was given', async () => {
    const blob = base64ToBlob(BYTES)
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  })
})
