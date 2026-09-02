import { Route, Routes } from 'react-router-dom'

function LeafSketch() {
  return (
    <svg aria-hidden="true" className="leaf-sketch" viewBox="0 0 120 150">
      <path d="M61 143C55 98 60 55 89 13" />
      <path d="M68 92C37 80 24 57 25 35C48 39 67 55 68 92Z" />
      <path d="M73 70C96 60 108 44 108 25C88 28 75 43 73 70Z" />
      <path d="M61 116C39 111 25 97 19 79C39 78 56 91 61 116Z" />
    </svg>
  )
}

function BookSketch() {
  return (
    <svg aria-hidden="true" className="book-sketch" viewBox="0 0 180 90">
      <path d="M10 22C42 15 67 19 88 34V77C67 64 42 61 10 68V22Z" />
      <path d="M170 22C138 15 113 19 92 34V77C113 64 138 61 170 68V22Z" />
      <path d="M90 33V80" />
      <path d="M27 34C44 31 59 34 72 42" />
      <path d="M108 42C121 34 136 31 153 34" />
    </svg>
  )
}

function ScaffoldPage() {
  return (
    <main className="page-shell">
      <div aria-hidden="true" className="paper-grain" />
      <header className="topbar">
        <a className="brand" href="/" aria-label="StudyPilot 首页">
          <span className="brand-mark">S</span>
          <span>
            <strong>StudyPilot</strong>
            <small>personal learning companion</small>
          </span>
        </a>
        <span className="phase-tag">工程脚手架</span>
      </header>

      <section className="welcome-card" aria-labelledby="page-title">
        <span aria-hidden="true" className="washi-tape" />
        <span className="eyebrow">A quiet place to begin</span>
        <h1 id="page-title">工程框架已运行，业务功能尚未实现</h1>
        <p className="intro">
          StudyPilot
          的前后端基础已经准备就绪。这个页面只用于确认工程可以启动、构建和测试，不代表资料管理或学习功能已经完成。
        </p>

        <div className="status-note">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>当前状态：基础环境就绪</strong>
            <p>下一步将在正式任务和契约批准后，逐项实现真实功能。</p>
          </div>
        </div>

        <div className="foundation-grid" aria-label="当前工程基础">
          <article>
            <span className="note-number">01</span>
            <h2>前端应用壳</h2>
            <p>React 路由、错误保护和自动检查已经建立。</p>
          </article>
          <article>
            <span className="note-number">02</span>
            <h2>后端健康检查</h2>
            <p>FastAPI 进程可通过最小接口确认运行状态。</p>
          </article>
          <article>
            <span className="note-number">03</span>
            <h2>安全默认边界</h2>
            <p>业务接口在完整安全契约建立前保持默认拒绝。</p>
          </article>
        </div>

        <p className="scope-note">此处没有示例资料、进度或统计数据，因为这些业务能力尚未开发。</p>
        <LeafSketch />
        <BookSketch />
      </section>

      <footer>
        <span>StudyPilot</span>
        <span aria-hidden="true">·</span>
        <span>先管理，再智能</span>
      </footer>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<ScaffoldPage />} />
    </Routes>
  )
}
