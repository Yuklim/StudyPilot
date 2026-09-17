/**
 * 「记下这段」的纯函数部分（TASK-068）：读选区、转 Markdown 引用。组件在 `ReaderQuote.tsx`
 * （文件只导出组件，react-refresh 规则）。
 */

const MAX_QUOTE = 2000

export type QuoteSelection = { text: string; top: number; left: number }

/** 把选区文本转成 Markdown 引用块：每行前加 `> `，空行保留为 `>`。 */
export function toQuote(text: string): string {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `> ${line.trim()}` : '>'))
    .join('\n')
}

/** 当前选区若整个落在 `rendered` 内且非空，返回文本与胶囊位置（视口坐标）；否则 null。 */
export function readSelection(rendered: Element | null): QuoteSelection | null {
  if (!rendered || typeof window.getSelection !== 'function') return null
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const { anchorNode, focusNode } = selection
  if (!anchorNode || !focusNode) return null
  if (!rendered.contains(anchorNode) || !rendered.contains(focusNode)) return null
  const text = selection.toString().trim()
  if (!text || text.length > MAX_QUOTE) return null
  const range = selection.getRangeAt(0)
  // jsdom 的 Range 没有 getBoundingClientRect；用例只关心文本，位置退回选区所在元素。
  const rect =
    typeof range.getBoundingClientRect === 'function'
      ? range.getBoundingClientRect()
      : (range.startContainer.parentElement?.getBoundingClientRect() ?? {
          top: 0,
          left: 0,
          width: 0,
        })
  return { text, top: rect.top, left: rect.left + rect.width / 2 }
}
