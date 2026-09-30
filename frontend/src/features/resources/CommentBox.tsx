import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

/**
 * 就地评论框（TASK-098，Zotero 式）。一个 textarea，三种时机保存：失焦、⌘/Ctrl+↩、停笔 `idleMs`。
 * 只在**有改动且非空**时保存：清空不等于删除（删除走条目菜单），空文本不会发请求。
 * 保存失败保留文字、显示原因、不重试——版本冲突这种事要让人看见，不能悄悄覆盖。
 *
 * 保存中又改了字：等这次回来再按最新文字补存一次，不并发发两条。补存放在**下一次渲染之后**（`again` 是状态，
 * 由 effect 触发）：这时 `saved` 与父级给的 `onSave` 都是新的——父级在首次保存里把「没有心得」变成了「有心得」，
 * 补存必须走「改心得」而不是再建一条（Review F1）。
 */
export function CommentBox({
  label,
  initial,
  placeholder,
  focusToken = 0,
  disabled = false,
  idleMs = 2000,
  rows = 2,
  onSave,
  onFocused,
}: {
  /** 可访问名称（每条评论框都不同，测试与读屏靠它）。 */
  label: string
  /** 已有的内容；外部换了一版（例如重读列表）时按它重置。 */
  initial: string
  placeholder?: string
  /** 父级想把焦点放进来时递增；同一值只消费一次。 */
  focusToken?: number
  disabled?: boolean
  idleMs?: number
  rows?: number
  /** 把文字存起来；抛错即失败（文字保留、显示 `failureText`）。 */
  onSave: (text: string) => Promise<void>
  /** 按 `focusToken` 拿到焦点之后回一声，父级据此清掉聚焦请求（不然列表重挂时会再抢一次焦点，Review F3）。 */
  onFocused?: () => void
}) {
  const [text, setText] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)
  const alive = useRef(true)
  const inflight = useRef(false)
  const [again, setAgain] = useState(false)
  // `save` 在事件与计时器里读最新文字，不把它塞进依赖：每次渲染后同步一份快照。
  const latest = useRef(text)
  useEffect(() => {
    latest.current = text
  })

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  // 外部内容换了一版（重读列表、别处改了）：没有未保存改动时跟着换。
  const [seenInitial, setSeenInitial] = useState(initial)
  if (initial !== seenInitial) {
    setSeenInitial(initial)
    if (text === saved) {
      setText(initial)
      setSaved(initial)
    }
  }
  const lastFocus = useRef(0)
  useEffect(() => {
    if (!focusToken || focusToken === lastFocus.current) return
    lastFocus.current = focusToken
    const node = box.current
    if (!node) return
    node.focus()
    node.setSelectionRange(node.value.length, node.value.length)
    onFocused?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只认 token
  }, [focusToken])

  const dirty = text.trim() !== saved.trim() && text.trim() !== ''

  async function save() {
    const value = latest.current
    if (value.trim() === '' || value.trim() === saved.trim()) return
    if (inflight.current) {
      setAgain(true)
      return
    }
    inflight.current = true
    setState('saving')
    setError('')
    try {
      await onSave(value)
      if (!alive.current) return
      setSaved(value)
      setState('saved')
    } catch (cause) {
      if (!alive.current) return
      setState('error')
      setError(cause instanceof Error ? cause.message : '没有保存成功。')
    } finally {
      inflight.current = false
    }
  }
  // 补存：上一次在飞时又改了字。等这一帧渲染完再存，闭包里的 `saved`/`onSave` 才是新的。
  // `state` 也在依赖里：标记是在飞行中立的，要等这次落地（state 变）再补。
  useEffect(() => {
    if (!again || inflight.current) return
    setAgain(false)
    void save()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只由 again 与落地触发
  }, [again, state])
  // 停笔自动保存：每次改动重置计时。
  useEffect(() => {
    if (!dirty || disabled) return
    const timer = setTimeout(() => void save(), idleMs)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只看文字与脏标记
  }, [text, dirty, disabled, idleMs])
  // 「已保存」两秒后淡出。
  useEffect(() => {
    if (state !== 'saved') return
    const timer = setTimeout(() => setState('idle'), 2000)
    return () => clearTimeout(timer)
  }, [state])

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void save()
    }
  }
  return (
    <div className={`comment-box${state === 'error' ? ' has-error' : ''}`}>
      <textarea
        ref={box}
        aria-label={label}
        rows={rows}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => {
          setText(event.target.value)
          if (state === 'error') setState('idle')
        }}
        onBlur={() => void save()}
        onKeyDown={onKeyDown}
      />
      {state === 'saving' && (
        <span className="comment-box-status" role="status">
          保存中…
        </span>
      )}
      {state === 'saved' && (
        <span className="comment-box-status" role="status">
          已保存
        </span>
      )}
      {state === 'error' && (
        <span className="comment-box-status resource-error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
