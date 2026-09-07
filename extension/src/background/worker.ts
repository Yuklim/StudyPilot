import { FETCH_IMAGE, MAX_IMAGE_BYTES, isSafeImageUrl } from '../shared/protocol'

// 扩展**唯一**会主动发出网络请求的地方，也是它第一次需要 background 上下文。
//
// 为什么非要 service worker：MV3 下内容脚本的跨源请求受 CORS 管，而正文图片绝大多数
// 挂在与文章不同源的图床上、这些图床不发 CORS 头。持有 host 权限的 service worker
// 不受此限 —— 这正是「只有浏览器扩展能可靠取回图片字节」那句话的具体含义
// （见 docs/contracts/API与数据契约基线.md §4.13）。
//
// **它的职责被限死为一件事**：收到取图请求 → 取字节 → 回传。它不注册别的监听、
// 不常驻状态、不主动发起任何请求、不写存储。`worker.test.ts` 断言这一点。

export const IMAGE_TIMEOUT_MS = 20_000

export type FetchImageResult =
  | { ok: true; base64: string; mediaType: string }
  | { ok: false; reason: 'unsafe-url' | 'no-permission' | 'http-error' | 'too-large' | 'failed' }

/** 把字节转成 base64。扩展消息通道会 JSON 序列化载荷，ArrayBuffer 过不去。 */
export function toBase64(bytes: Uint8Array): string {
  // 分块喂给 fromCharCode：整段展开会在大图上撑爆参数栈。
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

/**
 * 取一张图片的字节。**每一个选项都是安全决定，逐条说明：**
 *
 * - `credentials: 'omit'`：不带任何站点凭证。登录墙后的图片因此取不到，退化为
 *   保留原站地址 —— 这是 TASK-036 定下的「凭证始终由浏览器持有」的直接后果，
 *   不是缺陷。
 * - `redirect: 'follow'` 但重定向后的最终地址仍须过 `isSafeImageUrl`：图床普遍
 *   用重定向，禁掉会取不到大量正常图片；而只校验初始地址等于没校验。
 * - **边读边计数，超过上限立即中止**：不先读完再判断，否则一张恶意的巨图能在
 *   判断发生之前就把内存吃光。
 * - 超时上限：卡住的连接不能让这次采集永远悬着。
 */
export async function fetchImage(
  url: string,
  deps: {
    fetch: typeof fetch
    timeoutMs?: number
    hasPermission?: (origin: string) => Promise<boolean>
  } = { fetch: globalThis.fetch },
): Promise<FetchImageResult> {
  if (!isSafeImageUrl(url)) return { ok: false, reason: 'unsafe-url' }
  // 先问权限，再发请求。**这一步是为了让失败可归因**：没有权限时 fetch 会以一个
  // 普通的网络错误告终，与「站点拒绝」「网络不通」混在一起，用户看到的只是「没存下」。
  // 分出 `no-permission` 之后，界面能直接告诉用户去授权，而不是让人猜。
  // 匹配模式用拼接而不是写成一个字面量：`boundaries.test.ts` 的注释剥离器是朴素正则，
  // 源码里出现「斜杠加星号」这两个字符（哪怕在字符串或注释里）都会被它当成块注释起始，
  // 从而把本文件其余部分整段吃掉，让那几条边界扫描静默地变成空扫。
  // `boundaries.test.ts` 里那条「剥离后至少保留三成非空行」的断言就是为这件事加的。
  const permitted = await (deps.hasPermission ?? granted)(new URL(url).origin + '/' + '*')
  if (!permitted) return { ok: false, reason: 'no-permission' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? IMAGE_TIMEOUT_MS)
  try {
    const response = await deps.fetch(url, {
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, reason: 'http-error' }
    if (!isSafeImageUrl(response.url || url)) return { ok: false, reason: 'unsafe-url' }
    // Content-Length 只是声明，可能缺失或撒谎；用它做早退，真正的裁决在下面逐块计数。
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
      return { ok: false, reason: 'too-large' }
    }
    const bytes = await readBounded(response)
    if (bytes === null) return { ok: false, reason: 'too-large' }
    return {
      ok: true,
      base64: toBase64(bytes),
      // 只作参考：后端按字节魔数自行判定，不采信这个声明（契约 §4.14）。
      mediaType: (response.headers.get('content-type') ?? '').split(';', 1)[0]?.trim() ?? '',
    }
  } catch {
    // 权限未授予、网络失败、超时、被中止，一律归为「这张没取到」，不追问原因：
    // 对调用方而言处置完全相同，而区分它们需要把站点的错误细节带回本机。
    return { ok: false, reason: 'failed' }
  } finally {
    clearTimeout(timer)
  }
}

/** 逐块读取，累计超过上限即中止并返回 null。 */
async function readBounded(response: Response): Promise<Uint8Array | null> {
  const reader = response.body?.getReader()
  if (!reader) {
    const buffer = new Uint8Array(await response.arrayBuffer())
    return buffer.length > MAX_IMAGE_BYTES ? null : buffer
  }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.length
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged
}

/** 这一个源是否已被授权。未授权时不发请求，直接如实回报。 */
async function granted(origin: string): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions) return true
  try {
    return await chrome.permissions.contains({ origins: [origin] })
  } catch {
    // 查不了就别拦着：让 fetch 去试，失败仍会被归为 failed。
    return true
  }
}

/** 消息处理。返回 true 表示会异步回复（chrome 的约定）。 */
export function imageHandler(
  send: (url: string) => Promise<FetchImageResult>,
): (message: unknown, sender: unknown, respond: (result: FetchImageResult) => void) => boolean {
  return (message, _sender, respond) => {
    const envelope = message as { type?: unknown; url?: unknown } | null
    if (envelope?.type !== FETCH_IMAGE || typeof envelope.url !== 'string') return false
    send(envelope.url).then(respond, () => respond({ ok: false, reason: 'failed' }))
    return true
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  chrome.runtime.onMessage.addListener(imageHandler((url) => fetchImage(url)))
}
