import { CAPTURE_IMAGE_REQUEST, imageResultFrom, type ImageResult } from './protocol'

/**
 * 逐张把图片取回并冻结。**逐张而不是并发**，两个理由都成立：
 * 峰值内存只与单张图相关（base64 有 33% 放大，一张接近上限的图就是十几 MB），
 * 且失败一张不影响其余 —— 每张各走各的请求、各记各的结果。
 *
 * 取字节要经中转脚本问扩展的 service worker：本页是本机 UI 源上的普通页面，
 * 直接 fetch 图床会被 CORS 拒（契约 §4.13）。
 *
 * **任何一张失败都不回滚正文。**「资料 + 正文已存、部分图片没存下」是可接受的降级，
 * 而「因为一张图没取到就丢掉整篇正文」不是。
 */
export async function freezeImages(
  resourceId: string,
  images: readonly string[],
  snapshotVersion: number,
  deps: {
    ask: (url: string) => Promise<ImageResult>
    upload: (
      resourceId: string,
      bytes: Blob,
      sourceUrl: string,
      version: number,
    ) => Promise<unknown>
    onProgress?: (done: number, total: number) => void
  },
): Promise<{ frozen: number; failed: number }> {
  let frozen = 0
  let failed = 0
  for (const [index, url] of images.entries()) {
    deps.onProgress?.(index, images.length)
    try {
      const result = await deps.ask(url)
      if (!result.ok || result.base64 === undefined) {
        failed += 1
        continue
      }
      await deps.upload(resourceId, base64ToBlob(result.base64), url, snapshotVersion)
      frozen += 1
    } catch {
      // 取不到、传不上、后端拒收（类型不符、超限）—— 对用户的处置完全相同：
      // 这张保留原站地址。不追问具体原因，也不自动重试。
      failed += 1
    }
  }
  deps.onProgress?.(images.length, images.length)
  return { frozen, failed }
}

/** base64 → Blob。扩展消息通道会 JSON 序列化，字节只能以 base64 过来。 */
export function base64ToBlob(base64: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes])
}

/**
 * 向中转脚本要一张图片，等它把结果送回来。
 *
 * 有超时：扩展可能被禁用、service worker 可能唤不醒、消息可能过大而丢失。没有超时
 * 的话，页面会为一张取不到的图永远停在「正在保存图片」。
 */
export function askExtensionForImage(win: Window, timeoutMs = 30_000) {
  return (url: string) =>
    new Promise<ImageResult>((resolve) => {
      const done = (result: ImageResult) => {
        win.removeEventListener('message', listener)
        clearTimeout(timer)
        resolve(result)
      }
      const listener = (event: MessageEvent) => {
        const result = imageResultFrom(event, win)
        if (result && result.url === url) done(result)
      }
      const timer = setTimeout(() => done({ url, ok: false }), timeoutMs)
      win.addEventListener('message', listener)
      win.postMessage({ type: CAPTURE_IMAGE_REQUEST, url }, win.location.origin)
    })
}
