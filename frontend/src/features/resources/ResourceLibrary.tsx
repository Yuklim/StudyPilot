import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { BookSketch } from '../../shell/Icon'
import { displayTime, listResources, sourceLabels, statusLabels } from './api'
import { resourceTitle } from './resourceTitle'
import { ResourceError, ResourceProgress } from './ResourceState'
import { useResourceQuery } from './useResourceQuery'
import { ClassificationPicker, type Selection } from '../taxonomy/ClassificationPicker'
import { getClassification, type Kind } from '../taxonomy/api'

const DEFAULT_SORT = '-created_at'
const UNASSIGNED = 'unassigned'
// Chip text shown while an id from the address bar has no name yet, or cannot get one.
// They are placeholders, never real names, so they must not be cached as if they were.
const PENDING_NAME = '正在读取名称…'
const MISSING_NAME = '（已不存在）'

interface Applied {
  q: string
  source: string
  status: string
  sort: string
  topicId: string
  tagIds: string[]
  page: number
}

// The address bar is the single source of truth for applied filters, so refreshing,
// sharing and Back all reproduce a result set. `view` stays local: it is a display
// preference, and putting it in a shared link would impose one reader's choice on another.
function readApplied(params: URLSearchParams): Applied {
  const page = Number(params.get('page'))
  return {
    q: params.get('q') ?? '',
    source: params.get('source_type') ?? '',
    status: params.get('learning_status') ?? '',
    sort: params.get('sort') || DEFAULT_SORT,
    topicId:
      params.get('topic_unassigned') === 'true' ? UNASSIGNED : (params.get('topic_id') ?? ''),
    tagIds: params.getAll('tag_id'),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  }
}

function writeApplied(applied: Applied): URLSearchParams {
  const next = new URLSearchParams()
  if (applied.q) next.set('q', applied.q)
  if (applied.source) next.set('source_type', applied.source)
  if (applied.status) next.set('learning_status', applied.status)
  if (applied.sort !== DEFAULT_SORT) next.set('sort', applied.sort)
  if (applied.topicId === UNASSIGNED) next.set('topic_unassigned', 'true')
  else if (applied.topicId) next.set('topic_id', applied.topicId)
  applied.tagIds.forEach((id) => next.append('tag_id', id))
  if (applied.page > 1) next.set('page', String(applied.page))
  return next
}

function draftOf(applied: Applied) {
  return {
    q: applied.q,
    source: applied.source,
    status: applied.status,
    sort: applied.sort,
    classification: selectionOf(applied),
  }
}

function selectionOf(applied: Applied): Selection {
  return {
    topic: applied.topicId ? { id: applied.topicId, name: '' } : null,
    tags: applied.tagIds.map((id) => ({ id, name: '' })),
  }
}

