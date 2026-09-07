// 扩展与本页面之间的消息契约。
//
// 这是 `extension/src/shared/protocol.ts` 的**平行实现**：两个顶层目录之间没有构建
// 耦合（extension 是独立 npm 工程，不与 frontend 共享 node_modules），所以两边各写
// 一份、靠约定对齐。权威定义在 docs/contracts/API与数据契约基线.md，改动须三处同步。

export const CAPTURE_READY = 'studypilot-capture-ready'
export const CAPTURE_PAYLOAD = 'studypilot-capture-payload'
/** 页面向中转脚本要一张图片的字节。由页面发出，逐张。 */
export const CAPTURE_IMAGE_REQUEST = 'studypilot-capture-image-request'
/** 中转脚本把一张图片的结果交给页面（成功带字节，失败带原因）。 */
export const CAPTURE_IMAGE_RESULT = 'studypilot-capture-image-result'

/** 与后端 `SnapshotContent` 的 max_length 一致。 */
export const MAX_MARKDOWN = 1_000_000
/** 与后端 `source_url` 的 max_length 一致。 */
export const MAX_URL = 2048
/** 与后端标题的 max_length 一致；标题可空。 */
export const MAX_TITLE = 200

/** 与后端 `MAX_ASSET_BYTES` 一致。 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
/**
 * 一次采集最多冻结多少张图。
 *
 * 后端**不设**每篇张数上限（用户 2026-09-06 决定），这个上限只管**采集这一次**：
 * 它限的是「一次点击最多让扩展向外发多少个请求」，属授权面而非存储策略。
 * 超出的图片保留原站地址，页面会如实说有多少张没冻结。
 */
export const MAX_IMAGES = 60

export interface CapturePayload {
  title: string
  url: string
  markdown: string
  /**
   * 正文里引用的图片地址，绝对 http(s)，已去重并截断到 MAX_IMAGES。
   *
   * 空数组是正常状态：正文没有图片、或提取时一张都没认出来。它**不表示**
   * 用户拒绝了权限 —— 那件事发生在此之后，由页面按取回结果如实告知。
   */
  images: string[]
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

/**
 * 图片地址的校验，比 `isSafeSourceUrl` **松一处、紧一处**，两处都是有意的。
 *
 * 松：允许 `#`。后端的 `source_url`（资料的网址）拒绝片段标识符，而资产的
 * `source_url` 只是「这张图在正文里的地址」这一匹配键，后端对它不设该限制；
 * 若在这里一并拒掉，带 `#` 的图片地址会连原样保留都做不到。
 *
 * 紧：这个地址会被扩展**真的发出去请求**，而资料网址不会。所以照样拒绝空白、
 * 控制字符与 authority 段里的 `@`（携带凭据的地址），并要求可解析且有主机名。
 * `data:`/`blob:`/`file:` 一律不匹配 http(s) 前缀，从这里就被挡住。
 */
export function isSafeImageUrl(value: string): boolean {
  if (!/^https?:\/\//.test(value) || value.length > MAX_URL) return false
  if (/[\s\\]/u.test(value)) return false
  if ([...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return false
  if (/^https?:\/\/[^/?#]*@/.test(value)) return false
  try {
    const url = new URL(value)
    return Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}

/** 载荷里的图片清单：已去重、已截断到 MAX_IMAGES，每一条都过 isSafeImageUrl。 */
export function isImageList(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > MAX_IMAGES) return false
  return value.every((item) => typeof item === 'string' && isSafeImageUrl(item))
}

// 页面用它，防的是「谁都能往这个窗口发消息」。
/**
 * 接收端一律先过这道校验再使用：结构对不上就丢弃，不猜测、不补救。
 *
 * **任何网页都能向同源窗口 postMessage**，所以这不是防御性编程的客套，而是这条
 * 链路的信任边界本身。两端各有一份实现，规则必须完全一致。
 *
 * 两侧守卫覆盖到什么程度，如实说清（`check_task.py` 按路径前缀选检查组，只改一侧
 * 时另一侧的组不运行）：改**扩展**那份 → 扩展侧逐字比对必红；改**前端**那份 →
 * 只有**放宽**已被用例钉住的规则才红，**新增或收紧**不会红，那个方向仍靠人记。
 */
export function isCapturePayload(value: unknown): value is CapturePayload {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  const { title, url, markdown } = candidate
  if (typeof title !== 'string' || title.length > MAX_TITLE) return false
  if (typeof url !== 'string' || !isSafeSourceUrl(url)) return false
  if (typeof markdown !== 'string') return false
  if (!isImageList(candidate.images)) return false
  return markdown.trim().length > 0 && markdown.length <= MAX_MARKDOWN
}

/** 扩展交回的一张图片的结果。失败时只有一个粗粒度原因，不带站点的错误细节。 */
export interface ImageResult {
  url: string
  ok: boolean
  base64?: string
  /**
   * 失败的粗粒度原因，用于**让用户看懂为什么**，不带站点的错误细节。
   * 取值见扩展侧 `FetchImageResult`：`no-permission`（未授权）、`http-error`（站点拒绝）、
   * `too-large`（超过 10 MiB）、`unsafe-url`、`failed`（取不到/扩展没答话）、
   * `not-offered`（不在本次采集的清单里）。未知值一律按「取不到」处理。
   */
  reason?: string
}

/**
 * 从一条 message 事件里取出图片结果；不可信则返回 null。
 *
 * 与 `capturedFrom` 同样的信任边界：**任何同源脚本都能向本窗口 postMessage**，
 * 所以字节也要过校验。base64 只做形状检查（合法字符集、非空），真正的裁决在
 * 后端 —— 它按字节魔数判定类型，不采信这里的任何声明。
 */
export function imageResultFrom(event: MessageEvent, win: Window): ImageResult | null {
  if (event.source !== win) return null
  if (event.origin !== win.location.origin) return null
  const envelope = event.data as { type?: unknown; url?: unknown; result?: unknown } | null
  if (envelope?.type !== CAPTURE_IMAGE_RESULT) return null
  if (typeof envelope.url !== 'string') return null
  const result = envelope.result as { ok?: unknown; base64?: unknown; reason?: unknown } | null
  if (result?.ok !== true) {
    const reason = typeof result?.reason === 'string' ? result.reason : undefined
    return { url: envelope.url, ok: false, reason }
  }
  if (typeof result.base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.base64)) {
    return { url: envelope.url, ok: false, reason: 'bad-bytes' }
  }
  return { url: envelope.url, ok: true, base64: result.base64 }
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
  const { title, url, markdown, images } = envelope.payload
  // images 也要跟着复制一份：漏掉它，页面永远看不到图片清单，冻结这条路
  // 会一声不响地什么都不做 —— 这正是 `protocol.test.ts` 那条「返回的是副本」
  // 断言在本次改动中抓到的。数组本身也复制，避免与来源共享引用。
  return { title, url, markdown, images: [...images] }
}
