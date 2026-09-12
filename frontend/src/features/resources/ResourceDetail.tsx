import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { getResource, type Source } from './api'
import { ContentSnapshot, type SnapshotState } from './ContentSnapshot'
import { ResourceError } from './ResourceState'
import { ReaderContext, ResourceToolbar } from './ResourceToolbar'
import { NotesPanel } from '../notes/NotesPanel'
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

// 正文这一子树只在资料/快照自己的数据变化时才有内容变化；心得区开合、角标数量这类
// 只影响工具条的父级状态，**不该让正文重新渲染**——否则角标到位的那一下重渲染，正好撞上
// 快照取回落库的提交时序，会把刚提交的正文节点撕裂（ContentSnapshot 整文件用例抓到的
// 竞态）。用 memo 把正文隔离在父级状态更新之外，props 没变就不进这个子树。
const ReaderContent = memo(function ReaderContent({
  resourceId,
  sourceType,
  showSource,
  editRequest,
  deleteRequest,
  onSnapshotState,
}: {
  resourceId: string
  sourceType: Source
  showSource: boolean
  editRequest: number
  deleteRequest: number
  onSnapshotState: (state: SnapshotState) => void
}) {
  return (
    <ContentSnapshot
      resourceId={resourceId}
      sourceType={sourceType}
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
  function onNotesClick() {
    // 开合 + 聚焦一体（用户 2026-09-08 选定）：收起态点击 = 展开并聚焦写作框；
    // 展开态点击 = 把焦点带回写作框。收起另有心得区自带的「收起」按钮与 Esc。
    setNotesOpen(true)
    askEditorFocus()
  }
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
      className={`resource-sheet reader${notesOpen ? ' notes-open' : ''}`}
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
          deleted={() => navigate('/resources')}
          headingSlot={headingSlot}
          notesOpen={notesOpen}
          notesCount={notesCount}
          onNotesClick={onNotesClick}
          notesButtonRef={notesButton}
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
        <div className="reader-body">
          {/* 窄屏浮层展开时正文 `inert`：被浮层盖住的内容不该还能被 Tab 或辅助技术
              进入。宽屏挤压态两边都可见、都可读，不 inert。 */}
          <div className="reader-main" inert={opening}>
            {/* 标签与「收下它是因为」进正文列（TASK-046）：它们是这篇文章的元信息，
                位置要与正文列对齐，并随正文一起滚走——sticky 顶栏只装动作。 */}
            <ReaderContext resource={toolbarItem} />
            {/* 正文**紧接着上下文层**、默认占满——这是「正文优先」的全部意义。
                快照的安全形态（`html: false`、无消毒器、图片三条去向）全部落在
                `snapshotMarkdown.ts` 里，**本任务不进那个文件一个字符**。 */}
            <ReaderContent
              resourceId={toolbarItem.id}
              sourceType={toolbarItem.source_type}
              showSource={showSource}
              editRequest={editRequest}
              deleteRequest={deleteRequest}
              onSnapshotState={receiveSnapshotState}
            />
          </div>
          {/* 用心得 `<section aria-label>` 而不是 `<aside>`：section + 名字 = region，
              `getByRole('region', { name: '记录与理解' })` 照旧取得到。`<aside>` 在
              section 祖先里会被映射成 generic，region 查询会落空。 */}
          <section className="reader-notes" aria-label="记录与理解" ref={notesOverlay}>
            <div className="reader-notes-heading">
              <span className="note-tab">记录与理解</span>
              <button type="button" className="journal-button" onClick={closeNotes}>
                收起
              </button>
            </div>
            <NotesPanel
              key={resourceId}
              resourceId={resourceId}
              available={!!item}
              focusRequest={focusRequest}
              onCount={receiveCount}
            />
          </section>
        </div>
      )}
    </section>
  )
}
