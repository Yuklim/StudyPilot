import { useEffect, useRef, useState } from 'react'

import { ApiError, type DeletionCurrentImpact, type DeletionImpact } from '../../api/client'
import {
  deleteResource,
  failureText,
  previewResourceDeletion,
  type DeletionPreview,
  type Resource,
} from './api'
import { resourceTitle } from './resourceTitle'

const impactLabels: Array<[keyof DeletionImpact, string]> = [
  ['original_file_count', '原件'],
  ['snapshot_asset_count', '已冻结的图片'],
  ['note_count', '心得'],
  ['study_record_count', '学习历史'],
  ['active_review_plan_count', '复习计划'],
  ['review_record_count', '复习记录'],
  ['resource_tag_count', '标签关联'],
]

function ImpactSummary({ impact }: { impact: DeletionImpact }) {
  return (
    <ul className="deletion-impact" aria-label="删除影响摘要">
      {impactLabels.map(([key, label]) => (
        <li key={key}>
          <strong>{impact[key]}</strong>
          <span>{label}</span>
        </li>
      ))}
    </ul>
  )
}

export function ResourceDeletion({
  resource,
  deleted,
}: {
  resource: Resource
  deleted: () => void
}) {
  const [preview, setPreview] = useState<DeletionPreview | null>(null)
  const [currentImpact, setCurrentImpact] = useState<DeletionCurrentImpact | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const alive = useRef(true)
  const busy = useRef(false)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  async function requestPreview() {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError(null)
    setCurrentImpact(null)
    try {
      const next = await previewResourceDeletion(resource.id)
      if (alive.current) setPreview(next)
    } catch (cause) {
      if (alive.current) setError(cause)
    } finally {
      busy.current = false
      if (alive.current) setPending(false)
    }
  }

  async function confirmDeletion() {
    const token = preview?.confirmation_token
    if (!token || busy.current) return
    busy.current = true
    setPending(true)
    setError(null)
    try {
      await deleteResource(resource.id, token)
      if (alive.current) deleted()
    } catch (cause) {
      if (alive.current) {
        setPreview(null)
        setCurrentImpact(
          cause instanceof ApiError && cause.code === 'DELETION_IMPACT_CHANGED'
            ? (cause.details.current_impact ?? null)
            : null,
        )
        setError(cause)
      }
    } finally {
      busy.current = false
      if (alive.current) setPending(false)
    }
  }

  function cancel() {
    if (pending) return
    setPreview(null)
    setCurrentImpact(null)
    setError(null)
  }

  return (
    <section className="resource-deletion" aria-label="删除资料">
      {!preview && (
        <button
          type="button"
          className="journal-button danger"
          onClick={requestPreview}
          disabled={pending}
        >
          {pending ? '正在读取删除影响…' : '删除这份资料'}
        </button>
      )}
      {preview && (
        <div className="deletion-confirmation" role="dialog" aria-labelledby="deletion-title">
          <span className="note-tab">放下这一页</span>
          <h3 id="deletion-title">确认删除“{resourceTitle(resource)}”？</h3>
          <p className="deletion-warning" role="alert">
            此操作不可撤销。资料本身及下列关联内容会被删除；主题和标签本体会保留。
          </p>
          <ImpactSummary impact={preview.impact} />
          <p className="resource-hint">
            本次确认有效至{' '}
            <time dateTime={preview.expires_at}>
              {new Date(preview.expires_at).toLocaleString('zh-CN', { hour12: false })}
            </time>
            。 若资料或关联内容发生变化，系统会要求重新预览。
          </p>
          <div className="resource-actions">
            <button type="button" className="journal-button" onClick={cancel} disabled={pending}>
              取消
            </button>
            <button
              type="button"
              className="journal-button danger"
              onClick={confirmDeletion}
              disabled={pending}
            >
              {pending ? '正在删除…' : '确认删除'}
            </button>
          </div>
        </div>
      )}
      {error !== null && (
        <div className="resource-error deletion-error" role="alert">
          <p>{failureText(error)}</p>
          {currentImpact && (
            <>
              <p>最新影响摘要：</p>
              <ImpactSummary impact={currentImpact.impact} />
            </>
          )}
          {!pending && (
            <button type="button" className="journal-button" onClick={requestPreview}>
              重新预览删除
            </button>
          )}
        </div>
      )}
    </section>
  )
}
