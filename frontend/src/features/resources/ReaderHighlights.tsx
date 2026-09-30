import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

import { ApiError } from '../../api/client'
import { deleteNote, detachNote, listNotes, saveNote, type Note } from '../notes/api'
import { AnnotationComposer, type ComposeOutcome, type PendingAnchor } from './AnnotationComposer'
import { displayTime, failureText } from './api'
import { CommentBox } from './CommentBox'
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
 * 阅读器右栏的「注释」列表（TASK-072 起是「高亮」Tab；TASK-098 起合并了「心得」Tab，用户 2026-09-29
 * 定案：像 Zotero 那样不用跳到别处就能写）。
 *
 * **一个列表两种条目**：高亮/下划线（带或不带评论）按文中顺序排；不挂高亮的心得排在它们之后、新的在前。
 * 评论就地写（`CommentBox`）：没有心得就新建一条并配到这条高亮上，有则改内容；顶部「写心得…」框
 * （`AnnotationComposer`）在点进去那一刻若正文有选区，保存时先按当前颜色标高亮再配对。
 *
 * **上色不插节点。** 用 CSS Custom Highlight API 直接给 `Range` 着色，一种样子一个名字（`registryName`）。
 * 浏览器不支持时降级为不上色，列表照常可用（jsdom 走的就是这条路）。
 *
 * **定位在这里做，不在服务端。** 每次正文渲染完按 `exact` → 前后文 → 偏移附近 四级把锚点落回当前正文；
 * 落不回的就是**孤立**，排在高亮之后并说明原因——内容不丢，正文换回来自动对上，孤立状态不写回服务端。
 * **PDF 上按页定位**（TASK-089）：父级把已渲染的文字层按页号交进来（`pages`），那一页还没渲染 ≠ 孤立。
 *
 * **正文上的点选**（TASK-094）：上色没有 DOM 节点，点到哪条只能按坐标反查（`caretPositionFromPoint` +
 * `Range.isPointInRange`）。没选工具时点中出**气泡**（写评论 / 换色 / 高亮⇄下划线）；橡皮开着时点一下
 * **立刻删**，底部出「已删除 · 撤销」，撤销按同样锚点、样子重建，原本配的心得也接回。气泡与提示用
 * portal 挂在 body 上——右栏 Tab 隐藏时 `position: fixed` 的东西也会跟着藏。
 */

export type HighlightRow = {
  kind: 'highlight'
  highlight: Highlight
  range: Range | null
  note: Note | null
  /** 这条高亮所在的文本此刻**能不能被定位**：网页 = 正文已渲染；PDF = 它那一页的文字层已渲染。 */
  locatable: boolean
}
export type NoteRow = { kind: 'note'; note: Note }
export type AnnotationRow = HighlightRow | NoteRow

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
function anchorOf(highlight: Highlight): Anchor {
  return {
    exact: highlight.exact,
    prefix: highlight.prefix,
    suffix: highlight.suffix,
    start_offset: highlight.start_offset,
    end_offset: highlight.end_offset,
  }
}
function firstLine(text: string): string {
  const line = text.split('\n').find((row) => row.trim()) ?? ''
  return line.length > 24 ? line.slice(0, 24) + '…' : line
}
function excerpt(text: string): string {
  return text.length > 24 ? text.slice(0, 24) + '…' : text
}

