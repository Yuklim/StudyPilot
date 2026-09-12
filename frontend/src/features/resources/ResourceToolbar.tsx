import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router-dom'

import { displayTime, safeWebUrl, sourceLabels, statusLabels, type Resource } from './api'
import { resourceTitle } from './resourceTitle'
import { ResourceEditor } from './ResourceEditor'
import { FileOriginal } from './FileOriginal'
import { LearningPanel } from '../learning/LearningPanel'
import { ResourceTagEditor } from '../taxonomy/ResourceTagEditor'
import { Icon } from '../../shell/Icon'

/**
 * 阅读器的顶部工具条。**两层，且两层都常驻。**
 *
 * 上层是动作：返回、标题、学习状态、心得、原文/原件、`⋯`。
 * 下层是**阅读时要看见的上下文**：标签与「为什么收下这一页」。
 *
 * 用户原话是「元数据、标签、编辑资料、原件这些收到顶部工具条的按钮里」，这里对其中
 * 两项作了区分并已当面说明：标签与保存原因不是动作，是上下文。塞进按钮意味着每次
 * 想起「我当初为什么收下这篇」都要点一下，而这恰是本产品的核心信息之一。代价是正文
 * 起始位置下移约 40px，已记入任务记录的已知取舍。
 *
 * 低频**动作**才进 `⋯`：编辑资料、编辑标签、资料信息、正文的三个动作（看源码 / 替换 /
 * 删除），以及**单独一区、置于底部、带危险样式**的删除正文与删除资料。
 *
 * TASK-046 起这一页是**沉浸式整页**，本组件因此拆成三块渲染：
 *
 * - `.reader-toolbar`：只装动作层与 `⋯` 菜单，`position: sticky` 钉在窗口顶部。长文滚到
 *   任何位置都够得着「心得」与「返回资料库」——沉浸页没有左栏，这条返回链接是唯一出口。
 * - `.reader-panel`（面板）**移出 sticky 盒**：它在流内，跟着钉住会把半个窗口占掉。
 * - 上下文层（标签 + 收下它是因为）由 `ReaderContext` 单独导出，`ResourceDetail` 把它放进
 *   正文列内、正文之上——它是这篇文章的元信息（等同署名行），要与 740px 正文列左右对齐。
 */

type PanelKey = 'learning' | 'original' | 'edit' | 'tags' | 'info'

