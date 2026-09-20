/**
 * 高亮锚点的纯函数（TASK-072）：从选区取锚点、把锚点重新落回当前正文。
 *
 * 契约 4.15 的锚点是**分层**的：`exact` 是标下来的那句话，`prefix`/`suffix` 是它两侧的
 * 上下文（同一句话在文中出现多次时用来区分），偏移只是降级用的。定位按四级降级：
 * `exact` 唯一匹配 → 前后文消歧 → 偏移附近的模糊匹配 → **判为孤立**。
 *
 * 全部按**渲染后的正文纯文本**计算：重定位时两端用同一套文本才可能对上。服务端不碰这些，
 * 孤立状态也不落库——正文换回来，高亮就该重新对上（契约 4.15）。
 */

/** 与后端契约一致的上限：原文 2000、前后文各 200。 */
export const MAX_EXACT = 2000
export const MAX_CONTEXT = 200
/** 模糊匹配只在偏移两侧这个范围里找；正文可达百万字符，全篇比对不值得。 */
export const FUZZY_WINDOW = 2000
/** 模糊匹配用的开头片段长度，短于此不尝试：太短会匹配到不相干的地方。 */
const FRAGMENT = 40
const MIN_FRAGMENT = 8

export type Anchor = {
  exact: string
  prefix: string | null
  suffix: string | null
  start_offset: number
  end_offset: number
}

type Piece = { node: Text; start: number }
type Mapped = { text: string; pieces: Piece[] }

/** 把容器里的文本节点串成一条纯文本，并记住每段从哪个偏移开始。 */
export function mapText(container: Node): Mapped {
  const pieces: Piece[] = []
  let text = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue ?? ''
      if (value) {
        pieces.push({ node: node as Text, start: text.length })
        text += value
      }
      return
    }
    for (const child of Array.from(node.childNodes)) walk(child)
  }
  walk(container)
  return { text, pieces }
}

/** 偏移 → 具体文本节点里的位置；越界时落到最近的一端。 */
function pointAt({ pieces }: Mapped, offset: number): { node: Text; offset: number } | null {
  if (!pieces.length) return null
  for (let index = pieces.length - 1; index >= 0; index -= 1) {
    const piece = pieces[index]!
    const length = piece.node.nodeValue?.length ?? 0
    if (offset >= piece.start) {
      return { node: piece.node, offset: Math.min(offset - piece.start, length) }
    }
  }
  const first = pieces[0]!
  return { node: first.node, offset: 0 }
}

/** DOM 位置 → 纯文本偏移；容器外或找不到时返回 null。 */
function offsetOf(mapped: Mapped, node: Node, offset: number): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const piece = mapped.pieces.find((item) => item.node === node)
    return piece ? piece.start + offset : null
  }
  // 元素上的位置：落到它前面所有文本的末尾。
  const children = Array.from(node.childNodes).slice(0, offset)
  const before = children.reduce((sum, child) => sum + mapText(child).text.length, 0)
  const own = mapped.pieces.find((item) => node.contains(item.node))
  return own ? own.start + before : null
}

/** 从选区取锚点；选区不在容器里、为空或超长时返回 null。 */
export function anchorFrom(container: Element, range: Range): Anchor | null {
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return null
  }
  const mapped = mapText(container)
  const start = offsetOf(mapped, range.startContainer, range.startOffset)
  const end = offsetOf(mapped, range.endContainer, range.endOffset)
  if (start === null || end === null || end <= start) return null
  const exact = mapped.text.slice(start, end)
  if (!exact.trim() || exact.length > MAX_EXACT) return null
  const prefix = mapped.text.slice(Math.max(0, start - MAX_CONTEXT), start)
  const suffix = mapped.text.slice(end, end + MAX_CONTEXT)
  return {
    exact,
    prefix: prefix || null,
    suffix: suffix || null,
    start_offset: start,
    end_offset: end,
  }
}

/** 一处候选与锚点前后文的吻合程度：取两侧共同后/前缀的长度之和。 */
function contextScore(text: string, at: number, anchor: Anchor): number {
  const before = text.slice(Math.max(0, at - MAX_CONTEXT), at)
  const after = text.slice(at + anchor.exact.length, at + anchor.exact.length + MAX_CONTEXT)
  return common(before, anchor.prefix ?? '', true) + common(after, anchor.suffix ?? '', false)
}

