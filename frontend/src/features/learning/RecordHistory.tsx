import { useCallback, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { displayTime, statusLabels } from '../resources/api'
import { useResourceQuery } from '../resources/useResourceQuery'
import { learningError, listRecords } from './api'
import { toInstant } from './model'

export function RecordHistory({ resourceId }: { resourceId?: string }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState('-started_at')
  const [applied, setApplied] = useState('sort=-started_at')
  const [page, setPage] = useState(1)
  const [validation, setValidation] = useState('')
  const query = applied + '&page=' + page + '&page_size=20'
  const load = useCallback(() => listRecords(query, resourceId), [query, resourceId])
  const { result, retry } = useResourceQuery((resourceId ?? 'all') + query, load)
  function apply(event: FormEvent) {
    event.preventDefault()
    const start = from ? toInstant(from) : null
    const end = to ? toInstant(to) : null
    if ((from && !start) || (to && !end) || (start && end && start > end)) {
      setValidation('请填写有效的本地时间，结束时间不能早于开始时间。')
      return
    }
    const values = new URLSearchParams({ sort })
    if (start) values.set('started_from', start)
    if (end) values.set('started_to', end)
    setValidation('')
    setApplied(values.toString())
    setPage(1)
  }
  return (
    <section
      className="record-history"
      aria-label={resourceId ? '这份资料的学习历史' : '全部学习历史'}
    >
      <div className="section-heading">
        <h2>学习历史</h2>
        <span className="note-tab">一点一滴，留下痕迹</span>
      </div>
      <p className="resource-hint">
        记录只能追加，不能修改或删除。按浏览器本地时区显示；时间筛选的结束点不包含在内。
      </p>
      <form className="record-filters" onSubmit={apply} aria-label="筛选学习历史">
        <label>
          记录开始时间起
          <input
            type="datetime-local"
            step="1"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          记录开始时间止
          <input
            type="datetime-local"
            step="1"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          记录排序
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="-started_at">学习时间：新到旧</option>
            <option value="started_at">学习时间：旧到新</option>
            <option value="-created_at">记录时间：新到旧</option>
            <option value="created_at">记录时间：旧到新</option>
            <option value="-duration_seconds">时长：长到短</option>
            <option value="duration_seconds">时长：短到长</option>
          </select>
        </label>
        <div className="record-actions">
          <button className="journal-button" type="submit">
            筛选记录
          </button>
          <button
            className="journal-button"
            type="button"
            onClick={() => {
              setFrom('')
              setTo('')
              setSort('-started_at')
              setApplied('sort=-started_at')
              setPage(1)
              setValidation('')
            }}
          >
            重置记录筛选
          </button>
          <button className="journal-button" type="button" onClick={retry}>
            刷新历史
          </button>
        </div>
      </form>
      {validation && (
        <p role="alert" className="resource-error">
          {validation}
        </p>
      )}
      {!result && <p role="status">正在翻开学习历史…</p>}
      {result?.error !== undefined && (
        <div role="alert" className="resource-error">
          <p>{learningError(result.error, true)}</p>
          <button className="journal-button" onClick={retry}>
            重新读取历史
          </button>
        </div>
      )}
      {result?.data && (
        <>
          {!result.data.data.length && (
            <div className="quiet-empty">
              <h3>这一页还没有学习记录</h3>
              <p>从资料详情展开学习手帐，留下第一次记录；也可以调整筛选条件。</p>
              {!resourceId && (
                <Link className="text-link" to="/resources">
                  去资料库选择资料
                </Link>
              )}
            </div>
          )}
          <ol className="record-list" aria-label="学习历史结果">
            {result.data.data.map((row) => (
              <li className="record-card" key={row.id}>
                <div className="record-card-heading">
                  <time dateTime={row.started_at}>{displayTime(row.started_at)}</time>
                  <span>
                    {row.duration_seconds} 秒 · {(row.duration_seconds / 60).toFixed(1)} 分钟
                  </span>
                </div>
                <p>
                  {statusLabels[row.status_before]} {row.progress_before}% →{' '}
                  {statusLabels[row.status_after]} {row.progress_after}%
                </p>
                <h3>本次总结</h3>
                <p className="record-text">{row.summary || '未填写总结'}</p>
                <h3>疑问与下一步</h3>
                <p className="record-text">{row.questions_next || '未填写疑问或下一步'}</p>
                <p className="resource-hint">
                  记录于 <time dateTime={row.created_at}>{displayTime(row.created_at)}</time>
                </p>
                {!resourceId && (
                  <Link className="text-link" to={'/resources/' + row.resource_id}>
                    打开这条记录对应的资料
                  </Link>
                )}
              </li>
            ))}
          </ol>
          <nav className="record-actions" aria-label="学习历史分页">
            <button
              className="journal-button"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              上一页记录
            </button>
            <span>
              第 {page} 页 · 共 {result.data.page.total_items} 条记录
            </span>
            <button
              className="journal-button"
              disabled={!result.data.page.has_more}
              onClick={() => setPage(page + 1)}
            >
              下一页记录
            </button>
          </nav>
        </>
      )}
    </section>
  )
}