export function ResourceToolbar({
  resource,
  refreshed,
  onDeleteResource,
  notesOpen,
  notesCount,
  onNotesClick,
  notesButtonRef,
  snapshotExists,
  snapshotUnreadable = false,
  showSource,
  onToggleSource,
  onEditSnapshot,
  onDeleteSnapshot,
}: {
  resource: Resource
  /** 元数据被改动后重新读取这份资料。 */
  refreshed: () => void
  /**
   * 请求删除这份资料（TASK-056）：打开模态确认弹窗的是 `ResourceDetail`，弹窗渲染在菜单
   * 与面板之外——点别处关掉菜单不会把已取到的一次性令牌连同请求一起卸载掉。
   */
  onDeleteResource: () => void
  /** 心得区是否展开（挤压两栏还是窄屏浮层，由 `ResourceDetail` 的断点决定）。 */
  notesOpen: boolean
  /** 这份资料已绑定心得的总数；`null` 表示侧栏还没读到（不显示角标）。 */
  notesCount: number | null
  /** 点「心得」＝开合 + 聚焦一体（用户 2026-09-08 选定，见任务记录）。 */
  onNotesClick: () => void
  /** 心得按钮本体：`Esc` /「收起」把焦点还给它（TASK-045）。 */
  notesButtonRef: RefObject<HTMLButtonElement | null>
  /**
   * 这份资料有没有正文快照；`null` = 还没读到。菜单据此在「替换正文/粘贴正文」之间取
   * 文案，并决定「删除正文…」出不出现——**没有正文时不该有一个删除它的入口**。
   */
  snapshotExists: boolean | null
  /**
   * 正文读取失败（TASK-051）。此时 `snapshotExists` 也是 `null`，但与「还在读」不同：
   * 「替换/粘贴正文」要一并收起——读取中点它会等读到再开表单，失败了则什么都不会发生。
   * 可选，默认 false；既有用法不传。
   */
  snapshotUnreadable?: boolean
  /** 当前是不是源码视图。受控于 `ResourceDetail`：菜单项文案要随它变。 */
  showSource: boolean
  onToggleSource: () => void
  /** 打开正文编辑表单（替换/粘贴）。 */
  onEditSnapshot: () => void
  /** 请求删除正文；确认那一步由 `ContentSnapshot` 在正文位置渲染。 */
  onDeleteSnapshot: () => void
}) {
  const [panel, setPanel] = useState<PanelKey | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const menuRegion = useRef<HTMLDivElement>(null)
  const link = resource.source_url ? safeWebUrl(resource.source_url) : null

  // 一次只开一个面板：两个面板同时展开会把正文推到屏幕外，而工具条的意义正是让正文
  // 留在第一屏。开面板时同时关掉菜单，反之亦然。
  function openPanel(key: PanelKey) {
    setMenuOpen(false)
    setPanel((current) => (current === key ? null : key))
  }
  function openMenu() {
    setPanel(null)
    setMenuOpen((open) => !open)
  }
  /**
   * 菜单里那些**不开面板**的动作（正文的三个）。菜单一关，焦点会掉到 `body`，而这几个
   * 动作里只有「替换正文」会被自动聚焦的写作框接住；其余两个没有任何东西接。所以这里
   * 把焦点还给 `⋯`——与 `Esc` 关菜单同一条归还路径。
   *
   * `focus()` 必须排在 `run()` 之后：删除确认块与源码视图都在本次更新里挂载，先归还再
   * 触发的话，若被触发方随后主动聚焦（写作框的 `autoFocus`），归还会把它盖掉。
   */
  function runFromMenu(run: () => void, keepFocus = true) {
    setMenuOpen(false)
    run()
    if (keepFocus) menuTrigger.current?.focus()
  }

  // Esc 关菜单并把焦点还给触发按钮；点到菜单外面也关。**焦点归还只属于 `Esc` 那一支**
  // ——键盘用户在菜单消失后不该掉到文档开头，得从头 Tab 一遍；而用鼠标点别处的人
  // 焦点本就该跟着去别处（外点那一支的实测与理由见下方注释）。
  useEffect(() => {
    if (!menuOpen) return
    // 打开后把焦点送进菜单：否则键盘用户按下 ⋯ 之后第一次 Tab 会落到下面那层的标签
    // 链接上（视觉上完全在别处），标签越多绕得越远。
    menuRegion.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      menuTrigger.current?.focus()
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (menuRegion.current?.contains(target) || menuTrigger.current?.contains(target)) return
      setMenuOpen(false)
      // **这里不抢焦点。** 曾经在这里调过 `menuTrigger.focus()`，jsdom 里断言通过，
      // 而在真实 Chromium 里**根本不生效**：浏览器在 `pointerdown` 之后才执行
      // `mousedown` 的默认聚焦动作，点到空白处时会把焦点清到 `body`，把这次归还覆盖掉。
      // （实测过，不是推理：`Esc` 那条焦点确实回到 ⋯ 按钮，外点这条 `activeElement`
      // 是 `BODY`。）而且抢回来本身也不对——用户点了别处，焦点就该跟着去别处，
      // 这正是 WAI-ARIA 菜单按钮模式的规定。焦点归还只属于 `Esc` 那一支。
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [menuOpen])

  const progress = resource.progress
  return (
    <>
      {/* TASK-052 起顶栏**只装动作**（用户 2026-09-12 选定「A3 标题移出顶栏」+「全部宽度
          统一」）：标题与来源徽章移到正文列顶部（`ReaderHeader`），随文章滚走。此前窄屏
          「← 返回资料库 · 网页 · 标题」+ 四个按钮要排两行，顶栏实测 123px（390px 视口）。 */}
      <div className="reader-toolbar">
        <div className="reader-toolbar-actions">
          <Link className="text-link reader-back" to="/resources">
            {/* 箭头用 `aria-hidden` 的真实元素，不用 `::before`。生成内容在 Chromium 与
              Firefox 里**是计入**可访问名称的，只有 jsdom 不算——用伪元素等于只在测试
              环境里成立。文字在 ≤640px 视觉隐藏（`.sr-only`），可访问名称不变。 */}
            <span aria-hidden="true">← </span>
            <span className="reader-back-text">返回资料库</span>
          </Link>
          <div className="reader-toolbar-buttons">
            <button
              type="button"
              className="journal-button reader-status"
              aria-expanded={panel === 'learning'}
              onClick={() => openPanel('learning')}
            >
              {statusLabels[progress.status]} · {progress.progress_percent}%
            </button>
            {/* **图标按钮一律不留文字节点**：`textContent` 因此为空，用例可以直接断言
              「文字确实拿掉了」；名字由 `aria-label` 提供，鼠标用户由 `title` 兜底。
              本仓所有测试都按可访问名称查控件，所以只断言名称是抓不到图标化退化的
              ——这两条断言必须成对存在。

              心得入口（TASK-045）现在是这条规则的唯一例外：它带一个**数量角标**。
              角标显示的是值、不是动作（与学习状态徽章同类），且 `aria-hidden`——
              可访问名称仍由 `aria-label` 提供，`textContent` 只在数量为 0（角标隐藏）
              时为空，因此那条图标化守卫对**其余**图标按钮仍然成对成立。 */}
            <button
              type="button"
              ref={notesButtonRef}
              className="journal-button icon-button reader-notes-toggle"
              aria-expanded={notesOpen}
              aria-label="心得"
              title="心得"
              onClick={onNotesClick}
            >
              <Icon name="note" />
              {notesCount !== null && notesCount > 0 && (
                <span className="notes-badge" aria-hidden="true">
                  {notesCount}
                </span>
              )}
            </button>
            <OriginalEntry
              resource={resource}
              link={link}
              open={panel === 'original'}
              onOpen={() => openPanel('original')}
            />
            <button
              type="button"
              ref={menuTrigger}
              className="journal-button icon-button reader-more"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="更多操作"
              title="更多操作"
              onClick={openMenu}
            >
              <Icon name="more" />
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="reader-menu" ref={menuRegion} role="menu" aria-label="更多操作">
            <button
              type="button"
              role="menuitem"
              className="reader-menu-item"
              onClick={() => openPanel('edit')}
            >
              编辑资料
            </button>
            <button
              type="button"
              role="menuitem"
              className="reader-menu-item"
              onClick={() => openPanel('tags')}
            >
              编辑标签
            </button>
            <button
              type="button"
              role="menuitem"
              className="reader-menu-item"
              onClick={() => openPanel('info')}
            >
              资料信息
            </button>
            {/* 正文的三个动作（TASK-046，用户 2026-09-08 选定）。它们此前在正文底下，沉浸式
              阅读页里那是文章末尾——读到最后才看得见，而且与正文之间没有分界。收进这里
              **功能一个不少**：文案随状态变（源码/渲染、替换/粘贴），删除进下面的销毁区。 */}
            {/* 没有正文时不出现：切换一个不存在之物的两种视图没有意义。 */}
            {snapshotExists && (
              <button
                type="button"
                role="menuitem"
                className="reader-menu-item"
                onClick={() => runFromMenu(onToggleSource)}
              >
                {showSource ? '看渲染后的正文' : '看 Markdown 源码'}
              </button>
            )}
            {/* **读取失败时不出现**（TASK-051）：此前失败态这一项照样在，点了什么都不发生
              ——令牌只在读到之后才消费。读取中的一瞬**照旧给**：那时点下去会等读到再开表单，
              是刻意保留的行为（见 ContentSnapshot）。 */}
            {!snapshotUnreadable && (
              <button
                type="button"
                role="menuitem"
                className="reader-menu-item"
                /* 写作框带 `autoFocus`，由它接住焦点，这里不再归还给 `⋯`。 */
                onClick={() => runFromMenu(onEditSnapshot, false)}
              >
                {snapshotExists ? '替换正文' : '粘贴正文'}
              </button>
            )}
            {/* **销毁性动作单独一区、置于底部**（用户 2026-09-07 选定）。分隔线不是装饰：
              它是「删除不与普通动作相邻」这条要求的落点，有用例断言它在。

              它**也是一个真正的 `menuitem`**，并且只负责打开下面那个面板 —— 删除流程
              本身渲染在菜单之外。两位 Reviewer 都指出了原来的写法有问题：`role="menu"`
              里塞一个非 menuitem 的区块，辅助技术按菜单模型根本取不到这个销毁性动作；
              而且确认对话框嵌在浮层里，点一下菜单外面就会把已经取到的一次性令牌连同
              进行中的删除请求一起卸载掉（删除若已在途，后端删了、界面却停在原地不跳转）。 */}
            <hr className="reader-menu-separator" role="separator" />
            {/* **没有正文时不渲染这一项**：一个删除不存在之物的入口只会制造误点。
              省略号与「删除资料…」同义：点它先出确认，不是直接删。确认块由
              `ContentSnapshot` 渲染在正文位置——**不放在这个浮层里**，否则点一下菜单
              外面就会把确认连同进行中的请求一起卸载掉（TASK-043 已经付过这份学费）。 */}
            {snapshotExists && (
              <button
                type="button"
                role="menuitem"
                className="reader-menu-item danger"
                onClick={() => runFromMenu(onDeleteSnapshot, false)}
              >
                删除正文…
              </button>
            )}
            {/* 省略号：点它开确认弹窗（TASK-056 起是模态弹窗，不再是页面内面板），不直接删。
              **先把焦点还给 `⋯` 再开弹窗**：弹窗记下打开时的活动元素、关闭时还回去；
              菜单项随菜单一起卸载，不先归还的话它记到的会是 `body`。 */}
            <button
              type="button"
              role="menuitem"
              className="reader-menu-item danger"
              onClick={() => runFromMenu(onDeleteResource)}
            >
              删除资料…
            </button>
          </div>
        )}
      </div>

      {panel && (
        <ToolbarPanel
          label={panel === 'original' ? originalLabel(resource) : panelLabels[panel]}
          onClose={() => setPanel(null)}
        >
          {panel === 'learning' && (
            // 用户选「常驻工具条，点开即改」。`initialView="manage"` 让状态表单直接展开，
            // 否则要再点两层（查看旧学习历史 → 更多：状态与归档管理）才够得着。
            <LearningPanel
              key={'learning-' + resource.id}
              resource={resource}
              initialView="manage"
              changed={refreshed}
            />
          )}
          {panel === 'edit' && (
            <ResourceEditor
              key={'editor-' + resource.id}
              resource={resource}
              refreshed={refreshed}
            />
          )}
          {panel === 'tags' && <ResourceTagEditor resource={resource} refreshed={refreshed} />}
          {panel === 'info' && <ResourceInfo resource={resource} />}
          {panel === 'original' && <OriginalPanel resource={resource} />}
        </ToolbarPanel>
      )}
    </>
  )
}

