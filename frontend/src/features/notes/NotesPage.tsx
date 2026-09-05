import { Link } from 'react-router-dom'

import { NotesPanel } from './NotesPanel'

/** 顶层「我的心得」：只记录与回看不绑定资料的独立心得。 */
export function NotesPage() {
  return (
    <section className="notes-page" aria-label="我的心得">
      <p className="resource-hint">
        不必先收藏资料，也能随手记下此刻的理解或疑问。想记在某份资料下的心得，请到对应资料详情。
      </p>
      <Link className="text-link" to="/resources">
        去资料库 <span aria-hidden="true">→</span>
      </Link>
      <NotesPanel resourceId={null} available />
    </section>
  )
}
