import { useEffect, useState } from 'react'

import type { AnnotationTool } from './highlights'
import { readSelection, toQuote, type QuoteSelection } from './quoteSelection'

/**
 * 正文上的浮动胶囊（TASK-068 起）：在正文里选中一段文字，选区上方浮出「记下这段」——把这段以
 * Markdown 引用（`> …`）追加进右栏心得草稿并聚焦写作框，顺手标成高亮，心得保存后自动与那条
 * 高亮配对。
 *
 * **TASK-094 起标记走顶栏的工具，不再走胶囊。** 荧光笔或下划线开着时，选中文字**松手即落**：
 * 这里在 `mouseup`/`touchend` 上读选区、把 `Range` 交给父级取锚点，胶囊根本不出现——颜色本身
 * 就是反馈。TASK-072 的「标下来」按钮随之退场（用户 2026-09-26 在 Pencil 草图上确认）。
 * 没选工具（或选的是橡皮）时，胶囊只剩「记下这段」。
 *
 * **只做文本拼接。** 不存高亮、不给正文加锚点、不碰渲染器（`snapshotMarkdown.ts` 仍是唯一
 * 的 XSS 边界，这里只读 `selection.toString()`，进的是 textarea 的值）。
 *
 * 选区必须**整个落在正文根**里（锚点与焦点都在），否则不出胶囊、也不落色：选到顶栏、标题或
 * 侧栏的文字不是"这段正文"。空白选区、超过 2000 字也不算。
 *
 * **正文根是可换的**（TASK-087）：网页快照是 `.snapshot-rendered`，PDF 是
 * `.pdf-reader-pages`（每页 canvas 之上那层文字层就在里面）。
 *
 * **能不能标，可以按选区判**（TASK-089）：`canMark` 除了布尔还接受一个谓词，PDF 用它判
 * 「选区是否落在同一页里」——文字层按页给，一条高亮的锚点只能落在一页内。工具开着而谓词
 * 判否时不落色，改出胶囊说明原因并留「记下这段」（用户 2026-09-22 选定的跨页处理）。
 */

/** 点击/松手**当时**的选区，克隆一份交出去；拿不到真 `Range` 时给 null。 */
function currentRange(): Range | null {
  try {
    const current = window.getSelection?.()
    if (!current || current.rangeCount === 0) return null
    const range = current.getRangeAt(0)
    return typeof range?.cloneRange === 'function' ? range.cloneRange() : null
  } catch {
    return null
  }
}

export function ReaderQuote({
  container,
  onQuote,
  onMark,
  selector = '.snapshot-rendered',
  canMark = true,
  tool = null,
}: {
  /** 正文列元素；里面匹配 `selector` 的那个才算正文。 */
  container: HTMLElement | null
  onQuote: (quote: string, range: Range | null) => void
  /**
   * 工具开着时松手即调：把选区的 `Range` 交出去，由父级按当前工具与颜色取锚点、建高亮。
   * 「记下这段」也把 `Range` 一并交给 `onQuote`。
   */
  onMark: (range: Range) => void
  /** 正文根的选择器。默认网页快照；PDF 传 `.pdf-reader-pages`。 */
  selector?: string
  /**
   * 这份资料能不能标高亮。`false` 时工具开着也不落色；给谓词则按**当前选区**判——判否时
   * 出胶囊、加一句「选区跨页或落到页外，只能记下这段」的提示。
   */
  canMark?: boolean | ((range: Range) => boolean)
  /** 顶栏当前按下的工具（TASK-094）；荧光笔/下划线让选区松手即落色，橡皮与没选工具一样只出胶囊。 */
  tool?: AnnotationTool | null
}) {
  const [selection, setSelection] = useState<QuoteSelection | null>(null)
  const marking = tool === 'mark' || tool === 'underline'
  useEffect(() => {
    if (!container) return
    const update = () => setSelection(readSelection(container.querySelector(selector)))
    // 选区变化即刻算；滚动时位置会变，也重算（胶囊跟着选区走，滚出视口就不显示）。
    document.addEventListener('selectionchange', update)
    // **捕获阶段**监听（TASK-087）：scroll 不冒泡，而 PDF 是在
    // `.pdf-reader-pages` 这个内层容器里滚的——只听 window 的话，PDF 上滚动时胶囊会
    // 钉在原地不动。捕获能同时拿到内层容器与文档自身的滚动。
    document.addEventListener('scroll', update, { passive: true, capture: true })
    window.addEventListener('resize', update)
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelection(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('selectionchange', update)
      document.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [container, selector])

  // 松手即落（TASK-094）：工具开着、选区整个在正文里、（按谓词）能标，就把 Range 交出去并
  // 清掉选区。`mouseup` 时选区已经是最终形态（拖动过程中它随 mousemove 变）。判否的选区
  // 留给下面的胶囊去解释。
  useEffect(() => {
    if (!container || !marking) return
    const settle = () => {
      if (!readSelection(container.querySelector(selector))) return
      const range = currentRange()
      if (!range) return
      const allowed = typeof canMark === 'function' ? canMark(range) : canMark
      if (!allowed) return
      onMark(range)
      window.getSelection?.()?.removeAllRanges()
      setSelection(null)
    }
    document.addEventListener('mouseup', settle)
    document.addEventListener('touchend', settle)
    return () => {
      document.removeEventListener('mouseup', settle)
      document.removeEventListener('touchend', settle)
    }
  }, [container, selector, marking, canMark, onMark])

  if (!selection || selection.top < 0 || selection.top > window.innerHeight) return null
  // 工具开着时，能标的选区已经（或即将）在松手时落色，不出胶囊；判否的才出，并说明原因。
  const refused = (() => {
    if (!marking) return false
    if (typeof canMark !== 'function') return !canMark
    const range = currentRange()
    return range ? !canMark(range) : true
  })()
  if (marking && !refused) return null
  const take = (hand: (range: Range | null) => void) => {
    const range = currentRange()
    hand(range)
    window.getSelection?.()?.removeAllRanges()
    setSelection(null)
  }
  // 胶囊挂在选区上方 10px、水平居中；贴近视口边缘时夹回来。
  const left = Math.max(120, Math.min(window.innerWidth - 120, selection.left))
  const top = Math.max(64, selection.top - 10)
  return (
    <div className="reader-quote" style={{ top, left }}>
      {refused && typeof canMark === 'function' && (
        // 文案要同时盖住「跨页」与「一端落在页外的空隙」两种情况（独立 Review F2）：
        // 两者都是「选区没有整个落在同一页的文字层里」。
        <span className="reader-quote-note">选区跨页或落到页外，只能记下这段</span>
      )}
      <button
        type="button"
        className="reader-quote-button"
        // `mousedown` 会先于 `click` 清掉选区（textarea 之外点击的默认行为），所以在
        // 这里阻止默认，让 `click` 还能读到刚才那段文字。
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => take((range) => onQuote(toQuote(selection.text), range))}
      >
        <span aria-hidden="true">✎ </span>记下这段
      </button>
    </div>
  )
}
