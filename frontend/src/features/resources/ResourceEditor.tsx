import { useEffect, useRef, useState, type FormEvent } from 'react'

import { ApiError } from '../../api/client'
import { ClassificationBrowser } from '../taxonomy/ClassificationBrowser'
import { TagCreateField } from '../taxonomy/TagCreateField'
import type { Choice } from '../taxonomy/api'
import {
  failureText,
  getResource,
  safeWebUrl,
  updateResource,
  type Resource,
  type ResourceChanges,
} from './api'
import { resourceTitle } from './resourceTitle'

function sameTags(left: Choice[], right: { id: string }[]): boolean {
  // Order carries no meaning for a tag set, so compare the ids as sets.
  const ids = new Set(right.map((tag) => tag.id))
  return left.length === ids.size && left.every((tag) => ids.has(tag.id))
}

function topicOf(item: Resource): Choice | null {
  return item.topic_id
    ? { id: item.topic_id, name: item.topic_name ?? '当前主题（名称暂不可用）' }
    : null
}

// Mounted independently of the detail read, just like the quick-note editor.
export function ResourceEditor({
  resource,
  refreshed,
}: {
  resource?: Resource
  refreshed: () => void
}) {
  const [editing, setEditing] = useState<Resource | null>(null)
  const [notice, setNotice] = useState('')
  return (
    <section className="resource-editor" aria-label="资料信息编辑">
      {editing ? (
        <EditForm
          initial={editing}
          available={!!resource}
          cancelled={() => {
            setEditing(null)
            refreshed()
          }}
          saved={() => {
            setEditing(null)
            setNotice('资料修改已保存。')
            refreshed()
          }}
        />
      ) : (
        <button
          type="button"
          className="journal-button"
          disabled={!resource}
          onClick={() => {
            if (resource) {
              setEditing(resource)
              setNotice('')
            }
          }}
        >
          编辑资料
        </button>
      )}
      {notice && (
        <p role="status" className="note-saved">
          {notice}
        </p>
      )}
    </section>
  )
}

