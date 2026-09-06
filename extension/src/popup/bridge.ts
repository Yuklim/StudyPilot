import { EXTRACT_SCRIPT } from '../manifest'
import { CAPTURE_URL, PENDING_KEY, type CapturePayload } from '../shared/protocol'

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
      await chrome.tabs.create({ url: CAPTURE_URL })
    },
  }
}
