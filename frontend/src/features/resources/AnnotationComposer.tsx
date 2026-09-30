import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { LEAVE_EVENT } from '../../shell/pages'

/** 点进写作框那一刻正文里的选区：引文（给人看）与 Range（给标高亮用）。 */
export type PendingAnchor = { quote: string; range: Range }

/**
 * 右栏顶部的「写心得…」框（TASK-098）。用户规则：写心得时正文有选区 → 自动标高亮并配对；
 * 没选区 → 这份资料的心得（不挂高亮）。
 *
 * 选区会在点进 textarea 的瞬间塌掉，所以在 `mousedown`（键盘进来则 `focus`）时先把它记下来，
 * 显示成一枚「将配到：『…』」的小片，× 可以丢掉。失焦或 ⌘/Ctrl+↩ 保存；保存交给父级
 * （建高亮 → 建心得 → 配对），成功后清空。
 *
 * `quoteRequest`：胶囊「记下这段」在标不了高亮（跨页等）时的退路——引文以 Markdown 引用
 * 追加进来（TASK-068 起的队列语义：按已消费下标一次追加未消费的）。
 */
export function AnnotationComposer({
  disabled = false,
  focusRequest = 0,
  quoteRequest,
  captureSelection,
  onSubmit,
}: {
  disabled?: boolean
  focusRequest?: number
  quoteRequest?: { token: number; quotes: string[] }
  /** 读正文里此刻的选区；没有（或不在正文里）给 null。 */
  captureSelection: () => PendingAnchor | null
  /** 保存：文字 + 可能的选区。抛错即失败（文字保留）。 */
  onSubmit: (text: string, anchor: PendingAnchor | null) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [anchor, setAnchor] = useState<PendingAnchor | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const lastFocus = useRef(0)
  useEffect(() => {
    if (!focusRequest || focusRequest === lastFocus.current || disabled) return
    lastFocus.current = focusRequest
    box.current?.focus()
  }, [focusRequest, disabled])
  // 引文队列在渲染期消费（与 NotesPanel 同一写法）。
  const [quoteConsumed, setQuoteConsumed] = useState(0)
  if (quoteRequest && quoteRequest.token !== quoteConsumed) {
    const fresh = quoteRequest.quotes.slice(quoteConsumed)
    setQuoteConsumed(quoteRequest.token)
    if (fresh.length) {
      const head = text.replace(/\s+$/, '')
      setText((head ? head + '\n\n' : '') + fresh.join('\n\n') + '\n\n')
    }
  }
  useEffect(() => {
    if (!quoteConsumed) return
    const node = box.current
    if (!node) return
    node.focus()
    node.setSelectionRange(node.value.length, node.value.length)
  }, [quoteConsumed])

  // 外壳的 ⌘J 会把人带去整页编辑器；框里写了字还没保存就先问一声（TASK-060 Review F3 的语义沿用）。
  const dirty = text.trim() !== ''
  useEffect(() => {
    if (!dirty) return
    function onLeave(event: Event) {
      if (!window.confirm('这份草稿尚未保存，确定放弃当前编辑吗？')) event.preventDefault()
    }
    document.addEventListener(LEAVE_EVENT, onLeave)
    return () => document.removeEventListener(LEAVE_EVENT, onLeave)
  }, [dirty])

  function grab() {
    // 已经记着一段就不换：用户可能只是回到框里继续写。
    if (anchor) return
    const found = captureSelection()
    if (found) setAnchor(found)
  }
  async function submit() {
    if (pending || disabled) return
    const value = text.trim()
    if (!value) return
    setPending(true)
    setError('')
    setNotice('')
    try {
      await onSubmit(text, anchor)
      if (!alive.current) return
      setText('')
      setAnchor(null)
      setNotice(anchor ? '心得已保存，并配到刚标下的那段。' : '心得已保存。')
    } catch (cause) {
      if (!alive.current) return
      setError(cause instanceof Error ? cause.message : '没有保存成功。')
    } finally {
      if (alive.current) setPending(false)
    }
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void submit()
    }
  }
  return (
    <div className="annotation-composer">
      <textarea
        ref={box}
        aria-label="写心得"
        rows={3}
        value={text}
        placeholder="写心得…"
        disabled={disabled || pending}
        onMouseDown={grab}
        onFocus={grab}
        onChange={(event) => {
          setText(event.target.value)
          setNotice('')
        }}
        onBlur={() => void submit()}
        onKeyDown={onKeyDown}
      />
      {anchor && (
        <p className="annotation-anchor" aria-label="将配到的选区">
          将配到：『{anchor.quote.length > 40 ? anchor.quote.slice(0, 40) + '…' : anchor.quote}』
          <button type="button" className="text-link" onClick={() => setAnchor(null)}>
            不配
          </button>
        </p>
      )}
      <p className="resource-hint">
        {anchor
          ? '保存时会先按当前颜色标成高亮，再把心得配上去'
          : '选中正文再点进来：自动标成高亮并配上 · 没选中：这份资料的心得'}{' '}
        · 失焦或 ⌘↩ 保存
      </p>
      {pending && <p role="status">正在保存…</p>}
      {notice && (
        <p role="status" className="note-saved">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="resource-error">
          {error}
        </p>
      )}
    </div>
  )
}