/**
 * 文章头：资料标题（页面 `h1`）与来源徽章。TASK-052 起它在**正文列顶部**而不在 sticky
 * 顶栏里：顶栏只装动作，标题跟文章走——手机上顶栏因此从两行 123px 回到一行。
 *
 * `h1` 仍由 `headingSlot` 交回外壳做路由焦点落点（TASK-044）：**位置变了，契约没变**——
 * 各态恰好一个 h1、导航到达时焦点落在它上。
 */
export function ReaderHeader({
  resource,
  headingSlot,
}: {
  resource: Resource
  headingSlot: (element: HTMLHeadingElement | null) => void
}) {
  return (
    <header className="reader-header">
      <span className={`source-chip ${resource.source_type.toLowerCase()}`}>
        {sourceLabels[resource.source_type]}
      </span>
      <h1 className="reader-title" ref={headingSlot} tabIndex={-1}>
        {resourceTitle(resource)}
      </h1>
    </header>
  )
}

/**
 * 上下文层：标签与「收下它是因为」。**不是动作，是这篇文章的元信息**，所以不进按钮、
 * 也不进 sticky 顶栏——它随正文一起滚动，位置与正文列对齐（由 `ResourceDetail` 放进
 * `.reader-main`）。用户原话是「元数据、标签…收到顶部工具条的按钮里」，这两项当面作过
 * 区分：塞进按钮意味着每次想起「我当初为什么收下这篇」都要点一下。
 */
