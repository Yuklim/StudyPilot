import Defuddle from 'defuddle/full'

import {
  CAPTURE_EXTRACTED,
  MAX_CITATION_AUTHOR,
  MAX_CITATION_AUTHORS,
  MAX_CITATION_CONTAINER,
  MAX_CITATION_LOCATOR,
  MAX_CITATION_NAME,
  MAX_CITATION_STAMP,
  MAX_CITATION_YEAR,
  MAX_IMAGES,
  MAX_PDF_BYTES,
  MAX_MARKDOWN,
  MAX_TITLE,
  MIN_CITATION_YEAR,
  isSafeImageUrl,
  type CapturedCitation,
  type CapturedPdf,
  type CapturePayload,
  type PdfProblem,
} from '../shared/protocol'

// 在用户当前打开的那个页面里运行，由 popup 在用户点击扩展图标后经
// chrome.scripting 注入（activeTab 只在那一次点击后授予该标签页的访问权）。
//
// 它只读取**已经渲染好的 DOM**：不发任何网络请求、不读 cookie、不碰任何站点凭证。
// 用户看得见什么，它就能拿到什么；看不见的（未登录、付费墙后）它同样拿不到。

/**
 * **`useAsync: false` 是「扩展不发网络请求」这条用户承诺的落点。**
 *
 * Defuddle 的 `useAsync` 默认为 true，其 full bundle 里有数十处 `fetch(`
 * （YouTube/Reddit/Bilibili 等站点的异步抽取器）。它们目前只经 `parseAsync()`
 * 到达，而这里调的是同步 `parse()` —— 但那只是**碰巧**为真：升级依赖、或有人为
 * 支持视频站抽取改用 `parseAsync()`，承诺就当场破了。显式关掉它，并由
 * `extract.test.ts` 断言这个选项，让这条承诺结构性成立而不是偶然成立。
 */
export const EXTRACT_OPTIONS = { markdown: true, useAsync: false } as const

/**
 * 后端的 `source_url` 不接受片段标识符（`contracts.py` 的 `"#" in value` 判定），
 * 而文档站锚点、GitHub/MDN、hash 路由 SPA 的地址都带 `#`。若原样带过去，用户会
 * 一路预填成功、直到点保存才被 422 拒绝，且确认页不提供网址编辑框 —— 无路可走。
 * 所以在提取端就去掉 fragment。
 *
 * 取舍已明示：存下的地址因此可能不等于采集时地址栏里的原文（少了 `#锚点`）。
 * 这是必要的 —— 后端契约本就不接受带 fragment 的 `source_url`，保留它只会让
 * 这份资料存不进去。
 */
export function normalizeSourceUrl(href: string): string {
  // **不截断。** 早先这里 `slice(0, MAX_URL)`，结果是超长网址被砍到 2048 之后
  // 仍然「https:// 开头、无空白、可解析、无凭据」——顺利通过 `isSafeSourceUrl`，
  // 于是那条「超长必拒」的规则在真实路径上永远不会触发，库里会存下一个点开
  // 打不开的截断地址。长度裁决交给校验，让它诚实失败（走 unusable 分支）。
  try {
    const url = new URL(href)
    url.hash = ''
    return url.href
  } catch {
    return href
  }
}

/**
 * 从产出的 Markdown 里认出图片地址。**只认这三种写法**，如实说明覆盖面：
 *
 * - `![alt](url)` 与 `![alt](url "title")`（行内式，Defuddle 的常规产出）
 * - `![alt](<url>)`（尖括号式，地址含空格或括号时使用）
 * - 残留的 `<img src="url">`（Defuddle 未转换的 HTML 片段）
 *
 * **不认引用式** `![alt][ref]` + `[ref]: url`：那要连带解析链接定义，而链接定义里
 * 大多是普通链接不是图片，认下去会把一堆非图片地址也当成图片去请求。用这种写法
 * 的页面，其图片会保留原站地址 —— 与「取不到」同一条降级路径，不产生新形态。
 *
 * 相对地址按页面地址解析为绝对地址；解析不了、或不是 http(s) 的（`data:`、`blob:`）
 * 一律丢弃。去重后按出现顺序截断到 MAX_IMAGES。
 */
