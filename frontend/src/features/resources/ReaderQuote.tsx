import { useEffect, useState } from 'react'

import { readSelection, toQuote, type QuoteSelection } from './quoteSelection'

/**
 * 正文上的浮动胶囊（TASK-068 起）：在正文里选中一段文字，选区上方浮出两个按钮。
 * 「标下来」只把这段标成高亮（TASK-072）；「记下这段」除了标下来，还把这段以 Markdown
 * 引用（`> …`）追加进右栏心得草稿并聚焦写作框，心得保存后自动与那条高亮配对。
 *
 * **只做文本拼接。** 不存高亮、不给正文加锚点、不碰渲染器（`snapshotMarkdown.ts` 仍是唯一
 * 的 XSS 边界，这里只读 `selection.toString()`，进的是 textarea 的值）。Readwise 的「高亮旁
 * 写 note」是这条路的完整形态，本任务先落最轻的一步。
 *
 * 选区必须**整个落在正文根**里（锚点与焦点都在），否则不出胶囊：选到顶栏、标题或侧栏的
 * 文字不是"这段正文"。空白选区、超过 2000 字也不出。
 *
 * **正文根是可换的**（TASK-087）：网页快照是 `.snapshot-rendered`，PDF 是
 * `.pdf-reader-pages`（每页 canvas 之上那层文字层就在里面）。
 *
 * **「标下来」能不能出，可以按选区判**（TASK-089）：`canMark` 除了布尔还接受一个谓词，
 * PDF 用它判「选区是否落在同一页里」——文字层按页给，一条高亮的锚点只能落在一页内，
 * 跨页的选区只留「记下这段」并说明原因（用户 2026-09-22 选定）。
 */

export function ReaderQuote({
  container,
  onQuote,
  onMark,
  selector = '.snapshot-rendered',
  canMark = true,
}: {
  /** 正文列元素；里面匹配 `selector` 的那个才算正文。 */
  container: HTMLElement | null
  onQuote: (quote: string, range: Range | null) => void
  /**
   * TASK-072：「标下来」——只把这段标成高亮，不开心得框。用户 2026-09-19 选定胶囊放两个
   * 按钮：一手只标记，一手边标边写。两者都把选区的 `Range` 交出去，由父级取锚点。
   */
  onMark: (range: Range) => void
  /** 正文根的选择器。默认网页快照；PDF 传 `.pdf-reader-pages`。 */
  selector?: string
  /**
   * 这份资料能不能标高亮。`false` 时胶囊只留「记下这段」；给谓词则按**当前选区**判——
   * 判否时同样只留「记下这段」，并加一句「跨页只能记下这段」的提示。
   */
  canMark?: boolean | ((range: Range) => boolean)
}) {
  const [selection, setSelection] = useState<QuoteSelection | null>(null)
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

  if (!selection || selection.top < 0 || selection.top > window.innerHeight) return null
  // 两个按钮都要用点击**当时**的选区：`mousedown` 已经阻止了默认行为，选区还在。
  // 取不到真正的 `Range`（浏览器没给、或用例里是替身）时交出 null——引文照走，只是没法
  // 取锚点、这次不上色。引文不该被上色的失败连累。
  const currentRange = (): Range | null => {
    try {
      const current = window.getSelection?.()
      if (!current || current.rangeCount === 0) return null
      const range = current.getRangeAt(0)
      return typeof range?.cloneRange === 'function' ? range.cloneRange() : null
    } catch {
      return null
    }
  }
  // 按选区判能不能标（谓词形态）：拿不到真 Range 时按不能标处理——那种情况下父级也取不到锚点。
  const markable = (() => {
    if (typeof canMark !== 'function') return canMark
    const range = currentRange()
    return range ? canMark(range) : false
  })()
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
      {!markable && typeof canMark === 'function' && (
        <span className="reader-quote-note">跨页只能记下这段</span>
      )}
      {markable && (
        <>
          <button
            type="button"
            className="reader-quote-button mark"
            // `mousedown` 会先于 `click` 清掉选区（textarea 之外点击的默认行为），所以在
            // 这里阻止默认，让 `click` 还能读到刚才那段文字。
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => take((range) => range && onMark(range))}
          >
            <span aria-hidden="true">▨ </span>标下来
          </button>
          <span className="reader-quote-divider" aria-hidden="true" />
        </>
      )}
      <button
        type="button"
        className="reader-quote-button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => take((range) => onQuote(toQuote(selection.text), range))}
      >
        <span aria-hidden="true">✎ </span>记下这段
      </button>
    </div>
  )
}
