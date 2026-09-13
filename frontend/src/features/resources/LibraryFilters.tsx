import { useCallback } from 'react'

import { failureText } from './api'
import { useResourceQuery } from './useResourceQuery'
import { listClassifications, type Kind } from '../taxonomy/api'

/** 一行芯片能列的上限：与后端单页上限一致；更多的提示去分类整理页。 */
const CHIP_LIMIT = 100

/**
 * 资料库筛选行里的主题/标签芯片（TASK-057，用户 2026-09-12 选定）。
 *
 * 不再有「按主题与标签筛选」的展开面板：已有的主题/标签直接列出来，点一个就选一个，
 * **点选即生效**（由调用方立刻写进网址）。主题多选=任一匹配，可与「未分配」并列；标签
 * 多选=含任一（`tag_match=any`）。
 *
 * 网址里带着、但列表里没有的 id（已删除、或在前 100 个之外）仍会作为芯片显示，标成
 * 「已不存在或未列出」，可以取消——筛选条件不能因为读不到名字就悄悄丢掉。
 */
export function ClassificationChips({
  kind,
  selected,
  unassigned = false,
  onToggle,
  onToggleUnassigned,
}: {
  kind: Kind
  selected: string[]
  /** 只对主题有意义：「未分配」芯片是否选中。 */
  unassigned?: boolean
  onToggle: (id: string, on: boolean) => void
  onToggleUnassigned?: (on: boolean) => void
}) {
  const key = `page_size=${CHIP_LIMIT}&sort=name`
  const load = useCallback(() => listClassifications(kind, key), [kind, key])
  const { result, retry } = useResourceQuery(kind + ':' + key, load)
  const items = result?.data?.data ?? []
  const listed = new Set(items.map((item) => item.id))
  const orphans = selected.filter((id) => !listed.has(id))
  const label = kind === 'topics' ? '主题' : '标签'
  const hint = kind === 'topics' ? '选中多个时，属于其中任一即显示' : '选中多个时，含其中任一即显示'

  return (
    <fieldset className="filter-chips" aria-label={`按${label}筛选`}>
      <legend>
        {label}
        <span className="resource-hint">{hint}</span>
      </legend>
      {!result && <span className="resource-hint">正在读取{label}…</span>}
      {result?.error !== undefined && (
        <span className="resource-filter-note" role="alert">
          {failureText(result.error)}{' '}
          <button type="button" className="text-link" onClick={retry}>
            重试
          </button>
        </span>
      )}
      {result?.data && (
        <div className="chip-row" role="group" aria-label={`${label}选项`}>
          {kind === 'topics' && onToggleUnassigned && (
            <button
              type="button"
              className="chip"
              aria-pressed={unassigned}
              onClick={() => onToggleUnassigned(!unassigned)}
            >
              未分配
            </button>
          )}
          {items.map((item) => {
            const on = selected.includes(item.id)
            return (
              <button
                key={item.id}
                type="button"
                className="chip"
                aria-pressed={on}
                onClick={() => onToggle(item.id, !on)}
              >
                {item.name}
                {item.resource_count > 0 && (
                  <span className="chip-count" aria-hidden="true">
                    {item.resource_count}
                  </span>
                )}
              </button>
            )
          })}
          {orphans.map((id) => (
            <button
              key={id}
              type="button"
              className="chip orphan"
              aria-pressed="true"
              title="网址里带着的筛选条件，但这个 id 已不存在或未列出"
              onClick={() => onToggle(id, false)}
            >
              已不存在或未列出
            </button>
          ))}
          {items.length === 0 && orphans.length === 0 && (
            <span className="resource-hint">还没有{label}</span>
          )}
          {result.data.page.has_more && (
            <span className="resource-hint">
              只列出前 {CHIP_LIMIT} 个，更多请到「分类整理」查看。
            </span>
          )}
        </div>
      )}
    </fieldset>
  )
}
