import { useState } from 'react'

import { saveClassification, type Choice } from './api'
import { useOperation } from './useOperation'

// Create-and-select in place so the surrounding draft survives. Deliberately not a
// <form>: every caller already renders inside one, and nested forms are invalid HTML.
export function TagCreateField({
  disabled = false,
  hint,
  created,
}: {
  disabled?: boolean
  hint?: string
  created: (tag: Choice) => void
}) {
  const [name, setName] = useState('')
  const { pending, error, setError, run } = useOperation()
  async function create() {
    const trimmed = name.trim()
    if (!trimmed || Array.from(trimmed).length > 50) {
      setError('标签名称需为 1～50 字。')
      return
    }
    await run(
      () => saveClassification('tags', trimmed, ''),
      (tag) => {
        setName('')
        created(tag)
      },
    )
  }
  return (
    <div className="tag-create">
      <label className="resource-field">
        新建标签
        <input
          value={name}
          disabled={disabled || pending}
          placeholder="想到新标签就直接建，最多 50 字"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            // The enclosing form must not submit just because a tag was named.
            e.preventDefault()
            void create()
          }}
        />
      </label>
      <button
        type="button"
        className="journal-button"
        disabled={disabled || pending || !name.trim()}
        onClick={() => void create()}
      >
        {pending ? '正在新建…' : '新建并选用'}
      </button>
      {hint && <p className="resource-hint">{hint}</p>}
      {error && (
        <p role="alert" className="resource-error">
          {error}
        </p>
      )}
    </div>
  )
}
