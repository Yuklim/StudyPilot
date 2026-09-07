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
/** chrome.storage.local 中记住上次打开的确认页标签页 id，用于复用而非新开。 */
export const CONFIRM_TAB_KEY = 'confirmTabId'

/** 页面向中转脚本要一张图片的字节。由页面发出，逐张。 */
export const CAPTURE_IMAGE_REQUEST = 'studypilot-capture-image-request'
/** 中转脚本把一张图片的结果交给页面（成功带字节，失败带原因）。 */
export const CAPTURE_IMAGE_RESULT = 'studypilot-capture-image-result'
/** 中转脚本向 service worker 要字节。走 chrome.runtime，不经页面。 */
export const FETCH_IMAGE = 'studypilot-fetch-image'

/** 与后端 `SnapshotContent` 的 max_length 一致（backend .../resources/snapshots.py:8）。 */
export const MAX_MARKDOWN = 1_000_000
/** 与后端 `source_url` 的 max_length 一致（.../resources/contracts.py:68）。 */
export const MAX_URL = 2048
/** 与后端标题的 max_length 一致（.../resources/contracts.py:50）；标题可空。 */
export const MAX_TITLE = 200

/** 与后端 `MAX_ASSET_BYTES` 一致（backend .../resources/assets.py）。 */
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
  /** 可为空字符串：后端标题可空（TASK-029），页面据此显示「未命名资料」。 */
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

/**
 * 一个地址对应的扩展 match pattern。**popup 请求权限与 worker 查询权限必须用同一个
 * 模式串**，否则「请求的」与「查询的」是两个不同的东西，权限明明授了却查不到。
 * 上一版这段表达式在两个文件里各手写一份，靠注释叮嘱「两处必须一致」——那是纪律，
 * 不是保证；抽到这里之后两端共用同一份实现，想不一致也难。
 *
 * 去掉端口是有意的：`URL.origin` 在非默认端口时带端口，而 match pattern 的 host 段
 * 不接受端口号（依 Chrome match pattern 文档判断，**未实机验证**）。match pattern 本就
 * 端口无关，去掉它不损失任何覆盖面。
 *
 * 前端侧目前**没有调用方**：那份副本存在的理由是让平行副本的逐字比对成立
 * （扩展侧的 `protocol.test.ts` 把本函数列进了比对名单）。删掉它守卫会变红。
 */
export function matchPatternFor(url: URL): string {
  return `${url.protocol}//${url.hostname}/` + '*'
}

// 中转脚本用它，防的是「自己存坏了」。
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
