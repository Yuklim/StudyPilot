import { Link, useMatch } from 'react-router-dom'

import { ResourceDetail } from '../features/resources/ResourceDetail'
import { ResourceForm } from '../features/resources/ResourceForm'
import { ResourceLibrary } from '../features/resources/ResourceLibrary'

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
            打开资料库 <Icon name="arrow" />
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

export function Screen({ page }: { page: ShellPage }) {
  const match = useMatch('/resources/:resourceId')
  if (page.path === '/') return <Overview />
  if (page.path === '/resources/new') return <ResourceForm />
  if (page.path === '/resources') return <ResourceLibrary />
  if (page.path === '/resources/:resourceId' && match?.params.resourceId) {
    return <ResourceDetail key={match.params.resourceId} resourceId={match.params.resourceId} />
  }
  return <EmptyPage page={page} />
}
