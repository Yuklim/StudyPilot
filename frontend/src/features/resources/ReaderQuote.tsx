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
 * 选区必须**整个落在** `.snapshot-rendered` 里（锚点与焦点都在），否则不出胶囊：选到顶栏、
 * 标题或侧栏的文字不是"这段正文"。空白选区、超过 2000 字也不出。
 */

export function ReaderQuote({
  container,
  onQuote,
  onMark,
}: {
  /** 正文列元素；里面的 `.snapshot-rendered` 才算正文。 */
  container: HTMLElement | null
  onQuote: (quote: string, range: Range | null) => void
  /**
   * TASK-072：「标下来」——只把这段标成高亮，不开心得框。用户 2026-09-19 选定胶囊放两个
   * 按钮：一手只标记，一手边标边写。两者都把选区的 `Range` 交出去，由父级取锚点。
   */
  onMark: (range: Range) => void
}) {
  const [selection, setSelection] = useState<QuoteSelection | null>(null)
  useEffect(() => {
    if (!container) return
    const update = () => setSelection(readSelection(container.querySelector('.snapshot-rendered')))
    // 选区变化即刻算；滚动时位置会变，也重算（胶囊跟着选区走，滚出视口就不显示）。
    document.addEventListener('selectionchange', update)
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelection(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('selectionchange', update)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [container])

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
      <button
        type="button"
        className="reader-quote-button mark"
        // `mousedown` 会先于 `click` 清掉选区（textarea 之外点击的默认行为），所以在这里
        // 阻止默认，让 `click` 还能读到刚才那段文字。
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => take((range) => range && onMark(range))}
      >
        <span aria-hidden="true">▨ </span>标下来
      </button>
      <span className="reader-quote-divider" aria-hidden="true" />
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
