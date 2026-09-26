import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { failureText, getResource, type Source } from './api'
import { ContentSnapshot, type SnapshotState } from './ContentSnapshot'
import { PdfReader } from './PdfReader'
import { clearPdfPosition } from './pdfPosition'
import { isPdfOriginal, type OriginalFile } from './files'
import { ResourceDeleteDialog } from './ResourceDeleteDialog'
import { ResourceError } from './ResourceState'
import { ReaderOutline } from './ReaderOutline'
import { useOutline, useOutlineCurrent, type OutlineItem } from './outline'
import { currentBookmark, type PdfBookmark } from './pdfOutline'
import { ReaderQuote } from './ReaderQuote'
import { ReaderHighlights } from './ReaderHighlights'
import { anchorFrom } from './highlightAnchor'
import { AnnotationTools } from './AnnotationTools'
import {
  bindHighlightNote,
  createHighlight,
  type AnnotationTool,
  type Highlight,
  type HighlightColor,
  type HighlightLook,
} from './highlights'
import {
  clearPosition,
  fingerprintOf,
  percentOf,
  readPosition,
  writePosition,
} from './readerPosition'
import { ReaderHeader, ReaderInfo, ResourceToolbar } from './ResourceToolbar'
import { NotesPanel } from '../notes/NotesPanel'
import type { Note } from '../notes/api'
import { resourceTitle } from './resourceTitle'
import { useResourceQuery } from './useResourceQuery'
import { useHeadingSlot } from '../../shell/heading'

// TASK-043 起这一页是**阅读器**：正文占主体，动作与上下文都收在顶部工具条里。
//
// 此前它是一条长滚动：心得与编辑框在最上面，正文夹在元数据与原件之间，学习状态在最
// 底下。用户的原话是「从资料库点开资料之后应该直接显示的是阅读器窗口」。
//
// TASK-044 压缩了页面外壳，正文拿到更多空间。
//
// TASK-045 把心得从「正文下方整行」挪进右侧心得区：**宽屏默认收起**（正文保持满宽，
// 点工具条「心得」才展开为挤压两栏），窄屏展开为盖在正文上的浮层。心得区一旦资料读
// 到就**保持挂载、用 CSS 显隐**，而不是卸载——否则收起会丢掉未保存草稿。
const READER_BREAKPOINT = '(min-width: 1280px)'

// TASK-067：左侧目录栏的显隐是用户自选，记在本机（与外壳左栏折叠同一做法）；读不出来就当显示。
const OUTLINE_KEY = 'studypilot.reader.outline'
/** 不显示目录时传给 `useOutlineCurrent` 的常量空表——每次渲染给新数组会让它的 effect 反复重挂。 */
const NO_OUTLINE: OutlineItem[] = []
function readOutlineOpen(): boolean {
  try {
    return localStorage.getItem(OUTLINE_KEY) !== '0'
  } catch {
    return true
  }
}

// 正文这一子树只在资料/快照自己的数据变化时才有内容变化；心得区开合、角标数量这类
// 只影响工具条的父级状态，**不该让正文重新渲染**——否则角标到位的那一下重渲染，正好撞上
// 快照取回落库的提交时序，会把刚提交的正文节点撕裂（ContentSnapshot 整文件用例抓到的
// 竞态）。用 memo 把正文隔离在父级状态更新之外，props 没变就不进这个子树。
const ReaderContent = memo(function ReaderContent({
  resourceId,
  sourceType,
  pageTitle,
  showSource,
  editRequest,
  deleteRequest,
  onSnapshotState,
  pdf,
  pdfToolbarSlot,
  onPdfOutline,
  onPdfProgress,
  onPdfTextLayer,
}: {
  resourceId: string
  sourceType: Source
  pageTitle: string
  showSource: boolean
  editRequest: number
  deleteRequest: number
  onSnapshotState: (state: SnapshotState) => void
  /** TASK-073：FILE 资料的原件是 PDF 时，正文区放站内阅读器而不是快照空态。 */
  pdf: OriginalFile | null
  /** TASK-081：PDF 控件要投递到顶栏的哪个节点上；`null` = 顶栏还没挂上。 */
  pdfToolbarSlot: HTMLElement | null
  /** TASK-088：PDF 的书签目录与阅读进度都由阅读器自己算好交上来。 */
  onPdfOutline: (items: PdfBookmark[], goTo: (page: number) => void) => void
  onPdfProgress: (percent: number, page: number) => void
  /** TASK-089：每页文字层渲染完/撤回时上报，高亮在里面定位。 */
  onPdfTextLayer: (page: number, layer: HTMLElement | null) => void
}) {
  // PDF 自己就是正文：这时不渲染快照区（那里只会显示「还没有保存正文」的引导，对一份
  // 已经能在站内读的 PDF 没有意义）。其他格式的原件保持现状，走快照那条路。
  if (pdf)
    return (
      <PdfReader
        key={pdf.id}
        resourceId={resourceId}
        file={pdf}
        toolbarSlot={pdfToolbarSlot}
        onOutline={onPdfOutline}
        onProgress={onPdfProgress}
        onTextLayer={onPdfTextLayer}
      />
    )
  return (
    <ContentSnapshot
      resourceId={resourceId}
      sourceType={sourceType}
      pageTitle={pageTitle}
      showSource={showSource}
      editRequest={editRequest}
      deleteRequest={deleteRequest}
      onSnapshotState={onSnapshotState}
    />
  )
})

