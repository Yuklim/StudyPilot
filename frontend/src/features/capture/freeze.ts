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
): Promise<{ frozen: number; failed: number; reasons: Record<string, number> }> {
  let frozen = 0
  let failed = 0
  // 分原因计数。**上一版把所有失败合并成一句「没能保存」，结果是一次真实故障
  // 完全无法归因**：未授权、站点拒绝、超限、扩展没答话在界面上长得一模一样。
  const reasons: Record<string, number> = {}
  const note = (reason: string) => {
    reasons[reason] = (reasons[reason] ?? 0) + 1
    failed += 1
  }
  for (const [index, url] of images.entries()) {
    deps.onProgress?.(index, images.length)
    try {
      const result = await deps.ask(url)
      if (!result.ok || result.base64 === undefined) {
        note(result.reason ?? 'failed')
        continue
      }
      await deps.upload(resourceId, base64ToBlob(result.base64), url, snapshotVersion)
      frozen += 1
    } catch (cause) {
      // 后端拒收（类型不符、超限）与本地异常。仍不追问站点细节，也不自动重试，
      // 但要把后端给的错误码留下 —— 它是「为什么没存下」这个问题的答案。
      const code = (cause as { code?: unknown })?.code
      note(typeof code === 'string' ? code : 'upload-failed')
    }
  }
  deps.onProgress?.(images.length, images.length)
  return { frozen, failed, reasons }
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

/**
 * 把失败原因说成人话。**这一条是一次真实故障的直接产物**：当时界面只说「没能保存」，
 * 六张图全失败，而未授权、站点拒绝、超限、扩展没答话在屏幕上长得完全一样，
 * 用户和实现者都无法从界面判断问题出在哪一环。
 */
export function imageFailureText(reason: string, count: number): string {
  switch (reason) {
    case 'no-permission':
      return `${count} 张：浏览器没有授予访问该图片所在网站的权限。重新采集一次，并在弹出的授权框里点允许。`
    case 'http-error':
      return `${count} 张：图片所在网站拒绝了这次下载（例如需要登录，或限制外部引用）。`
    case 'too-large':
      return `${count} 张：单张超过 10 MiB 上限。`
    case 'unsafe-url':
      return `${count} 张：图片地址不是可以安全下载的普通网址。`
    case 'ASSET_TYPE_UNSUPPORTED':
      return `${count} 张：不是 PNG、JPEG、GIF 或 WebP，本机拒收。`
    case 'ASSET_TOO_LARGE':
      return `${count} 张：本机拒收，超过 10 MiB 上限。`
    case 'no-worker':
      return `${count} 张：浏览器扩展没有应答（可能刚被重新加载，或已停用）。在 chrome://extensions 里确认扩展已启用后重新采集。`
    case 'not-offered':
      return `${count} 张：不在这次采集交来的清单里，没有下载。`
    case 'bad-bytes':
      return `${count} 张：收到的内容不是可用的图片数据。`
    default:
      return `${count} 张：没能取到（扩展未响应、网络不通或已超时）。`
  }
}
