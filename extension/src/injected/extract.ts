import Defuddle from 'defuddle/full'

import {
  CAPTURE_EXTRACTED,
  MAX_IMAGES,
  MAX_MARKDOWN,
  MAX_TITLE,
  isSafeImageUrl,
  type CapturePayload,
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
  }
}

// 注入运行时才发消息；被单测 import 时（无 chrome）跳过。
if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  // popup 失焦即关闭。用户点了采集后立刻点向别处时，唯一的接收端已经消失，
  // sendMessage 会 reject —— 那是正常时序，不该在用户页面留下未处理的 rejection。
  // 这一次采集就此静默作废（没有数据外流），用户再点一次即可。
  chrome.runtime
    .sendMessage({
      type: CAPTURE_EXTRACTED,
      payload: extractFromDocument(document, location.href),
    })
    .catch(() => undefined)
}
