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
    await expect(freezeImages('r1', [A, B], 3, { ask, upload })).resolves.toMatchObject({
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
    ).resolves.toMatchObject({ frozen: 1, failed: 1 })
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
    ).resolves.toMatchObject({ frozen: 1, failed: 1 })
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
    // 超时有**专属**原因：这条路的真实含义是扩展一直没答话，补救方向与
    // 「网络不通」完全不同，不能和它共用一句文案。
    await expect(askExtensionForImage(window, 5)(A)).resolves.toEqual({
      url: A,
      ok: false,
      reason: 'no-answer',
    })
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

describe('failure reasons', () => {
  it('tallies why each image failed, instead of collapsing them into one number', async () => {
    // 上一轮真实故障里六张图全失败，而未授权、站点拒绝、超限在界面上长得一模一样，
    // 结果是没人能从界面判断问题在哪。这条钉住「原因要分开计数」。
    const result = await freezeImages('r1', [A, B, 'https://cdn.example.com/c.png'], 1, {
      ask: async (url) => {
        if (url === A) return { url, ok: false, reason: 'no-permission' }
        if (url === B) return { url, ok: false, reason: 'http-error' }
        return { url, ok: true, base64: BYTES }
      },
      upload: async () => undefined,
    })
    expect(result).toEqual({
      frozen: 1,
      failed: 2,
      reasons: { 'no-permission': 1, 'http-error': 1 },
    })
  })

  it('keeps the backend error code when an upload is refused', async () => {
    const refusal = Object.assign(new Error('refused'), { code: 'ASSET_TYPE_UNSUPPORTED' })
    const result = await freezeImages('r1', [A], 1, {
      ask: async (url) => ({ url, ok: true, base64: BYTES }),
      upload: async () => {
        throw refusal
      },
    })
    expect(result.reasons).toEqual({ ASSET_TYPE_UNSUPPORTED: 1 })
  })
})
