// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_EDGE,
  MAX_IMAGE_BYTES,
  NoteImageError,
  imageFiles,
  imageToMarkdown,
  inlineImageBytes,
} from './noteImages'

/**
 * jsdom 没有解码器也没有 canvas：这里把解码/编码两端换成可观察的桩，守的是本模块自己的
 * 逻辑——尺寸算法、格式选择与回退、大小上限、Markdown 形状。真实浏览器里的整条链路由 e2e 走。
 */
type Encoder = (type: string, quality: number) => Blob | null
function stubCanvas(size: { width: number; height: number }, encoder: Encoder) {
  const drawn: number[][] = []
  const sizes: Array<{ width: number; height: number }> = []
  const encodes: Array<[string, number]> = []
  vi.stubGlobal('createImageBitmap', async () => ({ ...size, close: vi.fn() }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    sizes.push({ width: this.width, height: this.height })
    return {
      drawImage: (_image: unknown, ...rest: number[]) => {
        drawn.push(rest)
      },
    } as unknown as CanvasRenderingContext2D
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    callback: BlobCallback,
    type?: string,
    quality?: unknown,
  ) {
    encodes.push([type ?? '', Number(quality)])
    callback(encoder(type ?? '', Number(quality)))
  })
  return { drawn, sizes, encodes }
}
const bytes = (n: number, type: string) => new Blob([new Uint8Array(n)], { type })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('imageToMarkdown', () => {
  it('shrinks to the longest edge, encodes WebP and returns one Markdown image line', async () => {
    const stub = stubCanvas({ width: 3200, height: 2000 }, (type) => bytes(10, type))
    const out = await imageToMarkdown(bytes(1000, 'image/png'), '截图')
    expect(stub.sizes).toEqual([{ width: MAX_EDGE, height: 1000 }])
    expect(stub.drawn).toEqual([[0, 0, MAX_EDGE, 1000]])
    expect(stub.encodes).toEqual([['image/webp', 0.82]])
    expect(out).toMatch(/^!\[截图\]\(data:image\/webp;base64,[A-Za-z0-9+/=]+\)$/)
  })
  it('never upscales a small image', async () => {
    const stub = stubCanvas({ width: 300, height: 120 }, (type) => bytes(10, type))
    await imageToMarkdown(bytes(1000, 'image/jpeg'))
    expect(stub.sizes).toEqual([{ width: 300, height: 120 }])
  })
  it('falls back to JPEG when the browser cannot encode WebP', async () => {
    const stub = stubCanvas({ width: 100, height: 100 }, (type) =>
      // 不会编 WebP 的浏览器把它当 PNG 编出来（规范行为），这里返回 PNG 模拟。
      type === 'image/webp' ? bytes(10, 'image/png') : bytes(10, type),
    )
    const out = await imageToMarkdown(bytes(1000, 'image/png'))
    expect(stub.encodes).toEqual([
      ['image/webp', 0.82],
      ['image/jpeg', 0.85],
    ])
    expect(out.startsWith('![图片](data:image/jpeg;base64,')).toBe(true)
  })
  it('passes a GIF through untouched so the animation survives', async () => {
    const stub = stubCanvas({ width: 100, height: 100 }, (type) => bytes(10, type))
    const out = await imageToMarkdown(bytes(1000, 'image/gif'))
    expect(stub.encodes).toEqual([])
    expect(out.startsWith('![图片](data:image/gif;base64,')).toBe(true)
  })
  it('refuses an image that is still too large after compression, and non-bitmap types', async () => {
    stubCanvas({ width: 100, height: 100 }, (type) => bytes(MAX_IMAGE_BYTES + 1, type))
    await expect(imageToMarkdown(bytes(1000, 'image/png'))).rejects.toMatchObject({
      code: 'IMAGE_TOO_LARGE',
    })
    await expect(imageToMarkdown(bytes(MAX_IMAGE_BYTES + 1, 'image/gif'))).rejects.toMatchObject({
      code: 'IMAGE_TOO_LARGE',
    })
    const svg = imageToMarkdown(bytes(10, 'image/svg+xml'))
    await expect(svg).rejects.toBeInstanceOf(NoteImageError)
    await expect(svg).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' })
  })
  it('keeps the alt text on one line and inside the brackets', async () => {
    stubCanvas({ width: 10, height: 10 }, (type) => bytes(10, type))
    const out = await imageToMarkdown(bytes(10, 'image/png'), 'a]b\n[c')
    expect(out.startsWith('![a b  c](')).toBe(true)
  })
})

describe('imageFiles', () => {
  it('picks only image files out of a paste/drop transfer', () => {
    const png = new File([new Uint8Array(4)], 'a.png', { type: 'image/png' })
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' })
    const transfer = {
      items: [
        { kind: 'string', getAsFile: () => null },
        { kind: 'file', getAsFile: () => txt },
        { kind: 'file', getAsFile: () => png },
      ],
      files: [txt, png],
    } as unknown as DataTransfer
    expect(imageFiles(transfer)).toEqual([png])
    expect(imageFiles(null)).toEqual([])
    // 只有 files 没有 items（部分拖放实现）也能拿到。
    expect(imageFiles({ files: [png] } as unknown as DataTransfer)).toEqual([png])
  })
})

describe('inlineImageBytes', () => {
  it('estimates the decoded size of every inline image in the body', () => {
    const body = '文字\n![a](data:image/webp;base64,AAAAAAAA)\n![b](data:image/png;base64,AAAA)\n'
    expect(inlineImageBytes(body)).toBe(6 + 3)
    expect(inlineImageBytes('没有图')).toBe(0)
  })
})