export function ReaderHighlights({
  resourceId,
  rendered,
  revision,
  onCount,
  pages = null,
  onJumpPage,
  tool = null,
  available = true,
  focusRequest = 0,
  quoteRequest,
  focusHighlight,
  captureSelection,
  markSelection,
  onOpenPanel,
  onHighlights,
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
  /** 注释总数（高亮 + 不挂高亮的心得）变化时回传，做角标。 */
  onCount?: (total: number) => void
  /** 顶栏当前按下的工具（TASK-094）：橡皮让正文上的点选变成删除；其余情况点选出气泡。 */
  tool?: AnnotationTool | null
  /** 父级正在刷新资料时为 false：不发写请求。 */
  available?: boolean
  /** 父级每次「想聚焦写作框」就 +1（心得按钮 = 开合 + 聚焦）。 */
  focusRequest?: number
  /** 标不了高亮时的退路：引文以 Markdown 引用进顶部写作框（TASK-068 队列语义）。 */
  quoteRequest?: { token: number; quotes: string[] }
  /** 父级要求聚焦某条高亮的评论框（胶囊「记下这段」刚标下的那条）。 */
  focusHighlight?: { id: string; token: number }
  /** 读正文里此刻的选区（给顶部写作框）。 */
  captureSelection: () => PendingAnchor | null
  /** 按当前颜色把选区标成高亮；标不了给 null。父级自己会让列表重读。 */
  markSelection: (range: Range) => Promise<Highlight | null>
  /** 气泡里点「写评论」时把右栏打开、切到「注释」。 */
  onOpenPanel?: () => void
  /** 当前读到的高亮列表（含本地覆盖）每变一版就回传：父级建高亮前靠它去重（TASK-099）。 */
  onHighlights?: (rows: Highlight[]) => void
}) {
  const load = useCallback(
    () =>
      Promise.all([
        listHighlights(resourceId),
        // 心得读一页 100 条：既用来配对显示，也就是「不挂高亮的心得」的来源。读不到就当没有：
        // 心得列表的故障不该把整个 Tab 变成错误页、更不该让正文不上色（Review F2）。
        listNotes(resourceId, 1, '-created_at', 100).then(
          (page) => page.data,
          () => [] as Note[],
        ),
      ]),
    [resourceId],
  )
  const { result, retry } = useResourceQuery(`annotations:${resourceId}:${revision}`, load)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [failure, setFailure] = useState<unknown>(null)
  const [removed, setRemoved] = useState<string[]>([])
  // 本地覆盖：换色/改型/写评论之后不重读整张列表——重读会先清空再上色，正文闪一下。
  // 列表真的换了一版（`result` 变）就丢掉覆盖，服务端的才是新的。
  const [patched, setPatched] = useState<{ base: unknown; map: Record<string, Highlight> }>({
    base: undefined,
    map: {},
  })
  const [noteEdits, setNoteEdits] = useState<{
    base: unknown
    map: Record<string, Note>
    added: Note[]
    removed: string[]
  }>({ base: undefined, map: {}, added: [], removed: [] })
  const [bubble, setBubble] = useState<{ id: string; x: number; y: number } | null>(null)
  const [toast, setToast] = useState<
    { kind: 'undo'; highlight: Highlight } | { kind: 'error'; text: string } | null
  >(null)
  // 「解除绑定」之后的提示（带去「我的心得」的链接）。
  const [detached, setDetached] = useState(false)
  const [focusTarget, setFocusTarget] = useState<{ id: string; token: number } | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  // 父级要求聚焦某条（胶囊「记下这段」刚标下的）：渲染期消费一次，转成本地聚焦目标。
  const [seenFocus, setSeenFocus] = useState(0)
  if (focusHighlight && focusHighlight.token !== seenFocus) {
    setSeenFocus(focusHighlight.token)
    setFocusTarget({ id: focusHighlight.id, token: focusHighlight.token })
  }

  const highlights = useMemo(() => {
    const overlay = patched.base === result ? patched.map : {}
    return (result?.data?.[0].data ?? [])
      .filter((row) => !removed.includes(row.id))
      .map((row) => overlay[row.id] ?? row)
  }, [result, removed, patched])
  const notes = useMemo(() => {
    const fetched = result?.data?.[1] ?? []
    const edits = noteEdits.base === result ? noteEdits : null
    const list = [...(edits?.added ?? []), ...fetched]
    return list
      .filter((note) => !(edits?.removed ?? []).includes(note.id))
      .map((note) => edits?.map[note.id] ?? note)
  }, [result, noteEdits])
  // 读取中不回传：换版重读时 `highlights` 会先空一拍，回传空表会把父级刚记进去的新一条抹掉（Review F1）。
  useEffect(() => {
    if (result) onHighlights?.(highlights)
  }, [result, highlights, onHighlights])
  function upsertNote(note: Note, added = false) {
    setNoteEdits((current) => {
      const same =
        current.base === result ? current : { base: result, map: {}, added: [], removed: [] }
      return {
        base: result,
        map: { ...same.map, [note.id]: note },
        added:
          added && !same.added.some((row) => row.id === note.id)
            ? [note, ...same.added]
            : same.added,
        removed: same.removed,
      }
    })
  }
  function dropNote(id: string) {
    setNoteEdits((current) => {
      const same =
        current.base === result ? current : { base: result, map: {}, added: [], removed: [] }
      return { ...same, base: result, removed: [...same.removed, id] }
    })
  }
  function patchHighlight(updated: Highlight) {
    setPatched((current) => ({
      base: result,
      map: { ...(current.base === result ? current.map : {}), [updated.id]: updated },
    }))
  }

  // 正文渲染完（或换了一版）就重新定位；`rendered` 由父级在 DOM 变化时换成新元素。
  // PDF 模式下则是「这一页的文字层渲染完」——容器按每条高亮自己的页号取。
  const rows = useMemo<AnnotationRow[]>(() => {
    const byId = new Map(notes.map((note) => [note.id, note]))
    const containerFor = (highlight: Highlight): Element | null => {
      if (pages) return highlight.page_number ? (pages.get(highlight.page_number) ?? null) : null
      return rendered
    }
    const located: HighlightRow[] = highlights.map((highlight) => {
      const container = containerFor(highlight)
      return {
        kind: 'highlight',
        highlight,
        range: container ? rangeFor(container, anchorOf(highlight)) : null,
        note: highlight.note_id ? (byId.get(highlight.note_id) ?? null) : null,
        locatable: container !== null,
      }
    })
    // 孤立的排在高亮里的最后；其余按文中顺序。
    located.sort((a, b) => {
      const aLost = a.locatable && !a.range
      const bLost = b.locatable && !b.range
      if (aLost !== bLost) return aLost ? 1 : -1
      const byPage = (a.highlight.page_number ?? 0) - (b.highlight.page_number ?? 0)
      return byPage || a.highlight.start_offset - b.highlight.start_offset
    })
    // 不挂高亮的心得：没有任何高亮指向它的那些，新的在前（接口已按 -created_at 给）。
    const bound = new Set(highlights.map((h) => h.note_id).filter(Boolean))
    const loose: NoteRow[] = notes
      .filter((note) => !bound.has(note.id))
      .map((note) => ({ kind: 'note', note }))
    return [...located, ...loose]
  }, [highlights, notes, rendered, pages])
  const highlightRows = rows.filter((row): row is HighlightRow => row.kind === 'highlight')
  // **正文还没就绪不等于孤立**：快照还在读、切到源码视图、这份资料没有快照时都没有可定位的正文。
  const locatable = pages ? pages.size > 0 : rendered !== null

  useEffect(() => {
    onCount?.(rows.length)
  }, [rows.length, onCount])

  // 上色。每次都整批重设：Range 会随正文变化失效，留着旧的比不上色更糟。按「样式 × 颜色」分名注册，
  // 上一轮用过、这一轮没有的名字要删掉，否则换色之后旧颜色还留在正文上。
  const painted = useRef<Set<string>>(new Set())
  useEffect(() => {
    const registry = (globalThis as unknown as { CSS?: { highlights?: Map<string, unknown> } }).CSS
      ?.highlights
    const Painter = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown })
      .Highlight
    if (!registry || typeof Painter !== 'function') return
    const groups = new Map<string, Range[]>()
    for (const row of highlightRows) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- highlightRows 由 rows 派生
  }, [rows, pages])

  // 橡皮（TASK-094）：不问就删，但给撤销。失败也走底部提示——右栏多半没开着。
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
  // 正文上的点选。拖选之后的松手也会来一个 click——选区非空、或按下点与松开点离得远（工具开着时
  // `ReaderQuote` 在 mouseup 里已把选区清掉）都不算点选。监听挂在正文容器上：网页是整篇正文，PDF 是每页文字层。
  const rowsRef = useRef(highlightRows)
  const toolRef = useRef(tool)
  useEffect(() => {
    rowsRef.current = highlightRows
    toolRef.current = tool
  })
  const containers = useMemo(
    () => (pages ? [...pages.values()] : rendered ? [rendered] : []),
    [pages, rendered],
  )
  useEffect(() => {
    if (!containers.length) return
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
      else if (toolRef.current === 'note') {
        // 「注释」工具（TASK-099）：点到哪条就写哪条的评论，不出气泡。
        onOpenPanel?.()
        setFocusTarget({ id: hit.highlight.id, token: Date.now() })
      } else setBubble({ id: hit.highlight.id, x: clientX, y: clientY })
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
  }, [containers, erase, onOpenPanel])
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
  // 聚焦目标所在的条目滚进视野。
  const itemRefs = useRef(new Map<string, HTMLLIElement>())
  useEffect(() => {
    if (!focusTarget) return
    itemRefs.current.get(focusTarget.id)?.scrollIntoView?.({ block: 'nearest' })
  }, [focusTarget])

  async function remove(highlight: Highlight) {
    if (busy) return
    setBusy(highlight.id)
    setFailure(null)
    try {
      await deleteHighlight(resourceId, highlight)
      if (!alive.current) return
      setRemoved((current) => [...current, highlight.id])
      setConfirming(null)
      setMenuFor(null)
    } catch (cause) {
      if (alive.current) setFailure(cause)
    } finally {
      if (alive.current) setBusy(null)
    }
  }
  // 解除绑定：这条心得回到「我的心得」，不再挂在这份资料下（NotesPanel 时代就有的入口，沿用）。
  async function detach(note: Note) {
    if (busy) return
    if (!window.confirm('解除后这条心得回到「我的心得」，不再挂在这份资料下。确定解除吗？')) return
    setBusy(note.id)
    setFailure(null)
    setDetached(false)
    try {
      await detachNote(note)
      if (!alive.current) return
      dropNote(note.id)
      setMenuFor(null)
      setDetached(true)
    } catch (cause) {
      if (alive.current) setFailure(cause)
    } finally {
      if (alive.current) setBusy(null)
    }
  }
  async function removeNote(note: Note) {
    if (busy) return
    setBusy(note.id)
    setFailure(null)
    try {
      await deleteNote(resourceId, note)
      if (!alive.current) return
      dropNote(note.id)
      setConfirming(null)
      setMenuFor(null)
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
        // 不该让标下的那段话跟着丢：退一步不带心得再建一次。共享客户端只认它列出的码：
        // `NOTE_NOT_FOUND` 原样到达，`NOTE_ALREADY_HIGHLIGHTED` 变成带 409 的 `REQUEST_FAILED`。
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
  // 换色 / 改型：一个版本化 PATCH，回来的那条盖住本地的。
  async function restyle(highlight: Highlight, changes: Partial<HighlightLook>) {
    setFailure(null)
    try {
      const updated = await updateHighlight(resourceId, highlight, changes)
      if (alive.current) patchHighlight(updated)
    } catch (cause) {
      if (alive.current) setToast({ kind: 'error', text: failureText(cause) })
    }
  }
  // 高亮下的评论：没有心得就新建一条并配上；有就改内容。
  async function saveComment(row: HighlightRow, text: string) {
    if (row.note) {
      const saved = await saveNote(resourceId, text, row.note)
      if (alive.current) upsertNote(saved)
      return
    }
    const created = await saveNote(resourceId, text, null)
    const updated = await updateHighlight(resourceId, row.highlight, { note_id: created.id })
    if (!alive.current) return
    upsertNote(created, true)
    patchHighlight(updated)
  }
  async function saveLoose(note: Note, text: string) {
    const saved = await saveNote(resourceId, text, note)
    if (alive.current) upsertNote(saved)
  }
  // 顶部「写心得…」：有选区先标高亮，再建心得、配上；标不了（跨页等）就只建心得。
  // 高亮建了、心得却没存成：把那条高亮撤掉再抛错——写作框里文字与选区都还在，人再存一次
  // 会重新标，不会留下一条多余的高亮（Review F4）。
  // 选区正好是一条**已有评论**的高亮（父级去重后回的是那条，TASK-099）：不改绑，心得存成独立心得。
  async function compose(
    text: string,
    anchor: PendingAnchor | null,
  ): Promise<{ outcome: ComposeOutcome }> {
    const target = anchor ? await markSelection(anchor.range) : null
    // 「已有评论」按列表里真配上的心得判，不看裸的 note_id：悬挂绑定（心得已被解绑走）显示为没评论，
    // 这里也应当配上去（Review F2）。
    const taken =
      target !== null &&
      highlightRows.some((row) => row.highlight.id === target.id && row.note !== null)
    // 只有这次新建的高亮才在心得失败时回滚：本来就有的那条不是这次的产物。
    const fresh = target !== null && !highlights.some((row) => row.id === target.id)
    let created: Note
    try {
      created = await saveNote(resourceId, text, null)
    } catch (cause) {
      if (target && fresh) await deleteHighlight(resourceId, target).catch(() => undefined)
      if (alive.current) retry()
      throw cause
    }
    if (target && !taken) await updateHighlight(resourceId, target, { note_id: created.id })
    if (alive.current) retry()
    return { outcome: !anchor ? 'alone' : !target ? 'unmarked' : taken ? 'taken' : 'paired' }
  }
  function jump(row: HighlightRow) {
    if (row.range) {
      row.range.startContainer.parentElement?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    } else if (pages && row.highlight.page_number !== null && onJumpPage) {
      onJumpPage(row.highlight.page_number)
    }
  }

  const orphans = highlightRows.filter((row) => row.locatable && !row.range).length
  // 气泡说的是哪条：按 id 从当前行里找，那条已经不在（被删、被重读掉）就没有气泡。
  const picked = bubble
    ? (highlightRows.find((row) => row.highlight.id === bubble.id) ?? null)
    : null
  const loading = result === undefined
  const failed = result?.error !== undefined

  return (
    <div className="reader-highlights annotation-panel">
      <AnnotationComposer
        disabled={!available}
        focusRequest={focusRequest}
        quoteRequest={quoteRequest}
        captureSelection={captureSelection}
        onSubmit={compose}
      />
      {loading && (
        <p role="status" className="resource-loading">
          正在读注释…
        </p>
      )}
      {failed && (
        <div className="resource-error" role="alert">
          <p>{failureText(result.error)}</p>
          <button type="button" className="journal-button" onClick={retry}>
            重新加载
          </button>
        </div>
      )}
      {!loading && !failed && (
        <>
          <p className="resource-hint reader-highlights-hint" aria-live="polite">
            {rows.length === 0
              ? '还没有注释'
              : `${rows.length} 条 · 按文中顺序${orphans ? ` · ${orphans} 条找不到原文` : ''}${
                  locatable ? '' : ' · 正文还没就绪'
                }`}
          </p>
          {failure !== null && (
            <p className="resource-error" role="alert">
              {failureText(failure)}
            </p>
          )}
          {detached && (
            <p className="note-saved" role="status">
              已解除为独立心得。
              <Link className="text-link" to="/notes">
                去「我的心得」查看
              </Link>
            </p>
          )}
          {rows.length === 0 ? (
            <p className="quiet-empty">
              顶栏选好荧光笔或下划线，在正文里选中一句话就标下了；想写点什么，选中文字后点「记下这段」，
              或在上面的框里直接写。
            </p>
          ) : (
            <ul className="annotation-list" aria-label="注释列表">
              {rows.map((row) => {
                const id = row.kind === 'highlight' ? row.highlight.id : row.note.id
                const focusToken = focusTarget?.id === id ? focusTarget.token : 0
                const open = menuFor === id
                if (row.kind === 'note') {
                  const { note } = row
                  return (
                    <li
                      key={id}
                      ref={(node) => {
                        if (node) itemRefs.current.set(id, node)
                        else itemRefs.current.delete(id)
                      }}
                      className="annotation-item note"
                    >
                      <div className="annotation-item-head">
                        <span className="annotation-kind">✎ 心得 · 未挂高亮</span>
                        <button
                          type="button"
                          className="text-link annotation-more"
                          aria-label={`更多：心得 ${firstLine(note.content)}`}
                          aria-expanded={open}
                          onClick={() => {
                            setMenuFor(open ? null : id)
                            setConfirming(null)
                          }}
                        >
                          ⋯
                        </button>
                      </div>
                      <CommentBox
                        label={`心得：${firstLine(note.content)}`}
                        initial={note.content}
                        placeholder="写点什么…"
                        focusToken={focusToken}
                        disabled={!available}
                        rows={3}
                        onSave={(text) => saveLoose(note, text)}
                        onFocused={() => setFocusTarget(null)}
                      />
                      <div className="annotation-meta">
                        <time dateTime={note.created_at}>{displayTime(note.created_at)}</time>
                      </div>
                      {open && (
                        <div className="annotation-actions">
                          <Link
                            className="text-link"
                            to={`/notes/${note.id}?resource=${resourceId}`}
                          >
                            整页编辑
                          </Link>
                          <button
                            type="button"
                            className="text-link"
                            disabled={busy === id}
                            onClick={() => void detach(note)}
                          >
                            解除绑定
                          </button>
                          {confirming === id ? (
                            <>
                              <button
                                type="button"
                                className="text-link danger"
                                disabled={busy === id}
                                onClick={() => void removeNote(note)}
                              >
                                {busy === id ? '正在删除…' : '确认删除心得'}
                              </button>
                              <button
                                type="button"
                                className="text-link"
                                onClick={() => setConfirming(null)}
                              >
                                取消
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="text-link danger"
                              onClick={() => setConfirming(id)}
                            >
                              删除心得
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                }
                const { highlight, range, note, locatable: found } = row
                return (
                  <li
                    key={id}
                    ref={(node) => {
                      if (node) itemRefs.current.set(id, node)
                      else itemRefs.current.delete(id)
                    }}
                    className={`annotation-item ${highlight.style} ${highlight.color}${
                      !found || range ? '' : ' orphaned'
                    }`}
                  >
                    <div className="annotation-item-head">
                      <span className="annotation-kind">
                        <span className={`look-dot ${highlight.color}`} aria-hidden="true" />
                        {STYLE_LABELS[highlight.style]}
                        {highlight.page_number !== null && ` · 第 ${highlight.page_number} 页`}
                      </span>
                      <button
                        type="button"
                        className="text-link annotation-more"
                        aria-label={`更多：${excerpt(highlight.exact)}`}
                        aria-expanded={open}
                        onClick={() => {
                          setMenuFor(open ? null : id)
                          setConfirming(null)
                        }}
                      >
                        ⋯
                      </button>
                    </div>
                    {found && !range && (
                      <p className="reader-highlight-orphan">
                        {pages
                          ? '在那一页上已找不到这段——PDF 换过、或页码对不上。内容留着。'
                          : '原文位置已找不到——正文换过一版。内容留着，换回来会自动对上。'}
                      </p>
                    )}
                    <blockquote className="reader-highlight-quote">{highlight.exact}</blockquote>
                    <CommentBox
                      label={`评论：${excerpt(highlight.exact)}`}
                      initial={note?.content ?? ''}
                      placeholder="添加评论…"
                      focusToken={focusToken}
                      disabled={!available}
                      onSave={(text) => saveComment(row, text)}
                      onFocused={() => setFocusTarget(null)}
                    />
                    <div className="annotation-meta">
                      {range ? (
                        <button type="button" className="text-link" onClick={() => jump(row)}>
                          跳到正文
                        </button>
                      ) : (
                        pages &&
                        !found &&
                        highlight.page_number !== null &&
                        onJumpPage && (
                          <button type="button" className="text-link" onClick={() => jump(row)}>
                            跳到第 {highlight.page_number} 页
                          </button>
                        )
                      )}
                      <time dateTime={highlight.created_at}>
                        {displayTime(highlight.created_at)}
                      </time>
                    </div>
                    {open && (
                      <div className="annotation-actions">
                        <div className="reader-tool-colors" role="radiogroup" aria-label="颜色">
                          {HIGHLIGHT_COLORS.map((option) => (
                            <button
                              key={option}
                              type="button"
                              role="radio"
                              className={`reader-tool-color ${option}`}
                              aria-checked={highlight.color === option}
                              aria-label={`${COLOR_LABELS[option]}色`}
                              title={`${COLOR_LABELS[option]}色`}
                              onClick={() => void restyle(highlight, { color: option })}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          className="text-link"
                          onClick={() =>
                            void restyle(highlight, {
                              style: highlight.style === 'mark' ? 'underline' : 'mark',
                            })
                          }
                        >
                          {highlight.style === 'mark' ? '改为下划线' : '改为高亮'}
                        </button>
                        {confirming === id ? (
                          <>
                            <button
                              type="button"
                              className="text-link danger"
                              disabled={busy === id}
                              onClick={() => void remove(highlight)}
                            >
                              {busy === id ? '正在删除…' : '确认删除'}
                            </button>
                            <button
                              type="button"
                              className="text-link"
                              onClick={() => setConfirming(null)}
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="text-link danger"
                            onClick={() => setConfirming(id)}
                          >
                            删除高亮
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
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
                onOpenPanel?.()
                setFocusTarget({ id: picked.highlight.id, token: Date.now() })
              }}
            >
              <span aria-hidden="true">✎ </span>
              {picked.note ? '改评论' : '写评论'}
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