export function ReaderContext({ resource }: { resource: Resource }) {
  return (
    <div className="reader-context">
      <nav className="reader-tags" aria-label="资料标签">
        {resource.tags.length ? (
          resource.tags.map((tag) => (
            <Link className="source-chip" key={tag.id} to={`/resources?tag_id=${tag.id}`}>
              {tag.name}
            </Link>
          ))
        ) : (
          <span className="resource-hint">暂无标签</span>
        )}
      </nav>
      <p className="reader-save-reason">
        <span className="note-tab">收下它是因为</span>
        {resource.save_reason || '还没有填写保存原因。'}
      </p>
    </div>
  )
}

const panelLabels: Record<PanelKey, string> = {
  learning: '学习状态与进度',
  original: '原件',
  edit: '编辑资料',
  tags: '编辑标签',
  info: '资料信息',
}

/** PASTE 的面板不能叫「原件」——那份资料没有原件，只有粘贴进来的原文。 */
function originalLabel(resource: Resource): string {
  return resource.source_type === 'FILE' ? '原件' : '粘贴原文'
}

function ToolbarPanel({
  label,
  onClose,
  children,
}: {
  label: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <section className="reader-panel" aria-label={label}>
      <div className="reader-panel-heading">
        <span className="note-tab">{label}</span>
        <button type="button" className="journal-button" onClick={onClose}>
          收起
        </button>
      </div>
      {children}
    </section>
  )
}

