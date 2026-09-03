import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'

import { displayTime, getResource, safeWebUrl, sourceLabels } from './api'
import { ResourceError } from './ResourceState'
import { LearningPanel } from '../learning/LearningPanel'
import { NotesPanel } from '../notes/NotesPanel'
import { useResourceQuery } from './useResourceQuery'
import { ResourceTagEditor } from '../taxonomy/ResourceTagEditor'
import { FileOriginal } from './FileOriginal'
import { ResourceEditor } from './ResourceEditor'

export function ResourceDetail({ resourceId }: { resourceId: string }) {
  const load = useCallback(() => getResource(resourceId), [resourceId])
  const { result, retry } = useResourceQuery(resourceId, load)
  const item = result?.data
  // Keep the editor mounted during same-resource metadata refreshes (for example, tag edits).
  const [openedId, setOpenedId] = useState<string | null>(null)
  if (item && openedId !== resourceId) setOpenedId(resourceId)
  const link = item?.source_url ? safeWebUrl(item.source_url) : null
  return (
    <section className="resource-sheet resource-detail" aria-label="资料内容">
      <Link className="text-link" to="/resources">
        返回资料库
      </Link>
      {!result && (
        <p role="status" className="resource-loading">
          正在打开这份资料…
        </p>
      )}
      {result?.error !== undefined && <ResourceError error={result.error} retry={retry} />}
      {item && (
        <div className="resource-sheet-heading">
          <span className={`source-chip ${item.source_type.toLowerCase()}`}>
            {sourceLabels[item.source_type]}
          </span>
          <h2>{item.title}</h2>
        </div>
      )}
      {openedId === resourceId && (
        <>
          <NotesPanel key={resourceId} resourceId={resourceId} available={!!item} />
          <ResourceEditor key={'editor-' + resourceId} resource={item} refreshed={retry} />
        </>
      )}
      {item && (
        <>
          <dl className="resource-metadata">
            <div>
              <dt>主要主题</dt>
              <dd>
                {item.topic_id ? (item.topic_name ?? '暂无法读取名称，请重新加载') : '未分配'}
              </dd>
            </div>
            <div>
              <dt>来源名称</dt>
              <dd>{item.source_name || '未填写'}</dd>
            </div>
            <div>
              <dt>收藏时间</dt>
              <dd>
                <time dateTime={item.created_at}>{displayTime(item.created_at)}</time>
              </dd>
            </div>
            <div>
              <dt>最近更新</dt>
              <dd>
                <time dateTime={item.updated_at}>{displayTime(item.updated_at)}</time>
              </dd>
            </div>
            <div>
              <dt>标签</dt>
              <dd>
                {item.tags.length
                  ? item.tags.map((tag) => (
                      <span className="source-chip" key={tag.id}>
                        {tag.name}
                      </span>
                    ))
                  : '暂无标签'}
              </dd>
            </div>
          </dl>
          <ResourceTagEditor resource={item} refreshed={retry} />
          <section className="save-reason-note" aria-label="保存原因">
            <span className="note-tab">为什么收下这一页</span>
            <p>{item.save_reason || '还没有填写保存原因。'}</p>
          </section>
          {item.source_type === 'WEB' && (
            <section className="resource-original" aria-labelledby="original-title">
              <h3 id="original-title">原始网页</h3>
              <p>{item.source_url}</p>
              {link ? (
                <a
                  className="text-link"
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                >
                  在新标签页打开原网页 ↗
                </a>
              ) : (
                <p role="alert">该网址无法安全打开，仅显示文本。</p>
              )}
              <p className="resource-hint">这里只保存网址；网页内容未抓取，也未生成摘要。</p>
            </section>
          )}
          {item.source_type === 'PASTE' && (
            <section className="resource-original" aria-labelledby="original-title">
              <h3 id="original-title">粘贴原文</h3>
              <p className="resource-hint">按纯文本原样展示，Markdown 和代码不会被执行。</p>
              <pre tabIndex={0} aria-label="粘贴原文内容">
                {item.pasted_content}
              </pre>
            </section>
          )}
          {item.source_type === 'FILE' && item.original_file && (
            <FileOriginal key={item.original_file.id} file={item.original_file} />
          )}
          <p className="resource-hint feature-boundary">
            资料删除、复习安排与正文解析尚未开放；文件原件不能替换。
          </p>
          <LearningPanel key={'learning-' + item.id} resource={item} />
        </>
      )}
    </section>
  )
}
