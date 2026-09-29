import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { ApiError } from '../../api/client'
import { failureText } from './api'
import { listNotes, type Note } from '../notes/api'
import { noteTitle } from '../notes/noteTitle'
import { rangeFor, type Anchor } from './highlightAnchor'
import {
  COLOR_LABELS,
  createHighlight,
  deleteHighlight,
  HIGHLIGHT_COLORS,
  listHighlights,
  registryName,
  STYLE_LABELS,
  updateHighlight,
  type AnnotationTool,
  type Highlight,
  type HighlightLook,
} from './highlights'
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
 * 仍找不到，才说「原文位置已找不到」。上色用带 `-pdf` 后缀的一套名字（只给底色/线色，
 * 文字层的字是透明的，不能像正文那样再给字色）。
 *
 * **配的心得可能已经不在本资料里**（心得被 `detachNote` 解绑或后贴到别处，TASK-071 遗留
 * F5）。那种悬挂绑定按「没配心得」展示，并允许重新配一条，不报错、不丢高亮。
 *
 * **正文上的点选（TASK-094）。** 上色没有 DOM 节点，点到哪条只能按坐标反查：
 * `caretPositionFromPoint` 取落点，再问每条 `Range.isPointInRange`。没选工具时点中出**气泡**
 * （写心得 / 换色 / 高亮⇄下划线）；顶栏橡皮开着时点一下**立刻删**，底部出「已删除 · 撤销」，
 * 撤销按同样的锚点、页码、样子重建，原本配的心得也一并接回（用户 2026-09-26 选定）。气泡与提示
 * 用 portal 挂在 body 上——本组件住在右栏 Tab 里，Tab 隐藏时 `position: fixed` 的东西也会跟着藏。
 */

