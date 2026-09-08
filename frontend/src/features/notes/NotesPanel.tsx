import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { ApiError } from '../../api/client'
import { displayTime, type Resource } from '../resources/api'
import { resourceTitle } from '../resources/resourceTitle'
import { useResourceQuery } from '../resources/useResourceQuery'
import {
  attachNote,
  cleanContent,
  deleteNote,
  detachNote,
  getNote,
  listNotes,
  needsRecovery,
  noteError,
  saveNote,
  type Note,
} from './api'
import { ResourceAttachPicker } from './ResourceAttachPicker'

export function NotesPanel({
  resourceId,
  available = true,
  focusRequest = 0,
  onCount,
}: {
  /** 绑定资料的心得传资源 id；独立心得(顶层「我的心得」页)传 null 或不传。 */
  resourceId?: string | null
  available?: boolean
  /**
   * TASK-045：`ResourceDetail` 每次请求聚焦写作框就递增一次（心得按钮＝开合 + 聚焦
   * 一体）。token 变化且此刻确实有写作框时把焦点放进去。可选：顶层「我的心得」页等
   * 独立用法不传，行为完全不变。
   */
  focusRequest?: number
  /**
   * TASK-045：读到心得总数（`result.data.page.total_items`）后回传给入口按钮做角标。
   * 只在心得区挂载、`scope` 有资料时才有意义，由 `ResourceDetail` 传入；独立用法不传。
   */
  onCount?: (total: number) => void
}) {
  const scope = resourceId ?? null
  const standalone = scope === null
  const [draft, setDraft] = useState('')
  const [selected, setSelected] = useState<Note | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<ReactNode>('')
  const [pending, setPending] = useState(false)
  const [attachFor, setAttachFor] = useState<string | null>(null)
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
  // TASK-045：心得按钮＝开合 + 聚焦一体。focusRequest 是父级每次「想聚焦写作框」就 +1 的
  // **单调 token**：同一 token 只消费一次。若把 available/deleting/pending 的翻转也当新请求，
  // 资源刷新（`available` 短暂翻 false 再回 true）就会在用户正操作别的面板时把焦点抢回
  // 写作框——候选 f1e96e1 上 Reviewer 抓到的焦点回归。因此用 ref 记住已消费的 token。
  const lastFocusRequest = useRef(0)
  useEffect(() => {
    if (focusRequest === lastFocusRequest.current) return
    lastFocusRequest.current = focusRequest
    if (!focusRequest) return
    if (!available || deleting || pending) return
    input.current?.focus()
  }, [focusRequest, available, deleting, pending])
  const load = useCallback(() => listNotes(scope, page), [scope, page])
  const { result, retry } = useResourceQuery(
    (scope ?? 'standalone') + ':' + page + ':' + revision,
    load,
  )
  // TASK-045：把这份资料已绑定心得总数报给入口按钮做角标。total_items 随新增/删除
  // 变化，角标实时增减；值不变（例如只改内容）则不重报。
  const totalNotes = result?.data?.page.total_items
  useEffect(() => {
    if (totalNotes === undefined) return
    onCount?.(totalNotes)
  }, [onCount, totalNotes])
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
    setAttachFor(null)
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
      const latest = await getNote(scope, row.id)
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
  async function attach(row: Note, resource: Resource) {
    if (busy.current || !available || !discardAllowed()) return
    busy.current = true
    setPending(true)
    setAttachFor(null)
    setNotice('')
    setError('')
    try {
      await attachNote(row, resource.id)
      if (!alive.current) return
      setRevision((value) => value + 1)
      setNotice(
        <>
          已后贴到资料。
          <Link className="text-link" to={`/resources/${resource.id}`}>
            打开《{resourceTitle(resource)}》查看
          </Link>
        </>,
      )
    } catch (cause) {
      if (!alive.current) return
      setError(`${noteError(cause)} 该心得状态可能已变化，列表已刷新，请核对后再试。`)
      setRevision((value) => value + 1)
    } finally {
      finish()
    }
  }
  async function detach(row: Note) {
    if (busy.current || !available || !discardAllowed()) return
    if (!window.confirm('解除后这条心得回到「我的心得」，不再挂在这份资料下。确定解除吗？')) return
    busy.current = true
    setPending(true)
    setNotice('')
    setError('')
    try {
      await detachNote(row)
      if (!alive.current) return
      setRevision((value) => value + 1)
      setNotice(
        <>
          已解除为独立心得。
          <Link className="text-link" to="/notes">
            去「我的心得」查看
          </Link>
        </>,
      )
    } catch (cause) {
      if (!alive.current) return
      setError(`${noteError(cause)} 该心得状态可能已变化，列表已刷新，请核对后再试。`)
      setRevision((value) => value + 1)
    } finally {
      finish()
    }
  }
  function toggleAttach(row: Note) {
    if (busy.current || !available || !discardAllowed()) return
    if (attachFor === row.id) {
      setAttachFor(null)
      return
    }
    setAttachFor(row.id)
    setNotice('')
    setError('')
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
        await deleteNote(scope, selected)
        if (alive.current)
          setNotice(scope === null ? '这条心得已删除。' : '这条心得已删除，资料与其他记录仍保留。')
      } else {
        const saved = await saveNote(scope, draft, selected)
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
        const latest = await getNote(scope, selected.id)
        if (!alive.current) return
        setSelected(latest)
      } else {
        const latest = await listNotes(scope, 1)
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
        <h2>{standalone ? '我的心得' : '随手记心得'}</h2>
        <span className="note-tab">
          {standalone ? '不先收藏资料，也能留住想法' : '留住此刻的想法'}
        </span>
      </div>
      <p className="resource-hint">
        {standalone
          ? '一句理解、一个疑问，都值得留下；独立心得不绑定资料，随时可写可回看。'
          : '一句理解、一个疑问，都值得留下。不用填学习时长或进度。'}
      </p>
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
            <p>
              {standalone
                ? '删除后无法恢复。只删除这一条独立心得。'
                : '删除后无法恢复。只删除下面这条心得，不影响资料或其他记录。'}
            </p>
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
                  {standalone && (
                    <button
                      className="journal-button"
                      disabled={pending}
                      onClick={() => toggleAttach(row)}
                    >
                      {attachFor === row.id ? '收起资料搜索' : '后贴到资料'}
                    </button>
                  )}
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
                  {!standalone && (
                    <button
                      className="journal-button"
                      disabled={pending}
                      onClick={() => void detach(row)}
                    >
                      解除绑定
                    </button>
                  )}
                </div>
                {standalone && attachFor === row.id && (
                  <ResourceAttachPicker
                    disabled={pending}
                    onPick={(resource) => void attach(row, resource)}
                  />
                )}
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
