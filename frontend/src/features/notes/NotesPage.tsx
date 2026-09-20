import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { displayTime, failureText, type Resource } from '../resources/api'
import { resourceTitle } from '../resources/resourceTitle'
import { renderSnapshot } from '../resources/snapshotMarkdown'
import { useResourceQuery } from '../resources/useResourceQuery'
import { attachNote, deleteNote, listNotes, type Note, type NotePage } from './api'
import { noteSnippet, noteTitle } from './noteTitle'
import { ResourceAttachPicker } from './ResourceAttachPicker'

/** 两栏（列表 + 预览）的最小宽度；以下只有列表，点一条直接进编辑页。 */
const TWO_PANE = '(min-width: 1024px)'
/** 一次拉取的条数：契约上限。搜索走接口，所以这个数只影响翻页次数，不影响搜得到什么。 */
const PAGE_SIZE = 100
/** 停止输入多久之后才发搜索请求（毫秒）：一次输入打一串请求没有意义。 */
const SEARCH_DELAY = 250

function useTwoPane(fallback = true): boolean {
  const [wide, setWide] = useState(() =>
    typeof window.matchMedia === 'function' ? window.matchMedia(TWO_PANE).matches : fallback,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(TWO_PANE)
    const update = () => setWide(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return wide
}

const UNTITLED = '无标题心得'

/**
 * 「我的心得」= 独立心得的管理与预览（TASK-061，用户 2026-09-14「像 iPhone 备忘录」）。
 *
 * - 左栏：可搜索的列表（标题取第一行、摘要、更新时间），按最近更新排序，「加载更多」翻页。
 *   **搜索走接口**（TASK-070：契约给顶层 `/notes` 加了 `q`），因此命中覆盖全部独立心得，而不是
 *   只搜已经翻出来的那几页；检索标准是**标题**（正文首个非空行，用户 2026-09-19 选定），正文里
 *   出现但标题里没有的词不算命中，界面文案要把这点说清楚。
 * - 右栏（≥1024px）：选中那条的预览（同正文快照的 Markdown 渲染器）与管理动作：编辑（进整页
 *   编辑器）、后贴到资料、删除。窄屏没有右栏，点一条直接进编辑页。
 * - 选中项写进网址 `?note=<id>`：刷新、后退都还在那条上。
 * - **只有独立心得**：契约的 `GET /notes` 只列 `resource_id` 为 null 的；绑定资料的心得在资料里。
 * - **页内不放写入口**（TASK-062，用户「做成心得查询即可」）：写新的走侧栏「写心得」或 ⌘J。
 */
export function NotesPage() {
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('note')
  const wide = useTwoPane()
  // 第一页走 useResourceQuery（读取中/失败/重试都由它管）；「加载更多」拿到的后续页放本地，
  // 第一页一换（刷新）就作废。
  const [revision, setRevision] = useState(0)
  const [query, setQuery] = useState('')
  // 输入即时进 `query`（框里跟手），停笔 250ms 才进 `needle`（真正发请求的那个）。
  const [needle, setNeedle] = useState('')
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === needle) return
    const timer = window.setTimeout(() => setNeedle(trimmed), SEARCH_DELAY)
    return () => window.clearTimeout(timer)
  }, [query, needle])
  const first = useCallback(() => listNotes(null, 1, '-updated_at', PAGE_SIZE, needle), [needle])
  const { result, retry } = useResourceQuery('notes:' + revision + ':' + needle, first)
  const [extra, setExtra] = useState<{ after: NotePage | undefined; pages: Note[][] }>({
    after: undefined,
    pages: [],
  })
  const [moreError, setMoreError] = useState<unknown>(null)
  const firstPage = result?.data
  const more = useMemo(
    () => (extra.after === firstPage ? extra.pages : []),
    [extra.after, extra.pages, firstPage],
  )
  const pages = useMemo(() => (firstPage ? [firstPage.data, ...more] : []), [firstPage, more])
  // 「还有没有下一页」以最后拿到的那页为准；没加载过后续页就看第一页。
  const [moreHasMore, setMoreHasMore] = useState<boolean | null>(null)
  const canLoadMore = firstPage !== undefined && (moreHasMore ?? firstPage.page.has_more)
  const total = firstPage?.page.total_items ?? null
  const loading = result === undefined
  const error = result?.error
  const [loadingMore, setLoadingMore] = useState(false)
  // 刚后贴成功的那条：列表已刷新（它不再是独立心得），右栏仍要给出「打开《资料》」的去处。
  const [attached, setAttached] = useState<Resource | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  async function loadMore() {
    if (!firstPage || loadingMore) return
    setLoadingMore(true)
    setMoreError(null)
    try {
      const page = await listNotes(null, pages.length + 1, '-updated_at', PAGE_SIZE, needle)
      if (!alive.current) return
      setExtra({ after: firstPage, pages: [...more, page.data] })
      setMoreHasMore(page.page.has_more)
    } catch (cause) {
      if (alive.current) setMoreError(cause)
    } finally {
      if (alive.current) setLoadingMore(false)
    }
  }

  const notes = useMemo(() => pages.flat(), [pages])
  // 命中与否由后端决定（按标题匹配全部独立心得），这里不再二次过滤：前端再筛一道只会
  // 让「接口说有、界面不显示」这种不一致有机会发生。
  const searching = needle !== ''
  const selected = notes.find((row) => row.id === selectedId) ?? null
  // 地址里指着一条、但已加载的独立列表里没有：已绑定资料、已删除，或在还没加载的页里
  // （TASK-061 Review F3）。不能静默当成「没选」。
  const missing = selectedId !== null && !loading && error === undefined && selected === null

  function select(id: string | null) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (id) next.set('note', id)
        else next.delete('note')
        return next
      },
      { replace: true },
    )
  }
  function refresh() {
    setMoreHasMore(null)
    setRevision((value) => value + 1)
  }

  return (
    <section className={`notes-manager${wide ? ' two-pane' : ''}`} aria-label="我的心得">
      <div className="notes-list-pane">
        <div className="notes-list-tools">
          <div className="resource-field search-field">
            <input
              type="search"
              aria-label="按标题搜索心得"
              placeholder="按标题搜索全部心得"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <p className="resource-hint notes-list-hint" aria-live="polite">
          {searching
            ? `标题含「${needle}」的独立心得${total === null ? '' : ` ${total} 条`}`
            : total === null
              ? '独立心得'
              : `共 ${total} 条独立心得`}
          ；{searching ? '只按标题搜索，正文里的词不算。' : '绑定资料的心得在各自资料里。'}
        </p>
        {loading && (
          <p role="status" className="resource-loading">
            {searching ? '正在搜索…' : '正在翻开心得…'}
          </p>
        )}
        {error !== undefined && (
          <div className="resource-error" role="alert">
            <p>{failureText(error)}</p>
            <button type="button" className="journal-button" onClick={retry}>
              重新加载
            </button>
          </div>
        )}
        {!loading && error === undefined && notes.length === 0 && !searching && (
          <div className="empty-sheet notes-empty">
            <h2>还没有独立心得</h2>
            <p>不必先收藏资料，随手记下的想法都会留在这里。用左侧「写心得」或快捷键记一条。</p>
          </div>
        )}
        {!loading && error === undefined && notes.length === 0 && searching && (
          <p className="quiet-empty">
            没有标题含「{needle}」的独立心得。搜索只看标题（正文第一行），换个词试试。
          </p>
        )}
        {notes.length > 0 && (
          <ul className="notes-index" aria-label="心得列表">
            {notes.map((row) => {
              const title = noteTitle(row.content) ?? UNTITLED
              const snippet = noteSnippet(row.content)
              const current = row.id === selectedId
              return (
                <li key={row.id} className={current ? 'selected' : undefined}>
                  <Link
                    to={wide ? `/notes?note=${row.id}` : `/notes/${row.id}`}
                    aria-current={current ? 'true' : undefined}
                    replace={wide}
                    onClick={() => setAttached(null)}
                  >
                    <span className="notes-index-title">{title}</span>
                    {snippet && <span className="notes-index-snippet">{snippet}</span>}
                    <time dateTime={row.updated_at}>{displayTime(row.updated_at)}</time>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
        {moreError !== null && (
          <p className="resource-error" role="alert">
            {failureText(moreError)}
          </p>
        )}
        {canLoadMore && (
          <button
            type="button"
            className="journal-button notes-more"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? '正在加载…' : '加载更多'}
          </button>
        )}
      </div>
      {wide && (
        <div className="notes-preview-pane">
          {selected ? (
            <NotePreview
              key={selected.id}
              note={selected}
              onAttached={(resource) => {
                setAttached(resource)
                select(null)
                refresh()
              }}
              onDeleted={() => {
                setAttached(null)
                select(null)
                refresh()
              }}
            />
          ) : missing ? (
            <div className="notes-preview-empty" role="status">
              <p className="resource-hint">
                {searching
                  ? '这条心得不在当前搜索结果里：标题不含搜索词，也可能已后贴到资料或已删除。'
                  : '这条心得不在独立心得列表里：可能已后贴到资料、已删除，或在还没加载的页里。'}
              </p>
              <Link className="text-link" to={`/notes/${selectedId}`}>
                直接打开
              </Link>
            </div>
          ) : attached ? (
            <div className="notes-preview-done" role="status">
              <p>
                已后贴到资料。
                <Link className="text-link" to={`/resources/${attached.id}`}>
                  打开《{resourceTitle(attached)}》查看
                </Link>
              </p>
              <button type="button" className="journal-button" onClick={() => setAttached(null)}>
                回到列表
              </button>
            </div>
          ) : (
            <div className="notes-preview-empty">
              <p className="resource-hint">
                {notes.length ? '从左边选一条，在这里预览。' : '写下第一条，它会出现在左边。'}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * 右栏：一条心得的预览与管理动作。后贴/删除成功后这条已不在独立列表里，由父级立刻刷新列表
 * （`onAttached` 还带着目标资料，父级据此给出去处）。
 */
function NotePreview({
  note,
  onAttached,
  onDeleted,
}: {
  note: Note
  onAttached: (resource: Resource) => void
  onDeleted: () => void
}) {
  const [attaching, setAttaching] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  // 删除模态（TASK-061 Review F2）：打开时焦点落在「取消」，Esc 关闭，关闭后焦点还给「删除」按钮。
  const deleteButton = useRef<HTMLButtonElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!confirmDelete) return
    cancelButton.current?.focus()
    const opener = deleteButton.current
    return () => opener?.focus()
  }, [confirmDelete])
  useEffect(() => {
    if (!confirmDelete) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) setConfirmDelete(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [confirmDelete, pending])
  const title = noteTitle(note.content)
  const html = useMemo(
    () => renderSnapshot(note.content, new Map(), null, { pageTitle: title, inlineImages: true }),
    [note.content, title],
  )

  async function attach(resource: Resource) {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await attachNote(note, resource.id)
      if (!alive.current) return
      onAttached(resource)
    } catch (cause) {
      if (!alive.current) return
      setError(failureText(cause))
    } finally {
      if (alive.current) setPending(false)
    }
  }
  async function remove() {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await deleteNote(null, note)
      if (!alive.current) return
      onDeleted()
    } catch (cause) {
      if (!alive.current) return
      setConfirmDelete(false)
      setError(failureText(cause))
    } finally {
      if (alive.current) setPending(false)
    }
  }

  return (
    <article className="notes-preview" aria-label="心得预览">
      <header className="notes-preview-head">
        <h2>{title ?? UNTITLED}</h2>
        <p className="resource-hint">
          更新于 <time dateTime={note.updated_at}>{displayTime(note.updated_at)}</time> · 独立心得
        </p>
        <div className="resource-actions">
          <Link className="journal-button primary" to={`/notes/${note.id}`}>
            编辑
          </Link>
          <button
            type="button"
            className="journal-button"
            aria-expanded={attaching}
            disabled={pending}
            onClick={() => setAttaching(!attaching)}
          >
            {attaching ? '收起资料搜索' : '后贴到资料'}
          </button>
          <button
            ref={deleteButton}
            type="button"
            className="journal-button danger"
            disabled={pending}
            onClick={() => setConfirmDelete(true)}
          >
            删除
          </button>
        </div>
      </header>
      {error !== null && (
        <div className="resource-error" role="alert">
          <p>{error}</p>
        </div>
      )}
      {attaching && <ResourceAttachPicker disabled={pending} onPick={(r) => void attach(r)} />}
      <div
        className="snapshot-rendered notes-preview-body"
        // 与正文快照同一渲染器、同一 `html:false` 配置。
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {confirmDelete && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setConfirmDelete(false)
          }}
        >
          <div
            className="modal-dialog deletion-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="note-preview-delete-title"
          >
            <h2 id="note-preview-delete-title">删除“{title ?? UNTITLED}”？</h2>
            <div className="deletion-dialog-body">
              <p className="deletion-warning">删除后不可恢复。</p>
            </div>
            <div className="resource-actions">
              <button
                ref={cancelButton}
                type="button"
                className="journal-button"
                onClick={() => setConfirmDelete(false)}
                disabled={pending}
              >
                取消
              </button>
              <button
                type="button"
                className="journal-button danger"
                onClick={() => void remove()}
                disabled={pending}
              >
                {pending ? '正在删除…' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}
