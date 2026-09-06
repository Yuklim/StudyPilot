import Defuddle from 'defuddle/full'

import {
  CAPTURE_EXTRACTED,
  MAX_MARKDOWN,
  MAX_TITLE,
  MAX_URL,
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
  try {
    const url = new URL(href)
    url.hash = ''
    return url.href.slice(0, MAX_URL)
  } catch {
    return href.slice(0, MAX_URL)
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
  return {
    title: (parsed.title || doc.title || '').trim().slice(0, MAX_TITLE),
    url: normalizeSourceUrl(url),
    markdown: (parsed.content ?? '').trim().slice(0, MAX_MARKDOWN),
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
