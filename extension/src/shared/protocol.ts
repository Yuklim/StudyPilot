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

/** 文献信息的上限，与后端 `modules/citations/contracts.py` 一一对应（契约 4.16）。 */
export const CITATION_ITEM_TYPES = [
  'JOURNAL_ARTICLE',
  'PREPRINT',
  'CONFERENCE_PAPER',
  'BOOK',
  'BOOK_CHAPTER',
  'THESIS',
  'REPORT',
  'WEBPAGE',
  'OTHER',
] as const
export const MAX_CITATION_AUTHORS = 100
export const MAX_CITATION_AUTHOR = 200
export const MIN_CITATION_YEAR = 1000
export const MAX_CITATION_YEAR = 2200
export const MAX_CITATION_STAMP = 32
export const MAX_CITATION_LOCATOR = 50
export const MAX_CITATION_NAME = 200
export const MAX_CITATION_CONTAINER = 500

/**
 * 采集时认出来的文献信息。认不出就是 `null` —— 多数网页不是文献，那是常态而非失败。
 *
 * 字段与后端文献接口（契约 4.16）同名同义，页面确认后原样交给 `PUT /citation`。
 * 这里**不带** `abstract`：摘要动辄上万字，为它把消息载荷撑大不值得，而它也不是
 * 用户在确认页上会看的东西。
 */
export interface CapturedCitation {
  item_type: (typeof CITATION_ITEM_TYPES)[number]
  /** 至多 MAX_CITATION_AUTHORS 位，每位去空白后非空；认不出作者时是空数组。 */
  authors: string[]
  issued_year: number | null
  /** 原样保留的出版日期字符串（`2024-03`、`Spring 2024` 都有人这么写），不解析。 */
  issued_date: string | null
  container_title: string | null
  volume: string | null
  issue: string | null
  pages: string | null
  publisher: string | null
  doi: string | null
  isbn: string | null
}

/** 采集时一并取下的 PDF 上限，与后端单文件上限一致（契约第 8 节 25 MiB）。 */
export const MAX_PDF_BYTES = 26_214_400

/**
 * 采集时顺手取下来的文献 PDF。
 *
 * **为什么由注入脚本去取**：它与页面同源运行，取一份**页面自己声明的同源 PDF**
 * （`citation_pdf_url`）不需要任何 host 权限——用户点扩展图标那一下授予的 `activeTab`
 * 就够了。这是「点一次就把文献拿进来」的落点。跨源的 PDF 受 CORS 管，取不到，按
 * `pdf_problem` 如实告知并退回存正文。
 */
export interface CapturedPdf {
  /** 文件名，取自地址最后一段；没有可用名字时是 `paper.pdf`。 */
  name: string
  /** 原始字节数。页面据它显示体积，也据它挡住超限的。 */
  bytes: number
  /** base64 的字节。取到时已校验过以 `%PDF-` 开头，不信服务器的 Content-Type。 */
  base64: string
}

/** 没能取到 PDF 的原因，确认页据此如实说明；`null` 表示这一页本来就不是文献。 */
export type PdfProblem = 'cross-origin' | 'too-large' | 'not-pdf' | 'failed'

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
  /**
   * 采集时认出来的文献信息；认不出就是 `null`（多数网页不是文献）。
   *
   * **可缺省**：旧版本扩展留下的暂存里没有这个字段，缺失与 `null` 同义（契约 14.2）。
   * 接收端的 `capturedFrom` 会把它归一成 `null`，好让「认不出」只有一种写法。
   */
  citation?: CapturedCitation | null
  /**
   * 采集时一并取下的文献 PDF；没有就是 `null`。
   *
   * **可缺省**：旧版本扩展留下的暂存里没有这个字段，缺失与 `null` 同义。
   */
  pdf?: CapturedPdf | null
  /** 认出是文献却没取到 PDF 时的原因；其余情况为 `null`。 */
  pdf_problem?: PdfProblem | null
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
 * 文献信息的校验。`null` 与缺失都算「没认出来」，一律放行为 `null`。
 *
 * 上限逐条对齐后端（契约 4.16）：超一个字都判整块不合格而不是截断——截断会让用户
 * 在确认页上看到的与最终存下的不是同一份，而这一块的全部价值就在于「你看到的就是
 * 要存的」。扩展侧在产出时就已按同样的上限收口，所以这里红了说明是有人在伪造消息。
 */
