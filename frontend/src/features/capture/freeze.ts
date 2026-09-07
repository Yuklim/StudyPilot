import { ApiError } from '../../api/client'
import { failureText } from '../resources/api'

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
      const timer = setTimeout(() => done({ url, ok: false, reason: 'no-answer' }), timeoutMs)
      win.addEventListener('message', listener)
      win.postMessage({ type: CAPTURE_IMAGE_REQUEST, url }, win.location.origin)
    })
}

/** 长得像后端错误码的字符串。挡住从 postMessage 带进来的任意文本。 */
function isBackendCode(reason: string): boolean {
  return /^[A-Z][A-Z_]{2,39}$/.test(reason)
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
    case 'failed':
      return `${count} 张：没能取到（网络不通、站点无响应，或站点拒绝了下载）。`
    case 'upload-failed':
      // 我们自己产生的内部标记（上传抛出非 ApiError，或 atob 失败），**可安全回显**。
      // 上一轮为挡住不可信字符串时，把自家标记的可诊断性一起赔进去了：它是小写，
      // 落进 else 分支后渲染得和注入垃圾一模一样。
      return `${count} 张：本机保存这张图片时出错了（upload-failed）。`
    case 'no-answer':
      // **与 `failed` 分开**：这条是扩展一直没答话（被停用、刚重载、消息过大而丢失），
      // 补救方向和「网络不通」完全不同。上一版的兜底文案恰好覆盖了它，改写时漏掉了。
      return `${count} 张：扩展一直没有响应。在 chrome://extensions 里确认 StudyPilot 已启用（或刚重新加载过）后重新采集。`
    default:
      // **不臆断原因。** 上传失败时这里拿到的是后端的错误码（版本冲突、快照不存在、
      // 本机存储不可用…），把它们一律说成「扩展未响应、网络不通」会把人指向
      // chrome://extensions，而问题根本不在那里 —— 上一版的兜底就是这么写的。
      // 已知的后端码交给 `failureText` 说人话，认不出的只说「没保存」外加原始码。
      // **不拿不可信字符串去查 `messages`**：reason 是从 postMessage 原样带过来的，
      // `'constructor'` 之类会取到 Object 的构造函数并把它的源码显示到界面上。
      // 只有长得像后端错误码的才交给 `failureText`；其余一律不解释，也不回显。
      // 另外 `failureText` 对未知码返回**空串**，所以必须有 `||` 兜底 —— 否则界面上
      // 会出现「1 张：（upload-failed）」这种一个字都没说的提示。
      return isBackendCode(reason)
        ? `${count} 张：${failureText(new ApiError(reason as never)) || '没能保存到本机。'}（${reason}）`
        : `${count} 张：没能保存到本机。`
  }
}
