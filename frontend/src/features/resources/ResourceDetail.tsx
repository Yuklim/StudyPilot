import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { getResource } from './api'
import { ContentSnapshot } from './ContentSnapshot'
import { ResourceError } from './ResourceState'
import { ResourceToolbar } from './ResourceToolbar'
import { NotesPanel } from '../notes/NotesPanel'
import { useResourceQuery } from './useResourceQuery'

// TASK-043 起这一页是**阅读器**：正文占主体，动作与上下文都收在顶部工具条里。
//
// 此前它是一条长滚动：心得与编辑框在最上面，正文夹在元数据与原件之间，学习状态在最
// 底下。用户的原话是「从资料库点开资料之后应该直接显示的是阅读器窗口」。
//
// 本步**不动心得的形态**（仍在正文下方），挤压式侧栏属 TASK-044；这是用户选的两步走。
const NOTES_ANCHOR = 'resource-notes'

export function ResourceDetail({ resourceId }: { resourceId: string }) {
  const navigate = useNavigate()
  const load = useCallback(() => getResource(resourceId), [resourceId])
  const { result, retry } = useResourceQuery(resourceId, load)
  const item = result?.data
  // Keep the notes panel mounted during same-resource metadata refreshes (for example, tag edits).
  const [openedId, setOpenedId] = useState<string | null>(null)
  if (item && openedId !== resourceId) setOpenedId(resourceId)
  // **工具条也要跨刷新活着。** `retry()` 会先把 result 清空再重新读取，那一瞬间 `item`
  // 是 undefined；若直接按 `item` 渲染，工具条整个卸载，用户正开着的面板（编辑标签、
  // 编辑资料…）当场关掉——而改标签本身就会触发这次刷新，于是「改一个标签，面板就没了」。
  // 旧版所有区块常驻，不存在这个问题；这是改版引入的退化，由标签用例先抓到。
  // 因此留住上一次读到的这份资料，只在换资料时丢弃。
  const [shown, setShown] = useState<typeof item>(undefined)
  if (item && item !== shown) setShown(item)
  // **只留 id 守卫，不再额外 setShown(undefined)。** 那一行与上一行在同一次渲染里可以
  // 互相抵消：只要出现 `item.id !== resourceId`（后端返回的 id 与请求的不一致），两条会
  // 无限交替触发 "Too many re-renders"。守卫放在读取处就够，也不会显示上一份资料。
  const toolbarItem = shown?.id === resourceId ? shown : undefined
  return (
    <section className="resource-sheet reader" aria-label="资料内容">
      {/* 工具条只在资料读到之后才渲染，而**读取中与读取失败时同样需要出口**。
          旧版这条返回链接是无条件的；改版初稿把它并进工具条，结果「正在打开这份
          资料…」那一屏一个链接都没有，用户被困在页面上。既有用例正是按可访问名称
          「返回资料库」取它的。 */}
      {!toolbarItem && (
        <Link className="text-link" to="/resources">
          返回资料库
        </Link>
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
          notesTargetId={NOTES_ANCHOR}
        />
      )}
      {toolbarItem && (
        // 正文**紧接着工具条**，先于心得与元数据出现——这是本任务的全部意义。
        // `ContentSnapshot` 与 `snapshotMarkdown` 本任务一个字符都不进：快照的安全形态
        // （`html: false`、无消毒器、图片三条去向）因此是文件清单能证明的，不靠自述。
        <ContentSnapshot resourceId={toolbarItem.id} sourceType={toolbarItem.source_type} />
      )}
      {openedId === resourceId && (
        <section
          className="detail-block"
          id={NOTES_ANCHOR}
          // 跳转目标要接得住焦点，否则点「心得」只滚动、焦点还留在工具条上。
          // 与本仓 `#main-content` 的做法一致。
          tabIndex={-1}
          aria-label="记录与理解"
        >
          <div className="detail-block-heading">
            <span className="note-tab">记录与理解</span>
            <span className="resource-hint">写下此刻的想法，时间自动记录。</span>
          </div>
          <NotesPanel key={resourceId} resourceId={resourceId} available={!!item} />
        </section>
      )}
    </section>
  )
}