/**
 * 原文/原件入口。WEB 资料直接开原网页（不占面板）；PASTE 与 FILE 打开面板。
 * WEB 的链接沿用详情页原有的三件套：`target=_blank` + `rel=noopener noreferrer` +
 * `referrerPolicy=no-referrer`，一个都不能少。
 */
function OriginalEntry({
  resource,
  link,
  open,
  onOpen,
}: {
  resource: Resource
  link: string | null
  open: boolean
  onOpen: () => void
}) {
  if (resource.source_type === 'WEB') {
    if (!link)
      return (
        <span className="resource-hint" role="alert">
          原网址无法安全打开
        </span>
      )
    return (
      <a
        className="journal-button icon-button"
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        aria-label="原网页"
        title="原网页（在新标签页打开）"
      >
        <Icon name="external" />
      </a>
    )
  }
  const label = resource.source_type === 'FILE' ? '原件' : '粘贴原文'
  return (
    <button
      type="button"
      className="journal-button icon-button"
      aria-expanded={open}
      aria-label={label}
      title={label}
      onClick={onOpen}
    >
      <Icon name={resource.source_type === 'FILE' ? 'file' : 'paste'} />
    </button>
  )
}

function OriginalPanel({ resource }: { resource: Resource }) {
  if (resource.source_type === 'FILE')
    return resource.original_file ? (
      <FileOriginal key={resource.original_file.id} file={resource.original_file} />
    ) : (
      <p className="resource-hint">这份资料还没有原件。</p>
    )
  return (
    <>
      <p className="resource-hint">按纯文本原样展示，Markdown 和代码不会被执行。</p>
      <pre tabIndex={0} aria-label="粘贴原文内容">
        {resource.pasted_content}
      </pre>
    </>
  )
}

function ResourceInfo({ resource }: { resource: Resource }) {
  return (
    <>
      <dl className="resource-metadata">
        <div>
          <dt>主要主题</dt>
          <dd>
            {resource.topic_id ? (resource.topic_name ?? '暂无法读取名称，请重新加载') : '未分配'}
          </dd>
        </div>
        <div>
          <dt>来源名称</dt>
          <dd>{resource.source_name || '未填写'}</dd>
        </div>
        <div>
          <dt>收藏时间</dt>
          <dd>
            <time dateTime={resource.created_at}>{displayTime(resource.created_at)}</time>
          </dd>
        </div>
        <div>
          <dt>最近更新</dt>
          <dd>
            <time dateTime={resource.updated_at}>{displayTime(resource.updated_at)}</time>
          </dd>
        </div>
      </dl>
      {resource.source_type === 'WEB' && (
        <>
          <p className="resource-hint">原始网址</p>
          <p>{resource.source_url}</p>
          <p className="resource-hint">这里只保存网址；网页内容未抓取，也未生成摘要。</p>
        </>
      )}
      <p className="resource-hint feature-boundary">
        复习安排与正文解析尚未开放；文件原件不能替换。
      </p>
    </>
  )
}