function EditForm({
  initial,
  available,
  cancelled,
  saved,
}: {
  initial: Resource
  available: boolean
  cancelled: () => void
  saved: () => void
}) {
  const [title, setTitle] = useState(initial.title ?? '')
  const [sourceName, setSourceName] = useState(initial.source_name ?? '')
  const [reason, setReason] = useState(initial.save_reason ?? '')
  const [sourceText, setSourceText] = useState(
    (initial.source_type === 'WEB' ? initial.source_url : initial.pasted_content) ?? '',
  )
  const [topic, setTopic] = useState<Choice | null>(() => topicOf(initial))
  const [chooseTopic, setChooseTopic] = useState(false)
  const [tags, setTags] = useState<Choice[]>(() => initial.tags.map((tag) => ({ ...tag })))
  const [chooseTags, setChooseTags] = useState(false)
  const [tagRevision, setTagRevision] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [recovery, setRecovery] = useState(false)
  const [latest, setLatest] = useState<Resource | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [discard, setDiscard] = useState(false)
  const alive = useRef(true)
  const busy = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // Retain the user's changed-field intent through a conflict. Unedited fields are omitted,
  // not copied from the stale form over another page's newer data.
  const changes: ResourceChanges = {}
  if (title.trim() !== (initial.title ?? '')) changes.title = title.trim() || null
  if (sourceName !== (initial.source_name ?? '')) changes.source_name = sourceName || null
  if (reason !== (initial.save_reason ?? '')) changes.save_reason = reason || null
  if ((topic?.id ?? null) !== initial.topic_id) changes.topic_id = topic?.id ?? null
  // Send the whole set only when it actually differs; the server treats it as a replacement.
  if (!sameTags(tags, initial.tags)) changes.tag_ids = tags.map((tag) => tag.id)
  if (initial.source_type === 'WEB' && sourceText.trim() !== initial.source_url)
    changes.source_url = sourceText.trim()
  if (initial.source_type === 'PASTE' && sourceText !== initial.pasted_content)
    changes.pasted_content = sourceText
  const dirty = Object.keys(changes).length > 0
  const canSave = dirty && available && !pending && (!recovery || (!!latest && confirmed))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy.current || !canSave) return
    const length = (value: string) => Array.from(value).length
    let invalid = ''
    if (length(title.trim()) > 200) invalid = '标题最多 200 字。'
    else if (length(sourceName) > 120 || length(reason) > 1000)
      invalid = '来源名称最多 120 字，保存原因最多 1000 字。'
    else if (
      changes.source_url !== undefined &&
      (!safeWebUrl(changes.source_url) || length(changes.source_url) > 2048)
    )
      invalid = '请填写完整的 http 或 https 网址，不含账号、密码、空格或 # 片段，最多 2048 字。'
    else if (
      changes.pasted_content !== undefined &&
      (length(changes.pasted_content) < 1 || length(changes.pasted_content) > 1_000_000)
    )
      invalid = '粘贴原文须为 1～100 万字，空白和换行会原样保存。'
    else if (tags.length > 20) invalid = '最多选择 20 个标签。'
    if (invalid) {
      setError(invalid)
      return
    }
    busy.current = true
    setPending(true)
    setError('')
    try {
      await updateResource(initial, changes, latest?.version ?? initial.version)
      if (alive.current) saved()
    } catch (cause) {
      if (alive.current) {
        setError(failureText(cause))
        if (
          !(cause instanceof ApiError) ||
          cause.status < 400 ||
          cause.status >= 500 ||
          [
            'VERSION_CONFLICT',
            'VERSION_REQUIRED',
            'SOURCE_TYPE_MISMATCH',
            'RESOURCE_NOT_FOUND',
          ].includes(cause.code)
        ) {
          setRecovery(true)
          setLatest(null)
          setConfirmed(false)
        }
      }
    } finally {
      busy.current = false
      if (alive.current) setPending(false)
    }
  }

  async function reread() {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setLatest(null)
    setConfirmed(false)
    setError('')
    try {
      const item = await getResource(initial.id)
      if (item.source_type !== initial.source_type) throw new ApiError('INVALID_RESPONSE')
      if (alive.current) setLatest(item)
    } catch (cause) {
      if (alive.current) setError(failureText(cause))
    } finally {
      busy.current = false
      if (alive.current) setPending(false)
    }
  }

  return (
    <form
      className="resource-edit-form"
      aria-label="编辑资料表单"
      onSubmit={submit}
      autoComplete="off"
      noValidate
      aria-describedby="resource-edit-hint"
    >
      <span className="note-tab">整理这一页</span>
      <h3>编辑资料</h3>
      <p className="resource-hint" id="resource-edit-hint">
        只改你需要的部分，不影响心得和学习历史。未保存内容仅留在本页，离开或刷新会丢失。
      </p>
      <fieldset className="resource-fields" disabled={pending}>
        <legend className="sr-only">资料修改内容</legend>
        <label className="resource-field">
          标题
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="留空则显示为「未命名资料」"
          />
        </label>
        <div className="resource-form-columns">
          <label className="resource-field">
            来源名称（选填）
            <input value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
          </label>
          <label className="resource-field">
            保存原因 / 简介（选填）
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
        <div className="resource-topic-edit">
          <p>主要主题：{topic?.name ?? '未分配'}</p>
          <button
            type="button"
            className="journal-button"
            aria-expanded={chooseTopic}
            onClick={() => setChooseTopic(!chooseTopic)}
          >
            {chooseTopic ? '收起主题选择' : '更改主要主题'}
          </button>
          {chooseTopic && (
            <section aria-label="编辑主要主题">
              <label className="classification-choice">
                <input
                  type="radio"
                  name="edit-topic"
                  checked={!topic}
                  onChange={() => setTopic(null)}
                />
                未分配主题
              </label>
              <ClassificationBrowser
                kind="topics"
                render={(item) => (
                  <label className="classification-choice">
                    <input
                      type="radio"
                      name="edit-topic"
                      checked={topic?.id === item.id}
                      onChange={() => setTopic(item)}
                    />
                    {item.name}
                  </label>
                )}
              />
            </section>
          )}
        </div>
        {/* Same block styling as the topic section; no new rule needed in styles.css. */}
        <div className="resource-topic-edit">
          <p>标签：{tags.length ? tags.map((tag) => tag.name).join('、') : '未添加'}</p>
          {tags.length > 0 && (
            <div className="selection-chips" aria-label="已选标签">
              {tags.map((tag) => (
                <button
                  type="button"
                  className="journal-button"
                  key={tag.id}
                  onClick={() => setTags(tags.filter((item) => item.id !== tag.id))}
                >
                  移除已选标签 {tag.name} ×
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="journal-button"
            aria-expanded={chooseTags}
            onClick={() => setChooseTags(!chooseTags)}
          >
            {chooseTags ? '收起标签选择' : '更改标签'}
          </button>
          {chooseTags && (
            <section aria-label="编辑标签">
              <p className="resource-hint">最多 20 个；保存时按这里的结果整组替换。</p>
              <TagCreateField
                disabled={tags.length >= 20}
                hint={tags.length >= 20 ? '已选满 20 个标签，先移除一个再新建。' : undefined}
                created={(tag) => {
                  setTags([...tags, tag])
                  setTagRevision(tagRevision + 1)
                }}
              />
              <ClassificationBrowser
                kind="tags"
                revision={tagRevision}
                render={(item) => (
                  <label className="classification-choice">
                    <input
                      type="checkbox"
                      checked={tags.some((tag) => tag.id === item.id)}
                      onChange={(event) =>
                        setTags(
                          event.target.checked
                            ? [...tags.filter((tag) => tag.id !== item.id), item]
                            : tags.filter((tag) => tag.id !== item.id),
                        )
                      }
                    />
                    {item.name}
                  </label>
                )}
              />
            </section>
          )}
        </div>
        {initial.source_type === 'FILE' ? (
          <p className="resource-hint">文件原件不能替换；需要另一份文件时请添加新资料。</p>
        ) : (
          <details className="resource-source-edit">
            <summary>{initial.source_type === 'WEB' ? '修改原始网页链接' : '修改粘贴原文'}</summary>
            <p className="resource-hint">保存后会覆盖原内容，目前没有修订历史；不更换资料类型。</p>
            {initial.source_type === 'WEB' ? (
              <label className="resource-field">
                网页地址（必填）
                <input
                  type="url"
                  inputMode="url"
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  required
                />
              </label>
            ) : (
              <label className="resource-field">
                粘贴原文（必填）
                <textarea
                  rows={8}
                  className="paste-input"
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  required
                />
              </label>
            )}
          </details>
        )}
      </fieldset>
      {!available && <p role="alert">资料详情暂不可用，草稿仍保留；请重新加载详情后再保存。</p>}
      {recovery && (
        <section className="resource-edit-recovery" aria-label="资料保存核对">
          <p role="alert">
            操作结果需要核对：资料可能已被修改，或保存结果尚未确认。草稿仍保留，不会自动重试。
          </p>
          <button type="button" className="journal-button" disabled={pending} onClick={reread}>
            保留草稿，读取最新资料
          </button>
          {latest && (
            <>
              <section aria-label="最新已保存资料">
                <h4>最新已保存资料（第 {latest.version} 版）</h4>
                <dl>
                  <dt>标题</dt>
                  <dd>{resourceTitle(latest)}</dd>
                  <dt>来源名称</dt>
                  <dd>{latest.source_name || '未填写'}</dd>
                  <dt>保存原因 / 简介</dt>
                  <dd>{latest.save_reason || '未填写'}</dd>
                  <dt>主要主题</dt>
                  <dd>{topicOf(latest)?.name ?? '未分配'}</dd>
                  <dt>标签</dt>
                  <dd>{latest.tags.map((tag) => tag.name).join('、') || '未添加'}</dd>
                </dl>
                {latest.source_type !== 'FILE' && (
                  <details>
                    <summary>查看最新来源内容</summary>
                    <pre tabIndex={0}>{latest.source_url ?? latest.pasted_content}</pre>
                  </details>
                )}
              </section>
              <p className="resource-hint">
                重新保存只提交本页改动的字段；若草稿已保存，可直接取消编辑。
              </p>
              <label className="note-confirm">
                <input
                  type="checkbox"
                  disabled={pending}
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                我已核对最新资料，确认仍需保存本页修改
              </label>
            </>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="resource-error">
          {error}
        </p>
      )}
      {pending && <p role="status">正在处理，请稍候；离开页面不会撤回已发送的请求。</p>}
      <div className="resource-edit-actions">
        <button type="submit" className="journal-button primary" disabled={!canSave}>
          保存资料修改
        </button>
        <button
          type="button"
          className="journal-button"
          disabled={pending}
          onClick={() => (dirty ? setDiscard(true) : cancelled())}
        >
          取消编辑
        </button>
      </div>
      {discard && (
        <div className="resource-edit-actions" role="group" aria-label="确认放弃资料修改">
          <p>放弃本页未保存的资料修改？不会删除已保存的资料或心得。</p>
          <button type="button" className="journal-button" disabled={pending} onClick={cancelled}>
            确认放弃修改
          </button>
          <button type="button" className="journal-button" onClick={() => setDiscard(false)}>
            继续编辑
          </button>
        </div>
      )}
    </form>
  )
}
