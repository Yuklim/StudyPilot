import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { ClassificationBrowser } from '../taxonomy/ClassificationBrowser'
import { TagCreateField } from '../taxonomy/TagCreateField'
import type { Choice } from '../taxonomy/api'
import { failureText, updateResource, type Resource, type ResourceChanges } from './api'
import { resourceTitle } from './resourceTitle'

/**
 * 资料库里的分类弹窗（TASK-097，用户 2026-09-29「资料库页也加上分配标签/主题」，选定「逐条 + 批量」）。
 *
 * **一份**：预填当前主题与标签，保存只发一次 PATCH、只带真改了的字段（`topic_id` / 整组 `tag_ids`）；
 * 什么都没改就直接关闭，不打扰服务端。
 *
 * **多份**：主题三选一（不改 / 不分配 / 设为某主题），标签是**追加**——并入每份资料自己已有的标签，
 * 超过 20 个的那份跳过标签并列出来。逐份 PATCH、各用自己的 `expected_version`（契约没有批量接口，
 * 也不该为此造一个：失败的是哪一份、为什么，要能说清）。失败的列出标题与原因，成功的照常生效。
 *
 * 模态机制与删除弹窗同一套：portal 到 body、其余子树 `inert`、Esc 关、Tab 在弹窗内首尾相接、
 * 关闭时焦点还给打开它的按钮。保存进行中不许关（关了循环还在发请求，用户以为停了）。
 */

const MAX_TAGS = 20

type TopicMode = 'keep' | 'clear' | 'set'
type Failure = { id: string; title: string; reason: string }

