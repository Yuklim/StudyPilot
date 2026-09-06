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
 * 规则：http(s) 开头（**大小写敏感**）；不含空白、控制字符、反斜杠、`#`；长度 ≤ MAX_URL；
 * authority 段不含 `@`；可解析且有主机名。
 *
 * **比 `frontend/src/features/resources/api.ts` 的 `safeWebUrl` 更严**，多三处：长度上限、
 * authority 段 `@` 拒绝（`safeWebUrl` 用 `!url.username`，判不出 `https://@example.com/`
 * 这种空用户名）、以及 scheme 大小写敏感。`safeWebUrl` 服务的是手工录入网址的展示防护，
 * 与采集路径无关，**未随本次收紧同步**，这是有意的：改它属于扩大范围。
 */
export function isSafeSourceUrl(value: string): boolean {
  // scheme 不带 /i：后端用的是大小写敏感的 startswith。真实采集路径经
  // `new URL().href` 规整后 scheme 恒为小写，所以这只影响伪造载荷。
  if (!/^https?:\/\//.test(value) || value.length > MAX_URL) return false
  if (/[\s\\#]/u.test(value)) return false
  if ([...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return false
  // 后端拒的是 netloc 里出现 `@`，不是「用户名非空」——`https://@example.com/` 在
  // 后端是 username='' 而非 None，同样被拒。JS 的 URL 分不出「没有」与「为空」，
  // 所以直接查 authority 段里有没有 `@`。
  if (/^https?:\/\/[^/?#]*@/.test(value)) return false
  try {
    const url = new URL(value)
    return Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}

// 页面用它，防的是「谁都能往这个窗口发消息」。
/**
 * 接收端一律先过这道校验再使用：结构对不上就丢弃，不猜测、不补救。
 *
 * **任何网页都能向同源窗口 postMessage**，所以这不是防御性编程的客套，而是这条
 * 链路的信任边界本身。两端各有一份实现，规则必须完全一致 —— 这一点由两侧的
 * 守卫测试机器强制，不靠人记。
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
