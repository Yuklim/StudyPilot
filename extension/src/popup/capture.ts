import {
  CAPTURE_EXTRACTED,
  isCapturePayload,
  isSafeSourceUrl,
  type CapturePayload,
} from '../shared/protocol'

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
  /** 打开本机 UI 的确认页；能复用上次那个就复用，不再新开一个。 */
  openConfirmPage(): Promise<void>
  /**
   * 请求取图所需的站点权限。**必须在用户手势里调用** —— 这就是采集要分两步的原因：
   * 提取是异步的，`await` 会消耗掉第一次点击的手势，所以请求只能发生在第二次点击里。
   *
   * 传入的是**这次真正要访问的那几个源**，不是 `<all_urls>`：一篇文章的图片通常只挂在
   * 一两个图床上，按源请求让授权框说的就是实际要做的事，用户也更容易同意。
   * manifest 里仍写 `optional_host_permissions: ["<all_urls>"]` —— 那是「允许在运行时
   * 请求任意源」的前提，不等于安装时持有任何源。
   */
  requestImageAccess(origins: string[]): Promise<boolean>
}

export type CaptureOutcome =
  | { ok: true; payload: CapturePayload }
  | { ok: false; reason: 'no-tab' | 'inject-failed' | 'timeout' | 'unusable' | 'unusable-url' }

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
    if (!isCapturePayload(raced)) {
      // 区分「正文没提取出来」和「正文好好的、但这个网址后端存不了」：
      // 后者对用户是完全不同的情况，一句「没能提取出正文」会把人指向错误的方向。
      const candidate = raced as { url?: unknown; markdown?: unknown } | null
      const badUrl =
        typeof candidate?.markdown === 'string' &&
        candidate.markdown.trim().length > 0 &&
        (typeof candidate.url !== 'string' || !isSafeSourceUrl(candidate.url))
      return { ok: false, reason: badUrl ? 'unusable-url' : 'unusable' }
    }

    return { ok: true, payload: raced }
  } finally {
    unsubscribe()
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * 第二步：把内容交给确认页。
 *
 * `withImages` 为 false 时把图片清单**清空后**再暂存 —— 用户选了「只存正文」，
 * 那么连地址清单都不该跟过去：留着它，页面就会去逐张请求，而那正是用户拒绝的事。
 *
 * 权限请求放在这里而不是 `runCapture` 里，是因为它必须在用户手势内发生（见
 * `CaptureBridge.requestImageAccess`）。请求被拒不阻断交付：正文照存，图片保留原站
 * 地址 —— 与「取不到」同一条降级路径。
 */
export async function deliverCapture(
  bridge: CaptureBridge,
  payload: CapturePayload,
  withImages: boolean,
): Promise<{ images: number; refused: boolean }> {
  const images = withImages ? payload.images : []
  // **先暂存，再请求权限。** 浏览器在弹出权限框时可能把 popup 关掉，那一刻这段代码
  // 连同它后面的一切都消失。原来的顺序（先请求、后暂存）会让整篇正文一起丢掉，
  // 用户看到的就是「点了没反应」。先落盘之后，最坏情况也只是这次没开确认页，
  // 内容还在，再点一次扩展即可。
  await bridge.stash({ ...payload, images })
  let granted = true
  if (images.length > 0) {
    granted = await bridge.requestImageAccess(originsOf(images))
    // 用户拒绝就把清单清掉：留着它，页面会去逐张请求，而那正是用户拒绝的事。
    if (!granted) await bridge.stash({ ...payload, images: [] })
  }
  await bridge.openConfirmPage()
  return { images: granted ? images.length : 0, refused: images.length > 0 && !granted }
}

/** 这批图片实际涉及的源，去重后作为权限请求的范围。 */
export function originsOf(images: readonly string[]): string[] {
  const origins = new Set<string>()
  for (const image of images) {
    try {
      origins.add(new URL(image).origin + '/*')
    } catch {
      // 不可解析的地址在提取端已被滤掉；这里只是不让它带崩整批请求。
    }
  }
  return [...origins]
}

/** 注入脚本回传的信封；只认自己的消息类型。 */
export function extractedPayload(message: unknown): unknown {
  const envelope = message as { type?: unknown; payload?: unknown } | null
  return envelope?.type === CAPTURE_EXTRACTED ? envelope.payload : undefined
}
