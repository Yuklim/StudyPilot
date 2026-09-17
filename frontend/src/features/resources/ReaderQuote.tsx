import { useEffect, useState } from 'react'

import { readSelection, toQuote, type QuoteSelection } from './quoteSelection'

/**
 * 「记下这段」（TASK-068，Pencil 草图里正文上的浮动胶囊）：在正文里选中一段文字，选区上方
 * 浮出一个胶囊按钮，点一下把这段以 Markdown 引用（`> …`）追加进右栏心得草稿并聚焦写作框。
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
}: {
  /** 正文列元素；里面的 `.snapshot-rendered` 才算正文。 */
  container: HTMLElement | null
  onQuote: (quote: string) => void
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
  // 胶囊挂在选区上方 10px、水平居中；贴近视口边缘时夹回来。
  const left = Math.max(120, Math.min(window.innerWidth - 120, selection.left))
  const top = Math.max(64, selection.top - 10)
  return (
    <div className="reader-quote" style={{ top, left }}>
      <button
        type="button"
        className="reader-quote-button"
        // `mousedown` 会先于 `click` 清掉选区（textarea 之外点击的默认行为），所以在这里
        // 阻止默认，让 `click` 还能读到刚才那段文字。
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onQuote(toQuote(selection.text))
          window.getSelection?.()?.removeAllRanges()
          setSelection(null)
        }}
      >
        <span aria-hidden="true">✎ </span>记下这段
      </button>
    </div>
  )
}
