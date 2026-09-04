import { useCallback, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { BookSketch } from '../../shell/Icon'
import { displayTime, listResources, sourceLabels, statusLabels } from './api'
import { ResourceError, ResourceProgress } from './ResourceState'
import { useResourceQuery } from './useResourceQuery'
import { ClassificationPicker, type Selection } from '../taxonomy/ClassificationPicker'

const initialFilters = {
  q: '',
  source: '',
  status: '',
  sort: '-created_at',
  classification: { topic: null, tags: [] } as Selection,
}
export function ResourceLibrary() {
  const [draft, setDraft] = useState(initialFilters)
  const [filters, setFilters] = useState(initialFilters)
  const [page, setPage] = useState(1)
  const [view, setView] = useState<'cards' | 'list'>('list')
  const [validation, setValidation] = useState('')
  const query = new URLSearchParams({ page: String(page), page_size: '20', sort: filters.sort })
  if (filters.q) query.set('q', filters.q)
  if (filters.source) query.set('source_type', filters.source)
  if (filters.status) query.set('learning_status', filters.status)
  if (filters.classification.topic?.id === 'unassigned') query.set('topic_unassigned', 'true')
  else if (filters.classification.topic) query.set('topic_id', filters.classification.topic.id)
  filters.classification.tags.forEach((tag) => query.append('tag_id', tag.id))
  const key = query.toString()
  const load = useCallback(() => listResources(key), [key])
  const { result, retry } = useResourceQuery(key, load)
  const filtered = Boolean(
    filters.q ||
    filters.source ||
    filters.status ||
    filters.classification.topic ||
    filters.classification.tags.length,
  )
  const data = result?.data

  function search(event: FormEvent) {
    event.preventDefault()
    if (Array.from(draft.q.trim()).length > 200) {
      setValidation('搜索词最多 200 字。')
      return
    }
    setValidation('')
    setPage(1)
    setFilters({ ...draft, q: draft.q.trim() })
  }

  return (
    <section aria-label="我的资料">
      <form
        className="resource-filters"
        onSubmit={search}
        aria-label="搜索与筛选"
        autoComplete="off"
      >
        <label className="resource-field search-field">
          搜索资料
          <input
            type="search"
            placeholder="搜索标题、来源名称或保存原因"
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
          />
        </label>
        <label className="resource-field">
          资料类型
          <select
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
        <label className="resource-field">
          学习状态
          <select
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
        <label className="resource-field">
          排序
          <select value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: e.target.value })}>
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
          value={draft.classification}
          onChange={(classification) => setDraft({ ...draft, classification })}
          filter
        />
        <div className="resource-actions">
          <button className="journal-button primary" type="submit">
            搜索 / 应用筛选
          </button>
          <button
            className="journal-button"
            type="button"
            onClick={() => {
              setDraft(initialFilters)
              setFilters(initialFilters)
              setPage(1)
              setValidation('')
            }}
          >
            重置
          </button>
        </div>
        {validation && <p role="alert">{validation}</p>}
      </form>
      <div className="resource-toolbar">
        <p aria-live="polite">
          <span>{data ? `共 ${data.page.total_items} 份资料` : '我的收藏'}</span>
          <small>筛选条件离开本页后重置</small>
        </p>
        <div className="view-switch" role="group" aria-label="显示方式">
          <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>
            卡片
          </button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
            列表
          </button>
        </div>
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
                    <Link to={`/resources/${item.id}`}>{item.title}</Link>
                  </h2>
                  <span className="resource-row-source">
                    {item.source_name || '未填写来源名称'}
                  </span>
                  {item.tags.length > 0 && (
                    <ul className="resource-tags" aria-label="标签">
                      {item.tags.map((tag) => (
                        <li key={tag.id}>{tag.name}</li>
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
                  <Link to={`/resources/${item.id}`}>{item.title}</Link>
                </h2>
                <p className="resource-reason">{item.save_reason || '留给下一次阅读。'}</p>
                <p className="resource-hint">
                  主题：
                  {item.topic_id ? (item.topic_name ?? '暂无法读取名称，请重新加载') : '未分配'}
                </p>
                {item.tags.length > 0 && (
                  <ul className="resource-tags" aria-label="标签">
                    {item.tags.map((tag) => (
                      <li key={tag.id}>{tag.name}</li>
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
            onClick={() => setPage((value) => Math.max(1, value - 1))}
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
            onClick={() => setPage((value) => value + 1)}
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
