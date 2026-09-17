/**
 * 阅读位置记忆（TASK-067）：**只在本机、只记位置**。
 *
 * 用户 2026-09-17 要求「下一次看的时候默认从上次结束位置开始」。位置存 `localStorage`，
 * 键含资料 id；值里带一个正文指纹（渲染后的文本长度），正文被替换后指纹对不上就不恢复
 * ——旧位置对新正文没有意义，跳到一个无关的地方比从头开始更糟。
 *
 * **不写学习进度。** 契约里的进度只由学习记录推进（时长、小结、状态前后）；滚动到 60%
 * 不等于学到 60%。用户选定的是「一键写入」（TASK-068）：阅读器提示上次读到哪，写不写
 * 进学习进度由用户点一下决定。
 *
 * 所有 `localStorage` 读写都包在 try/catch 里：隐私模式或禁用站点数据时访问器本身会抛。
 */

export type ReaderPosition = {
  /** 视口顶到文档顶的像素距离。 */
  top: number
  /** 视口顶在正文里的百分比（0–100，整数），用于提示「上次读到 62%」。 */
  percent: number
  /** 正文指纹：渲染后 `textContent.length`。 */
  fingerprint: number
  savedAt: string
}

const PREFIX = 'studypilot.reader.position.'

export function positionKey(resourceId: string): string {
  return PREFIX + resourceId
}

export function readPosition(resourceId: string): ReaderPosition | null {
  try {
    const raw = localStorage.getItem(positionKey(resourceId))
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const record = value as Record<string, unknown>
    const top = record.top
    const percent = record.percent
    const fingerprint = record.fingerprint
    const savedAt = record.savedAt
    if (
      typeof top !== 'number' ||
      !Number.isFinite(top) ||
      top < 0 ||
      typeof percent !== 'number' ||
      !Number.isInteger(percent) ||
      percent < 0 ||
      percent > 100 ||
      typeof fingerprint !== 'number' ||
      !Number.isInteger(fingerprint) ||
      typeof savedAt !== 'string'
    ) {
      return null
    }
    return { top, percent, fingerprint, savedAt }
  } catch {
    return null
  }
}

export function writePosition(resourceId: string, position: ReaderPosition): void {
  try {
    localStorage.setItem(positionKey(resourceId), JSON.stringify(position))
  } catch {
    // 存不下只影响下次打开，不影响本次阅读。
  }
}

export function clearPosition(resourceId: string): void {
  try {
    localStorage.removeItem(positionKey(resourceId))
  } catch {
    // 同上。
  }
}

/** 正文指纹：渲染后的文本长度。换了正文（替换/删除/重抓）长度几乎必变。 */
export function fingerprintOf(rendered: Element | null): number {
  return rendered?.textContent?.length ?? 0
}

/**
 * 视口顶相对正文的阅读百分比。正文顶之前算 0，正文底之后算 100；
 * 视口高度计入分母，滚到底时是 100 而不是「视口顶到了底」的 100 − 一屏。
 */
export function percentOf(rendered: Element, scrollTop: number, viewport: number): number {
  const rect = rendered.getBoundingClientRect()
  const start = rect.top + scrollTop
  const total = rect.height - viewport
  if (total <= 0) return 100
  const read = scrollTop - start
  return Math.max(0, Math.min(100, Math.round((read / total) * 100)))
}