export function LibraryClassifyDialog({
  targets,
  onClose,
  onSaved,
}: {
  targets: Resource[]
  /** 用户取消，或保存全部成功后关闭。 */
  onClose: () => void
  /** 至少一份保存成功时调用一次；调用方据此刷新列表。 */
  onSaved: () => void
}) {
  const single = targets.length === 1
  const first = targets[0]
  const [topicMode, setTopicMode] = useState<TopicMode>(() =>
    single ? (first?.topic_id ? 'set' : 'clear') : 'keep',
  )
  const [topic, setTopic] = useState<Choice | null>(() =>
    single && first?.topic_id
      ? { id: first.topic_id, name: first.topic_name ?? '未命名主题' }
      : null,
  )
  // 一份时是「这份资料的标签集合」；多份时是「要追加的标签」。
  const [tags, setTags] = useState<Choice[]>(() => (single && first ? [...first.tags] : []))
  const [revision, setRevision] = useState(0)
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null)
  const [failures, setFailures] = useState<Failure[]>([])
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)
  const busy = useRef(false)
  const dialog = useRef<HTMLDivElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  // portal 的挂点：用 state 而不是 ref——渲染期间读 ref 会被 react-hooks/refs 规则拦下。
  const [host] = useState(() => document.createElement('div'))

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useLayoutEffect(() => {
    const node = host
    const opener = document.activeElement as HTMLElement | null
    document.body.appendChild(node)
    const others = [...document.body.children].filter(
      (el) => el !== node && !el.hasAttribute('inert'),
    )
    others.forEach((el) => el.setAttribute('inert', ''))
    cancelButton.current?.focus()
    return () => {
      others.forEach((el) => el.removeAttribute('inert'))
      node.remove()
      opener?.focus()
    }
  }, [host])

  const running = saving !== null
  function close() {
    if (running) return
    onClose()
  }
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!running) onClose()
        return
      }
      if (event.key !== 'Tab' || !dialog.current) return
      const focusable = [
        ...dialog.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ]
      if (focusable.length === 0) return
      const head = focusable[0]!
      const tail = focusable[focusable.length - 1]!
      const active = document.activeElement
      if (event.shiftKey && (active === head || !dialog.current.contains(active))) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && (active === tail || !dialog.current.contains(active))) {
        event.preventDefault()
        head.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [running, onClose])

  /** 这份资料要发的变更；null = 什么都不用改。 */
  function changesFor(item: Resource): { changes: ResourceChanges; skippedTags: boolean } | null {
    const changes: ResourceChanges = {}
    let skippedTags = false
    if (topicMode === 'clear' && item.topic_id !== null) changes.topic_id = null
    if (topicMode === 'set' && topic && item.topic_id !== topic.id) changes.topic_id = topic.id
    if (single) {
      const wanted = tags.map((tag) => tag.id)
      const current = item.tags.map((tag) => tag.id)
      if (
        wanted.length !== current.length ||
        wanted.some((id) => !current.includes(id)) ||
        current.some((id) => !wanted.includes(id))
      )
        changes.tag_ids = wanted
    } else if (tags.length > 0) {
      const merged = [...item.tags.map((tag) => tag.id)]
      for (const tag of tags) if (!merged.includes(tag.id)) merged.push(tag.id)
      if (merged.length > MAX_TAGS) skippedTags = true
      else if (merged.length !== item.tags.length) changes.tag_ids = merged
    }
    return Object.keys(changes).length === 0 && !skippedTags ? null : { changes, skippedTags }
  }

  async function save() {
    if (busy.current) return
    if (topicMode === 'set' && !topic) {
      setError('请选一个主题，或改为「不分配」。')
      return
    }
    const plan = targets
      .map((item) => ({ item, plan: changesFor(item) }))
      .filter(
        (entry): entry is { item: Resource; plan: NonNullable<ReturnType<typeof changesFor>> } =>
          entry.plan !== null,
      )
    if (plan.length === 0) {
      onClose()
      return
    }
    busy.current = true
    setError(null)
    setFailures([])
    setSaving({ done: 0, total: plan.length })
    const failed: Failure[] = []
    let succeeded = 0
    for (const { item, plan: entry } of plan) {
      if (!alive.current) return
      if (entry.skippedTags) {
        failed.push({
          id: item.id,
          title: resourceTitle(item),
          reason: `已有 ${item.tags.length} 个标签，追加后会超过 ${MAX_TAGS} 个，标签没有加`,
        })
      }
      if (Object.keys(entry.changes).length > 0) {
        try {
          await updateResource(item, entry.changes, item.version)
          succeeded += 1
        } catch (cause) {
          failed.push({ id: item.id, title: resourceTitle(item), reason: failureText(cause) })
        }
      }
      if (alive.current) setSaving((s) => (s ? { ...s, done: s.done + 1 } : s))
    }
    busy.current = false
    if (!alive.current) return
    if (succeeded > 0) onSaved()
    setSaving(null)
    if (failed.length === 0) onClose()
    else setFailures(failed)
  }

  const title = single ? `分类：${resourceTitle(first!)}` : `为 ${targets.length} 份资料设置分类`
  const tagFull = single && tags.length >= MAX_TAGS

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        ref={dialog}
        className="modal-dialog classify-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="classify-dialog-title"
      >
        <h2 id="classify-dialog-title">{title}</h2>
        <fieldset disabled={running} className="classify-dialog-body">
          <legend className="sr-only">主题与标签</legend>
          <section className="classify-section" aria-label="主题">
            <h3>主题</h3>
            {!single && (
              <label className="classification-choice">
                <input
                  type="radio"
                  name="classify-topic"
                  checked={topicMode === 'keep'}
                  onChange={() => setTopicMode('keep')}
                />
                不改
              </label>
            )}
            <label className="classification-choice">
              <input
                type="radio"
                name="classify-topic"
                checked={topicMode === 'clear'}
                onChange={() => setTopicMode('clear')}
              />
              不分配主题
            </label>
            <ClassificationBrowser
              kind="topics"
              disabled={running}
              render={(item) => (
                <label className="classification-choice">
                  <input
                    type="radio"
                    name="classify-topic"
                    checked={topicMode === 'set' && topic?.id === item.id}
                    onChange={() => {
                      setTopicMode('set')
                      setTopic(item)
                    }}
                  />
                  <span>{item.name}</span>
                </label>
              )}
            />
          </section>
          <section className="classify-section" aria-label="标签">
            <h3>{single ? '标签' : '追加标签'}</h3>
            <p className="resource-hint">
              {single
                ? `已选 ${tags.length} 个标签（最多 ${MAX_TAGS} 个）`
                : tags.length > 0
                  ? `将给每份资料追加 ${tags.length} 个标签；已有的不动`
                  : '勾选要追加的标签；已有的不动'}
            </p>
            <TagCreateField
              disabled={running || tagFull}
              hint={tagFull ? `已选满 ${MAX_TAGS} 个标签，先移除一个再新建。` : undefined}
              created={(tag) => {
                setTags((current) => [...current, tag])
                setRevision((value) => value + 1)
              }}
            />
            <ClassificationBrowser
              kind="tags"
              disabled={running}
              revision={revision}
              render={(item) => {
                const picked = tags.some((tag) => tag.id === item.id)
                return (
                  <label className="classification-choice">
                    <input
                      type="checkbox"
                      checked={picked}
                      disabled={tagFull && !picked}
                      onChange={(event) =>
                        setTags((current) =>
                          event.target.checked
                            ? [...current, item]
                            : current.filter((tag) => tag.id !== item.id),
                        )
                      }
                    />
                    <span>{item.name}</span>
                  </label>
                )
              }}
            />
          </section>
        </fieldset>
        {saving && (
          <p role="status" className="resource-hint">
            正在保存 {saving.done}/{saving.total}…
          </p>
        )}
        {error && (
          <p className="resource-error" role="alert">
            {error}
          </p>
        )}
        {failures.length > 0 && (
          <div className="resource-error" role="alert">
            <p>这些资料没有改成：</p>
            <ul>
              {failures.map((failure) => (
                <li key={failure.id}>
                  {failure.title}：{failure.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="resource-actions">
          <button
            type="button"
            className="journal-button"
            ref={cancelButton}
            disabled={running}
            onClick={close}
          >
            {failures.length > 0 ? '关闭' : '取消'}
          </button>
          {failures.length === 0 && (
            <button
              type="button"
              className="journal-button primary"
              disabled={running}
              onClick={() => void save()}
            >
              保存
            </button>
          )}
        </div>
      </div>
    </div>,
    host,
  )
}
