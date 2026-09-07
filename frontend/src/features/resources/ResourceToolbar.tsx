import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { displayTime, safeWebUrl, sourceLabels, statusLabels, type Resource } from './api'
import { resourceTitle } from './resourceTitle'
import { ResourceDeletion } from './ResourceDeletion'
import { ResourceEditor } from './ResourceEditor'
import { FileOriginal } from './FileOriginal'
import { LearningPanel } from '../learning/LearningPanel'
import { ResourceTagEditor } from '../taxonomy/ResourceTagEditor'

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
 * 低频**动作**才进 `⋯`：编辑资料、编辑标签、资料信息，以及**单独一区、置于底部、
 * 带危险样式**的删除资料。
 */

type PanelKey = 'learning' | 'original' | 'edit' | 'tags' | 'info' | 'delete'

export function ResourceToolbar({
  resource,
  refreshed,
  deleted,
  notesTargetId,
}: {
  resource: Resource
  /** 元数据被改动后重新读取这份资料。 */
  refreshed: () => void
  /** 资料已被删除，由调用方决定去哪。 */
  deleted: () => void
  /** 「心得」按钮要跳到的区域 id。本步心得仍在正文下方（侧栏属 TASK-044）。 */
  notesTargetId: string
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

  // Esc 关菜单并把焦点还给触发按钮；点到菜单外面也关。**焦点必须还回去**——
  // 否则用键盘的人在菜单消失后会掉到文档开头，得从头 Tab 一遍。
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
    <div className="reader-toolbar">
      <div className="reader-toolbar-actions">
        <Link className="text-link reader-back" to="/resources">
          返回资料库
        </Link>
        <span className={`source-chip ${resource.source_type.toLowerCase()}`}>
          {sourceLabels[resource.source_type]}
        </span>
        <h2 className="reader-title">{resourceTitle(resource)}</h2>
        <div className="reader-toolbar-buttons">
          <button
            type="button"
            className="journal-button reader-status"
            aria-expanded={panel === 'learning'}
            onClick={() => openPanel('learning')}
          >
            {statusLabels[progress.status]} · {progress.progress_percent}%
          </button>
          <a className="journal-button" href={`#${notesTargetId}`}>
            心得
          </a>
          <OriginalEntry
            resource={resource}
            link={link}
            open={panel === 'original'}
            onOpen={() => openPanel('original')}
          />
          <button
            type="button"
            ref={menuTrigger}
            className="journal-button reader-more"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="更多操作"
            onClick={openMenu}
          >
            ⋯
          </button>
        </div>
      </div>

      {/* 上下文层：常驻，不需要任何点击。 */}
      <div className="reader-toolbar-context">
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
          {/* **销毁性动作单独一区、置于底部**（用户 2026-09-07 选定）。分隔线不是装饰：
              它是「删除不与普通动作相邻」这条要求的落点，有用例断言它在。

              它**也是一个真正的 `menuitem`**，并且只负责打开下面那个面板 —— 删除流程
              本身渲染在菜单之外。两位 Reviewer 都指出了原来的写法有问题：`role="menu"`
              里塞一个非 menuitem 的区块，辅助技术按菜单模型根本取不到这个销毁性动作；
              而且确认对话框嵌在浮层里，点一下菜单外面就会把已经取到的一次性令牌连同
              进行中的删除请求一起卸载掉（删除若已在途，后端删了、界面却停在原地不跳转）。 */}
          <hr className="reader-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="reader-menu-item danger"
            onClick={() => openPanel('delete')}
          >
            删除资料…
          </button>
        </div>
      )}

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
          {/* `ResourceDeletion` 一个字未改 —— 预览影响 → 一次性令牌 → 确认，三步照旧；
              这里只决定它挂在哪。挂在面板里而不是菜单里，点别处不会把令牌丢掉。 */}
          {panel === 'delete' && <ResourceDeletion resource={resource} deleted={deleted} />}
        </ToolbarPanel>
      )}
    </div>
  )
}

const panelLabels: Record<PanelKey, string> = {
  learning: '学习状态与进度',
  original: '原件',
  edit: '编辑资料',
  tags: '编辑标签',
  info: '资料信息',
  delete: '放下这一页',
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
        className="journal-button"
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
      >
        {/* 箭头走 ::after，与返回链接一致：它是装饰，不该混进可访问名称。 */}
        <span className="reader-external">原网页</span>
      </a>
    )
  }
  return (
    <button type="button" className="journal-button" aria-expanded={open} onClick={onOpen}>
      {resource.source_type === 'FILE' ? '原件' : '粘贴原文'}
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
