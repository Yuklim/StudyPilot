/**
 * PDF 的阅读位置记忆（TASK-073）：**只在本机、只记位置**，不写学习进度。
 *
 * 与网页正文那套（`readerPosition.ts`）分开是因为锚点不同：网页记的是「文档顶起算的像素
 * 与百分比」，PDF 记的是**第几页 + 页内比例**——PDF 的页高随缩放变化，像素值换个缩放就没
 * 意义了，页码不会。指纹用的是**原件行的 id**（见下）：换了一份文件，旧位置对它没有意义。
 *
 * 所有 `localStorage` 读写都包在 try/catch 里：隐私模式或禁用站点数据时访问器本身会抛。
 */

export type PdfPosition = {
  /** 第几页，从 1 起。 */
  page: number
  /**
   * 页内比例（0–1）：**视口中线**落在这一页的什么位置。用中线而不是顶边，是因为短文档
   * 滚到底时末页顶部仍在视口顶之下，按顶边判会一直停在上一页（见 `locatePage`）。
   */
  ratio: number
  /**
   * 原件指纹：用原件行的 id。契约里 FILE 资料的原件**不可更换**（TASK-020），所以同一份
   * 资料的 id 是稳定的；真要换成另一份文件只能新建资料，那时 id 不同、旧位置自然不恢复。
   */
  fingerprint: string
  savedAt: string
}

const PREFIX = 'studypilot.pdf.position.'

export function pdfPositionKey(resourceId: string): string {
  return PREFIX + resourceId
}

export function readPdfPosition(resourceId: string): PdfPosition | null {
  try {
    const raw = localStorage.getItem(pdfPositionKey(resourceId))
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const record = value as Record<string, unknown>
    const { page, ratio, fingerprint, savedAt } = record
    if (
      typeof page !== 'number' ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      typeof ratio !== 'number' ||
      !Number.isFinite(ratio) ||
      ratio < 0 ||
      ratio > 1 ||
      typeof fingerprint !== 'string' ||
      !fingerprint ||
      typeof savedAt !== 'string'
    )
      return null
    return { page, ratio, fingerprint, savedAt }
  } catch {
    return null
  }
}

export function writePdfPosition(resourceId: string, position: Omit<PdfPosition, 'savedAt'>): void {
  try {
    localStorage.setItem(
      pdfPositionKey(resourceId),
      JSON.stringify({ ...position, savedAt: new Date().toISOString() }),
    )
  } catch {
    // 存不下只影响下次打开。
  }
}

export function clearPdfPosition(resourceId: string): void {
  try {
    localStorage.removeItem(pdfPositionKey(resourceId))
  } catch {
    // 同上。
  }
}

/**
 * 从「每页的顶部偏移 + 页高」和当前滚动位置算出落在第几页、页内多少。
 * `tops[i]` 是第 i+1 页顶部相对滚动容器内容顶的偏移，`heights[i]` 是该页的高。
 *
 * **以视口中线为准，不是视口顶。** 按顶边判会在短文档上出错：一份两页的 PDF 滚到底时，
 * 末页的顶部仍在视口顶之下——容器根本滚不了那么多，于是「跳到第 2 页」之后页码显示的还是
 * 第 1 页（e2e 实测抓到）。中线落在哪一页，人就在读哪一页，这个判据在任何文档长度下都成立。
 * `viewport` 传 0 时退回按顶边判（纯函数用例里方便直接给坐标）。
 */
export function locatePage(
  scrollTop: number,
  tops: number[],
  heights: number[],
  viewport = 0,
): { page: number; ratio: number } {
  if (!tops.length) return { page: 1, ratio: 0 }
  const anchor = scrollTop + viewport / 2
  let index = 0
  for (let at = 0; at < tops.length; at += 1) {
    if (anchor >= tops[at]!) index = at
    else break
  }
  const height = heights[index] ?? 0
  const ratio = height > 0 ? Math.min(1, Math.max(0, (anchor - tops[index]!) / height)) : 0
  return { page: index + 1, ratio }
}

/**
 * 反过来：要让第 `page` 页的 `ratio` 处回到视口中线，滚动容器该滚到哪。
 * 负值夹回 0；滚不到那么远时浏览器自己会夹在底部，落点仍是最接近的位置。
 */
export function scrollTopFor(
  position: { page: number; ratio: number },
  tops: number[],
  heights: number[],
  viewport = 0,
): number {
  if (!tops.length) return 0
  const index = Math.min(Math.max(position.page - 1, 0), tops.length - 1)
  const anchor = tops[index]! + (heights[index] ?? 0) * position.ratio
  return Math.max(0, anchor - viewport / 2)
}