export function collectImages(markdown: string, baseUrl: string): string[] {
  const found: string[] = []
  const push = (raw: string) => {
    const trimmed = raw.trim().replace(/^<|>$/g, '')
    if (!trimmed) return
    let absolute: string
    try {
      absolute = new URL(trimmed, baseUrl).href
    } catch {
      return
    }
    if (!isSafeImageUrl(absolute)) return
    if (!found.includes(absolute)) found.push(absolute)
  }
  // 行内式：`(` 之后到第一个空白或 `)` 之前的部分是地址，其后可跟 "title"。
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)/g)) {
    push(match[1] ?? '')
  }
  for (const match of markdown.matchAll(/<img\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi)) {
    push(match[1] ?? '')
  }
  return found.slice(0, MAX_IMAGES)
}

/**
 * 认出这一页声明的文献信息（TASK-075）。**只读这一页自己写在 `<meta>`/JSON-LD 里的东西**，
 * 不联网核对——本机应用不出网，这条承诺与 `useAsync: false` 同源。
 *
 * 取值顺序固定为「结构化的在前，含糊的在后」：`citation_*`（Google Scholar 那套 Highwire
 * 标签，学术站点几乎都有）→ `DC.*`（都柏林核心）→ JSON-LD 的 schema.org。
 *
 * **作者只认结构化来源。** Defuddle 也给一个 `author` 字符串，但那是「张三, 李四」还是
 * 「张三（某机构）」无从判断，拆错了比不填更糟——认不准就不猜，是这一块的总原则。
 */
function metaValues(doc: Document, name: string): string[] {
  const found: string[] = []
  // name 与 property 都要看：Highwire 用 name，OG/schema 系用 property。
  for (const node of doc.querySelectorAll('meta[name], meta[property]')) {
    const key = (node.getAttribute('name') ?? node.getAttribute('property') ?? '').toLowerCase()
    if (key !== name) continue
    const content = (node.getAttribute('content') ?? '').trim()
    if (content) found.push(content)
  }
  return found
}

/** 去空白、按上限截断；空串一律折成 null（「未知」只留一种写法）。 */
function bounded(value: string | undefined, max: number): string | null {
  const text = (value ?? '').trim()
  if (!text) return null
  return [...text].length > max ? [...text].slice(0, max).join('') : text
}

/** 页面里所有 JSON-LD 的 @type，小写。解析失败的块跳过，不因一处坏 JSON 放弃整页。 */
function schemaTypes(doc: Document): string[] {
  const types: string[] = []
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    const type = record['@type']
    if (typeof type === 'string') types.push(type.toLowerCase())
    if (Array.isArray(type))
      for (const item of type) if (typeof item === 'string') types.push(item.toLowerCase())
    if (Array.isArray(record['@graph'])) walk(record['@graph'])
  }
  for (const node of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      walk(JSON.parse(node.textContent ?? ''))
    } catch {
      // 坏 JSON 在真实网页上很常见，跳过它继续看下一块。
    }
  }
  return types
}

/**
 * 页面上出现的所有 DOI（去重）：指向 `doi.org` 的链接。
 *
 * arXiv 的 abs 页**不发 `citation_doi`**，但它在正文里放了一个
 * `<a id="arxiv-doi-link" href="https://doi.org/10.48550/arXiv.1706.03762">`——DOI 就写在
 * 页面上，只是不在 meta 里（2026-09-21 实测）。很多出版社页面也这么展示。读它既拿到了
 * 效果，又不必像 Zotero 那样按 `10.48550/arXiv.<id>` 的规律**代页面生成**一个它没说过的值。
 */