export function ResourceLibrary() {
  const [params, setParams] = useSearchParams()
  const address = params.toString()
  const applied = useMemo(() => readApplied(new URLSearchParams(address)), [address])
  // Ids come from the address bar without names; resolve them so the chips stay readable.
  const [names, setNames] = useState<Record<string, string>>({})
  const [lookupFailed, setLookupFailed] = useState(false)
  const [draft, setDraft] = useState(() => draftOf(applied))
  const [shown, setShown] = useState(address)
  const [view, setView] = useState<'cards' | 'list'>('list')
  const [validation, setValidation] = useState('')

  if (shown !== address) {
    // A new address (Back, a tag chip, a pasted link) replaces the unapplied form.
    setShown(address)
    setDraft(draftOf(applied))
  }

  useEffect(() => {
    const wanted: [Kind, string][] = [
      ...(applied.topicId && applied.topicId !== UNASSIGNED
        ? ([['topics', applied.topicId]] as [Kind, string][])
        : []),
      ...applied.tagIds.map((id) => ['tags', id] as [Kind, string]),
    ]
    const missing = wanted.filter(([, id]) => names[id] === undefined)
    if (!missing.length) return
    let alive = true
    void Promise.all(
      missing.map(async ([kind, id]) => {
        // An empty name marks "asked and could not resolve", so we never ask twice.
        try {
          return [id, (await getClassification(kind, id)).name || ' '] as const
        } catch {
          return [id, ''] as const
        }
      }),
    ).then((rows) => {
      if (!alive) return
      setNames((current) => ({ ...current, ...Object.fromEntries(rows) }))
      if (rows.some(([, name]) => !name)) setLookupFailed(true)
    })
    return () => {
      alive = false
    }
  }, [applied, names])

  function label(choice: { id: string; name: string }): string {
    if (choice.id === UNASSIGNED) return '未分配主题'
    if (choice.name) return choice.name
    const known = names[choice.id]
    if (known === undefined) return PENDING_NAME
    return known.trim() || MISSING_NAME
  }
  const named = (selection: Selection): Selection => ({
    topic: selection.topic ? { ...selection.topic, name: label(selection.topic) } : null,
    tags: selection.tags.map((tag) => ({ ...tag, name: label(tag) })),
  })

  const query = new URLSearchParams({
    page: String(applied.page),
    page_size: '20',
    sort: applied.sort,
  })
  if (applied.q) query.set('q', applied.q)
  if (applied.source) query.set('source_type', applied.source)
  if (applied.status) query.set('learning_status', applied.status)
  if (applied.topicId === UNASSIGNED) query.set('topic_unassigned', 'true')
  else if (applied.topicId) query.set('topic_id', applied.topicId)
  applied.tagIds.forEach((id) => query.append('tag_id', id))
  const key = query.toString()
  const load = useCallback(() => listResources(key), [key])
  const { result, retry } = useResourceQuery(key, load)
  const filtered = Boolean(
    applied.q || applied.source || applied.status || applied.topicId || applied.tagIds.length,
  )
  const page = applied.page
  const data = result?.data

  function apply(next: Applied) {
    setLookupFailed(false)
    setParams(writeApplied(next))
  }

  function search(event: FormEvent) {
    event.preventDefault()
    if (Array.from(draft.q.trim()).length > 200) {
      setValidation('搜索词最多 200 字。')
      return
    }
    setValidation('')
    apply({
      q: draft.q.trim(),
      source: draft.source,
      status: draft.status,
      sort: draft.sort,
      topicId: draft.classification.topic?.id ?? '',
      tagIds: draft.classification.tags.map((tag) => tag.id),
      page: 1,
    })
  }

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
              搜索 / 应用筛选
            </button>
            <button
              className="journal-button"
              type="button"
              onClick={() => {
                setValidation('')
                setLookupFailed(false)
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
              value={draft.source}
              onChange={(e) => setDraft({ ...draft, source: e.target.value })}
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
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
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
              value={draft.sort}
              onChange={(e) => setDraft({ ...draft, sort: e.target.value })}
            >
              {[
                ['-created_at', '最近添加'],
                ['created_at', '最早添加'],
                ['-updated_at', '最近更新'],
                ['updated_at', '最早更新'],
                ['title', '标题升序'],
                ['-title', '标题降序'],
                ['progress_percent', '进度升序'],
                ['-progress_percent', '进度降序'],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <ClassificationPicker
            value={named(draft.classification)}
            onChange={(classification) => {
              // Names picked in page are authoritative; remember them for the address bar.
              setNames((current) => ({
                ...current,
                ...Object.fromEntries(
                  [...(classification.topic ? [classification.topic] : []), ...classification.tags]
                    .filter(
                      (choice) =>
                        choice.name &&
                        choice.id !== UNASSIGNED &&
                        choice.name !== PENDING_NAME &&
                        choice.name !== MISSING_NAME,
                    )
                    .map((choice) => [choice.id, choice.name]),
                ),
              }))
              setDraft({ ...draft, classification })
            }}
            filter
          />
          {validation && (
            <span className="resource-filter-note" role="alert">
              {validation}
            </span>
          )}
        </div>
      </form>
      {lookupFailed && (
        <p role="alert" className="resource-filter-note">
          网址里有已不存在或读不到的主题/标签，它对应的筛选条件仍在生效但显示不出名称；其余筛选条件不受影响。
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
        <ul className={`resource-collection ${view}`} aria-label="资料结果">
          {data.data.map((item) =>
            view === 'list' ? (
              <li key={item.id} className="resource-row">
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
              </li>
            ) : (
              <li key={item.id} className="resource-card">
                <div className="resource-card-heading">
                  <span className={`source-chip ${item.source_type.toLowerCase()}`}>
                    {sourceLabels[item.source_type]}
                  </span>
                  <span>{item.source_name || '未填写来源名称'}</span>
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
    </section>
  )
}
