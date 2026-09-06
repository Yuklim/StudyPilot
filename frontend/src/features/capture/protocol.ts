// 扩展与本页面之间的消息契约。
//
// 这是 `extension/src/shared/protocol.ts` 的**平行实现**：两个顶层目录之间没有构建
// 耦合（extension 是独立 npm 工程，不与 frontend 共享 node_modules），所以两边各写
// 一份、靠约定对齐。权威定义在 docs/contracts/API与数据契约基线.md，改动须三处同步。

export const CAPTURE_READY = 'studypilot-capture-ready'
export const CAPTURE_PAYLOAD = 'studypilot-capture-payload'

/** 与后端 `SnapshotContent` 的 max_length 一致。 */
export const MAX_MARKDOWN = 1_000_000
/** 与后端 `source_url` 的 max_length 一致。 */
export const MAX_URL = 2048
/** 与后端标题的 max_length 一致；标题可空。 */
export const MAX_TITLE = 200

export interface CapturePayload {
  title: string
  url: string
  markdown: string
}

/**
 * 校验后才使用。**任何网页都能向同源窗口 postMessage**，所以这道校验不是防御性
 * 编程的客套，而是这个页面的信任边界本身：结构对不上就当没收到。
 */
export function isCapturePayload(value: unknown): value is CapturePayload {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  const { title, url, markdown } = candidate
  if (typeof title !== 'string' || title.length > MAX_TITLE) return false
  if (typeof url !== 'string' || url.length > MAX_URL || !/^https?:\/\//i.test(url)) return false
  if (typeof markdown !== 'string') return false
  return markdown.trim().length > 0 && markdown.length <= MAX_MARKDOWN
}

/** 从一条 message 事件里取出可信的采集内容；不可信则返回 null。 */
export function capturedFrom(event: MessageEvent, win: Window): CapturePayload | null {
  // 跨源 opener 或 iframe 发来的消息，source 不是本窗口。
  if (event.source !== win) return null
  if (event.origin !== win.location.origin) return null
  const envelope = event.data as { type?: unknown; payload?: unknown } | null
  if (envelope?.type !== CAPTURE_PAYLOAD) return null
  return isCapturePayload(envelope.payload) ? envelope.payload : null
}