function doisFromLinks(doc: Document): string[] {
  const found = new Set<string>()
  for (const node of doc.querySelectorAll('a[href]')) {
    const href = node.getAttribute('href') ?? ''
    try {
      const link = new URL(href, doc.baseURI || 'https://example.invalid/')
      if (!/^(www\.|dx\.)?doi\.org$/i.test(link.hostname)) continue
      const target = decodeURIComponent(link.pathname.replace(/^\//, ''))
      if (target.startsWith('10.')) found.add(target)
    } catch {
      // 页面上的坏地址很常见，跳过它继续看下一个。
    }
  }
  return [...found]
}

/**
 * 这一页看起来是不是博客平台搭的。
 *
 * 照搬 Zotero `Embedded Metadata.js` 的启发式（`#wp-block-library-css`、
 * `.yoast-schema-graph`、`generator` 含 wordpress/blogger/wooframework）。它**不是**用来
 * 抬高门槛的，而是 Zotero 优先级链里「光有 citation_title 的猜测输给平台特征」那一环：
 * 只压制弱信号，有期刊名/DOI 这类强信号的页面不受影响——否则一个用 WordPress 搭的期刊站
 * 会被误伤。
 */
function looksLikeBlog(doc: Document): boolean {
  if (
    doc.getElementById('wp-block-library-css') ||
    doc.getElementById('wp-block-library-inline-css') ||
    doc.getElementsByClassName('yoast-schema-graph').length
  )
    return true
  return metaValues(doc, 'generator').some((value) => /wordpress|blogger|wooframework/i.test(value))
}

export function extractCitation(doc: Document, url: string): CapturedCitation | null {
  const first = (...names: string[]) => {
    for (const name of names) {
      const found = metaValues(doc, name)[0]
      if (found) return found
    }
    return undefined
  }
  const declaredDoi = first('citation_doi', 'dc.identifier.doi')
  const linkedDois = doisFromLinks(doc)
  // **不认 `dc.source`**：DC 规范里它常是站点名甚至一段网址，把它算成「期刊名」会让
  // 任何声明了 DC 的普通 CMS 页面被判成期刊论文、出处显示成一段地址。
  const inbook = first('citation_inbook_title', 'citation_book_title')
  const journal = first('citation_journal_title')
  const conference = first('citation_conference_title', 'citation_conference')
  // `citation_dissertation_institution` 是机构（可作出版方）；`citation_dissertation_name`
  // 是**论文名**，只能当类型信号——拿它填出版方会污染字段（第一轮 Review F4）。
  const thesisPlace = first('citation_dissertation_institution')
  const thesisName = first('citation_dissertation_name')
  const reportPlace = first('citation_technical_report_institution')
  const arxivId = first('citation_arxiv_id')
  const container = bounded(journal ?? conference ?? inbook, MAX_CITATION_CONTAINER)
  const types = schemaTypes(doc)
  const says = (...wanted: string[]) => wanted.some((type) => types.includes(type))

  // **门槛**（TASK-079，照 Zotero 的 Embedded Metadata 口径）：
  // 强信号——DOI、期刊/会议/书名、学位论文或报告的机构、schema.org 明说是论文书学位论文报告；
  // 弱信号——光有 `citation_title`。`citation_*` 是 Highwire 那套**专门发给 Google Scholar**
  // 的学术标签，所以它自己就是信号；上一版额外要求 DOI 或期刊名，直接把预印本挡在了门外
  // （arXiv 两样都不发，用户实测撞到）。弱信号遇上博客平台特征则不认。
  // 注意：**链接里的 DOI 不进这里**。它不是这一页自我声明的身份，见下方取值处的理由。
  const strong = Boolean(
    declaredDoi ||
    container ||
    thesisPlace ||
    thesisName ||
    reportPlace ||
    arxivId ||
    says('scholarlyarticle', 'book', 'thesis', 'report'),
  )
  const weak = Boolean(first('citation_title'))
  if (!strong && !(weak && !looksLikeBlog(doc))) return null

  // **链接里的 DOI 只在两条同时成立时才算这一页自己的**（第一轮 Review F1）：
  // ① 这一页已凭 meta 里的强信号被认定为文献——链接本身**不作**认定依据；
  // ② 整页只有唯一一个 DOI 链接。
  // 否则：维基条目、论文解读博客、期刊目录页的参考文献区里全是**别人的** DOI，取第一个
  // 就是把别人作品的编号写进这份资料；而确认页默认勾选、用户看一串编号根本分辨不出。
  // arXiv 靠的是 ① `citation_arxiv_id` 是强信号，② 它的 abs 页实测确实只有一个 DOI 链接。
  const doi = bounded(
    declaredDoi ?? (strong && linkedDois.length === 1 ? linkedDois[0] : undefined),
    MAX_CITATION_NAME,
  )

  const authors = metaValues(doc, 'citation_author')
    .concat(metaValues(doc, 'dc.creator'))
    .map((name) => bounded(name, MAX_CITATION_AUTHOR))
    .filter((name): name is string => name !== null)
    .slice(0, MAX_CITATION_AUTHORS)
  const stamp = first(
    'citation_publication_date',
    'citation_cover_date',
    'citation_date',
    'citation_online_date',
    'dc.date',
  )
  const year = Number((stamp ?? '').slice(0, 4))
  const firstPage = first('citation_firstpage')
  const lastPage = first('citation_lastpage')
  // 页面明说自己是什么，就按它说的算；都没说时才看手里的信号，最后才落到 OTHER。
  // 与 Zotero 的一处有意分歧：光有 `citation_title` 时它猜 journalArticle，我们判 OTHER——
  // 那个类型会直接显示在确认页的卡片上，猜错比留空更刺眼。
  const item_type: CapturedCitation['item_type'] = says('book')
    ? 'BOOK'
    : says('thesis') || thesisPlace || thesisName
      ? 'THESIS'
      : says('report') || reportPlace
        ? 'REPORT'
        : conference
          ? 'CONFERENCE_PAPER'
          : inbook && !journal
            ? 'BOOK_CHAPTER'
            : // 预印本：有 arXiv 标识或来自 arxiv 域名，且没有期刊名。有期刊名说明它已经
              // 正式发表，那就是期刊论文。
              //
              // **这一支必须独立于 `doi`**（第二轮 Review F6）：上一版把它挂在
              // `says(...) || journal || doi` 里面，于是「有 citation_arxiv_id 但没有可采纳
              // DOI」的页面会掉到 OTHER。最实际的例子正是本任务的目标页面族——arXiv 上带
              // "Related DOI" 的 abs 页有两条不同的 doi.org 链接，唯一性不成立、`doi` 为空，
              // 结果卡片显示「其他」。契约里写的「有 arxiv 标识即判预印本」也才真正成立。
              !journal && (arxivId || /(^|\.)arxiv\.org$/i.test(hostOf(url)))
              ? 'PREPRINT'
              : says('scholarlyarticle') || journal || doi
                ? 'JOURNAL_ARTICLE'
                : 'OTHER'
  return {
    item_type,
    authors,
    issued_year:
      Number.isSafeInteger(year) && year >= MIN_CITATION_YEAR && year <= MAX_CITATION_YEAR
        ? year
        : null,
    issued_date: bounded(stamp, MAX_CITATION_STAMP),
    container_title: container,
    volume: bounded(first('citation_volume'), MAX_CITATION_LOCATOR),
    issue: bounded(first('citation_issue'), MAX_CITATION_LOCATOR),
    pages: bounded(
      firstPage && lastPage ? `${firstPage}-${lastPage}` : (firstPage ?? lastPage),
      MAX_CITATION_LOCATOR,
    ),
    publisher: bounded(
      first('citation_publisher', 'dc.publisher') ?? thesisPlace ?? reportPlace,
      MAX_CITATION_NAME,
    ),
    doi,
    isbn: bounded(first('citation_isbn', 'dc.identifier.isbn'), MAX_CITATION_STAMP),
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/**
 * 把字节转成 base64。**分块**转：`String.fromCharCode(...bytes)` 在几 MB 的数组上会把
 * 调用栈撑爆（实测论文 0.7–6.5 MB，最大的那篇转出来 8.6 MB）。
 */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const CHUNK = 0x8000
  let binary = ''
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK))
  }
  return btoa(binary)
}

