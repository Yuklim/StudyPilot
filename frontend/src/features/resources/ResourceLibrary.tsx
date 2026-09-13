import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { BookSketch, Icon } from '../../shell/Icon'
import { displayTime, listResources, sourceLabels, statusLabels } from './api'
import { ResourceDeleteDialog, type DeleteTarget } from './ResourceDeleteDialog'
import { resourceTitle } from './resourceTitle'
import { ResourceError, ResourceProgress } from './ResourceState'
import { useResourceQuery } from './useResourceQuery'
import { ClassificationChips } from './LibraryFilters'

const EMPTY_SELECTION: ReadonlySet<string> = new Set()

const DEFAULT_SORT = '-created_at'

const SORTS: [string, string][] = [
  ['-created_at', '最近添加'],
  ['created_at', '最早添加'],
  ['-updated_at', '最近更新'],
  ['updated_at', '最早更新'],
  ['title', '标题升序'],
  ['-title', '标题降序'],
  ['progress_percent', '进度升序'],
  ['-progress_percent', '进度降序'],
]

interface Applied {
  q: string
  source: string
  status: string
  sort: string
  // TASK-057：主题多选（任一）+「未分配」可并列；标签多选（任一）。
  topicIds: string[]
  unassigned: boolean
  tagIds: string[]
  page: number
  // Values the address bar asked for that this page refuses to forward.
  ignored: string[]
}

// The address bar is the single source of truth for applied filters, so refreshing,
// sharing and Back all reproduce a result set. `view` stays local: it is a display
// preference, and putting it in a shared link would impose one reader's choice on another.
function readApplied(params: URLSearchParams): Applied {
  const page = Number(params.get('page'))
  const ignored: string[] = []
  // A hand-edited address must not push unchecked values at the backend; an
  // unusable one falls back to "not specified" and is reported, never forwarded.
  const allowed = (key: string, label: string, values: string[]) => {
    const value = params.get(key)
    if (!value) return ''
    if (values.includes(value)) return value
    ignored.push(label)
    return ''
  }
  const q = params.get('q') ?? ''
  if (Array.from(q).length > 200) ignored.push('搜索词')
  return {
    q: Array.from(q).length > 200 ? '' : q,
    source: allowed('source_type', '资料类型', Object.keys(sourceLabels)),
    status: allowed('learning_status', '学习状态', Object.keys(statusLabels)),
    sort:
      allowed(
        'sort',
        '排序',
        SORTS.map(([value]) => value),
      ) || DEFAULT_SORT,
    topicIds: params.getAll('topic_id'),
    unassigned: params.get('topic_unassigned') === 'true',
    tagIds: params.getAll('tag_id'),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    ignored,
  }
}

function writeApplied(applied: Applied): URLSearchParams {
  const next = new URLSearchParams()
  if (applied.q) next.set('q', applied.q)
  if (applied.source) next.set('source_type', applied.source)
  if (applied.status) next.set('learning_status', applied.status)
  if (applied.sort !== DEFAULT_SORT) next.set('sort', applied.sort)
  applied.topicIds.forEach((id) => next.append('topic_id', id))
  if (applied.unassigned) next.set('topic_unassigned', 'true')
  applied.tagIds.forEach((id) => next.append('tag_id', id))
  if (applied.page > 1) next.set('page', String(applied.page))
  return next
}

// 草稿里只剩搜索词：类型/状态/排序与主题/标签都是点选即生效（TASK-057），直接写网址。
function draftOf(applied: Applied) {
  return { q: applied.q }
}