function common(a: string, b: string, fromEnd: boolean): number {
  const length = Math.min(a.length, b.length)
  let same = 0
  while (same < length) {
    const left = fromEnd ? a[a.length - 1 - same] : a[same]
    const right = fromEnd ? b[b.length - 1 - same] : b[same]
    if (left !== right) break
    same += 1
  }
  return same
}

function occurrences(text: string, needle: string): number[] {
  const found: number[] = []
  if (!needle) return found
  let at = text.indexOf(needle)
  while (at !== -1) {
    found.push(at)
    at = text.indexOf(needle, at + 1)
  }
  return found
}

/** 去掉全部空白，并记下每个剩余字符对应的原始下标。 */
function strip(text: string): { value: string; index: number[] } {
  let value = ''
  const index: number[] = []
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at]!
    if (/\s/.test(char)) continue
    value += char
    index.push(at)
  }
  return { value, index }
}

export type Located = { start: number; end: number; degraded: boolean }

/**
 * 把锚点重新落回当前正文，返回纯文本上的区间；四级都失败即 `null`（＝孤立）。
 * `degraded` 表示不是靠 `exact` 原样匹配找到的，界面可据此提示「位置可能有偏移」。
 */
export function locate(text: string, anchor: Anchor): Located | null {
  const hits = occurrences(text, anchor.exact)
  if (hits.length === 1) {
    return { start: hits[0]!, end: hits[0]! + anchor.exact.length, degraded: false }
  }
  if (hits.length > 1) {
    // 同一句话出现多次：先看前后文，再按离原偏移最近的那处决胜。
    let best = hits[0]!
    let bestScore = -1
    for (const at of hits) {
      const score = contextScore(text, at, anchor)
      const closer = Math.abs(at - anchor.start_offset) < Math.abs(best - anchor.start_offset)
      if (score > bestScore || (score === bestScore && closer)) {
        best = at
        bestScore = score
      }
    }
    return { start: best, end: best + anchor.exact.length, degraded: false }
  }
  // 原样找不到：**两边都去掉空白**再找一次（重新排版过、换行与缩进变了但字没变）。
  // 折成一个空格是不够的：换行常落在句子中间，折叠后仍会多出空格而对不上。
  const flatText = strip(text)
  const flatNeedle = strip(anchor.exact).value
  if (flatNeedle) {
    const at = flatText.value.indexOf(flatNeedle)
    if (at !== -1 && flatText.index.length) {
      const start = flatText.index[at]!
      const last = flatText.index[Math.min(at + flatNeedle.length - 1, flatText.index.length - 1)]!
      return { start, end: last + 1, degraded: true }
    }
  }
  // 最后一级：在原偏移附近用**开头片段**找。这段话本身被改过尾巴时还能落回大致位置。
  // 片段取原文的六成（下限 8 字、上限 40 字）：整句去找等于没有这一级，太短又会乱落。
  const wanted = Math.min(FRAGMENT, Math.max(MIN_FRAGMENT, Math.floor(anchor.exact.length * 0.6)))
  const fragment = anchor.exact.slice(0, wanted)
  if (anchor.exact.length >= MIN_FRAGMENT && fragment.length >= MIN_FRAGMENT) {
    const from = Math.max(0, anchor.start_offset - FUZZY_WINDOW)
    const to = Math.min(text.length, anchor.end_offset + FUZZY_WINDOW)
    const at = text.slice(from, to).indexOf(fragment)
    if (at !== -1) {
      const start = from + at
      return { start, end: Math.min(start + anchor.exact.length, text.length), degraded: true }
    }
  }
  return null
}

/** 定位结果 → 可以交给 CSS Custom Highlight API 的 Range；拿不到位置时 null。 */
export function rangeFor(container: Element, anchor: Anchor): Range | null {
  const mapped = mapText(container)
  const found = locate(mapped.text, anchor)
  if (!found) return null
  const start = pointAt(mapped, found.start)
  const end = pointAt(mapped, found.end)
  if (!start || !end) return null
  const range = container.ownerDocument.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  return range
}
