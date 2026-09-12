import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { ApiError } from '../../api/client'
import { deleteResource, failureText, previewResourceDeletion } from './api'

/** 弹窗要删的一份资料：只需要 id 与显示用标题。 */
export interface DeleteTarget {
  id: string
  title: string
}

// 每份资料在弹窗生命周期里的状态。契约（§9）是「预览取一次性令牌 → 持令牌删除」，
// 令牌只在这里、只在内存里，绝不进 DOM。
type Row =
  | { id: string; title: string; phase: 'previewing' }
  | { id: string; title: string; phase: 'ready'; token: string; notes: number }
  | { id: string; title: string; phase: 'deleting'; token: string; notes: number }
  | { id: string; title: string; phase: 'deleted'; notes: number }
  | { id: string; title: string; phase: 'failed'; notes: number; reason: string }

/**
 * 删除资料的确认弹窗（TASK-056，用户 2026-09-12 选定）。
 *
 * 打开即在后台**静默预览**每一份、取令牌；用户看到的只有：标题、一句「不可恢复」、
 * 心得数（>0 才显示）与「取消 / 删除」——原件、图片、学习历史等影响不再罗列，这是用户
 * 明示的决定。契约层面的保护一条不少：影响变化 (409) 会自动重新预览并要求**再确认一次**；
 * 令牌过期/重放/无效与网络错误给受控文案 +「重试」。
 *
 * 多份（资料库多选）串行走同一条契约：N 次预览、确认一次、N 次删除；部分失败列出
 * 未删除的那些并可只重试它们，已删除的不重放。
 *
 * 模态实现不引入依赖：portal 到 `document.body`，打开期间把 body 的其余直接子节点设为
 * `inert`（Tab 与辅助技术都进不去），关闭后焦点还给打开时的活动元素。
 */
