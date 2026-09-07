import { CAPTURE_PAYLOAD, CAPTURE_READY, PENDING_KEY, isCapturePayload } from '../shared/protocol'

// 只在本机 UI 源上运行的中转脚本（manifest 的 content_scripts 只匹配那一个源）。
//
// 采用「页面先说就绪、再交付」的握手，而不是页面一加载就推：内容脚本在
// document_idle 运行，而 React 何时挂载并不确定，先推会丢消息。

export function relayHandler(win: Window, storage: chrome.storage.StorageArea) {
  return async (event: MessageEvent) => {
    // 只接受本页面自己发出的就绪信号。跨源 opener/iframe 发来的消息
    // event.source 不会等于 win，直接丢弃。
    if (event.source !== win) return
    if (event.origin !== win.location.origin) return
    if ((event.data as { type?: unknown } | null)?.type !== CAPTURE_READY) return

    const stored = await storage.get(PENDING_KEY)
    const payload = stored[PENDING_KEY]
    // 用后即删：一次采集只交付一次，页面刷新不会重复预填。
    await storage.remove(PENDING_KEY)
    if (!isCapturePayload(payload)) return
    win.postMessage({ type: CAPTURE_PAYLOAD, payload }, win.location.origin)
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  window.addEventListener('message', relayHandler(window, chrome.storage.local))
}
