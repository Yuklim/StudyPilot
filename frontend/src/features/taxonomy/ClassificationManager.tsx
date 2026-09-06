import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { ClassificationBrowser } from './ClassificationBrowser'
import {
  deleteClassification,
  detachAllTagResources,
  getClassification,
  labels,
  mergeTag,
  saveClassification,
  type Choice,
  type Classification,
  type Kind,
} from './api'
import { useOperation } from './useOperation'

// The library filters by id, and TASK-033 put those filters in the address bar,
// so "see what uses this" is just a link.
function usageHref(kind: Kind, id: string): string {
  return `/resources?${kind === 'topics' ? 'topic_id' : 'tag_id'}=${id}`
}
function UsageLink({ kind, item }: { kind: Kind; item: Classification }) {
  if (!item.resource_count) return <span className="classification-usage">暂无资料使用</span>
  return (
    <Link className="classification-usage usage-link" to={usageHref(kind, item.id)}>
      {item.resource_count} 份资料在用
    </Link>
  )
}

type Editor = { mode: 'edit' | 'delete' | 'detach' | 'merge'; item?: Classification }

// Bulk association work lives apart from the create/edit/delete form: it acts on many
// resource_tags rows at once and needs its own confirmation, not another form branch.
function TagBulkPanel({
  editor,
  close,
  saved,
}: {
  editor: { mode: 'detach' | 'merge'; item: Classification }
  close: () => void
  saved: () => void
}) {
  const { item, mode } = editor
  const [target, setTarget] = useState<Choice | null>(null)
  const { pending, error, run } = useOperation()
  const ready = mode === 'detach' || (!!target && target.id !== item.id)
  return (
    <section
      className="classification-editor"
      aria-label={`${mode === 'detach' ? '清空关联' : '合并标签'}确认`}
    >
      <span className="note-tab">先确认，再动手</span>
      <fieldset disabled={pending} className="classification-browser">
        <legend className="sr-only">{mode === 'detach' ? '清空标签关联' : '合并标签'}</legend>
        <h2>
          {mode === 'detach'
            ? `清空“${item.name}”的全部关联？`
            : `把“${item.name}”合并到哪个标签？`}
        </h2>
        <p className="resource-hint">
          {mode === 'detach'
            ? `会解除 ${item.resource_count} 份资料上的这个标签，标签本身保留，资料内容不受影响。`
            : `会把 ${item.resource_count} 份资料上的“${item.name}”换成目标标签，然后删除“${item.name}”。资料内容不受影响。`}
        </p>
        <p className="resource-hint">
          按当前看到的 {item.resource_count} 份提交；若期间份数已变化，本次不会执行。
        </p>
        {mode === 'merge' && (
          <>
            <p className="resource-hint">目标标签：{target ? target.name : '尚未选择'}</p>
            <ClassificationBrowser
              kind="tags"
              disabled={pending}
              render={(candidate) => (
                <label className="classification-choice">
                  <input
                    type="radio"
                    name="merge-target"
                    disabled={candidate.id === item.id}
                    checked={target?.id === candidate.id}
                    onChange={() => setTarget(candidate)}
                  />
                  <span>{candidate.name}</span>
                </label>
              )}
            />
          </>
        )}
        <div className="resource-actions">
          <button
            type="button"
            className="journal-button danger"
            disabled={!ready}
            onClick={() =>
              void run(
                () =>
                  mode === 'detach'
                    ? detachAllTagResources(item)
                    : mergeTag(item, target as Choice),
                saved,
              )
            }
          >
            {pending
              ? '正在处理…'
              : mode === 'detach'
                ? `确认清空 ${item.resource_count} 份关联`
                : '确认合并'}
          </button>
          <button type="button" className="journal-button" onClick={close}>
            取消
          </button>
        </div>
        {error && (
          <div role="alert" className="resource-error">
            <p>{error}</p>
            <p>没有自动重试。请重新读取分类列表，确认份数后再决定。</p>
          </div>
        )}
      </fieldset>
    </section>
  )
}
function ClassificationEditor({
  kind,
  editor,
  close,
  saved,
}: {
  kind: Kind
  editor: Editor
  close: () => void
  saved: () => void
}) {
  const [item, setItem] = useState(editor.item)
  const [name, setName] = useState(editor.item?.name ?? '')
  const [description, setDescription] = useState(editor.item?.description ?? '')
  const { pending, error, setError, run } = useOperation()
  const label = labels[kind]
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (editor.mode === 'delete' && item) {
      await run(() => deleteClassification(kind, item), saved)
      return
    }
    if (!name.trim() || Array.from(name.trim()).length > (kind === 'topics' ? 80 : 50)) {
      setError(`${label}名称需为 1～${kind === 'topics' ? 80 : 50} 字。`)
      return
    }
    if (Array.from(description).length > 500) {
      setError('主题说明最多 500 字。')
      return
    }
    await run(() => saveClassification(kind, name, description, item), saved)
  }
  return (
    <section
      className="classification-editor"
      aria-label={`${editor.mode === 'delete' ? '删除确认' : item ? '修改' : '新建'}${label}`}
    >
      <span className="note-tab">
        {editor.mode === 'delete' ? '先确认，再放下' : '给知识贴一张索引'}
      </span>
      <form onSubmit={submit} noValidate autoComplete="off">
        <fieldset disabled={pending} className="classification-browser">
          <legend className="sr-only">{label}编辑</legend>
          {editor.mode === 'delete' ? (
            <>
              <h2>确认删除“{item?.name}”？</h2>
              <p className="resource-hint">
                只删除这个未使用的{label}，不能撤销。若仍被资料使用，系统会拒绝；不会连带删除资料。
              </p>
              {item && item.resource_count > 0 && (
                <p className="resource-hint">
                  这个{label}正被 {item.resource_count} 份资料使用，删除会被拒绝。
                  <Link className="usage-link" to={usageHref(kind, item.id)}>
                    查看这 {item.resource_count} 份资料
                  </Link>
                  ，先解除后再回来删除。
                </p>
              )}
            </>
          ) : (
            <>
              <h2>
                {item ? '修改' : '新建'}
                {label}
              </h2>
              <label className="resource-field">
                {label}名称
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              {kind === 'topics' && (
                <label className="resource-field">
                  主题说明（选填）
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="给这个方向留一句话，最多 500 字"
                  />
                </label>
              )}
              <p className="resource-hint">未保存的内容只留在当前页面，离开或刷新会丢失。</p>
            </>
          )}
          <div className="resource-actions">
            <button
              type="submit"
              className={`journal-button ${editor.mode === 'delete' ? 'danger' : 'primary'}`}
            >
              {pending
                ? '正在处理…'
                : editor.mode === 'delete'
                  ? `确认删除${label}`
                  : `保存${label}`}
            </button>
            <button type="button" className="journal-button" onClick={close}>
              取消
            </button>
          </div>
          {error && (
            <div role="alert" className="resource-error">
              <p>{error}</p>
              <p>没有自动重试。若连接中断，操作可能已成功，请先查看最新数据再决定。</p>
              {item && (
                <button
                  type="button"
                  className="journal-button"
                  onClick={() =>
                    void run(
                      () => getClassification(kind, item.id),
                      (latest) => {
                        setItem(latest)
                        setName(latest.name)
                        setDescription(latest.description ?? '')
                      },
                    )
                  }
                >
                  放弃草稿，载入最新版本
                </button>
              )}
            </div>
          )}
        </fieldset>
      </form>
    </section>
  )
}
function ClassificationPanel({ kind }: { kind: Kind }) {
  const [editor, setEditor] = useState<Editor>()
  const [revision, setRevision] = useState(0)
  const [notice, setNotice] = useState('')
  const label = labels[kind]
  return (
    <>
      <div className="resource-toolbar">
        <p className="resource-hint">
          {kind === 'topics'
            ? '主题是资料的主要方向。一个主题，可以慢慢积累很多页。'
            : '标签是灵活的小线索。一份资料，可以有多个标签。'}
        </p>
        <button
          type="button"
          className="journal-button primary"
          disabled={Boolean(editor)}
          onClick={() => {
            setNotice('')
            setEditor({ mode: 'edit' })
          }}
        >
          新建{label}
        </button>
      </div>
      {notice && (
        <p role="status" className="resource-hint">
          {notice}
        </p>
      )}
      {editor &&
        ((editor.mode === 'detach' || editor.mode === 'merge') && editor.item ? (
          <TagBulkPanel
            key={`${kind}:${editor.item.id}:${editor.mode}`}
            editor={{ mode: editor.mode, item: editor.item }}
            close={() => setEditor(undefined)}
            saved={() => {
              setEditor(undefined)
              setRevision(revision + 1)
              setNotice('操作成功，已重新读取分类列表。')
            }}
          />
        ) : (
          <ClassificationEditor
            key={`${kind}:${editor.item?.id ?? 'new'}:${editor.mode}`}
            kind={kind}
            editor={editor}
            close={() => setEditor(undefined)}
            saved={() => {
              setEditor(undefined)
              setRevision(revision + 1)
              setNotice('操作成功，已重新读取分类列表。')
            }}
          />
        ))}
      <ClassificationBrowser
        kind={kind}
        revision={revision}
        disabled={Boolean(editor)}
        render={(item) => (
          <article className="classification-card">
            <div>
              <h3>{item.name}</h3>
              {kind === 'topics' && <p>{item.description || '留一页空白，慢慢补充。'}</p>}
              <UsageLink kind={kind} item={item} />
            </div>
            <div className="resource-actions">
              <button
                type="button"
                className="journal-button"
                aria-label={`修改${label} ${item.name}`}
                onClick={() => {
                  setNotice('')
                  setEditor({ mode: 'edit', item })
                }}
              >
                修改
              </button>
              {kind === 'tags' && item.resource_count > 0 && (
                <button
                  type="button"
                  className="journal-button"
                  aria-label={`清空标签关联 ${item.name}`}
                  onClick={() => {
                    setNotice('')
                    setEditor({ mode: 'detach', item })
                  }}
                >
                  清空关联
                </button>
              )}
              {kind === 'tags' && (
                <button
                  type="button"
                  className="journal-button"
                  aria-label={`合并标签 ${item.name}`}
                  onClick={() => {
                    setNotice('')
                    setEditor({ mode: 'merge', item })
                  }}
                >
                  合并到…
                </button>
              )}
              <button
                type="button"
                className="journal-button danger"
                aria-label={`删除${label} ${item.name}`}
                onClick={() => {
                  setNotice('')
                  setEditor({ mode: 'delete', item })
                }}
              >
                删除
              </button>
            </div>
          </article>
        )}
      />
    </>
  )
}
export function ClassificationManager() {
  const [kind, setKind] = useState<Kind>('topics')
  return (
    <section className="resource-sheet" aria-label="分类整理">
      <div className="classification-intro">
        <span className="small-label">SMALL LABELS, GROWING IDEAS</span>
        <h2>把好奇，收进自己的索引册。</h2>
        <p className="resource-hint">主题定方向，标签串线索。不必一次整理完。</p>
      </div>
      <div className="view-switch classification-tabs" role="group" aria-label="分类类型">
        <button type="button" aria-pressed={kind === 'topics'} onClick={() => setKind('topics')}>
          主题
        </button>
        <button type="button" aria-pressed={kind === 'tags'} onClick={() => setKind('tags')}>
          标签
        </button>
      </div>
      <ClassificationPanel key={kind} kind={kind} />
    </section>
  )
}
