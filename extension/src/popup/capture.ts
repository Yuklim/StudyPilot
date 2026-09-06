import { CAPTURE_EXTRACTED, isCapturePayload, type CapturePayload } from '../shared/protocol'

// 采集流程的编排逻辑，与 chrome API 解耦，便于在没有浏览器的环境里真实测试。
// 真实接线见 ./bridge.ts。

export interface CaptureBridge {
  /** 用户点击时所在的标签页。 */
  activeTabId(): Promise<number | undefined>
  /** 订阅注入脚本回传的提取结果；返回取消订阅函数。 */
  onExtracted(handler: (payload: unknown) => void): () => void
  /** 把提取脚本注入该标签页（依赖 activeTab，在用户点击后才有权限）。 */
  inject(tabId: number): Promise<void>
  /** 暂存待交付内容，供中转脚本在 UI 页面就绪后取走。 */
  stash(payload: CapturePayload): Promise<void>
  /** 打开本机 UI 的确认页。 */
  openConfirmPage(): Promise<void>
}

export type CaptureOutcome =
  | { ok: true; payload: CapturePayload }
  | { ok: false; reason: 'no-tab' | 'inject-failed' | 'timeout' | 'unusable' }

/**
 * 顺序是有讲究的：**先订阅再注入**。注入脚本一跑完就发消息，晚订阅会丢结果。
 * 全程不写入任何数据——写入只发生在用户在确认页点确认之后。
 */
export async function runCapture(
  bridge: CaptureBridge,
  timeoutMs = 15_000,
): Promise<CaptureOutcome> {
  const tabId = await bridge.activeTabId()
  if (tabId === undefined) return { ok: false, reason: 'no-tab' }

  let settle: ((value: unknown) => void) | undefined
  const extracted = new Promise<unknown>((resolve) => {
    settle = resolve
  })
  const unsubscribe = bridge.onExtracted((payload) => settle?.(payload))

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    try {
      await bridge.inject(tabId)
    } catch {
      // 常见且正常：chrome:// 页面、扩展商店、PDF 阅读器都拒绝注入。
      return { ok: false, reason: 'inject-failed' }
    }

    const timeout = Symbol('timeout')
    const raced = await Promise.race([
      extracted,
      new Promise<typeof timeout>((resolve) => {
        timer = setTimeout(() => resolve(timeout), timeoutMs)
      }),
    ])
    if (raced === timeout) return { ok: false, reason: 'timeout' }
    // 提取到的可能是空正文（例如纯图片页），那不值得开确认页。
    if (!isCapturePayload(raced)) return { ok: false, reason: 'unusable' }

    await bridge.stash(raced)
    await bridge.openConfirmPage()
    return { ok: true, payload: raced }
  } finally {
    unsubscribe()
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** 注入脚本回传的信封；只认自己的消息类型。 */
export function extractedPayload(message: unknown): unknown {
  const envelope = message as { type?: unknown; payload?: unknown } | null
  return envelope?.type === CAPTURE_EXTRACTED ? envelope.payload : undefined
}
