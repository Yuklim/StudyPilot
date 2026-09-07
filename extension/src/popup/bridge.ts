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
      // **必须用 `storage.session` 而不是 `storage.local`**：tab id 只在**单次浏览器会话内**
      // 唯一，重启后会从低位重新分配。存进 local（跨重启持久）的话，重启后第一次采集
      // 可能把一个恰好占用同一 id 的**无关标签页**导航到确认页，用户在那里没保存的
      // 输入就没了 —— 而 `catch` 只挡得住「id 无效」，挡不住「id 有效但不是我的」。
      // session 区随浏览器关闭清空，从根上消除这个窗口；它属既有 `storage` 权限。
      //
      // **零新增权限**：`chrome.tabs.update` 对一个已知 id 不需要 `tabs` 权限 ——
      // 需要它的是读取标签页的 url/title，而这里两样都不读。用 `tabs.query({url})`
      // 去找已开的页面才需要那个权限，所以不用那条路。
      const stored = await chrome.storage.session.get(CONFIRM_TAB_KEY)
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
        await chrome.storage.session.set({ [CONFIRM_TAB_KEY]: tab.id })
      }
    },
    async requestImageAccess(origins: string[]) {
      // 必须在用户手势内调用，调用点是 popup 上「一并保存」那一下点击。
      // 只请求这批图片实际涉及的源，不请求 `<all_urls>`。
      if (origins.length === 0) return false
      const requested = await chrome.permissions.request({ origins })
      // **复核一次，不信 request 的返回值。** 浏览器可能在弹框时关掉 popup、
      // 也可能因为别的原因让授权没有真正落地；只看返回值就会把「以为授权了」
      // 一路带到页面，最后表现为「图片一张都没存下」而没人知道为什么。
      if (!requested) return false
      return chrome.permissions.contains({ origins })
    },
  }
}
