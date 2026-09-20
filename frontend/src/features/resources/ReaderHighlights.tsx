import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { failureText } from './api'
import { listNotes, type Note } from '../notes/api'
import { noteTitle } from '../notes/noteTitle'
import { rangeFor, type Anchor } from './highlightAnchor'
import { deleteHighlight, listHighlights, type Highlight } from './highlights'
import { useResourceQuery } from './useResourceQuery'

/**
 * 阅读器右栏的「高亮」Tab（TASK-072，用户 2026-09-19 在 Pencil 草图上确认）。
 *
 * **上色不插节点。** 用 CSS Custom Highlight API 直接给 `Range` 着色：一段 200 行的代码块
 * 若按老办法包 `<span>` 会产生上千个节点、打碎无障碍树，两条高亮重叠时还得拆节点。正文
 * 由 `snapshotMarkdown.ts` 渲染，那里是本项目唯一的 XSS 边界，这里一个字符都不往里写。
 * 浏览器不支持这个 API 时**降级为不上色**，列表照常可用（jsdom 走的就是这条路）。
 *
 * **定位在这里做，不在服务端。** 服务端只存锚点（契约 4.15）。每次正文渲染完，按
 * `exact` → 前后文 → 偏移附近 四级把锚点落回当前正文；落不回的就是**孤立**，排在列表最后
 * 并说明原因——内容不丢，正文换回来自动对上，孤立状态也不写回服务端。
 *
 * **配的心得可能已经不在本资料里**（心得被 `detachNote` 解绑或后贴到别处，TASK-071 遗留
 * F5）。那种悬挂绑定按「没配心得」展示，并允许重新配一条，不报错、不丢高亮。
 */

export type HighlightRow = { highlight: Highlight; range: Range | null; note: Note | null }