/**
 * PDF 下载自己的时限。
 *
 * **为什么非有不可**：`runCapture` 给整次采集的预算是 15 秒（`popup/capture.ts`），
 * 而 PDF 下载就跑在这段预算里。没有这道时限时，一份下得慢的 PDF 会把整次采集拖超时，
 * 用户得到的是「可能内容还没加载完」——**连网页正文都没存下**，恰好违背「拿不到 PDF
 * 就退回存正文」这条设计。超时就当作没拿到，照常退回快照。
 *
 * **20 秒是量出来的，不是拍的**：2026-09-21 在本机实测五篇论文，下载耗时
 * 772 / 1241 / 2520 / 3508 / **9243** ms（最后一个是 arXiv 的 `1706.03762`，2.11 MB）。
 * 先定的 10 秒会让这一篇经常性地擦边失败。20 秒留出约一倍余量；相应地
 * `popup/capture.ts` 的整次预算从 15 秒提到 30 秒——有 PDF 要下时，这一步是几 MB 的
 * 下载而不再只是读一次 DOM，按读 DOM 的尺子量它本身就不对。
 */
export const PDF_TIMEOUT_MS = 20_000

/**
 * 地址末段用作文件名前先看它说不说明问题：PLOS 的 PDF 地址是
 * `/plosone/article/file?id=…&type=printable`，末段是 `file`——照抄就会把每一篇
 * 都存成 `file.pdf`（真实站点实测发现）。这类通用词一律退回用标题。
 */
