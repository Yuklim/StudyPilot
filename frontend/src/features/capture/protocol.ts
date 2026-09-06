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
 * 与后端 `source_url` 的校验规则对齐（`modules/resources/contracts.py` 的
 * `parsed_url`），而不只是「以 http(s) 开头」。宽松版本会让带 `#` 锚点的地址一路
 * 预填成功、直到用户点保存才被 422 拒绝，而确认页不提供网址编辑框 —— 无路可走。
 *
 * 规则：http(s) 开头；不含空白、控制字符、反斜杠、`#`；可解析且有主机名；不含凭据。
 * 与 `frontend/src/features/resources/api.ts` 的 `safeWebUrl` 同规则。
 */
export function isSafeSourceUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value) || value.length > MAX_URL) return false
  if (/[\s\\#]/u.test(value)) return false
  if ([...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return false
  try {
    const url = new URL(value)
    return Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
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
  if (typeof url !== 'string' || !isSafeSourceUrl(url)) return false
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
  if (!isCapturePayload(envelope.payload)) return null
  // 返回**已校验字段的副本**而不是原对象：让「校验的即所用的」在代码层面自明。
  // 结构化克隆已经挡住了 getter/Proxy，这一步是把不变量写进代码而非依赖运行时特性。
  const { title, url, markdown } = envelope.payload
  return { title, url, markdown }
}