export function ReaderHighlights({
  resourceId,
  rendered,
  revision,
  onWriteNote,
  onOpenNote,
  onCount,
}: {
  resourceId: string
  /** 渲染后的正文元素；正文还没渲染（读取中、源码视图）时为 null。 */
  rendered: Element | null
  /** 父级每新增一条高亮就 +1，用来重新读列表。 */
  revision: number
  /** 「写心得」：切到心得 Tab 写一条，保存后由父级配到这条高亮上。 */
  onWriteNote: (highlight: Highlight) => void
  /** 「改写心得」：切到心得 Tab（那条心得在那里编辑）。 */
  onOpenNote: (note: Note) => void
  onCount?: (total: number) => void
}) {
  const load = useCallback(
    () =>
      Promise.all([
        listHighlights(resourceId),
        // 只为显示「配了哪条心得」。一页 100 条：超过这个数的资料里，落在后面的心得会被
        // 当成悬挂绑定，代价只是多出一个「写心得」入口（已记录在任务里）。
        listNotes(resourceId, 1, '-created_at', 100),
      ]),
    [resourceId],
  )
  const { result, retry } = useResourceQuery(`highlights:${resourceId}:${revision}`, load)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [failure, setFailure] = useState<unknown>(null)
  const [removed, setRemoved] = useState<string[]>([])
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const highlights = useMemo(
    () => (result?.data?.[0].data ?? []).filter((row) => !removed.includes(row.id)),
    [result, removed],
  )
  const notes = useMemo(() => result?.data?.[1].data ?? [], [result])

  // 正文渲染完（或换了一版）就重新定位；`rendered` 由父级在 DOM 变化时换成新元素。
  const rows = useMemo<HighlightRow[]>(() => {
    const byId = new Map(notes.map((note) => [note.id, note]))
    const located = highlights.map((highlight) => ({
      highlight,
      range: rendered ? rangeFor(rendered, anchorOf(highlight)) : null,
      note: highlight.note_id ? (byId.get(highlight.note_id) ?? null) : null,
    }))
    // 孤立的排最后；其余按文中顺序（接口已按 start_offset 排好，定位后以实际位置为准）。
    return located.sort((a, b) => {
      if (!a.range !== !b.range) return a.range ? -1 : 1
      return a.highlight.start_offset - b.highlight.start_offset
    })
  }, [highlights, notes, rendered])

  useEffect(() => {
    onCount?.(highlights.length)
  }, [highlights.length, onCount])

  // 上色。每次都整批重设：Range 会随正文变化失效，留着旧的比不上色更糟。
  useEffect(() => {
    const registry = (globalThis as unknown as { CSS?: { highlights?: Map<string, unknown> } }).CSS
      ?.highlights
    const Painter = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown })
      .Highlight
    if (!registry || typeof Painter !== 'function') return
    const ranges = rows.map((row) => row.range).filter((range): range is Range => range !== null)
    if (!ranges.length) {
      registry.delete('studypilot-mark')
      return
    }
    registry.set('studypilot-mark', new Painter(...ranges))
    return () => {
      registry.delete('studypilot-mark')
    }
  }, [rows])

  async function remove(highlight: Highlight) {
    if (busy) return
    setBusy(highlight.id)
    setFailure(null)
    try {
      await deleteHighlight(resourceId, highlight)
      if (!alive.current) return
      setRemoved((current) => [...current, highlight.id])
      setConfirming(null)
    } catch (cause) {
      if (alive.current) setFailure(cause)
    } finally {
      if (alive.current) setBusy(null)
    }
  }

  if (result === undefined) {
    return (
      <p role="status" className="resource-loading">
        正在读高亮…
      </p>
    )
  }
  if (result.error !== undefined) {
    return (
      <div className="resource-error" role="alert">
        <p>{failureText(result.error)}</p>
        <button type="button" className="journal-button" onClick={retry}>
          重新加载
        </button>
      </div>
    )
  }
  const orphans = rows.filter((row) => !row.range).length
  return (
    <div className="reader-highlights">
      <p className="resource-hint reader-highlights-hint" aria-live="polite">
        {rows.length === 0
          ? '还没有标下任何一段'
          : `共 ${rows.length} 条 · 按文中顺序${orphans ? ` · ${orphans} 条找不到原文` : ''}`}
      </p>
      {failure !== null && (
        <p className="resource-error" role="alert">
          {failureText(failure)}
        </p>
      )}
      {rows.length === 0 ? (
        <div className="empty-sheet reader-highlights-empty">
          <h2>还没有标下任何一段</h2>
          <p>
            在正文里选中一句话，浮出的胶囊里点「标下来」。只想标记就到此为止；想写点什么就点
            「记下这段」，心得保存后会自动配到这条高亮上。
          </p>
        </div>
      ) : (
        <ul className="reader-highlights-list" aria-label="高亮列表">
          {rows.map(({ highlight, range, note }) => (
            <li key={highlight.id} className={range ? undefined : 'orphaned'}>
              {!range && (
                <p className="reader-highlight-orphan">
                  原文位置已找不到——正文换过一版。内容留着，换回来会自动对上。
                </p>
              )}
              <blockquote className="reader-highlight-quote">{highlight.exact}</blockquote>
              {note && (
                <p className="reader-highlight-note">✎ {noteTitle(note.content) ?? '无标题心得'}</p>
              )}
              <div className="reader-highlight-actions">
                {range && (
                  <button
                    type="button"
                    className="text-link"
                    onClick={() =>
                      range.startContainer.parentElement?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      })
                    }
                  >
                    跳到正文
                  </button>
                )}
                <button
                  type="button"
                  className="text-link"
                  onClick={() => (note ? onOpenNote(note) : onWriteNote(highlight))}
                >
                  {note ? '改写心得' : '写心得'}
                </button>
                {confirming === highlight.id ? (
                  <>
                    <button
                      type="button"
                      className="text-link danger"
                      disabled={busy === highlight.id}
                      onClick={() => void remove(highlight)}
                    >
                      {busy === highlight.id ? '正在删除…' : '确认删除'}
                    </button>
                    <button type="button" className="text-link" onClick={() => setConfirming(null)}>
                      取消
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="text-link danger"
                    onClick={() => setConfirming(highlight.id)}
                  >
                    删除
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function anchorOf(highlight: Highlight): Anchor {
  return {
    exact: highlight.exact,
    prefix: highlight.prefix,
    suffix: highlight.suffix,
    start_offset: highlight.start_offset,
    end_offset: highlight.end_offset,
  }
}
