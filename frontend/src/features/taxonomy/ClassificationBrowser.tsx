import { useCallback, useState } from 'react'

import { useResourceQuery } from '../resources/useResourceQuery'
import {
  classificationError,
  labels,
  listClassifications,
  type Classification,
  type Kind,
} from './api'

export function ClassificationBrowser({
  kind,
  render,
  disabled = false,
  revision = 0,
}: {
  kind: Kind
  render: (item: Classification) => React.ReactNode
  disabled?: boolean
  revision?: number
}) {
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('name')
  const [validation, setValidation] = useState('')
  const query = new URLSearchParams({ page: String(page), page_size: '20', sort })
  if (q) query.set('q', q)
  const key = query.toString()
  const load = useCallback(() => listClassifications(kind, key), [kind, key])
  const { result, retry } = useResourceQuery(`${kind}:${key}:${revision}`, load)
  const data = result?.data
  const label = labels[kind]
  return (
    <fieldset disabled={disabled} className="classification-browser">
      <legend className="sr-only">{label}列表</legend>
      <div className="classification-search">
        <label className="resource-field">
          搜索{label}
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                search()
              }
            }}
          />
        </label>
        <button type="button" className="journal-button" onClick={search}>
          查找{label}
        </button>
        <label className="resource-field">
          {label}排序
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value)
              setPage(1)
            }}
          >
            <option value="name">名称升序</option>
            <option value="-name">名称降序</option>
            <option value="-created_at">最近创建</option>
            <option value="created_at">最早创建</option>
          </select>
        </label>
      </div>
      {validation && (
        <p role="alert" className="resource-error">
          {validation}
        </p>
      )}
      {!result && (
        <p role="status" className="resource-hint">
          正在加载{label}…
        </p>
      )}
      {result?.error !== undefined && (
        <div role="alert" className="resource-error">
          <p>{classificationError(result.error)}</p>
          <button className="journal-button" type="button" onClick={retry}>
            重新加载{label}
          </button>
        </div>
      )}
      {data && (
        <>
          <p className="resource-hint">
            共 {data.page.total_items} 个{label}
          </p>
          {data.data.length ? (
            <ul className="classification-list" aria-label={`${label}结果`}>
              {data.data.map((item) => (
                <li key={item.id}>{render(item)}</li>
              ))}
            </ul>
          ) : (
            <p className="classification-empty">
              {q || page > 1
                ? '没有匹配结果，试试其他名称或上一页。'
                : `还没有${label}，从一个小小的分类开始。`}
            </p>
          )}
          <nav className="resource-pagination" aria-label={`${label}分页`}>
            <button
              type="button"
              className="journal-button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              上一页{label}
            </button>
            <span>
              {data.page.total_pages
                ? `${data.page.number} / ${data.page.total_pages}`
                : '暂无分页'}
            </span>
            <button
              type="button"
              className="journal-button"
              disabled={!data.page.has_more}
              onClick={() => setPage(page + 1)}
            >
              下一页{label}
            </button>
          </nav>
        </>
      )}
    </fieldset>
  )
  function search() {
    if (Array.from(draft.trim()).length > (kind === 'topics' ? 80 : 50)) {
      setValidation(`搜索词最多 ${kind === 'topics' ? 80 : 50} 字。`)
      return
    }
    setValidation('')
    setPage(1)
    setQ(draft.trim())
    retry()
  }
}
