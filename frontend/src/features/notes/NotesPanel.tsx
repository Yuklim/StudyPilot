import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import { ApiError } from '../../api/client'
import { displayTime } from '../resources/api'
import { useResourceQuery } from '../resources/useResourceQuery'
import {
  cleanContent,
  deleteNote,
  getNote,
  listNotes,
  needsRecovery,
  noteError,
  saveNote,
  type Note,
} from './api'

export function NotesPanel({
  resourceId,
  available = true,
}: {
  resourceId: string
  available?: boolean
}) {
  const [draft, setDraft] = useState('')
  const [selected, setSelected] = useState<Note | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const [recovery, setRecovery] = useState<{ verified: boolean; missing: boolean } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [checkedNotes, setCheckedNotes] = useState<Note[]>([])
  const busy = useRef(false)
  const alive = useRef(true)
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    if (selected && !deleting && !pending) input.current?.focus()
  }, [selected, deleting, pending])
  const load = useCallback(() => listNotes(resourceId, page), [resourceId, page])
  const { result, retry } = useResourceQuery(resourceId + ':' + page + ':' + revision, load)
  const dirty = !deleting && draft !== (selected?.content ?? '')
  function discardAllowed() {
    return !dirty || window.confirm('这份草稿尚未保存，确定放弃当前编辑吗？')
  }
  function reset() {
    setSelected(null)
    setDraft('')
    setDeleting(false)
    setRecovery(null)
    setConfirmed(false)
    setError('')
  }
  function finish() {
    busy.current = false
    if (alive.current) setPending(false)
  }
  async function choose(row: Note, remove: boolean) {
    if (busy.current || !available || !discardAllowed()) return
    busy.current = true
    setPending(true)
    setNotice('')
    setError('')
    try {
      const latest = await getNote(resourceId, row.id)
      if (!alive.current) return
      setSelected(latest)
      setDraft(latest.content)
      setDeleting(remove)
      setRecovery(null)
      setConfirmed(false)
      if (!remove) input.current?.focus()
    } catch (cause) {
      if (alive.current) setError(noteError(cause))
    } finally {
      finish()
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (
      busy.current ||
      !available ||
      (recovery && (!recovery.verified || recovery.missing || !confirmed))
    )
      return
    if (deleting && (!selected || !confirmed)) return
    if (!deleting && (!cleanContent(draft) || [...cleanContent(draft)].length > 50000)) {
      setError('写下一点内容再保存吧，最多 50,000 个字符。')
      return
    }
    busy.current = true
    setPending(true)
    setError('')
    setNotice('')
    try {
      if (deleting && selected) {
        await deleteNote(resourceId, selected)
        if (alive.current) setNotice('这条心得已删除，资料与其他记录仍保留。')
      } else {
        const saved = await saveNote(resourceId, draft, selected)
        if (alive.current) setNotice(`心得已保存 · ${displayTime(saved.updated_at)}`)
      }
      if (alive.current) {
        reset()
        setPage(1)
        setRevision((value) => value + 1)
      }
    } catch (cause) {
      if (!alive.current) return
      setError(noteError(cause))
      if (needsRecovery(cause) || (cause instanceof ApiError && cause.status === 404)) {
        setRecovery({ verified: false, missing: false })
        setConfirmed(false)
        setError('操作结果需要核对，草稿仍在。请先读取最新心得；不会自动重复保存或删除。')
      }
    } finally {
      finish()
    }
  }
  async function recover() {
    if (busy.current || !available) return
    busy.current = true
    setPending(true)
    setConfirmed(false)
    // A failed re-read must never unlock a previous, potentially stale write.
    setRecovery({ verified: false, missing: false })
    try {
      if (selected) {
        const latest = await getNote(resourceId, selected.id)
        if (!alive.current) return
        setSelected(latest)
      } else {
        const latest = await listNotes(resourceId, 1)
        if (!alive.current) return
        setCheckedNotes(latest.data)
        setPage(1)
      }
      setRevision((value) => value + 1)
      setRecovery({ verified: true, missing: false })
      setError('已读取最新内容。请与当前草稿核对，确认仍有需要后再操作。')
    } catch (cause) {
      if (!alive.current) return
      if (selected && cause instanceof ApiError && cause.code === 'NOTE_NOT_FOUND') {
        setRecovery({ verified: true, missing: true })
        setError('这条心得已不存在。草稿仍保留，不会自动新增或再次删除。')
        setRevision((value) => value + 1)
      } else setError(noteError(cause))
    } finally {
      finish()
    }
  }
  return (
    <section className="notes-panel" aria-label="个人心得">
      <div className="section-heading">
        <h2>随手记心得</h2>
        <span className="note-tab">留住此刻的想法</span>
      </div>
      <p className="resource-hint">一句理解、一个疑问，都值得留下。不用填学习时长或进度。</p>
      {!available && <p role="status">正在核对资料，暂不能保存或删除心得；当前草稿仍保留。</p>}
      <form
        className="note-editor"
        aria-label="心得编辑"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        {deleting && selected ? (
          <>
            <h3>删除这条心得？</h3>
            <p>删除后无法恢复。只删除下面这条心得，不影响资料或其他记录。</p>
            <p className="record-text note-delete-preview">{selected.content}</p>
          </>
        ) : (
          <label>
            {selected ? '编辑心得' : '这次想记下什么？'}
            <textarea
              ref={input}
              rows={4}
              value={draft}
              disabled={pending}
              placeholder="刚刚读到的理解、还没想通的疑问……"
              onChange={(event) => {
                setDraft(event.target.value)
                setNotice('')
                setConfirmed(false)
              }}
            />
          </label>
        )}
        <p className="resource-hint">
          {selected && !deleting ? '正在修改已有心得。' : ''}
          草稿仅保留在本页；刷新或离开前请先保存。
        </p>
        {notice && (
          <p role="status" className="note-saved">
            {notice}
          </p>
        )}
        {error && (
          <div role="alert" className="resource-error">
            <p>{error}</p>
            {recovery && (
              <button
                className="journal-button"
                type="button"
                disabled={pending}
                onClick={() => void recover()}
              >
                保留草稿，读取最新心得
              </button>
            )}
          </div>
        )}
        {recovery?.verified && selected && !deleting && !recovery.missing && (
          <section aria-label="最新已保存内容">
            <h3>最新已保存内容</h3>
            <p className="record-text">{selected.content}</p>
          </section>
        )}
        {recovery?.verified && !selected && (
          <section aria-label="刚读取的最新心得">
            <h3>刚读取的最新心得</h3>
            <p className="resource-hint">
              下面是最新一页。也可在心得列表翻页核对；已存在的内容无需再次保存。
            </p>
            {checkedNotes.length ? (
              checkedNotes.map((row) => (
                <p className="record-text" key={row.id}>
                  {row.content}
                </p>
              ))
            ) : (
              <p>暂未查到心得。</p>
            )}
          </section>
        )}
        {(deleting || recovery?.verified) && !recovery?.missing && (
          <label className="note-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={pending}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            {deleting ? '我确认永久删除上方这条心得' : '我已核对最新心得，确认仍需保存当前草稿'}
          </label>
        )}
        <div className="record-actions">
          <button
            className="journal-button primary"
            type="submit"
            disabled={
              pending ||
              !available ||
              (deleting && !confirmed) ||
              (!!recovery && (!recovery.verified || recovery.missing || !confirmed))
            }
          >
            {pending ? '正在处理…' : deleting ? '确认删除心得' : selected ? '保存修改' : '保存心得'}
          </button>
          {(selected || recovery) && (
            <button
              className="journal-button"
              type="button"
              disabled={pending}
              onClick={() => {
                if (discardAllowed()) {
                  reset()
                  setNotice('')
                }
              }}
            >
              取消，返回新增
            </button>
          )}
          {recovery?.missing && !deleting && (
            <button
              className="journal-button"
              type="button"
              disabled={pending}
              onClick={() => {
                setSelected(null)
                setRecovery(null)
                setConfirmed(false)
                setError('')
                setNotice('草稿已转为新心得，尚未保存。')
              }}
            >
              作为新心得继续编辑
            </button>
          )}
        </div>
      </form>
      <div className="section-heading">
        <h3>留下的心得</h3>
        <button className="journal-button" type="button" onClick={retry}>
          刷新心得列表
        </button>
      </div>
      {!result && <p role="status">正在翻开心得…</p>}
      {result?.error !== undefined && (
        <div role="alert" className="resource-error">
          <p>{noteError(result.error)}</p>
          <button className="journal-button" onClick={retry}>
            重新读取心得列表
          </button>
        </div>
      )}
      {result?.data && (
        <>
          {!result.data.data.length && (
            <p className="quiet-empty">
              {page === 1
                ? '还没有心得，写下一句话就可以开始。'
                : '这一页已没有心得，可以返回上一页。'}
            </p>
          )}
          <ol className="record-list" aria-label="心得列表">
            {result.data.data.map((row) => (
              <li className="note-card" key={row.id}>
                <p className="record-text">{row.content}</p>
                <p className="resource-hint">
                  保存于 <time dateTime={row.created_at}>{displayTime(row.created_at)}</time>
                  {row.updated_at !== row.created_at && (
                    <>
                      {' '}
                      · 更新于 <time dateTime={row.updated_at}>{displayTime(row.updated_at)}</time>
                    </>
                  )}
                </p>
                <div className="record-actions">
                  <button
                    className="journal-button"
                    disabled={pending}
                    onClick={() => void choose(row, false)}
                  >
                    编辑
                  </button>
                  <button
                    className="journal-button"
                    disabled={pending}
                    onClick={() => void choose(row, true)}
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <nav className="record-actions" aria-label="心得分页">
            <button
              className="journal-button"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              上一页心得
            </button>
            <span>
              第 {page} 页 · 共 {result.data.page.total_items} 条心得
            </span>
            <button
              className="journal-button"
              disabled={!result.data.page.has_more}
              onClick={() => setPage(page + 1)}
            >
              下一页心得
            </button>
          </nav>
        </>
      )}
    </section>
  )
}
