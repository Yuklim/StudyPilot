import { Link } from 'react-router-dom'

import { BookSketch, Icon } from './Icon'
import type { ShellPage } from './pages'

function EmptyPage({ page }: { page: ShellPage }) {
  return (
    <section className="empty-sheet" aria-label={page.title + '页面预留'}>
      <div className="book-mat">
        <BookSketch />
      </div>
      <span className="small-label">
        {page.path === '*' ? 'PAGE NOT FOUND' : '这一页，留给接下来的积累'}
      </span>
      <h2>{page.emptyTitle}</h2>
      <p>{page.description}</p>
      <Link className="text-link" to={page.path.startsWith('/resources/') ? '/resources' : '/'}>
        {page.path.startsWith('/resources') && page.path !== '/resources'
          ? '返回资料库'
          : '返回学习概览'}
        <Icon name="arrow" />
      </Link>
    </section>
  )
}

function Overview() {
  return (
    <>
      <section className="welcome-note" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <span className="eyebrow">A LITTLE EVERY DAY</span>
          <h2 id="welcome-title">让学习，成为日常的一小部分。</h2>
          <p>
            收好值得读的内容，记下自己的理解。
            <br />
            不必赶路，也可以慢慢向前。
          </p>
          <Link className="text-link" to="/resources">
            看看资料库页面 <Icon name="arrow" />
          </Link>
        </div>
        <div className="journal-decoration" aria-hidden="true">
          <span className="washi-tape" />
          <span className="journal-date">a page for your thoughts</span>
          <BookSketch />
          <span className="journal-signature">一点一滴，都算数。</span>
        </div>
      </section>

      <section className="metrics" aria-label="统计尚未接入">
        {[
          ['library', '收藏的资料', '每一份好奇，都有去处'],
          ['record', '本周学习时长', '让投入留下痕迹'],
          ['review', '今日待复习', '在合适的时候，再回看'],
        ].map(([icon, title, caption]) => (
          <article className="metric" key={title}>
            <div className="metric-heading">
              <Icon name={icon as 'library' | 'record' | 'review'} />
              <h2>{title}</h2>
            </div>
            <div className="metric-value">
              <span aria-hidden="true">—</span>
              <span>未接入</span>
            </div>
            <p>{caption}</p>
          </article>
        ))}
      </section>

      <div className="overview-bottom">
        <section className="learning-sheet" aria-labelledby="continue-title">
          <div className="section-heading">
            <h2 id="continue-title">继续学习</h2>
            <span>留给真正的学习记录</span>
          </div>
          <div className="quiet-empty">
            <span className="empty-icon">
              <Icon name="record" />
            </span>
            <h3>下一次，从上次停下的地方开始</h3>
            <p>学习数据尚未接入，暂不展示资料或进度。</p>
          </div>
        </section>
        <aside className="daily-note" aria-label="学习小记">
          <span className="note-tab">写在页边</span>
          <h2>给知识一点时间。</h2>
          <p>
            读到的，不必急着全部记住。
            <br />
            真正理解的，会慢慢留下来。
          </p>
          <span className="note-signature">Keep a little curiosity.</span>
        </aside>
      </div>
    </>
  )
}

function AddResource() {
  return (
    <section className="add-sheet" aria-labelledby="sources-title">
      <div className="section-heading">
        <h2 id="sources-title">选择你的资料来源</h2>
        <span>来源方式预览</span>
      </div>
      <div className="source-cards">
        {[
          ['01', '网页链接', '保留网页地址、标题与收藏的原因。'],
          ['02', '本地文件', '保留 PDF、Word、Markdown 或 TXT 原件。'],
          ['03', '粘贴内容', '直接保存一段 Markdown 或纯文本。'],
        ].map(([number, title, description]) => (
          <article key={number}>
            <span className="source-number">{number}</span>
            <h3>{title}</h3>
            <p>{description}</p>
            <span className="source-status">尚未开放</span>
          </article>
        ))}
      </div>
      <p className="add-disclaimer">
        这里仅展示已规划的资料来源。目前不能保存或上传，也不会收集任何内容。
      </p>
      <Link className="text-link" to="/resources">
        返回资料库 <Icon name="arrow" />
      </Link>
    </section>
  )
}

export function Screen({ page }: { page: ShellPage }) {
  if (page.path === '/') return <Overview />
  if (page.path === '/resources/new') return <AddResource />
  return <EmptyPage page={page} />
}
