import { useState, type FormEvent } from 'react'

import { ClassificationBrowser } from './ClassificationBrowser'
import {
  deleteClassification,
  getClassification,
  labels,
  saveClassification,
  type Classification,
  type Kind,
} from './api'
import { useOperation } from './useOperation'

type Editor = { mode: 'edit' | 'delete'; item?: Classification }
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
      {editor && (
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
      )}
      <ClassificationBrowser
        kind={kind}
        revision={revision}
        disabled={Boolean(editor)}
        render={(item) => (
          <article className="classification-card">
            <div>
              <h3>{item.name}</h3>
              {kind === 'topics' && <p>{item.description || '留一页空白，慢慢补充。'}</p>}
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
