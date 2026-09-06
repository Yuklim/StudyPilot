import { useCallback, useRef, useState, type FormEvent } from 'react'

import {
  deleteResourceSnapshot,
  failureText,
  getResourceSnapshot,
  putResourceSnapshot,
  type Source,
} from './api'
import { useResourceQuery } from './useResourceQuery'

// The wording depends on what else the detail page shows below this block, so the
// component has to know the source type: a WEB resource has an "open the original
// page" link, a PASTE resource has its pasted text, a FILE resource has its file.
// Writing WEB-only wording for all three told PASTE and FILE users something untrue.
const snapshotHints: Record<Source, string> = {
  WEB: '这是保存当时的副本，不随原文更新；需要最新内容请用下方的「打开原网页」。',
  PASTE: '这是另存的一份正文副本，与下方的「粘贴原文」各自独立保存。',
  FILE: '这是另存的一份纯文本正文，不随下方的原件变化。',
}

const emptyHints: Record<Source, string> = {
  WEB: '还没有保存正文。只存链接的话，原文改版或消失后这份资料就找不回来了；可以把正文粘贴进来存一份。',
  PASTE: '还没有另存正文。粘贴的原文见下方；如果想再留一份整理过的正文，可以粘贴进来。',
  FILE: '还没有保存正文。原件见下方；如果想留一份可检索的纯文本正文，可以粘贴进来。',
}

// The frozen copy of the resource's text. This page only stores and shows the
// Markdown source: rendering it as a document belongs to the reader, not here.
export function ContentSnapshot({
  resourceId,
  sourceType,
}: {
  resourceId: string
  sourceType: Source
}) {
  const [revision, setRevision] = useState(0)
  const load = useCallback(() => getResourceSnapshot(resourceId), [resourceId])
  const { result, retry } = useResourceQuery(`${resourceId}:snapshot:${revision}`, load)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const snapshot = result?.data ?? null

  async function run(work: () => Promise<unknown>) {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    try {
      await work()
      setEditing(false)
      setDraft('')
      setRevision((value) => value + 1)
    } catch (cause) {
      // No automatic retry: a failed write may or may not have landed.
      setError(failureText(cause))
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft.trim()) {
      setError('正文不能为空。')
      return
    }
    void run(() => putResourceSnapshot(resourceId, draft, snapshot?.version))
  }

  // The section itself never disappears: a reload after saving must not make the whole
  // block flash away, only the part that is actually being re-read.
  const unreadable = result?.error !== undefined
  return (
    <section className="resource-snapshot" aria-label="正文快照">
      <h3>正文快照</h3>
      {!result ? (
        <p role="status">正在读取正文…</p>
      ) : unreadable ? (
        // A failed read of an optional section is reported politely: the loud
        // role="alert" is reserved for writes the user just asked for.
        <div className="resource-error">
          <p role="status">{failureText(result.error)} 正文没有读到，资料本身不受影响。</p>
          <button type="button" className="journal-button" onClick={retry}>
            重新读取正文
          </button>
        </div>
      ) : snapshot ? (
        <>
          <p className="resource-hint">
            保存于 {snapshot.captured_at.slice(0, 10)} · 共 {snapshot.char_count} 字 · 来源标识{' '}
            {snapshot.extractor} · 第 {snapshot.version} 版
          </p>
          <p className="resource-hint">{snapshotHints[sourceType]}</p>
          <pre className="snapshot-body" tabIndex={0}>
            {snapshot.content}
          </pre>
        </>
      ) : (
        <p className="resource-hint">{emptyHints[sourceType]}</p>
      )}
      {result &&
        !unreadable &&
        (editing ? (
          <form onSubmit={save} aria-label="正文快照编辑" noValidate>
            <fieldset disabled={pending}>
              <legend className="sr-only">粘贴正文</legend>
              <label className="resource-field">
                正文（Markdown）
                <textarea
                  autoFocus
                  rows={12}
                  className="paste-input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="把文章正文粘贴到这里，最多 100 万字"
                />
              </label>
              <div className="resource-actions">
                <button type="submit" className="journal-button primary" disabled={!draft.trim()}>
                  {pending ? '正在保存…' : snapshot ? '替换正文' : '保存正文'}
                </button>
                <button
                  type="button"
                  className="journal-button"
                  onClick={() => {
                    setEditing(false)
                    setDraft('')
                    setError('')
                  }}
                >
                  取消
                </button>
              </div>
            </fieldset>
          </form>
        ) : (
          <div className="resource-actions">
            <button
              type="button"
              className="journal-button"
              disabled={pending}
              onClick={() => {
                setError('')
                setDraft(snapshot?.content ?? '')
                setEditing(true)
              }}
            >
              {snapshot ? '替换正文' : '粘贴正文'}
            </button>
            {snapshot && (
              <button
                type="button"
                className="journal-button danger"
                disabled={pending}
                onClick={() => void run(() => deleteResourceSnapshot(resourceId, snapshot.version))}
              >
                删除正文
              </button>
            )}
          </div>
        ))}
      {error && (
        <div role="alert" className="resource-error">
          <p>{error}</p>
          <p>没有自动重试。请重新读取这份资料后再决定。</p>
        </div>
      )}
    </section>
  )
}