type Point = { node: Node; offset: number }
/** 视口坐标下的文字落点；Chromium 128+ 有标准的 `caretPositionFromPoint`，旧的走 `caretRangeFromPoint`。 */
function caretAt(x: number, y: number): Point | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  if (typeof doc.caretPositionFromPoint === 'function') {
    const at = doc.caretPositionFromPoint(x, y)
    return at ? { node: at.offsetNode, offset: at.offset } : null
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y)
    return range ? { node: range.startContainer, offset: range.startOffset } : null
  }
  return null
}
function contains(range: Range, point: Point): boolean {
  try {
    return range.isPointInRange(point.node, point.offset)
  } catch {
    return false
  }
}

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
  tool = null,
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
  /** 顶栏当前按下的工具（TASK-094）：橡皮让正文上的点选变成删除；其余情况点选出气泡。 */
  tool?: AnnotationTool | null
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
  // 本地覆盖（TASK-094）：换色/改型之后不重读整张列表——重读会先清空再上色，正文闪一下。
  // 列表真的换了一版（`result` 变）就丢掉覆盖，服务端的才是新的。
  const [patched, setPatched] = useState<{ base: unknown; map: Record<string, Highlight> }>({
    base: undefined,
    map: {},
  })
  const [bubble, setBubble] = useState<{ id: string; x: number; y: number } | null>(null)
  const [toast, setToast] = useState<
    { kind: 'undo'; highlight: Highlight } | { kind: 'error'; text: string } | null
  >(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const highlights = useMemo(() => {
    const overlay = patched.base === result ? patched.map : {}
    return (result?.data?.[0].data ?? [])
      .filter((row) => !removed.includes(row.id))
      .map((row) => overlay[row.id] ?? row)
  }, [result, removed, patched])
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

  useEffect(() => {
    onCount?.(highlights.length)
  }, [highlights.length, onCount])

  // 上色。每次都整批重设：Range 会随正文变化失效，留着旧的比不上色更糟。
  // TASK-094 起按「样式 × 颜色」分名注册（`registryName`），CSS 里每个名字一条规则；上一轮
  // 用过、这一轮没有的名字要删掉，否则换色之后旧颜色还留在正文上。
  const painted = useRef<Set<string>>(new Set())
  useEffect(() => {
    const registry = (globalThis as unknown as { CSS?: { highlights?: Map<string, unknown> } }).CSS
      ?.highlights
    const Painter = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown })
      .Highlight
    if (!registry || typeof Painter !== 'function') return
    const groups = new Map<string, Range[]>()
    for (const row of rows) {
      if (!row.range) continue
      const name = registryName(row.highlight, pages !== null)
      groups.set(name, [...(groups.get(name) ?? []), row.range])
    }
    for (const name of painted.current) if (!groups.has(name)) registry.delete(name)
    for (const [name, ranges] of groups) registry.set(name, new Painter(...ranges))
    painted.current = new Set(groups.keys())
    return () => {
      for (const name of painted.current) registry.delete(name)
      painted.current = new Set()
    }
  }, [rows, pages])

  // 正文上的点选（TASK-094）。拖选之后的松手也会来一个 click——选区非空时不算点选，那是在选
  // 文字（工具开着时它已经落色）。监听挂在正文容器上：网页是整篇正文，PDF 是每一页的文字层。
  const rowsRef = useRef(rows)
  const toolRef = useRef(tool)
  useEffect(() => {
    rowsRef.current = rows
    toolRef.current = tool
  }, [rows, tool])
  const containers = useMemo(
    () => (pages ? [...pages.values()] : rendered ? [rendered] : []),
    [pages, rendered],
  )
  // 橡皮（TASK-094）：不问就删，但给撤销。失败也走底部提示——右栏 Tab 多半没开着，列表里的
  // 那条 alert 用户看不见。
  const erase = useCallback(
    async (highlight: Highlight) => {
      if (busy) return
      setBusy(highlight.id)
      setFailure(null)
      setBubble(null)
      try {
        await deleteHighlight(resourceId, highlight)
        if (!alive.current) return
        setRemoved((current) => [...current, highlight.id])
        setToast({ kind: 'undo', highlight })
      } catch (cause) {
        if (alive.current) setToast({ kind: 'error', text: failureText(cause) })
      } finally {
        if (alive.current) setBusy(null)
      }
    },
    [busy, resourceId],
  )
  useEffect(() => {
    if (!containers.length) return
    // 拖选与点选的区分靠两样：选区还在（没选工具时拖选完选区留着）；或者按下点与松开点
    // 离得远（工具开着时 `ReaderQuote` 在 mouseup 里已把选区清掉，随后的 click 到这里时
    // 选区已经空了——Review F1）。超过几个像素就当拖动。
    let pressedAt: { x: number; y: number } | null = null
    const onMouseDown = (event: Event) => {
      const { clientX, clientY } = event as MouseEvent
      pressedAt = { x: clientX, y: clientY }
    }
    const onClick = (event: Event) => {
      const { clientX, clientY } = event as MouseEvent
      const selection = window.getSelection?.()
      if (selection && !selection.isCollapsed) return
      if (pressedAt && Math.hypot(clientX - pressedAt.x, clientY - pressedAt.y) > 4) return
      const point = caretAt(clientX, clientY)
      if (!point) return
      const hit = rowsRef.current.find((row) => row.range !== null && contains(row.range, point))
      if (!hit) return
      if (toolRef.current === 'eraser') void erase(hit.highlight)
      else setBubble({ id: hit.highlight.id, x: clientX, y: clientY })
    }
    for (const node of containers) {
      node.addEventListener('mousedown', onMouseDown)
      node.addEventListener('click', onClick)
    }
    return () => {
      for (const node of containers) {
        node.removeEventListener('mousedown', onMouseDown)
        node.removeEventListener('click', onClick)
      }
    }
  }, [containers, erase])
  // 气泡：Esc 或点到外面就关。
  useEffect(() => {
    if (!bubble) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setBubble(null)
    }
    function onPointerDown(event: Event) {
      if (!(event.target as Element | null)?.closest?.('.reader-bubble')) setBubble(null)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [bubble])
  // 底部提示几秒后自己消失；撤销要在这段时间里点。
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.kind === 'undo' ? 8000 : 6000)
    return () => clearTimeout(timer)
  }, [toast])

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
  // 撤销 = 按同样的锚点、页码、样子再建一条，原来配的心得一并接回（那条心得刚被解绑、还空着）。
  async function restore(highlight: Highlight) {
    setToast(null)
    setFailure(null)
    const look = { style: highlight.style, color: highlight.color }
    try {
      try {
        await createHighlight(
          resourceId,
          anchorOf(highlight),
          highlight.note_id,
          highlight.page_number,
          look,
        )
      } catch (cause) {
        // 那条心得这会儿可能已经不在（删了、解绑到别处、或被别的高亮配走）——那是绑定的事，
        // 不该让标下的那段话跟着丢：退一步不带心得再建一次（Review F4）。
        // 共享客户端只认它列出的码：`NOTE_NOT_FOUND` 原样到达，`NOTE_ALREADY_HIGHLIGHTED`
        // 变成带 409 的 `REQUEST_FAILED`。
        if (highlight.note_id === null || !(cause instanceof ApiError)) throw cause
        const noteGone =
          cause.code === 'NOTE_NOT_FOUND' ||
          (cause.code === 'REQUEST_FAILED' && cause.status === 409)
        if (!noteGone) throw cause
        await createHighlight(resourceId, anchorOf(highlight), null, highlight.page_number, look)
      }
      if (alive.current) retry()
    } catch (cause) {
      if (alive.current) setToast({ kind: 'error', text: failureText(cause) })
    }
  }
  // 气泡里的换色 / 改型：一个版本化 PATCH，回来的那条盖住本地的。
  async function restyle(highlight: Highlight, changes: Partial<HighlightLook>) {
    setFailure(null)
    try {
      const updated = await updateHighlight(resourceId, highlight, changes)
      if (alive.current)
        setPatched((current) => ({
          base: result,
          map: { ...(current.base === result ? current.map : {}), [updated.id]: updated },
        }))
    } catch (cause) {
      if (alive.current) setToast({ kind: 'error', text: failureText(cause) })
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
  // 气泡说的是哪条：按 id 从当前行里找，那条已经不在（被删、被重读掉）就没有气泡。
  const picked = bubble ? (rows.find((row) => row.highlight.id === bubble.id) ?? null) : null
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
            顶栏选好荧光笔或下划线，在正文里选中一句话就标下了。想写点什么，就在没选工具时选中
            文字、点「记下这段」，心得保存后会自动配到这条高亮上；点一下正文上已有的高亮也能给它写。
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
              <span className="reader-highlight-look">
                <span className={`look-dot ${highlight.color}`} aria-hidden="true" />
                {STYLE_LABELS[highlight.style]}
              </span>
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
      {picked &&
        bubble &&
        createPortal(
          <div
            className="reader-bubble"
            role="dialog"
            aria-label="这条高亮"
            style={{ top: bubble.y, left: bubble.x }}
          >
            <button
              type="button"
              className="reader-bubble-button primary"
              onClick={() => {
                setBubble(null)
                if (picked.note) onOpenNote(picked.note)
                else onWriteNote(picked.highlight)
              }}
            >
              <span aria-hidden="true">✎ </span>
              {picked.note ? '改写心得' : '写心得'}
            </button>
            <span className="reader-bubble-divider" aria-hidden="true" />
            <div className="reader-tool-colors" role="radiogroup" aria-label="颜色">
              {HIGHLIGHT_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  className={`reader-tool-color ${option}`}
                  aria-checked={picked.highlight.color === option}
                  aria-label={`${COLOR_LABELS[option]}色`}
                  title={`${COLOR_LABELS[option]}色`}
                  onClick={() => void restyle(picked.highlight, { color: option })}
                />
              ))}
            </div>
            <span className="reader-bubble-divider" aria-hidden="true" />
            <button
              type="button"
              className="reader-bubble-button"
              onClick={() =>
                void restyle(picked.highlight, {
                  style: picked.highlight.style === 'mark' ? 'underline' : 'mark',
                })
              }
            >
              {picked.highlight.style === 'mark' ? '改为下划线' : '改为高亮'}
            </button>
          </div>,
          document.body,
        )}
      {toast &&
        createPortal(
          <div className="reader-toast" role="status">
            {toast.kind === 'undo' ? (
              <>
                <span>已删除一条{STYLE_LABELS[toast.highlight.style]}</span>
                <button type="button" onClick={() => void restore(toast.highlight)}>
                  撤销
                </button>
              </>
            ) : (
              <span>{toast.text}</span>
            )}
          </div>,
          document.body,
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
