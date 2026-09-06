import { useState } from 'react'

import type { Resource } from '../resources/api'
import { ClassificationBrowser } from './ClassificationBrowser'
import { TagCreateField } from './TagCreateField'
import { changeResourceTag } from './api'
import { useOperation } from './useOperation'

function TagActions({ resource, refreshed }: { resource: Resource; refreshed: () => void }) {
  const { pending, error, run } = useOperation()
  const [revision, setRevision] = useState(0)
  const full = resource.tags.length >= 20
  return (
    <fieldset disabled={pending} className="classification-browser">
      <legend className="sr-only">编辑资料标签</legend>
      <p className="resource-hint">
        每次只变更一个标签，不覆盖其他标签，不改变正文、主题或学习进度。
      </p>
      <div className="selection-chips">
        {resource.tags.map((tag) => (
          <button
            type="button"
            className="journal-button"
            key={tag.id}
            onClick={() => void run(() => changeResourceTag(resource.id, tag.id, false), refreshed)}
          >
            解除标签 {tag.name}
          </button>
        ))}
      </div>
      {/* Here "select" means attach: a tag created from this page belongs to this resource. */}
      <TagCreateField
        disabled={full}
        hint={full ? '这份资料已有 20 个标签，先解除一个再新建。' : undefined}
        created={(tag) => {
          setRevision(revision + 1)
          void run(() => changeResourceTag(resource.id, tag.id, true), refreshed)
        }}
      />
      <ClassificationBrowser
        kind="tags"
        disabled={pending}
        revision={revision}
        render={(tag) => (
          <div className="classification-card">
            <span>{tag.name}</span>
            <button
              type="button"
              className="journal-button"
              disabled={
                resource.tags.some((item) => item.id === tag.id) || resource.tags.length >= 20
              }
              onClick={() =>
                void run(() => changeResourceTag(resource.id, tag.id, true), refreshed)
              }
            >
              {resource.tags.some((item) => item.id === tag.id)
                ? `已添加 ${tag.name}`
                : `添加标签 ${tag.name}`}
            </button>
          </div>
        )}
      />
      {pending && (
        <p role="status" className="resource-hint">
          正在更新标签，离开页面不会取消已发出的操作…
        </p>
      )}
      {error && (
        <div role="alert" className="resource-error">
          <p>{error}</p>
          <p>没有自动重试，结果可能尚未确认。请重新读取资料后再决定。</p>
          <button type="button" className="journal-button" onClick={refreshed}>
            重新读取资料
          </button>
        </div>
      )}
    </fieldset>
  )
}
export function ResourceTagEditor(props: { resource: Resource; refreshed: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="classification-picker" aria-label="资料标签管理">
      <button
        type="button"
        className="journal-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? '收起标签管理' : '管理这份资料的标签'}
      </button>
      {open && <TagActions {...props} />}
    </section>
  )
}