const USELESS_NAMES = new Set([
  'file',
  'files',
  'pdf',
  'download',
  'get',
  'view',
  'fetch',
  'full',
  'fulltext',
  'article',
  'content',
  'render',
  'print',
  'printable',
])

/** 只去掉真正会坏事的字符（路径分隔与控制字符，与契约 8.1 的后端口径一致），中文照留。 */
function safeName(raw: string): string {
  // 逐字符判而不用正则：控制字符写进正则会被 eslint 的 no-control-regex 拦下，
  // 而这里正是它说的那种例外——剔除控制字符本身就是目的。
  const cleaned = [...raw]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0
      if (code < 0x20 || code === 0x7f) return ''
      return '\\/:*?"<>|'.includes(ch) ? ' ' : ch
    })
    .join('')
  return capName(cleaned.replace(/\s+/g, ' ').trim(), 180)
}

/**
 * 截到至多 `max` 个 **UTF-16 单元**，且不把代理对劈成半个字符。
 *
 * 两头都要管住，所以不能只取其一（第二轮 Review 非阻断项①）：
 * - 按 UTF-16 直接 `slice` 会在 emoji／生僻字中间切断，留下一个孤立代理；
 * - 按码点 `[...s].slice(n)` 不会切断，但 n 个码点最多占 2n 个 UTF-16 单元，
 *   于是 `name.length ≤ 200` 那道协议校验可能被越过，整条载荷被接收端丢掉。
 */
function capName(raw: string, max: number): string {
  let out = ''
  for (const ch of raw) {
    if (out.length + ch.length > max) break
    out += ch
  }
  return out
}

/** 从地址取文件名；末段没有像样的名字（arXiv 的 `/pdf/1706.03762` 有，PLOS 的没有）就退回标题。 */
function pdfNameFor(target: URL, title: string): string {
  let last = target.pathname.split('/').filter(Boolean).pop() ?? ''
  try {
    last = decodeURIComponent(last)
  } catch {
    // 地址里有坏转义就用原样，不为一个文件名让整次采集失败。
  }
  const stem = last.replace(/\.pdf$/i, '')
  const fromPath = USELESS_NAMES.has(stem.toLowerCase()) ? '' : safeName(stem)
  const name = fromPath || safeName(title) || 'paper'
  return `${name}.pdf`
}

/**
 * 取这一页自己声明的 PDF（TASK-080）。
 *
 * **只取同源的那一份，且只在这一页已被认作文献时才取。** 同源 fetch 不需要任何 host
 * 权限——用户点扩展图标那一下授予的 `activeTab` 就够了，这是「点一次就把文献拿进来」
 * 的落点。跨源的 PDF 受 CORS 管，取不到，如实报 `cross-origin` 并退回存正文。
 *
 * **不带凭据**（`credentials: 'omit'`）：扩展对用户的承诺是「不接触任何网站账号」，
 * 所以需要登录才能下载的 PDF 这里拿不到，按 `failed` 退回存正文。这是有意的取舍。
 *
 * **不信服务器的 `Content-Type`**：付费墙常常回 200 加一页 HTML，所以自己看 `%PDF-`。
 */