/** 跟随一个媒体查询。jsdom 没有 matchMedia 时用 fallback（默认当宽屏挤压态）。 */
function useSqueezeLayout(fallback = true): boolean {
  const [squeeze, setSqueeze] = useState(() => {
    if (typeof window.matchMedia !== 'function') return fallback
    return window.matchMedia(READER_BREAKPOINT).matches
  })
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(READER_BREAKPOINT)
    const update = () => setSqueeze(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return squeeze
}

/** 「在等心得」的配对最多留这么久（毫秒）：过了就不配，宁可让用户再点一次「写心得」。 */
const PENDING_MS = 10 * 60 * 1000

export function ResourceDetail({ resourceId }: { resourceId: string }) {
  const navigate = useNavigate()
  const load = useCallback(() => getResource(resourceId), [resourceId])
  const { result, retry } = useResourceQuery(resourceId, load)
  const item = result?.data
  // **工具条也要跨刷新活着。** `retry()` 会先把 result 清空再重新读取，那一瞬间 `item`
  // 是 undefined；若直接按 `item` 渲染，工具条整个卸载，用户正开着的面板（编辑标签、
  // 编辑资料…）当场关掉——而改标签本身就会触发这次刷新，于是「改一个标签，面板就没了」。
  // 旧版所有区块常驻，不存在这个问题；这是改版引入的退化，由标签用例先抓到。
  // 因此留住上一次读到的这份资料，只在换资料时丢弃。
  // TASK-044 起这一页自己出 `h1`（页头块整个不渲染），并把它交回外壳做焦点落点。
  // **每一种状态都必须恰好有一个 `h1`**——读取中、读取失败也要有，否则导航过来的
  // 键盘用户没有落点，而这种失效在屏幕上完全看不出来。
  const headingSlot = useHeadingSlot()
  const [shown, setShown] = useState<typeof item>(undefined)
  if (item && item !== shown) setShown(item)
  // **只留 id 守卫，不再额外 setShown(undefined)。** 那一行与上一行在同一次渲染里可以
  // 互相抵消：只要出现 `item.id !== resourceId`（后端返回的 id 与请求的不一致），两条会
  // 无限交替触发 "Too many re-renders"。守卫放在读取处就够，也不会显示上一份资料。
  const toolbarItem = shown?.id === resourceId ? shown : undefined

  // --- TASK-046：正文的三个动作搬进工具条的 `⋯` 菜单 ---
  // 菜单在工具条里、正文在下面，共同父级还是这里。**只上提触发与用于取文案的状态**：
  // 快照数据、版本与请求本体仍归 `ContentSnapshot`。替换/删除用单调递增的令牌而不是
  // 布尔，否则父级任何一次重渲染都可能把动作重放一遍。
  const [showSource, setShowSource] = useState(false)
  const [editRequest, setEditRequest] = useState(0)
  const [deleteRequest, setDeleteRequest] = useState(0)
  // `null` = 还不知道有没有正文（读取中，或读取失败）。读取失败单独记一位（TASK-051 起
  // 失败态也回传）：菜单据此把「替换/粘贴正文」也收起，而读取中的一瞬照旧给入口。
  const [snapshotState, setSnapshotState] = useState<SnapshotState | null>(null)
  const snapshotExists = snapshotState && !snapshotState.unreadable ? snapshotState.exists : null
  const snapshotUnreadable = snapshotState?.unreadable ?? false
  const toggleSource = useCallback(() => setShowSource((shown) => !shown), [])
  const askEdit = useCallback(() => setEditRequest((value) => value + 1), [])
  const askDelete = useCallback(() => setDeleteRequest((value) => value + 1), [])
  // **必须 useCallback**：它是 memo 过的正文子树的 prop，每次新建函数等于让工具条的
  // 任何状态变化（开合心得、角标到位）都重新渲染整篇正文。
  const receiveSnapshotState = useCallback((state: SnapshotState) => setSnapshotState(state), [])

  // --- TASK-045：心得区（右侧，默认收起）---
  // 开合状态、对写作框的聚焦请求、Esc 的归还目标都在这一个父级里协调：心得按钮在
  // `ResourceToolbar`、心得区在这页，两者的共同父级就是这里。**不新增路由或全局
  // context**；页面 `h1` 与返回路径的焦点（TASK-044）完全不受影响。
  const [notesOpen, setNotesOpen] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const [notesCount, setNotesCount] = useState<number | null>(null)
  const notesButton = useRef<HTMLButtonElement>(null)
  const notesOverlay = useRef<HTMLElement>(null)
  // 宽屏（≥1280px）展开是「正文 + 心得」两列；窄屏展开是盖在正文上的浮层。
  const squeeze = useSqueezeLayout()
  const opening = notesOpen && !squeeze // 窄屏浮层态：正文要让位，禁止焦点进入
  const askEditorFocus = useCallback(() => setFocusRequest((value) => value + 1), [])
  // 开合 + 聚焦一体（用户 2026-09-08 选定）：收起态点击 = 展开并聚焦写作框；
  // 展开态点击 = 把焦点带回写作框。收起另有心得区自带的「收起」按钮与 Esc。
  // TASK-067 起入口是 `openNotesTab`（下文）：同样的行为，外加把右栏切到「心得」Tab。
  const closeNotes = useCallback(() => {
    setNotesOpen(false)
    notesButton.current?.focus()
  }, [])
  useEffect(() => {
    if (!notesOpen) return
    function onKeyDown(event: KeyboardEvent) {
      // 浮层/挤压都不做模态焦点陷阱（与既有 ToolbarPanel 一致）；Esc 是统一的关闭语义。
      if (event.key !== 'Escape') return
      // **Esc 只属于此刻正被操作的那一个表面。** 焦点若在工具条里别的控件上（⋯ 菜单
      // 开着、焦点在菜单项上），那是那个表面自己的 Esc——全局监听若照关不误，一次 Esc
      // 会把菜单和心得侧栏一起关掉、焦点也被心得按钮抢走（R1 复审 finding 2）。只有
      // 焦点位于心得区、心得按钮本身，或工具条之外的正文/页面别处时，才由这里收起。
      const active = document.activeElement as HTMLElement | null
      if (!active) return
      // **只让给正打开的表面**（TASK-051）：焦点在 `⋯` 菜单项上、在面板（`.reader-panel`，
      // TASK-046 起它在 sticky 盒子之外）里，或停在一个 `aria-expanded="true"` 的触发钮上。
      // 此前是「工具条里任何非心得控件一律让」，于是菜单被 Esc 收回、焦点回到 `⋯` 之后，
      // 那里已经没有表面在开，再按 Esc 却什么都不发生——侧栏只能用鼠标点「收起」
      // （TASK-045 遗留 1「死键」）。心得按钮自己也是 `aria-expanded` 的，排在前面放行。
      if (active === notesButton.current || active.closest('.reader-notes')) {
        closeNotes()
        return
      }
      const inOpenSurface =
        active.closest('.reader-menu, .reader-panel') ||
        active.getAttribute('aria-expanded') === 'true'
      if (inOpenSurface) return
      closeNotes()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [notesOpen, closeNotes])
  const receiveCount = useCallback((total: number) => setNotesCount(total), [])
  // 右栏两个 Tab（TASK-067）：「心得」= NotesPanel，「信息」= 标签 / 保存原因 / 来源 / 进度。
  // 标签与保存原因从正文顶部移进来（用户 2026-09-17 选定「按草图移入信息 Tab」，推翻
  // TASK-046 的「上下文层留在正文顶部」）。⌘J / 心得按钮总是落到「心得」Tab。
  const [sideTab, setSideTab] = useState<'highlights' | 'notes' | 'info'>('notes')
  function openNotesTab() {
    setSideTab('notes')
    setNotesOpen(true)
    askEditorFocus()
  }

  // --- TASK-067：左侧目录栏 ---
  // 目录从渲染后的正文 DOM 收集（见 ReaderOutline）：正文列元素进 state 而不是 ref，
  // 因为它只在资料读到之后才渲染，ref 的变化不会触发重新收集。
  const [readerMain, setReaderMain] = useState<HTMLDivElement | null>(null)
  // --- TASK-073：FILE 资料的原件是 PDF 时，站内直接读 ---
  // 取 `toolbarItem` 而不是 `item`：后者在每次 `retry()` 时被置空（见上面那段注释），
  // 用它会让 PDF 页在「保存学习记录 / 改标签」这类会触发刷新的动作里短暂翻回非 PDF
  // 形态——版式跳一下，`PdfReader` 连同已解析的文档一起卸载、回来重下重解析。
  // 工具条本身早就为此改用 `toolbarItem`，这里跟上（独立 Review 非阻断项）。
  const pdfOriginal = isPdfOriginal(toolbarItem?.original_file ?? null)
    ? toolbarItem!.original_file!
    : null

  const outline = useOutline(readerMain)
  /**
   * PDF 的目录（TASK-088）：书签大纲由 `PdfReader` 读出来交上来，连同「跳到第 N 页」。
   * 两种阅读器的左栏共用 `ReaderOutline`，只是**当前是哪条**与**点了去哪**各算各的。
   */
  // 本机阅读位置的百分比：恢复时取存的值，滚动时随位置写回一起更新（只在整数变化时 setState）。
  // **两种阅读器都往这里写**（TASK-088）：网页由正文滚动算，PDF 由 `PdfReader` 报上来。
  const [readingPercent, setReadingPercent] = useState<number | null>(null)
  // 目录**连同它属于哪份资料一起存**。`Screen.tsx` 以 `resourceId` 为 key 挂载本组件，换资料
  // 时整棵重挂、state 本就清空——**所以这层判断现在不挡任何实际路径**：同一份资料换原件时
  // `id` 仍然相等，旧目录照画；初次 `onOutline` 之前 `items` 本来就是空。它只是一层廉价防御，
  // 等详情页哪天不再按 `resourceId` 重挂才有意义。（两轮独立 Review 先后纠正了我这里的归因：
  // 先是「双保险」的说法不准，再是「挡换原件」这句同样不成立。）
  const [pdfOutline, setPdfOutline] = useState<{
    id: string
    items: PdfBookmark[]
    goTo: (page: number) => void
  }>({ id: '', items: [], goTo: () => {} })
  const [pdfPage, setPdfPage] = useState(1)
  const takePdfOutline = useCallback(
    (items: PdfBookmark[], goTo: (page: number) => void) => {
      setPdfOutline({ id: resourceId, items, goTo })
    },
    [resourceId],
  )
  const takePdfProgress = useCallback((percent: number, at: number) => {
    setReadingPercent((current) => (current === percent ? current : percent))
    setPdfPage((current) => (current === at ? current : at))
  }, [])
  const [outlineOpen, setOutlineOpen] = useState(readOutlineOpen)
  const toggleOutline = useCallback(() => {
    // 写存储放在事件处理器里、不放 setState 更新函数里（更新函数应当是纯的，StrictMode
    // 会调两次）——与外壳 `toggleNav` 同一约定（TASK-067 Review F1）。
    const next = !outlineOpen
    setOutlineOpen(next)
    try {
      localStorage.setItem(OUTLINE_KEY, next ? '1' : '0')
    } catch {
      // 存不下只影响下次打开。
    }
  }, [outlineOpen])
  // 目录只在宽屏（≥1280px）作为左栏存在；窄屏不渲染（浮层形态留给后续任务）。
  // **两种阅读器合流在这里**（TASK-088）：网页用正文标题，PDF 用书签大纲；
  // 两边都是「没有就不显示左栏」。
  const pdfRows = pdfOutline.id === resourceId ? pdfOutline.items : []
  const outlineRows = pdfOriginal ? pdfRows : outline
  const outlineShown = squeeze && outlineOpen && outlineRows.length > 0
  // 目录没显示时不必跟着滚动量所有标题（独立 Review F4②：这个 hook 从组件里提上来之后
  // 变成常挂，收起或窄屏时仍在每次滚动里对全部 h2/h3 取 `getBoundingClientRect`）。
  const outlineCurrent = useOutlineCurrent(outlineShown && !pdfOriginal ? outline : NO_OUTLINE)
  const outlineAt = pdfOriginal ? currentBookmark(pdfRows, pdfPage) : outlineCurrent
  // 没有快捷键（用户 2026-09-17：「快捷键我觉得可以先不做」）：开关只有顶栏的「目录」按钮。

  // --- TASK-068：「记下这段」→ 心得草稿；「记为学习进度」用的阅读百分比 ---
  // 引文是**待消费队列**而不是单个槽位：`NotesPanel` 在 `available=false`（父级正在刷新
  // 资料）的瞬态里留着 token 不消费，这段窗口内连点两次「记下这段」时，单槽位会被后一次
  // 覆盖、前一段引文丢掉（TASK-068 Review F2）。队列里每点一次追加一段，`token` 即长度，
  // 面板按已消费下标一次把未消费的都追加进草稿。组件按 `resourceId` 重挂（`Screen.tsx`），
  // 换资料时队列跟着清空。
  const [quoteRequest, setQuoteRequest] = useState<{ token: number; quotes: string[] }>()
  const takeQuote = useCallback((quote: string) => {
    setSideTab('notes')
    setNotesOpen(true)
    setQuoteRequest((current) => {
      const quotes = [...(current?.quotes ?? []), quote]
      return { token: quotes.length, quotes }
    })
  }, [])

  // --- TASK-072：高亮 ---
  // 每标下一条就让「高亮」Tab 重读列表；`pendingNote` 记住「这条高亮在等一条心得」，
  // 心得一保存就配上去。一次只挂一条：连点两次「记下这段」而心得还没保存时，配对目标
  // 是最后一次，先前那条留作没配心得的高亮（不丢数据，已记录在任务里）。
  const [highlightRevision, setHighlightRevision] = useState(0)
  const [highlightCount, setHighlightCount] = useState<number | null>(null)
  // 「在等一条心得」的那条高亮。它必须会**过期**（Review F3）：点了「记下这段」却放弃草稿、
  // 或转头去改别的心得时，之后随手写的一条心得不该被配到那条旧高亮上——界面里目前没有解绑
  // 入口，配错了不好收拾。除了几处显式清空，再给一个时限兜底。
  const pendingNote = useRef<{ highlight: Highlight; at: number } | null>(null)
  const [markError, setMarkError] = useState<string | null>(null)
  // 顶栏的标注工具（TASK-094）：按下的工具与当前颜色只在本页内存，刷新回到「没选工具」
  // （用户选定不记忆）。点颜色时若没选工具或选的是橡皮，顺手切到荧光笔。
  const [tool, setTool] = useState<AnnotationTool | null>(null)
  const [color, setColor] = useState<HighlightColor>('yellow')
  const pickColor = useCallback((next: HighlightColor) => {
    setColor(next)
    setTool((current) => (current === null || current === 'eraser' ? 'mark' : current))
  }, [])
  /**
   * PDF 上已渲染的文字层，按页号存（TASK-089）。`PdfReader` 在每页文字层渲染完时报上来、
   * 离开渲染窗口时撤回；高亮的定位与上色都在这些容器里做。每次换新 Map，`ReaderHighlights`
   * 才会重新定位。
   */
  const [pdfLayers, setPdfLayers] = useState<Map<number, Element>>(() => new Map())
  const takeTextLayer = useCallback((page: number, layer: HTMLElement | null) => {
    setPdfLayers((current) => {
      if (layer ? current.get(page) === layer : !current.has(page)) return current
      const next = new Map(current)
      if (layer) next.set(page, layer)
      else next.delete(page)
      return next
    })
  }, [])
  /**
   * 一个选区落在 PDF 的哪一页（两端都在同一页的文字层里才算）；不在任何一页、或跨页 → null。
   * 文字层按页给，一条高亮的锚点只能落在一页内——跨页时不落色、只能记下这段（用户 2026-09-22 选定）。
   */
  const pageOfRange = useCallback((range: Range): { page: number; layer: Element } | null => {
    const layerOf = (node: Node) =>
      (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest(
        '.pdf-text-layer',
      ) ?? null
    const start = layerOf(range.startContainer)
    const end = layerOf(range.endContainer)
    if (!start || start !== end) return null
    const page = Number(start.closest('.pdf-page')?.getAttribute('data-page'))
    return Number.isInteger(page) && page >= 1 ? { page, layer: start } : null
  }, [])
  const canMarkPdfRange = useCallback((range: Range) => pageOfRange(range) !== null, [pageOfRange])
  const mark = useCallback(
    async (range: Range, keep: (highlight: Highlight) => void, look: HighlightLook) => {
      // 锚点取自哪段文本：网页是整篇正文；PDF 是选区所在的那一页（TASK-089）。
      let container: Element | null
      let page: number | null = null
      if (pdfOriginal) {
        const at = pageOfRange(range)
        if (!at) return
        container = at.layer
        page = at.page
      } else {
        container = readerMain?.querySelector('.snapshot-rendered') ?? null
      }
      if (!container) return
      const anchor = anchorFrom(container, range)
      if (!anchor) return
      setMarkError(null)
      try {
        const created = await createHighlight(resourceId, anchor, null, page, look)
        keep(created)
        setHighlightRevision((value) => value + 1)
      } catch (cause) {
        setMarkError(failureText(cause))
      }
    },
    [readerMain, resourceId, pdfOriginal, pageOfRange],
  )
  const takeMark = useCallback(
    (range: Range) => {
      // 工具开着时的落色（TASK-094）：不开右栏、不切 Tab——颜色本身就是反馈，一路标下去
      // 不该每次都弹出右栏。只标记、明确不想配心得：把上一次还在等的配对丢掉。
      pendingNote.current = null
      void mark(range, () => {}, { style: tool === 'underline' ? 'underline' : 'mark', color })
    },
    [mark, tool, color],
  )
  // TASK-089 起 PDF 与网页走同一条路：引文进草稿 + 标高亮 + 心得保存后配对。
  // 跨页的选区 `mark()` 会早退（取不到单一页），引文照进草稿——正是用户要的行为。
  const takeQuoteAndMark = useCallback(
    (quote: string, range: Range | null) => {
      takeQuote(quote)
      // 取不到选区时只进草稿、不标高亮：引文是用户已经看见的动作，不该被上色失败连累。
      if (range)
        void mark(
          range,
          (created) => {
            pendingNote.current = { highlight: created, at: Date.now() }
          },
          // 「记下这段」标的是当前颜色的高亮（不是下划线）：它是「写心得」这只手，样子按默认。
          { style: 'mark', color },
        )
    },
    [mark, takeQuote, color],
  )
  // 心得保存成功：若有在等的高亮，就把它配上去（契约：`note_id` 必须显式给出）。
  const bindSavedNote = useCallback(
    async (note: Note) => {
      const waiting = pendingNote.current
      pendingNote.current = null
      if (!waiting || note.resource_id !== resourceId) return
      // 过期就不配了：宁可让用户自己再点一次「写心得」，也不要把心得配到早就忘了的那段上。
      if (Date.now() - waiting.at > PENDING_MS) return
      try {
        await bindHighlightNote(resourceId, waiting.highlight, note.id)
        setHighlightRevision((value) => value + 1)
      } catch (cause) {
        setMarkError(failureText(cause))
      }
    },
    [resourceId],
  )
  const openNoteFromHighlight = useCallback(() => {
    // 去改的是**既有**心得，不是要给谁配一条新的：清掉在等的配对。
    pendingNote.current = null
    setSideTab('notes')
    setNotesOpen(true)
  }, [])
  const writeNoteForHighlight = useCallback(
    (highlight: Highlight) => {
      pendingNote.current = { highlight, at: Date.now() }
      setSideTab('notes')
      setNotesOpen(true)
      askEditorFocus()
    },
    [askEditorFocus],
  )
  const receiveHighlightCount = useCallback((total: number) => setHighlightCount(total), [])

  /**
   * 顶栏里给 PDF 控件留的挂载点（TASK-081）。放 state 而不是 ref：ref 的变化不会触发
   * 重渲染，`PdfReader` 就永远收不到这个节点。首帧它是 `null`，`PdfReader` 那一侧据此
   * 什么都不渲染——渲染在原位再跳上去会闪一下。
   */
  const [pdfToolbarSlot, setPdfToolbarSlot] = useState<HTMLElement | null>(null)

  // --- TASK-067：记住阅读位置（本机、只记位置，不写学习进度）---
  // 正文渲染完成的时机与目录同源：盯着正文列，`.snapshot-rendered` 出现后恢复一次；
  // 之后滚动就（按帧节流）把位置写回。换资料重来。
  const restoredFor = useRef<string | null>(null)
  const readingPdf = Boolean(pdfOriginal)
  useEffect(() => {
    // **PDF 不走这一套**（TASK-088）：它有自己的位置记忆与进度上报（`PdfReader`）。
    // 这里早退不只是省事——这个 effect 的 cleanup 会把 `readingPercent` 抹成 null，
    // 而 PDF 那侧只在百分比**变化**时才报，抹掉之后进度线要等用户再滚一段才回来。
    if (!readerMain || readingPdf) return
    const resource = resourceId
    let frame = 0
    const rendered = () => readerMain.querySelector('.snapshot-rendered')
    const restore = () => {
      const body = rendered()
      if (!body || restoredFor.current === resource) return
      restoredFor.current = resource
      const saved = readPosition(resource)
      if (!saved || saved.fingerprint !== fingerprintOf(body) || saved.top <= 0) return
      setReadingPercent(saved.percent)
      window.scrollTo({ top: saved.top })
    }
    const observer = new MutationObserver(restore)
    observer.observe(readerMain, { childList: true, subtree: true })
    restore()
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const body = rendered()
        if (!body || restoredFor.current !== resource) return
        const percent = percentOf(body, window.scrollY, window.innerHeight)
        setReadingPercent((current) => (current === percent ? current : percent))
        writePosition(resource, {
          top: Math.round(window.scrollY),
          percent,
          fingerprint: fingerprintOf(body),
          savedAt: new Date().toISOString(),
        })
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      if (restoredFor.current === resource) restoredFor.current = null
      setReadingPercent(null)
    }
  }, [readerMain, resourceId, readingPdf])

  // --- TASK-056：删除资料的确认是模态弹窗，挂在菜单与面板之外 ---
  const [deleting, setDeleting] = useState(false)
  const askDeleteResource = useCallback(() => setDeleting(true), [])
  const closeDeletion = useCallback(() => setDeleting(false), [])
  const afterDeletion = useCallback(() => {
    // 资料没了，本机记的阅读位置也没用了（TASK-067 Review F3）。
    clearPosition(resourceId)
    // PDF 的位置是另一把钥匙，删资料时一起清（Review F5：TASK-067 的同一处置没平移过来）。
    clearPdfPosition(resourceId)
    navigate('/resources')
  }, [navigate, resourceId])

  // --- TASK-049：窄屏浮层要让开 sticky 顶栏，而顶栏高度不是常数 ---
  // 浮层改用视口定位后，它的 `top` 必须是顶栏的**实际**高度：≤640px 顶栏会因按钮换行
  // 变高（styles.css 的 `@media (max-width: 640px)`），写死一个常量会在那一档把浮层的
  // 头部（「记录与理解 / 收起」）压到不透明的顶栏底下——那正是本任务要避免的可见缺陷。
  // 顶栏与浮层是兄弟，CSS 里互相拿不到高度，只能实测；窗口尺寸变化会改变顶栏高度，
  // 所以展开期间挂着 resize 重测，收起即卸掉。
  //
  // 只写样式不 setState：这是布局度量，不参与渲染，进 state 会让每次 resize 重渲染
  // 整棵正文子树（它是 memo 过的，恰恰是成本最高的部分）。用 useLayoutEffect 是为了
  // **在首帧之前**就把值写进去，否则浮层会先落在兜底值上再跳一下。
  useLayoutEffect(() => {
    if (!opening) return
    const overlay = notesOverlay.current
    if (!overlay) return
    function measure() {
      // 顶栏只在资料读出来之后才渲染（读取中/失败态没有工具条），此时它必然在。
      const toolbar = notesButton.current?.closest('.reader-toolbar')
      if (!toolbar || !overlay) return
      overlay.style.setProperty('--reader-toolbar-h', `${toolbar.getBoundingClientRect().height}px`)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [opening])

  return (
    <section
      className={`resource-sheet reader${notesOpen ? ' notes-open' : ''}${
        // 类名**不能叫 `pdf-page`**：那是 `PdfReader` 给每一页 PDF 用的类，
        // 裸选择器 `.pdf-page { align-items: center }` 会连整张页面一起命中，
        // 顶栏因此收成内容宽并居中，「适合宽度」也跟着量错（独立 Review F1）。
        pdfOriginal ? ' reader-pdf' : ''
      }`}
      aria-label="资料内容"
    >
      {/* 工具条只在资料读到之后才渲染，而**读取中与读取失败时同样需要出口**。
          旧版这条返回链接是无条件的；改版初稿把它并进工具条，结果「正在打开这份
          资料…」那一屏一个链接都没有，用户被困在页面上。既有用例正是按可访问名称
          「返回资料库」取它的。 */}
      {!toolbarItem && (
        <>
          <Link className="text-link reader-back" to="/resources">
            <span aria-hidden="true">← </span>返回资料库
          </Link>
          <h1 className="reader-title" ref={headingSlot} tabIndex={-1}>
            {result?.error === undefined ? '正在打开资料' : '这份资料打不开'}
          </h1>
        </>
      )}
      {!result && (
        <p role="status" className="resource-loading">
          正在打开这份资料…
        </p>
      )}
      {result?.error !== undefined && <ResourceError error={result.error} retry={retry} />}
      {toolbarItem && (
        <ResourceToolbar
          resource={toolbarItem}
          refreshed={retry}
          onDeleteResource={askDeleteResource}
          notesOpen={notesOpen}
          notesCount={notesCount}
          onNotesClick={openNotesTab}
          notesButtonRef={notesButton}
          outlineAvailable={squeeze && outlineRows.length > 0}
          outlineOpen={outlineOpen}
          onToggleOutline={toggleOutline}
          readingPercent={readingPercent}
          pdfMode={Boolean(pdfOriginal)}
          pdfSlotRef={setPdfToolbarSlot}
          headingSlot={headingSlot}
          // 标注工具（TASK-094）只在有可标注正文时给：网页要有快照，PDF 要有原件。
          tools={
            pdfOriginal || snapshotExists === true ? (
              <AnnotationTools tool={tool} color={color} onTool={setTool} onColor={pickColor} />
            ) : undefined
          }
          snapshotExists={snapshotExists}
          snapshotUnreadable={snapshotUnreadable}
          showSource={showSource}
          onToggleSource={toggleSource}
          onEditSnapshot={askEdit}
          onDeleteSnapshot={askDelete}
        />
      )}
      {toolbarItem && (
        // 正文 + 心得区。TASK-045 起这一页是**两栏容器**：默认只有正文列（心得区
        // `display:none`），展开才让出右侧一列（宽屏挤压 / 窄屏浮层）。
        <div className={`reader-body${outlineShown ? ' outline-open' : ''}`}>
          {/* 左侧目录栏（TASK-067）：宽屏、用户未隐藏、正文里有标题时才占一列。 */}
          {outlineShown && (
            <ReaderOutline
              items={outlineRows}
              current={outlineAt}
              hint={pdfOriginal ? '随页面滚动高亮当前节；点击跳到那一页' : undefined}
              onJump={(index) => {
                if (pdfOriginal) pdfOutline.goTo(pdfRows[index]?.page ?? 1)
                else outline[index]?.element.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            />
          )}
          {/* 窄屏浮层展开时正文 `inert`：被浮层盖住的内容不该还能被 Tab 或辅助技术
              进入。宽屏挤压态两边都可见、都可读，不 inert。 */}
          <div className="reader-main" inert={opening} ref={setReaderMain}>
            {/* 标题进正文列（TASK-052）：页面 `h1` 就是文章的标题，位置与正文列对齐、
                随正文滚走；路由焦点仍落在它上（`headingSlot`）。
                **PDF 例外（TASK-081）**：那一页的标题长在顶栏里，这里不再重复一个 `h1`
                ——一页两个 `h1` 既是无障碍问题，也正是要省掉的那 64px。 */}
            {!pdfOriginal && <ReaderHeader resource={toolbarItem} headingSlot={headingSlot} />}
            {/* 「记下这段」浮动胶囊（TASK-068）与工具开着时的「选中即落」（TASK-094）：读正文里的选区。
                PDF 的正文根是 `.pdf-reader-pages`（文字层在里面，TASK-087）；能不能落色按选区判
                ——落在同一页才落，跨页只留「记下这段」（TASK-089，用户选定）。 */}
            <ReaderQuote
              container={readerMain}
              selector={pdfOriginal ? '.pdf-reader-pages' : '.snapshot-rendered'}
              canMark={pdfOriginal ? canMarkPdfRange : true}
              onQuote={takeQuoteAndMark}
              onMark={takeMark}
              tool={tool}
            />
            {/* 标签与「收下它是因为」TASK-067 起在右栏「信息」Tab（用户 2026-09-17 选定），
                不再占正文顶部；正文紧接标题。 */}
            {/* 正文**紧接着上下文层**、默认占满——这是「正文优先」的全部意义。
                快照的安全形态（`html: false`、无消毒器、图片三条去向）全部落在
                `snapshotMarkdown.ts` 里，**本任务不进那个文件一个字符**。 */}
            <ReaderContent
              resourceId={toolbarItem.id}
              sourceType={toolbarItem.source_type}
              // 页面 h1 显示的就是这个字符串（TASK-053：正文开头同名 h1 不再重复渲染）。
              pageTitle={resourceTitle(toolbarItem)}
              showSource={showSource}
              editRequest={editRequest}
              deleteRequest={deleteRequest}
              onSnapshotState={receiveSnapshotState}
              pdf={pdfOriginal}
              pdfToolbarSlot={pdfToolbarSlot}
              onPdfOutline={takePdfOutline}
              onPdfProgress={takePdfProgress}
              onPdfTextLayer={takeTextLayer}
            />
          </div>
          {/* 用心得 `<section aria-label>` 而不是 `<aside>`：section + 名字 = region，
              `getByRole('region', { name: '记录与理解' })` 照旧取得到。`<aside>` 在
              section 祖先里会被映射成 generic，region 查询会落空。 */}
          <section className="reader-notes" aria-label="记录与理解" ref={notesOverlay}>
            <div className="reader-notes-heading">
              {/* 两个 Tab（TASK-067）。NotesPanel **保持挂载**（草稿与角标数量都在它里面），
                  「信息」选中时只是 CSS 显隐，不卸载。 */}
              <div className="reader-side-tabs" role="tablist" aria-label="右栏">
                {/* 「高亮」Tab。TASK-073 曾对 PDF 隐藏它（那时高亮锚点只能落在快照正文里）；
                    TASK-089 起 PDF 的高亮按页锚定，这个 Tab 两种阅读器都有。 */}
                {
                  <button
                    type="button"
                    role="tab"
                    id="reader-tab-highlights"
                    aria-selected={sideTab === 'highlights'}
                    aria-controls="reader-tabpanel-highlights"
                    className="reader-side-tab"
                    onClick={() => setSideTab('highlights')}
                  >
                    高亮
                    {highlightCount !== null && highlightCount > 0 && (
                      <span className="notes-badge" aria-hidden="true">
                        {highlightCount}
                      </span>
                    )}
                  </button>
                }
                <button
                  type="button"
                  role="tab"
                  id="reader-tab-notes"
                  aria-selected={sideTab === 'notes'}
                  aria-controls="reader-tabpanel-notes"
                  className="reader-side-tab"
                  onClick={() => setSideTab('notes')}
                >
                  心得
                  {notesCount !== null && notesCount > 0 && (
                    <span className="notes-badge" aria-hidden="true">
                      {notesCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  role="tab"
                  id="reader-tab-info"
                  aria-selected={sideTab === 'info'}
                  aria-controls="reader-tabpanel-info"
                  className="reader-side-tab"
                  onClick={() => setSideTab('info')}
                >
                  信息
                </button>
              </div>
              <button type="button" className="journal-button" onClick={closeNotes}>
                收起
              </button>
            </div>
            {markError !== null && (
              <p className="resource-error" role="alert">
                {markError}
              </p>
            )}
            {
              <div
                role="tabpanel"
                id="reader-tabpanel-highlights"
                aria-labelledby="reader-tab-highlights"
                hidden={sideTab !== 'highlights'}
              >
                <ReaderHighlights
                  key={resourceId}
                  resourceId={resourceId}
                  rendered={readerMain?.querySelector('.snapshot-rendered') ?? null}
                  // PDF：按页定位（TASK-089）；那一页没渲染时可以让阅读器跳过去。
                  pages={pdfOriginal ? pdfLayers : null}
                  onJumpPage={pdfOriginal ? pdfOutline.goTo : undefined}
                  revision={highlightRevision}
                  onWriteNote={writeNoteForHighlight}
                  onOpenNote={openNoteFromHighlight}
                  onCount={receiveHighlightCount}
                  tool={tool}
                />
              </div>
            }
            <div
              role="tabpanel"
              id="reader-tabpanel-notes"
              aria-labelledby="reader-tab-notes"
              hidden={sideTab !== 'notes'}
            >
              <NotesPanel
                key={resourceId}
                resourceId={resourceId}
                available={!!item}
                focusRequest={focusRequest}
                quoteRequest={quoteRequest}
                onCount={receiveCount}
                onSaved={bindSavedNote}
              />
            </div>
            <div
              role="tabpanel"
              id="reader-tabpanel-info"
              aria-labelledby="reader-tab-info"
              hidden={sideTab !== 'info'}
            >
              <ReaderInfo resource={toolbarItem} />
            </div>
          </section>
        </div>
      )}
      {deleting && toolbarItem && (
        <ResourceDeleteDialog
          targets={[{ id: toolbarItem.id, title: resourceTitle(toolbarItem) }]}
          onClose={closeDeletion}
          onDeleted={afterDeletion}
        />
      )}
    </section>
  )
}