export function isCapturedCitation(value: unknown): value is CapturedCitation | null {
  if (value === null || value === undefined) return true
  if (typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  const bounded = (field: string, max: number) => {
    const item = candidate[field]
    if (item === null || item === undefined) return true
    return typeof item === 'string' && item.trim().length >= 1 && [...item].length <= max
  }
  if (!(CITATION_ITEM_TYPES as readonly string[]).includes(candidate.item_type as string))
    return false
  const authors = candidate.authors
  if (!Array.isArray(authors) || authors.length > MAX_CITATION_AUTHORS) return false
  if (
    !authors.every(
      (name) =>
        typeof name === 'string' &&
        name.trim().length >= 1 &&
        [...name].length <= MAX_CITATION_AUTHOR,
    )
  )
    return false
  const year = candidate.issued_year
  if (
    year !== null &&
    year !== undefined &&
    (typeof year !== 'number' ||
      !Number.isSafeInteger(year) ||
      year < MIN_CITATION_YEAR ||
      year > MAX_CITATION_YEAR)
  )
    return false
  return (
    bounded('issued_date', MAX_CITATION_STAMP) &&
    bounded('container_title', MAX_CITATION_CONTAINER) &&
    bounded('volume', MAX_CITATION_LOCATOR) &&
    bounded('issue', MAX_CITATION_LOCATOR) &&
    bounded('pages', MAX_CITATION_LOCATOR) &&
    bounded('publisher', MAX_CITATION_NAME) &&
    bounded('doi', MAX_CITATION_NAME) &&
    bounded('isbn', MAX_CITATION_STAMP)
  )
}

/**
 * PDF 的校验。`null` 与缺失都算「这次没有 PDF」。
 *
 * base64 只做形状与体积校验：真正判断它是不是 PDF 的地方在取字节时（`%PDF-` 魔数），
 * 因为付费墙常常回 200 加一页 HTML。到了这一步还不合格，说明不是本扩展产出的消息。
 */
/**
 * `pdf_problem` 只能是契约 14.7 列的四种之一（或没有）。
 *
 * 首轮 Review F3：原先它跟着载荷原样透传，TypeScript 的 `PdfProblem` 在运行时不存在，
 * 于是「载荷必须通过结构校验」（契约 14.3）对这个字段是空话。实际危害有限——它只用来
 * 查一张固定的文案表——但契约说了要校验的字段就得校验，口径不能和相邻的 `pdf` 不一致。
 */
export function isPdfProblem(value: unknown): value is PdfProblem | null {
  if (value === null || value === undefined) return true
  return (
    value === 'cross-origin' || value === 'too-large' || value === 'not-pdf' || value === 'failed'
  )
}

export function isCapturedPdf(value: unknown): value is CapturedPdf | null {
  if (value === null || value === undefined) return true
  if (typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  const { name, bytes, base64 } = candidate
  if (typeof name !== 'string' || !name.trim() || name.length > 200) return false
  // 契约 14.2 写明必以 `.pdf` 结尾。后端的扩展名白名单本来也会兜住，但契约说了的事
  // 就该在这里判——否则契约与实现各说各话（首轮 Review F7）。
  if (!/\.pdf$/i.test(name)) return false
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 1) return false
  if (bytes > MAX_PDF_BYTES) return false
  if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return false
  // base64 每 4 个字符编 3 字节，末尾用 `=` 补齐：长度**和**补齐位数合起来能唯一确定
  // 原始字节数。只比长度的话，同一组里的 8 与 9 字节分辨不出来（都是 12 个字符）。
  if (Math.ceil(bytes / 3) * 4 !== base64.length) return false
  const padding = bytes % 3 === 0 ? 0 : 3 - (bytes % 3)
  return base64.endsWith('='.repeat(padding)) && !base64.endsWith('='.repeat(padding + 1))
}

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
  if (!isCapturedCitation(candidate.citation)) return false
  if (!isCapturedPdf(candidate.pdf)) return false
  if (!isPdfProblem(candidate.pdf_problem)) return false
  return markdown.trim().length > 0 && markdown.length <= MAX_MARKDOWN
}