export function ResourceLibrary() {
  const [params, setParams] = useSearchParams()
  const address = params.toString()
  const applied = useMemo(() => readApplied(new URLSearchParams(address)), [address])
  const [draft, setDraft] = useState(() => draftOf(applied))
  const [shown, setShown] = useState({ address, q: applied.q })
  const [view, setView] = useState<'cards' | 'list'>('list')
  const [validation, setValidation] = useState('')

  if (shown.address !== address) {
    // A new address (Back, a pasted link, a chip) is the truth. The unsent search draft
    // is replaced only when the address's own `q` changed: picking a chip must not wipe
    // the words the user is still typing (TASK-057, everything else applies instantly).
    setShown({ address, q: applied.q })
    if (applied.q !== shown.q) setDraft(draftOf(applied))
  }

  const query = new URLSearchParams({
    page: String(applied.page),
    page_size: '20',
    sort: applied.sort,
  })
  if (applied.q) query.set('q', applied.q)
  if (applied.source) query.set('source_type', applied.source)
  if (applied.status) query.set('learning_status', applied.status)
  applied.topicIds.forEach((id) => query.append('topic_id', id))
  if (applied.unassigned) query.set('topic_unassigned', 'true')
  applied.tagIds.forEach((id) => query.append('tag_id', id))
  // 标签任一匹配（用户 2026-09-12 选定）；后端默认仍是全匹配，所以必须显式带上。
  if (applied.tagIds.length) query.set('tag_match', 'any')
  const key = query.toString()
  const load = useCallback(() => listResources(key), [key])
  const { result, retry } = useResourceQuery(key, load)
  const filtered = Boolean(
    applied.q ||
    applied.source ||
    applied.status ||
    applied.topicIds.length ||
    applied.unassigned ||
    applied.tagIds.length,
  )
  const page = applied.page
  const data = result?.data

  // --- TASK-056：库内删除——单个（每份一个删除按钮）与多选（复选框 + 选择条）---
  // 选择只对当前这一页有意义：把它和查询键绑在一起，翻页/筛选变化（`key` 变）就自然
  // 作废，不用 effect 去清——避免带着看不见的选中项去点「删除所选」。
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({
    key,
    ids: new Set(),
  })
  const selected = selection.key === key ? selection.ids : EMPTY_SELECTION
  const setSelected = useCallback(
    (update: (current: Set<string>) => Set<string>) =>
      setSelection((current) => ({
        key,
        ids: update(current.key === key ? current.ids : new Set()),
      })),
    [key],
  )
  const [deleteTargets, setDeleteTargets] = useState<DeleteTarget[] | null>(null)
  const rows = data?.data ?? []
  const target = (item: (typeof rows)[number]): DeleteTarget => ({
    id: item.id,
    title: resourceTitle(item),
  })
  function toggleSelected(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }
  const allOnPage = rows.length > 0 && rows.every((item) => selected.has(item.id))
  const selectedTargets = rows.filter((item) => selected.has(item.id)).map(target)
  const closeDeletion = useCallback(() => setDeleteTargets(null), [])
  const afterDeletion = useCallback(
    (ids: string[]) => {
      setSelected((current) => {
        const next = new Set(current)
        ids.forEach((id) => next.delete(id))
        return next
      })
      retry()
    },
    [retry, setSelected],
  )

  function apply(next: Applied) {
    setParams(writeApplied(next))
  }

  function search(event: FormEvent) {
    event.preventDefault()
    if (Array.from(draft.q.trim()).length > 200) {
      setValidation('搜索词最多 200 字。')
      return
    }
    setValidation('')
    apply({ ...applied, q: draft.q.trim(), page: 1, ignored: [] })
  }
  // 点选即生效：改一项就写网址、回到第一页。**基于最新网址算**（函数式更新），连点两个
  // 芯片时第二下不会拿着上一次渲染的旧状态把第一下覆盖掉。
  function pick(patch: Partial<Applied> | ((current: Applied) => Partial<Applied>)) {
    setValidation('')
    setParams((current) => {
      const latest = readApplied(current)
      const next = typeof patch === 'function' ? patch(latest) : patch
      return writeApplied({ ...latest, ...next, page: 1, ignored: [] })
    })
  }
  const toggleIn = (list: string[], id: string, on: boolean) =>
    on ? (list.includes(id) ? list : [...list, id]) : list.filter((item) => item !== id)

  return (
    <section aria-label="我的资料">
      <form
        className="resource-filters"
        onSubmit={search}
        aria-label="搜索与筛选"
        autoComplete="off"
      >
        <div className="resource-filter-top">
          <label className="resource-field search-field">
            <span className="sr-only">搜索资料</span>
            <input
              type="search"
              placeholder="搜索标题、来源名称或保存原因"
              value={draft.q}
              onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            />
          </label>
          <div className="resource-actions">
            <button className="journal-button primary" type="submit">
              搜索
            </button>
            <button
              className="journal-button"
              type="button"
              onClick={() => {
                setValidation('')
                // An already empty address means the render-time sync will not fire,
                // so the unapplied draft has to be cleared here as it was before.
                setDraft(draftOf(readApplied(new URLSearchParams())))
                setParams(new URLSearchParams())
              }}
            >
              重置
            </button>
          </div>
          <div className="view-switch" role="group" aria-label="显示方式">
            <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>
              卡片
            </button>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
              列表
            </button>
          </div>
        </div>
        <div className="resource-filter-row" aria-label="筛选条件">
          <label className="resource-field filter-select">
            <span>类型</span>
            <select
              aria-label="资料类型"
              value={applied.source}
              onChange={(e) => pick({ source: e.target.value })}
            >
              <option value="">全部类型</option>
              {Object.entries(sourceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="resource-field filter-select">
            <span>状态</span>
            <select
              aria-label="学习状态"
              value={applied.status}
              onChange={(e) => pick({ status: e.target.value })}
            >
              <option value="">全部未归档</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="resource-field filter-select">
            <span>排序</span>
            <select
              aria-label="排序"
              value={applied.sort}
              onChange={(e) => pick({ sort: e.target.value })}
            >
              {SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {validation && (
            <span className="resource-filter-note" role="alert">
              {validation}
            </span>
          )}
        </div>
        {/* 主题/标签芯片各占一行，点选即生效（TASK-057）。 */}
        <ClassificationChips
          kind="topics"
          selected={applied.topicIds}
          unassigned={applied.unassigned}
          onToggle={(id, on) => pick((cur) => ({ topicIds: toggleIn(cur.topicIds, id, on) }))}
          onToggleUnassigned={(on) => pick({ unassigned: on })}
        />
        <ClassificationChips
          kind="tags"
          selected={applied.tagIds}
          onToggle={(id, on) => pick((cur) => ({ tagIds: toggleIn(cur.tagIds, id, on) }))}
        />
      </form>
      {applied.ignored.length > 0 && (
        <p role="alert" className="resource-filter-note">
          网址里的{applied.ignored.join('、')}读不懂，已忽略；其余筛选条件照常生效。
        </p>
      )}
      <div className="resource-toolbar">
        <p aria-live="polite">
          <span>{data ? `共 ${data.page.total_items} 份资料` : '我的收藏'}</span>
          <small>筛选条件会写进网址，刷新、收藏和后退都保留</small>
        </p>
      </div>
      {!result && (
        <p role="status" className="resource-loading">
          正在翻开资料库…
        </p>
      )}
      {result?.error !== undefined && <ResourceError error={result.error} retry={retry} />}
      {data && data.data.length === 0 && (
        <div className="empty-sheet">
          <div className="book-mat">
            <BookSketch />
          </div>
          <h2>{filtered || page > 1 ? '这一页没有找到资料' : '给想学的内容，留一个位置'}</h2>
          <p>
            {filtered || page > 1
              ? '试试其他搜索词，或重置筛选回到第一页。'
              : '从一篇网页或一段文字开始，一点点填满自己的知识手帐。'}
          </p>
          <Link className="text-link" to="/resources/new">
            收藏第一份好奇
          </Link>
        </div>
      )}
      {data && data.data.length > 0 && (
        <div className="resource-selection" role="group" aria-label="批量操作">
          <label className="resource-select-all">
            <input
              type="checkbox"
              checked={allOnPage}
              onChange={(e) =>
                setSelected(() =>
                  e.target.checked ? new Set(rows.map((item) => item.id)) : new Set(),
                )
              }
            />
            全选本页
          </label>
          {selected.size > 0 && (
            <>
              <span aria-live="polite">已选 {selected.size} 份</span>
              <button
                type="button"
                className="journal-button"
                onClick={() => setSelected(() => new Set())}
              >
                清除选择
              </button>
              <button
                type="button"
                className="journal-button danger"
                onClick={() => setDeleteTargets(selectedTargets)}
              >
                删除所选
              </button>
            </>
          )}
        </div>
      )}
      {data && data.data.length > 0 && (
        <ul className={`resource-collection ${view}`} aria-label="资料结果">
          {data.data.map((item) =>
            view === 'list' ? (
              <li
                key={item.id}
                className={`resource-row${selected.has(item.id) ? ' selected' : ''}`}
              >
                <input
                  type="checkbox"
                  className="resource-select"
                  aria-label={`选择 ${resourceTitle(item)}`}
                  checked={selected.has(item.id)}
                  onChange={(e) => toggleSelected(item.id, e.target.checked)}
                />
                <div className="resource-row-main">
                  <span className={`source-chip ${item.source_type.toLowerCase()}`}>
                    {sourceLabels[item.source_type]}
                  </span>
                  <h2>
                    <Link to={`/resources/${item.id}`}>{resourceTitle(item)}</Link>
                  </h2>
                  <span className="resource-row-source">
                    {item.source_name || '未填写来源名称'}
                  </span>
                  {item.tags.length > 0 && (
                    <ul className="resource-tags" aria-label="标签">
                      {item.tags.map((tag) => (
                        <li key={tag.id}>
                          <Link to={`/resources?tag_id=${tag.id}`}>{tag.name}</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="resource-row-side">
                  <span className="resource-row-topic">
                    主题：{item.topic_id ? (item.topic_name ?? '未命名主题') : '未分配'}
                  </span>
                  <span className="resource-row-status">
                    {statusLabels[item.progress.status]} · {item.progress.progress_percent}%
                  </span>
                  <time dateTime={item.created_at}>{displayTime(item.created_at)}</time>
                </div>
                <button
                  type="button"
                  className="journal-button icon-button resource-delete"
                  aria-label={`删除 ${resourceTitle(item)}`}
                  title="删除"
                  onClick={() => setDeleteTargets([target(item)])}
                >
                  <Icon name="trash" />
                </button>
              </li>
            ) : (
              <li
                key={item.id}
                className={`resource-card${selected.has(item.id) ? ' selected' : ''}`}
              >
                <div className="resource-card-heading">
                  <input
                    type="checkbox"
                    className="resource-select"
                    aria-label={`选择 ${resourceTitle(item)}`}
                    checked={selected.has(item.id)}
                    onChange={(e) => toggleSelected(item.id, e.target.checked)}
                  />
                  <span className={`source-chip ${item.source_type.toLowerCase()}`}>
                    {sourceLabels[item.source_type]}
                  </span>
                  <span>{item.source_name || '未填写来源名称'}</span>
                  <button
                    type="button"
                    className="journal-button icon-button resource-delete"
                    aria-label={`删除 ${resourceTitle(item)}`}
                    title="删除"
                    onClick={() => setDeleteTargets([target(item)])}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
                <h2>
                  <Link to={`/resources/${item.id}`}>{resourceTitle(item)}</Link>
                </h2>
                <p className="resource-reason">{item.save_reason || '留给下一次阅读。'}</p>
                <p className="resource-hint">
                  主题：
                  {item.topic_id ? (item.topic_name ?? '暂无法读取名称，请重新加载') : '未分配'}
                </p>
                {item.tags.length > 0 && (
                  <ul className="resource-tags" aria-label="标签">
                    {item.tags.map((tag) => (
                      <li key={tag.id}>
                        <Link to={`/resources?tag_id=${tag.id}`}>{tag.name}</Link>
                      </li>
                    ))}
                  </ul>
                )}
                <ResourceProgress resource={item} />
                <time dateTime={item.created_at}>{displayTime(item.created_at)} 收藏</time>
              </li>
            ),
          )}
        </ul>
      )}
      {data && (
        <nav className="resource-pagination" aria-label="资料分页">
          <button
            className="journal-button"
            disabled={page <= 1}
            onClick={() => apply({ ...applied, page: Math.max(1, page - 1) })}
          >
            上一页
          </button>
          <span>
            {data.page.total_pages === 0
              ? '暂无分页'
              : `第 ${data.page.number} 页 / 共 ${data.page.total_pages} 页`}
          </span>
          <button
            className="journal-button"
            disabled={!data.page.has_more}
            onClick={() => apply({ ...applied, page: page + 1 })}
          >
            下一页
          </button>
        </nav>
      )}
      <Link className="text-link" to="/">
        返回学习概览
      </Link>
      {deleteTargets && deleteTargets.length > 0 && (
        <ResourceDeleteDialog
          targets={deleteTargets}
          onClose={closeDeletion}
          onDeleted={afterDeletion}
        />
      )}
    </section>
  )
}
