import { useState } from 'react'

import { ClassificationBrowser } from './ClassificationBrowser'
import type { Choice } from './api'

export interface Selection {
  topic: Choice | null
  tags: Choice[]
}
export function ClassificationPicker({
  value,
  onChange,
  filter = false,
}: {
  value: Selection
  onChange: (value: Selection) => void
  filter?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="classification-picker">
      <button
        type="button"
        className="journal-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? '收起分类选择' : filter ? '按主题与标签筛选' : '选择主题与标签（选填）'}
      </button>
      <p className="resource-hint">
        {value.topic ? `主题：${value.topic.name}` : filter ? '不限主题' : '未选择主题'} · 已选{' '}
        {value.tags.length} 个标签{filter ? '（须全部匹配）' : '（最多 20 个）'}
      </p>
      {value.tags.length > 0 && (
        <div className="selection-chips" aria-label="已选标签">
          {value.tags.map((tag) => (
            <button
              type="button"
              className="journal-button"
              key={tag.id}
              onClick={() =>
                onChange({ ...value, tags: value.tags.filter((item) => item.id !== tag.id) })
              }
            >
              移除已选标签 {tag.name} ×
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="classification-picker-grid">
          <section aria-label="选择主要主题">
            <h3>主要主题</h3>
            <label className="classification-choice">
              <input
                type="radio"
                name="topic-choice"
                checked={!value.topic}
                onChange={() => onChange({ ...value, topic: null })}
              />
              {filter ? '不限主题' : '不分配主题'}
            </label>
            {filter && (
              <label className="classification-choice">
                <input
                  type="radio"
                  name="topic-choice"
                  checked={value.topic?.id === 'unassigned'}
                  onChange={() =>
                    onChange({ ...value, topic: { id: 'unassigned', name: '未分配主题' } })
                  }
                />
                仅未分配主题
              </label>
            )}
            <ClassificationBrowser
              kind="topics"
              render={(item) => (
                <label className="classification-choice">
                  <input
                    type="radio"
                    name="topic-choice"
                    checked={value.topic?.id === item.id}
                    onChange={() => onChange({ ...value, topic: item })}
                  />
                  <span>{item.name}</span>
                </label>
              )}
            />
          </section>
          <section aria-label="选择资料标签">
            <h3>标签</h3>
            <ClassificationBrowser
              kind="tags"
              render={(item) => (
                <label className="classification-choice">
                  <input
                    type="checkbox"
                    checked={value.tags.some((tag) => tag.id === item.id)}
                    disabled={
                      value.tags.length >= 20 && !value.tags.some((tag) => tag.id === item.id)
                    }
                    onChange={(e) =>
                      onChange({
                        ...value,
                        tags: e.target.checked
                          ? [...value.tags, item]
                          : value.tags.filter((tag) => tag.id !== item.id),
                      })
                    }
                  />
                  <span>{item.name}</span>
                </label>
              )}
            />
          </section>
        </div>
      )}
    </div>
  )
}
