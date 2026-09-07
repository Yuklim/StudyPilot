import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'

import { HeadingSlot } from './shell/heading'
import { Icon } from './shell/Icon'
import { moreNavigation, pageAt, primaryNavigation } from './shell/pages'
import { Screen } from './shell/Screen'

/** 左栏折叠是用户自选，记在本机；读不出来就当展开。 */
const NAV_KEY = 'studypilot.nav.collapsed'
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(NAV_KEY) === '1'
  } catch {
    // 隐私模式、禁用站点数据等都会让这里抛异常。**展开是安全的默认**：认不出图标的人
    // 至少还看得见文字。
    return false
  }
}

function App() {
  const { pathname } = useLocation()
  const page = pageAt(pathname)
  const heading = useRef<HTMLHeadingElement>(null)
  const previousPath = useRef(pathname)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  // 本次路由切换还欠一次聚焦；以及这次切换是否已经聚焦过。
  const wantFocus = useRef(false)
  const focusedForRoute = useRef(false)
  // 页面自己渲染 h1 时（`ownHeading`），由它把元素登记上来；**焦点仍由这里统一管**。
  const registerHeading = useCallback((element: HTMLHeadingElement | null) => {
    heading.current = element
    if (!element) return
    if (wantFocus.current) {
      element.focus()
      wantFocus.current = false
      focusedForRoute.current = true
      return
    }
    // **换标题时要把焦点接回来。** 阅读器页先渲染「正在打开资料」这个 h1、拿到焦点，
    // 数据到了再换成真正的资料标题；旧节点一移除，焦点就掉到 `body`，导航过来的键盘
    // 用户在数据到达的一瞬间失去落点——而这在屏幕上完全看不出来。
    // 只在「本次路由已经聚焦过、且此刻焦点无处可去」时接管，不抢用户点到别处的焦点。
    if (focusedForRoute.current && document.activeElement === document.body) element.focus()
  }, [])

  function toggleNav() {
    setCollapsed((value) => {
      const next = !value
      try {
        localStorage.setItem(NAV_KEY, next ? '1' : '0')
      } catch {
        // 存不下就只影响这一次会话，不影响本次折叠。
      }
      return next
    })
  }

  useEffect(() => {
    document.title = `${page.title} · StudyPilot`
    if (previousPath.current !== pathname) {
      previousPath.current = pathname
      wantFocus.current = true
      focusedForRoute.current = false
      if (heading.current) {
        heading.current.focus()
        wantFocus.current = false
        focusedForRoute.current = true
      }
    }
  }, [page.title, pathname])

  return (
    <div className={`app-shell${collapsed ? ' nav-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <aside className="sidebar" aria-label="学习空间导航">
        <Link className="brand" to="/" aria-label="StudyPilot 学习概览">
          <span className="brand-mark" aria-hidden="true">
            S<span>·</span>
          </span>
          <span className="brand-copy">
            <strong>StudyPilot</strong>
            <span>个人学习手帐</span>
          </span>
        </Link>
        <button
          type="button"
          className="nav-toggle"
          aria-label={collapsed ? '展开导航栏' : '收起导航栏'}
          aria-expanded={!collapsed}
          title={collapsed ? '展开导航栏' : '收起导航栏'}
          onClick={toggleNav}
        >
          <Icon name={collapsed ? 'expand' : 'collapse'} />
        </button>
        <Link className="add-link" to="/resources/new" aria-label="添加资料" title="添加资料">
          <Icon name="plus" />
          {!collapsed && <span>添加资料</span>}
        </Link>
        <div className="nav-section">
          <p className="nav-label">我的学习</p>
          <nav className="primary-nav" aria-label="主要导航">
            {primaryNavigation.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path !== '/resources'}
                aria-label={item.title}
                title={item.title}
              >
                <Icon name={item.icon} />
                {/* **折叠时不渲染这个文字节点，而不是用 CSS 藏起来。** 可见文本因此确实
                    为空（用例能断言），可访问名称由 `aria-label` 顶上，两者不冲突。 */}
                {!collapsed && <span>{item.title}</span>}
                <span className="nav-dot" aria-hidden="true" />
              </NavLink>
            ))}
          </nav>
        </div>
        {moreNavigation.length > 0 && (
          <div className="nav-section nav-section-more">
            <p className="nav-label">后续能力</p>
            <nav className="primary-nav" aria-label="更多能力">
              {moreNavigation.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end
                  aria-label={item.title}
                  title={item.title}
                >
                  <Icon name={item.icon} />
                  {!collapsed && <span>{item.title}</span>}
                  <span className="nav-dot" aria-hidden="true" />
                </NavLink>
              ))}
            </nav>
          </div>
        )}
        <div className="sidebar-note" aria-hidden="true">
          <span className="note-pin" />
          <p>
            慢慢积累，
            <br />
            也是一种前进。
          </p>
          <span>one page at a time</span>
        </div>
        <div className="sidebar-footer">
          <span className="space-marker" />
          本机个人空间
        </div>
      </aside>

      <main className="workspace" id="main-content" tabIndex={-1}>
        <div className="workspace-topbar">
          <span>
            我的学习空间
            <span className="breadcrumb-separator" aria-hidden="true">
              /
            </span>
            {page.title}
          </span>
          <span className="workspace-badge">本机学习空间</span>
        </div>
        {!page.ownHeading && (
          <header className="page-heading">
            <span className="eyebrow">STUDYPILOT / YOUR LEARNING JOURNAL</span>
            <h1 ref={registerHeading} tabIndex={-1}>
              {page.title}
            </h1>
            <p>{page.caption}</p>
          </header>
        )}
        {/* **只在概览页。** 这是一句关于产品阶段的说明，属于首页；此前它出现在每一页，
            对每天用的人来说第 100 次看到它没有任何信息量，却在阅读器上占掉 45–87px。 */}
        {page.path === '/' && (
          <div className="preview-notice" role="note" aria-label="当前开发阶段">
            <Icon name="info" />
            <p>
              <strong>网页、文件与粘贴资料已开放</strong>
              <span>可以收藏资料、随手写心得并回看旧记录。复习、统计及正文解析留待后续。</span>
            </p>
          </div>
        )}
        <HeadingSlot.Provider value={registerHeading}>
          <Screen page={page} />
        </HeadingSlot.Provider>
        <footer className="workspace-footer">
          <span>为每一次认真学习，留一页空白。</span>
          <span>资料与学习记录可用 · 慢慢积累</span>
        </footer>
      </main>
    </div>
  )
}

export default App