export async function capturePdf(
  doc: Document,
  pageUrl: string,
  citation: CapturedCitation | null,
  title = '',
): Promise<{ pdf: CapturedPdf | null; problem: PdfProblem | null }> {
  // 不是文献就不抓：普通网页不该因为页面上有个 PDF 链接就被存成 PDF 资料。
  if (!citation) return { pdf: null, problem: null }
  const declared = metaValues(doc, 'citation_pdf_url')[0]
  // 没声明 PDF 不算问题，是这一页本来就没有。
  if (!declared) return { pdf: null, problem: null }
  let target: URL
  let origin: string
  try {
    target = new URL(declared, doc.baseURI || pageUrl)
    origin = new URL(pageUrl).origin
  } catch {
    return { pdf: null, problem: 'failed' }
  }
  if (target.origin !== origin) return { pdf: null, problem: 'cross-origin' }
  try {
    const response = await fetch(target.href, {
      credentials: 'omit',
      signal: AbortSignal.timeout(PDF_TIMEOUT_MS),
    })
    if (!response.ok) return { pdf: null, problem: 'failed' }
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > MAX_PDF_BYTES) return { pdf: null, problem: 'too-large' }
    if (buffer.byteLength < 5) return { pdf: null, problem: 'not-pdf' }
    const head = String.fromCharCode(...new Uint8Array(buffer.slice(0, 5)))
    if (head !== '%PDF-') return { pdf: null, problem: 'not-pdf' }
    return {
      pdf: {
        name: pdfNameFor(target, title || doc.title),
        bytes: buffer.byteLength,
        base64: toBase64(buffer),
      },
      problem: null,
    }
  } catch (cause) {
    // 超时与其它失败要分开说：前者「再试一次也许就成」，后者多半是付费墙——
    // 该怎么办完全不同，笼统一句「没拿到」等于把我们已经知道的信息丢掉。
    // 不写 `cause instanceof Error`：真实浏览器里 fetch 超时抛的是 `DOMException`
    // （`name === 'TimeoutError'`）。它的原型链确实经过 `Error.prototype`，所以 instanceof
    // 也成立——但那条链依赖 WebIDL 的实现细节，而这里只需要一个名字。防御性地读它，
    // 顺带兼容任何非 Error 的抛出物。（第四轮 Review F1。）
    const name = (cause as { name?: unknown } | null)?.name
    if (name === 'TimeoutError' || name === 'AbortError') return { pdf: null, problem: 'slow' }
    // 网络失败、CORS 被拒、被拦截器掐断都落这里：如实说没拿到，不猜原因。
    return { pdf: null, problem: 'failed' }
  }
}

export function extractFromDocument(doc: Document, url: string): CapturePayload {
  // markdown: true 让 Defuddle 直接把正文转成 Markdown 放进 content。
  //
  // 一处**非只读**的副作用，如实记在这里：`parse()` 在克隆前会对活文档做两处属性
  // 归一化（`_normalizeAttributes`、`_resolveNoscriptImages`）。所有删除与清理都发生
  // 在副本上、页面不会被掏空，但那两处改写确实落在用户的实页上，理论上可能让
  // React/Vue 页面出现一次图片跳变。文档里「只读取」的说法应按此理解。
  const parsed = new Defuddle(doc, { url, ...EXTRACT_OPTIONS }).parse()
  // 图片地址从**截断后**的正文里认，不是从原始产出里：正文被 MAX_MARKDOWN 砍掉的
  // 部分不会进快照，为那部分的图片申请权限、发请求、占本机空间都是白费。
  const markdown = (parsed.content ?? '').trim().slice(0, MAX_MARKDOWN)
  return {
    title: (parsed.title || doc.title || '').trim().slice(0, MAX_TITLE),
    url: normalizeSourceUrl(url),
    markdown,
    images: collectImages(markdown, url),
    citation: extractCitation(doc, url),
  }
}

// 注入运行时才发消息；被单测 import 时（无 chrome）跳过。
if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  // popup 失焦即关闭。用户点了采集后立刻点向别处时，唯一的接收端已经消失，
  // sendMessage 会 reject —— 那是正常时序，不该在用户页面留下未处理的 rejection。
  // 这一次采集就此静默作废（没有数据外流），用户再点一次即可。
  void (async () => {
    const payload = extractFromDocument(document, location.href)
    // PDF 在这里取：与页面同源运行，`activeTab` 已够用，不必再向用户要权限。
    const { pdf, problem } = await capturePdf(
      document,
      location.href,
      payload.citation ?? null,
      payload.title,
    )
    await chrome.runtime
      .sendMessage({ type: CAPTURE_EXTRACTED, payload: { ...payload, pdf, pdf_problem: problem } })
      .catch(() => undefined)
  })()
}
