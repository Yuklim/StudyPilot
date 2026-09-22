/**
 * PDF 的目录（TASK-088）：从 pdf.js 的**书签大纲**（`/Outlines`）读，不是从文字层猜标题。
 *
 * 网页正文的目录是 `h2/h3`（见 `outline.ts`）；PDF 没有标题层级这回事，能用的是作者在导出时
 * 写进文件的书签。LaTeX/hyperref 导出的论文基本都有，扫描件基本没有——**没有就不显示左栏**
 * （用户 2026-09-21 选定，与网页正文里没有 h2/h3 时一致）。
 *
 * 书签指向的是一个「目标」（destination）：可能是具名的（字符串，要再查一次），也可能是
 * 显式数组，数组第一项是页引用。把它解析成页码要走 `getDestination` → `getPageIndex`。
 * **任何一步失败就丢掉这一条**，不显示半个坏目录。
 */

export type PdfBookmark = {
  key: string
  /** 只分两层，与网页目录的 h2/h3 共用同一套样式。 */
  level: 2 | 3
  text: string
  /** 1 起的页码。 */
  page: number
}

type OutlineNode = { title?: string; dest?: unknown; items?: unknown }

/**
 * 只描述我们真正调到的部分（与 `PdfReader` 对 pdf.js 的用法一致：结构化类型，不引它的类型包）。
 *
 * `getOutline` 故意收成 `unknown[]`：pdf.js 那边的条目形状随版本变，**这里逐个字段自己查**，
 * 比声明一个漂亮却不保真的类型安全。
 */
export type OutlineDoc = {
  getOutline?: () => Promise<unknown[] | null>
  getDestination?: (id: string) => Promise<unknown[] | null>
  getPageIndex?: (ref: unknown) => Promise<number>
}

/** 把一个书签目标解析成 1 起的页码；解析不出来给 null。 */
async function pageOf(doc: OutlineDoc, dest: unknown): Promise<number | null> {
  try {
    const explicit =
      typeof dest === 'string' ? ((await doc.getDestination?.(dest)) ?? null) : (dest ?? null)
    if (!Array.isArray(explicit) || explicit.length === 0) return null
    const ref = explicit[0]
    // 有些文件的目标直接给页序号（0 起）而不是页引用。
    if (typeof ref === 'number') return Number.isInteger(ref) && ref >= 0 ? ref + 1 : null
    const index = await doc.getPageIndex?.(ref)
    return typeof index === 'number' && index >= 0 ? index + 1 : null
  } catch {
    // 坏 `dest`、指向已删页、文件损坏——都当作这一条没有。
    return null
  }
}

/** 读这份 PDF 的书签大纲；没有书签、读不出来、或每一条都解析失败，都返回 `[]`（＝不显示左栏）。 */
export async function readPdfOutline(doc: OutlineDoc): Promise<PdfBookmark[]> {
  if (typeof doc.getOutline !== 'function') return []
  const tree = await doc.getOutline().catch(() => null)
  if (!Array.isArray(tree) || tree.length === 0) return []
  const items: PdfBookmark[] = []
  // **只铺两层**：再深的层级在这套样式里没有位置，且一份论文的三级书签往往是图表清单。
  const walk = async (nodes: unknown[], level: 2 | 3) => {
    for (const raw of nodes) {
      if (typeof raw !== 'object' || raw === null) continue
      const node = raw as OutlineNode
      const text = (typeof node.title === 'string' ? node.title : '').trim()
      const page = await pageOf(doc, node.dest)
      if (text && page) items.push({ key: `${items.length}-${text}`, level, text, page })
      if (level === 2 && Array.isArray(node.items) && node.items.length > 0)
        await walk(node.items, 3)
    }
  }
  await walk(tree, 2)
  return items
}

/**
 * 当前读到哪一条：页码不大于当前页的**最后一条**。
 *
 * 与网页那版（`currentIndex`）不同的是**不提前 break**：网页的标题按文档顺序排，PDF 的书签
 * 顺序由作者决定，见过附录排在正文之前的文件。全扫一遍取最后一个匹配，代价是 O(n)、n 是
 * 书签数（几十条），可以忽略。
 */
export function currentBookmark(items: { page: number }[], page: number): number {
  let current = -1
  for (let index = 0; index < items.length; index += 1) {
    if (items[index]!.page <= page) current = index
  }
  return current
}

/**
 * 读到整份的百分之几（TASK-088）：`(页序 - 1 + 页内比例) / 总页数`。
 *
 * 与网页那边「滚动位置百分比」不是同一套算法，但**用户看到的含义一致**——读到整份的多少。
 * 顶栏的进度线与「记为学习进度 N%」都用它。
 */
export function readingPercentOf(page: number, ratio: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null
  const safe = Math.min(Math.max(ratio, 0), 1)
  const percent = Math.round(((page - 1 + safe) / total) * 100)
  return Math.min(100, Math.max(0, percent))
}
