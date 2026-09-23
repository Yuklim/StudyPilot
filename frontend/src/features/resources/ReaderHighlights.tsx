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
 * **PDF 上按页定位**（TASK-089）：父级把已渲染的文字层按页号交进来（`pages`），每条高亮在
 * 它自己那一页的容器里跑同一套四级定位。**那一页还没渲染 ≠ 孤立**——只有那一页已经渲染
 * 仍找不到，才说「原文位置已找不到」。上色用另一个高亮名 `studypilot-mark-pdf`（只给底色，
 * 文字层的字是透明的，不能像正文那样再给字色）。
 *
 * **配的心得可能已经不在本资料里**（心得被 `detachNote` 解绑或后贴到别处，TASK-071 遗留
 * F5）。那种悬挂绑定按「没配心得」展示，并允许重新配一条，不报错、不丢高亮。
 */

export type HighlightRow = {
  highlight: Highlight
  range: Range | null
  note: Note | null
  /** 这条高亮所在的文本此刻**能不能被定位**：网页 = 正文已渲染；PDF = 它那一页的文字层已渲染。 */
  locatable: boolean
}

export function ReaderHighlights({
  resourceId,
  rendered,
  revision,
  onWriteNote,
  onOpenNote,
  onCount,
  pages = null,
  onJumpPage,
}: {
  resourceId: string
  /** 渲染后的正文元素；正文还没渲染（读取中、源码视图）时为 null。PDF 模式下不看它。 */
  rendered: Element | null
  /** PDF 模式（TASK-089）：页号 → 已渲染的文字层。给了它就按页定位，`rendered` 被忽略。 */
  pages?: Map<number, Element> | null
  /** PDF 模式下「跳到正文」落到还没渲染的页时，让阅读器跳到那一页。 */
  onJumpPage?: (page: number) => void
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
        // 只为显示「配了哪条心得」。读不到就当没有：心得列表的故障不该把整个高亮 Tab 变成
        // 错误页、更不该让正文不上色（Review F2）。一页 100 条：超过这个数的资料里，落在
        // 后面的心得会被当成悬挂绑定，代价只是多出一个「写心得」入口（已记录在任务里）。
        listNotes(resourceId, 1, '-created_at', 100).then(
          (page) => page.data,
          () => [] as Note[],
        ),
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
  const notes = useMemo(() => result?.data?.[1] ?? [], [result])

  // 正文渲染完（或换了一版）就重新定位；`rendered` 由父级在 DOM 变化时换成新元素。
  // PDF 模式下则是「这一页的文字层渲染完」——容器按每条高亮自己的页号取。
  const rows = useMemo<HighlightRow[]>(() => {
    const byId = new Map(notes.map((note) => [note.id, note]))
    const containerFor = (highlight: Highlight): Element | null => {
      if (pages) return highlight.page_number ? (pages.get(highlight.page_number) ?? null) : null
      return rendered
    }
    const located = highlights.map((highlight) => {
      const container = containerFor(highlight)
      return {
        highlight,
        range: container ? rangeFor(container, anchorOf(highlight)) : null,
        note: highlight.note_id ? (byId.get(highlight.note_id) ?? null) : null,
        locatable: container !== null,
      }
    })
    // 孤立的排最后；其余按文中顺序（接口已按页码、页内位置排好，定位后以实际位置为准）。
    return located.sort((a, b) => {
      const aLost = a.locatable && !a.range
      const bLost = b.locatable && !b.range
      if (aLost !== bLost) return aLost ? 1 : -1
      const byPage = (a.highlight.page_number ?? 0) - (b.highlight.page_number ?? 0)
      return byPage || a.highlight.start_offset - b.highlight.start_offset
    })
  }, [highlights, notes, rendered, pages])
  // **正文还没就绪不等于孤立**（Review F1）：快照还在读、切到源码视图、这份资料没有快照时
  // 都没有可定位的正文，这时说「原文位置已找不到」是在冤枉数据。列表照列，只是不下判断。
  // PDF 模式下这是按条判的（`row.locatable`）：视口外的页没渲染，那几条只是「还没看」。
  const locatable = pages ? pages.size > 0 : rendered !== null
  const registryName = pages ? 'studypilot-mark-pdf' : 'studypilot-mark'

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
      registry.delete(registryName)
      return
    }
    registry.set(registryName, new Painter(...ranges))
    return () => {
      registry.delete(registryName)
    }
  }, [rows, registryName])

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
  const orphans = rows.filter((row) => row.locatable && !row.range).length
  return (
    <div className="reader-highlights">
      <p className="resource-hint reader-highlights-hint" aria-live="polite">
        {rows.length === 0
          ? '还没有标下任何一段'
          : `共 ${rows.length} 条 · 按文中顺序${orphans ? ` · ${orphans} 条找不到原文` : ''}${
              locatable ? '' : ' · 正文还没就绪'
            }`}
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
          {rows.map(({ highlight, range, note, locatable: found }) => (
            <li key={highlight.id} className={!found || range ? undefined : 'orphaned'}>
              {found && !range && (
                <p className="reader-highlight-orphan">
                  {pages
                    ? '在那一页上已找不到这段——PDF 换过、或页码对不上。内容留着。'
                    : '原文位置已找不到——正文换过一版。内容留着，换回来会自动对上。'}
                </p>
              )}
              {highlight.page_number !== null && (
                <span className="source-chip reader-highlight-page">
                  第 {highlight.page_number} 页
                </span>
              )}
              <blockquote className="reader-highlight-quote">{highlight.exact}</blockquote>
              {note && (
                <p className="reader-highlight-note">✎ {noteTitle(note.content) ?? '无标题心得'}</p>
              )}
              <div className="reader-highlight-actions">
                {range ? (
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
                ) : (
                  // PDF 上那一页还没渲染：让阅读器跳过去，渲染完自然会定位上色。
                  pages &&
                  !found &&
                  highlight.page_number !== null &&
                  onJumpPage && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => onJumpPage(highlight.page_number!)}
                    >
                      跳到第 {highlight.page_number} 页
                    </button>
                  )
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
