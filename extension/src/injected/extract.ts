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

export function extractFromDocument(doc: Document, url: string): CapturePayload {
  // markdown: true 让 Defuddle 直接把正文转成 Markdown 放进 content。
  const parsed = new Defuddle(doc, { url, markdown: true }).parse()
  return {
    title: (parsed.title || doc.title || '').trim().slice(0, MAX_TITLE),
    url: url.slice(0, MAX_URL),
    markdown: (parsed.content ?? '').trim().slice(0, MAX_MARKDOWN),
  }
}

// 注入运行时才发消息；被单测 import 时（无 chrome）跳过。
if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  chrome.runtime.sendMessage({
    type: CAPTURE_EXTRACTED,
    payload: extractFromDocument(document, location.href),
  })
}
