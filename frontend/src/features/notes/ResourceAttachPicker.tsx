import { useState, type FormEvent } from 'react'

import { failureText, listResources, type Resource } from '../resources/api'
import { resourceTitle } from '../resources/resourceTitle'

/** 搜索可读资料并选一份，作为「后贴」的目标。只负责选择，不发起 attach。 */
export function ResourceAttachPicker({
  disabled,
  onPick,
}: {
  disabled: boolean
  onPick: (resource: Resource) => void
}) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<Resource[] | null>(null)
  const [error, setError] = useState('')
  async function search(event: FormEvent) {
    event.preventDefault()
    if (disabled) return
    const keyword = query.trim()
    if (!keyword) return
    setError('')
    try {
      const page = await listResources(`q=${encodeURIComponent(keyword)}&page=1&page_size=20`)
      setResult(page.data)
    } catch (cause) {
      setResult(null)
      setError(failureText(cause))
    }
  }
  return (
    <div className="resource-attach-picker">
      <form aria-label="搜索要后贴的资料" onSubmit={(event) => void search(event)} noValidate>
        <label>
          资料标题关键词
          <input
            value={query}
            disabled={disabled}
            placeholder="输入标题搜索资料库"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="journal-button" type="submit" disabled={disabled}>
          搜索资料
        </button>
      </form>
      <p className="resource-hint">
        搜索后会列出资料库中的可读资料；点「后贴」即把这条独立心得挂到该资料。
      </p>
      {error && (
        <div role="alert" className="resource-error">
          <p>{error}</p>
        </div>
      )}
      {result && !result.length && <p className="quiet-empty">没有找到标题匹配的资料。</p>}
      {result && result.length > 0 && (
        <ol className="record-list" aria-label="可后贴的资料">
          {result.map((resource) => (
            <li key={resource.id}>
              <span>{resourceTitle(resource)}</span>
              <button
                className="journal-button"
                type="button"
                disabled={disabled}
                onClick={() => onPick(resource)}
              >
                后贴到《{resourceTitle(resource)}》
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
