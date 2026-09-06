import { Link, useMatch } from 'react-router-dom'

import { CapturePage } from '../features/capture/CapturePage'
import { ResourceDetail } from '../features/resources/ResourceDetail'
import { ResourceForm } from '../features/resources/ResourceForm'
import { ResourceLibrary } from '../features/resources/ResourceLibrary'
import { ClassificationManager } from '../features/taxonomy/ClassificationManager'
import { RecordHistory } from '../features/learning/RecordHistory'
import { NotesPage } from '../features/notes/NotesPage'

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
          <div className="overview-actions" aria-label="快速开始">
            <Link className="journal-button primary" to="/resources">
              打开资料库 <Icon name="arrow" />
            </Link>
            <Link className="journal-button" to="/resources/new">
              收藏一份内容 <Icon name="plus" />
            </Link>
          </div>
        </div>
        <div className="journal-decoration" aria-hidden="true">
          <span className="washi-tape" />
          <span className="journal-date">a page for your thoughts</span>
          <BookSketch />
          <span className="journal-signature">一点一滴，都算数。</span>
        </div>
      </section>

      <section className="overview-capability" aria-label="当前可用能力">
        <div className="section-heading">
          <h2>现在可以做什么</h2>
          <span>诚实标注，不展示假数据</span>
        </div>
        <ul className="capability-list">
          <li>
            <Icon name="library" />
            <span>
              <strong>收藏资料</strong>
              <small>网页、文件与粘贴内容都已开放。</small>
            </span>
          </li>
          <li>
            <Icon name="record" />
            <span>
              <strong>随手写心得</strong>
              <small>在资料详情里记下理解与疑问，时间自动记录。</small>
            </span>
          </li>
          <li>
            <Icon name="topic" />
            <span>
              <strong>整理分类</strong>
              <small>为主题、标签建立自己的线索。</small>
            </span>
          </li>
        </ul>
        <p className="overview-future" role="note">
          复习安排与详细统计尚未开放；已有学习历史仍可在侧栏「后续能力」中查看。
        </p>
      </section>
    </>
  )
}

export function Screen({ page }: { page: ShellPage }) {
  const match = useMatch('/resources/:resourceId')
  if (page.path === '/') return <Overview />
  if (page.path === '/classifications') return <ClassificationManager />
  if (page.path === '/notes') return <NotesPage />
  if (page.path === '/study-records') return <RecordHistory />
  if (page.path === '/capture') return <CapturePage />
  if (page.path === '/resources/new') return <ResourceForm />
  if (page.path === '/resources') return <ResourceLibrary />
  if (page.path === '/resources/:resourceId' && match?.params.resourceId) {
    return <ResourceDetail key={match.params.resourceId} resourceId={match.params.resourceId} />
  }
  return <EmptyPage page={page} />
}
