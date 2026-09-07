import {
  CAPTURE_IMAGE_REQUEST,
  CAPTURE_IMAGE_RESULT,
  CAPTURE_PAYLOAD,
  CAPTURE_READY,
  FETCH_IMAGE,
  PENDING_KEY,
  isCapturePayload,
} from '../shared/protocol'

// 只在本机 UI 源上运行的中转脚本（manifest 的 content_scripts 只匹配那一个源）。
//
// 采用「页面先说就绪、再交付」的握手，而不是页面一加载就推：内容脚本在
// document_idle 运行，而 React 何时挂载并不确定，先推会丢消息。
//
// TASK-040 起它多一件事：**按页面的逐张请求，代为向 service worker 要图片字节**。
// 页面自己取不到 —— 它是 UI 源上的普通页面，跨源请求受 CORS 管。

/**
 * 本次交付过的图片地址。**这是这条新链路的信任边界。**
 *
 * 中转脚本运行在本机 UI 源上，而该源上的任何脚本都能向本窗口 postMessage。若不
 * 限定范围，一段注入到 UI 页面的脚本就能让扩展代它去请求任意地址、并把响应字节
 * 交回来 —— 那等于把扩展当成一个绕过 CORS 的通用代理。因此只服务**本次采集载荷
 * 里带来的那些地址**，别的一律不理。
 */
export function relayHandler(
  win: Window,
  storage: chrome.storage.StorageArea,
  ask: (url: string) => Promise<unknown> = (url) =>
    chrome.runtime.sendMessage({ type: FETCH_IMAGE, url }),
) {
  let allowed: ReadonlySet<string> = new Set()

  return async (event: MessageEvent) => {
    // 只接受本页面自己发出的就绪信号。跨源 opener/iframe 发来的消息
    // event.source 不会等于 win，直接丢弃。
    if (event.source !== win) return
    if (event.origin !== win.location.origin) return
    const type = (event.data as { type?: unknown } | null)?.type

    if (type === CAPTURE_READY) {
      const stored = await storage.get(PENDING_KEY)
      const payload = stored[PENDING_KEY]
      // 用后即删：一次采集只交付一次，页面刷新不会重复预填。
      await storage.remove(PENDING_KEY)
      if (!isCapturePayload(payload)) return
      allowed = new Set(payload.images)
      win.postMessage({ type: CAPTURE_PAYLOAD, payload }, win.location.origin)
      return
    }

    if (type === CAPTURE_IMAGE_REQUEST) {
      const url = (event.data as { url?: unknown }).url
      if (typeof url !== 'string') return
      // 不在本次载荷里的地址：不请求、不报错细节，只回一个失败，页面据此保留原链接。
      if (!allowed.has(url)) {
        win.postMessage(
          { type: CAPTURE_IMAGE_RESULT, url, result: { ok: false, reason: 'not-offered' } },
          win.location.origin,
        )
        return
      }
      let result: unknown
      try {
        result = await ask(url)
      } catch {
        // **与 worker 自己报的失败分开**：这里代表「问不到 service worker」——
        // 它没被唤醒、扩展刚被重载、或消息过大而丢失。归进同一个桶的话，
        // 「扩展没答话」和「图片取不到」在界面上会长得一模一样。
        result = { ok: false, reason: 'no-worker' }
      }
      win.postMessage({ type: CAPTURE_IMAGE_RESULT, url, result }, win.location.origin)
    }
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  window.addEventListener('message', relayHandler(window, chrome.storage.local))
}
