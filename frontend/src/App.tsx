import { useEffect, useRef } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'

import { Icon } from './shell/Icon'
import { navigation, pageAt } from './shell/pages'
import { Screen } from './shell/Screen'

function App() {
  const { pathname } = useLocation()
  const page = pageAt(pathname)
  const heading = useRef<HTMLHeadingElement>(null)
  const previousPath = useRef(pathname)

  useEffect(() => {
    document.title = `${page.title} · StudyPilot`
    if (previousPath.current !== pathname) {
      heading.current?.focus()
      previousPath.current = pathname
    }
  }, [page.title, pathname])

  return (
    <div className="app-shell">
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
        <div className="nav-section">
          <p className="nav-label">我的学习</p>
          <nav className="primary-nav" aria-label="主要导航">
            {navigation.map((item) => (
              <NavLink key={item.path} to={item.path} end={item.path !== '/resources'}>
                <Icon name={item.icon} />
                <span>{item.title}</span>
                <span className="nav-dot" aria-hidden="true" />
              </NavLink>
            ))}
          </nav>
        </div>
        <Link className="add-link" to="/resources/new" aria-label="添加资料">
          <Icon name="plus" />
          <span>添加资料</span>
        </Link>
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
        <header className="page-heading">
          <span className="eyebrow">STUDYPILOT / YOUR LEARNING JOURNAL</span>
          <h1 ref={heading} tabIndex={-1}>
            {page.title}
          </h1>
          <p>{page.caption}</p>
        </header>
        <div className="preview-notice" role="note" aria-label="当前开发阶段">
          <Icon name="info" />
          <p>
            <strong>网页与粘贴资料已开放</strong>
            <span>主题与标签可在分类整理中管理；学习记录、文件上传仍在开发中。</span>
          </p>
        </div>
        <Screen page={page} />
        <footer className="workspace-footer">
          <span>为每一次认真学习，留一页空白。</span>
          <span>资料可用 · 学习功能待接入</span>
        </footer>
      </main>
    </div>
  )
}

export default App
