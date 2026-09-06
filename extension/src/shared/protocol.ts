// 扩展与本机 UI 页面（`/capture`）之间的消息契约。
//
// `frontend/src/features/capture/protocol.ts` 平行实现同一份格式：两个顶层目录之间
// 没有构建耦合（见 extension/AGENTS.md §6），所以这是一份**约定**而不是共享代码。
// 权威定义写在 docs/contracts/API与数据契约基线.md，任何改动须三处同步。

/** 本机 UI 的规范源。后端的本机访问门禁只信任这一个源，扩展因此不直连 API。 */
export const UI_ORIGIN = 'http://127.0.0.1:5173'
export const CAPTURE_URL = `${UI_ORIGIN}/capture`
/** 中转内容脚本的匹配范围。**只有这一个源**，不得放宽。 */
export const RELAY_MATCH = `${UI_ORIGIN}/*`

/** 页面就绪，向中转脚本要内容。由页面发出。 */
export const CAPTURE_READY = 'studypilot-capture-ready'
/** 中转脚本把内容交给页面。 */
export const CAPTURE_PAYLOAD = 'studypilot-capture-payload'
/** 注入的提取脚本把结果回传给 popup。走 chrome.runtime，不经页面。 */
export const CAPTURE_EXTRACTED = 'studypilot-capture-extracted'
/** chrome.storage.local 中暂存待交付内容的键。用后即删。 */
export const PENDING_KEY = 'pendingCapture'

/** 与后端 `SnapshotContent` 的 max_length 一致（backend .../resources/snapshots.py:8）。 */
export const MAX_MARKDOWN = 1_000_000
/** 与后端 `source_url` 的 max_length 一致（.../resources/contracts.py:68）。 */
export const MAX_URL = 2048
/** 与后端标题的 max_length 一致（.../resources/contracts.py:50）；标题可空。 */
export const MAX_TITLE = 200

export interface CapturePayload {
  /** 可为空字符串：后端标题可空（TASK-029），页面据此显示「未命名资料」。 */
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
 * 接收端一律先过这道校验再使用。两端都要用它：中转脚本防的是自己存坏了，
 * 页面防的是**任何网页都能向同源窗口 postMessage** —— 结构对不上就丢弃。
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
