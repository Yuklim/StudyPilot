import { EXTRACT_SCRIPT } from '../manifest'
import { CAPTURE_URL, CONFIRM_TAB_KEY, PENDING_KEY, type CapturePayload } from '../shared/protocol'

import { extractedPayload, type CaptureBridge } from './capture'

/** 把 runCapture 的抽象接口接到真实的 chrome API 上。 */
export function chromeBridge(): CaptureBridge {
  return {
    async activeTabId() {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      return tab?.id
    },
    onExtracted(handler) {
      const listener = (message: unknown) => {
        const payload = extractedPayload(message)
        if (payload !== undefined) handler(payload)
      }
      chrome.runtime.onMessage.addListener(listener)
      return () => chrome.runtime.onMessage.removeListener(listener)
    },
    async inject(tabId: number) {
      await chrome.scripting.executeScript({ target: { tabId }, files: [EXTRACT_SCRIPT] })
    },
    async stash(payload: CapturePayload) {
      await chrome.storage.local.set({ [PENDING_KEY]: payload })
    },
    async openConfirmPage() {
      // 复用上次开过的那个确认页，而不是每次新开一个（TASK-038 遗留 A2）。
      //
      // **零新增权限**：`chrome.tabs.update` 对一个已知 id 不需要 `tabs` 权限 ——
      // 需要它的是读取标签页的 url/title，而这里两样都不读。用 `tabs.query({url})`
      // 去找已开的页面才需要那个权限，所以不用那条路。
      const stored = await chrome.storage.local.get(CONFIRM_TAB_KEY)
      const previous = stored[CONFIRM_TAB_KEY]
      if (typeof previous === 'number') {
        try {
          await chrome.tabs.update(previous, { url: CAPTURE_URL, active: true })
          return
        } catch {
          // 标签页已被关掉：id 失效是正常情况，不是错误，回落到新开一个。
        }
      }
      const tab = await chrome.tabs.create({ url: CAPTURE_URL })
      if (typeof tab.id === 'number') {
        await chrome.storage.local.set({ [CONFIRM_TAB_KEY]: tab.id })
      }
    },
    async requestImageAccess(origins: string[]) {
      // 必须在用户手势内调用，调用点是 popup 上「一并保存」那一下点击。
      // 只请求这批图片实际涉及的源，不请求 `<all_urls>`。
      if (origins.length === 0) return false
      return chrome.permissions.request({ origins })
    },
  }
}