export function ResourceDeleteDialog({
  targets,
  onClose,
  onDeleted,
}: {
  targets: DeleteTarget[]
  /** 用户取消，或全部删除成功后关闭。 */
  onClose: () => void
  /** 每成功删除一份就回报一次；调用方据此刷新列表或离开页面。 */
  onDeleted: (ids: string[]) => void
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    targets.map((t) => ({ id: t.id, title: t.title, phase: 'previewing' as const })),
  )
  const [error, setError] = useState<string | null>(null)
  // 影响变化：重新预览之后要用户再点一次「删除」；这一位只为那句提示存在。
  const [reconfirm, setReconfirm] = useState(false)
  const busy = useRef(false)
  const alive = useRef(true)
  const dialog = useRef<HTMLDivElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const host = useRef<HTMLDivElement | null>(null)
  if (host.current === null) host.current = document.createElement('div')

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // --- 模态：挂到 body、其余子树 inert、焦点进来、关闭时还回去 ---
  useLayoutEffect(() => {
    const node = host.current!
    const opener = document.activeElement as HTMLElement | null
    document.body.appendChild(node)
    const others = [...document.body.children].filter(
      (el) => el !== node && !el.hasAttribute('inert'),
    )
    others.forEach((el) => el.setAttribute('inert', ''))
    // 焦点落在「取消」上：最不具破坏性的动作先拿到键盘。
    cancelButton.current?.focus()
    return () => {
      others.forEach((el) => el.removeAttribute('inert'))
      node.remove()
      opener?.focus()
    }
  }, [])

  const deleting = rows.some((r) => r.phase === 'deleting')
  function close() {
    if (deleting) return
    onClose()
  }
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!deleting) onClose()
        return
      }
      // 其余子树已 inert，Tab 到头会掉进浏览器自己的界面：在弹窗内首尾相接。
      if (event.key !== 'Tab' || !dialog.current) return
      const focusable = [
        ...dialog.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ]
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.current.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !dialog.current.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [deleting, onClose])

  // --- 预览：打开即静默取令牌 ---
  async function preview(ids: string[]) {
    setError(null)
    for (const id of ids) {
      try {
        const next = await previewResourceDeletion(id)
        if (!alive.current) return
        setRows((current) =>
          current.map((r) =>
            r.id === id
              ? {
                  ...r,
                  phase: 'ready',
                  token: next.confirmation_token,
                  notes: next.impact.note_count,
                }
              : r,
          ),
        )
      } catch (cause) {
        if (!alive.current) return
        const reason = failureText(cause)
        setRows((current) =>
          current.map((r) =>
            r.id === id
              ? {
                  id: r.id,
                  title: r.title,
                  phase: 'failed',
                  notes: 'notes' in r ? r.notes : 0,
                  reason,
                }
              : r,
          ),
        )
        setError(reason)
      }
    }
  }
  // 只在打开时跑一次；targets 由调用方保证打开期间不变。用 ref 挡住 StrictMode 的
  // 双跑：两次并发预览同一份资料会让后端回 500（沙盒实测），第二次的失败还会把第一次
  // 的成功盖成一条错误提示。
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void preview(targets.map((t) => t.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- 删除：串行；影响变化则重新预览并要求再确认 ---
  async function confirm() {
    if (busy.current) return
    const pending = rows.filter((r): r is Extract<Row, { phase: 'ready' }> => r.phase === 'ready')
    if (pending.length === 0) return
    busy.current = true
    setError(null)
    setReconfirm(false)
    const done: string[] = []
    let changed = false
    for (const row of pending) {
      setRows((current) =>
        current.map((r) => (r.id === row.id ? { ...row, phase: 'deleting' } : r)),
      )
      try {
        await deleteResource(row.id, row.token)
        if (!alive.current) return
        done.push(row.id)
        setRows((current) =>
          current.map((r) =>
            r.id === row.id ? { id: r.id, title: r.title, phase: 'deleted', notes: row.notes } : r,
          ),
        )
      } catch (cause) {
        if (!alive.current) return
        if (cause instanceof ApiError && cause.code === 'DELETION_IMPACT_CHANGED') {
          // 契约：影响变了就得重新预览、重新确认。旧令牌已作废，不重放。
          changed = true
          setRows((current) =>
            current.map((r) =>
              r.id === row.id ? { id: r.id, title: r.title, phase: 'previewing' } : r,
            ),
          )
          await preview([row.id])
          continue
        }
        setRows((current) =>
          current.map((r) =>
            r.id === row.id
              ? {
                  id: r.id,
                  title: r.title,
                  phase: 'failed',
                  notes: row.notes,
                  reason: failureText(cause),
                }
              : r,
          ),
        )
      }
    }
    busy.current = false
    if (done.length > 0) onDeleted(done)
    if (!alive.current) return
    if (changed) setReconfirm(true)
    // 全部删完才自动关；有失败或待再确认的就留在弹窗里，让用户看见并决定。
    const left = rows.filter((r) => r.phase !== 'deleted' && !done.includes(r.id))
    if (left.length === 0) onClose()
  }

  // 重试：只对失败的重新预览。
  function retry() {
    const failed = rows.filter((r) => r.phase === 'failed').map((r) => r.id)
    setRows((current) =>
      current.map((r) =>
        r.phase === 'failed' ? { id: r.id, title: r.title, phase: 'previewing' } : r,
      ),
    )
    void preview(failed)
  }

  const remaining = rows.filter((r) => r.phase !== 'deleted')
  const deleted = rows.filter((r) => r.phase === 'deleted')
  const failed = rows.filter((r): r is Extract<Row, { phase: 'failed' }> => r.phase === 'failed')
  const ready = rows.filter((r) => r.phase === 'ready')
  const previewing = rows.some((r) => r.phase === 'previewing')
  const notes = remaining.reduce((sum, r) => sum + ('notes' in r ? r.notes : 0), 0)
  const single = targets.length === 1
  const title = single ? `删除“${targets[0]!.title}”？` : `删除 ${remaining.length} 份资料？`

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        ref={dialog}
        className="modal-dialog deletion-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deletion-dialog-title"
        aria-describedby="deletion-dialog-body"
      >
        <h2 id="deletion-dialog-title">{title}</h2>
        <div id="deletion-dialog-body" className="deletion-dialog-body">
          <p className="deletion-warning">删除后不可恢复。</p>
          {previewing && <p role="status">正在核对…</p>}
          {!previewing && notes > 0 && (
            <p>
              {single ? '这份资料' : '这些资料'}的 {notes} 条心得会一起删除。
            </p>
          )}
          {reconfirm && <p role="alert">内容有变化，请再确认一次。</p>}
          {(error !== null || failed.length > 0) && (
            <div className="resource-error" role="alert">
              {deleted.length > 0 && <p>已删除 {deleted.length} 份。</p>}
              {failed.length > 0 ? (
                <ul>
                  {failed.map((r) => (
                    <li key={r.id}>
                      “{r.title}”未删除：{r.reason}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{error}</p>
              )}
            </div>
          )}
        </div>
        <div className="resource-actions">
          <button
            type="button"
            ref={cancelButton}
            className="journal-button"
            onClick={close}
            disabled={deleting}
          >
            取消
          </button>
          {failed.length > 0 && !deleting && (
            <button type="button" className="journal-button" onClick={retry}>
              {failed.length === remaining.length ? '重试' : '重试未删除的'}
            </button>
          )}
          <button
            type="button"
            className="journal-button danger"
            onClick={() => void confirm()}
            disabled={deleting || previewing || ready.length === 0}
          >
            {deleting ? '正在删除…' : '删除'}
          </button>
        </div>
      </div>
    </div>,
    host.current,
  )
}
