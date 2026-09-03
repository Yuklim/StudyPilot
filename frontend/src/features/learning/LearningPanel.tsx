import { useEffect, useRef, useState, type FormEvent } from 'react'

import { ApiError } from '../../api/client'
import { getResource, statusLabels, type Resource, type Status } from '../resources/api'
import { ResourceProgress } from '../resources/ResourceState'
import { createRecord, learningError, options } from './api'
import { localTime, toInstant, type Progress } from './model'
import { RecordHistory } from './RecordHistory'

function RecordForm({
  resource,
  saved,
  reloaded,
  started,
}: {
  resource: Resource
  saved: (value: Progress) => void
  reloaded: (value: Resource) => void
  started: () => void
}) {
  const current = resource.progress
  const [when, setWhen] = useState(() => localTime())
  const [seconds, setSeconds] = useState('0')
  const [after, setAfter] = useState<Status>(current.status)
  const [percent, setPercent] = useState(String(current.progress_percent))
  const [summary, setSummary] = useState('')
  const [questions, setQuestions] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [archiveConfirmed, setArchiveConfirmed] = useState(false)
  const busy = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const allowed = options(resource)
  const archiveAction = current.status !== after && [current.status, after].includes('ARCHIVED')
  function selectStatus(value: Status) {
    setAfter(value)
    setArchiveConfirmed(false)
    if (value === 'ARCHIVED' || current.status === 'ARCHIVED')
      setPercent(String(current.progress_percent))
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy.current || blocked) return
    started()
    const startedAt = toInstant(when)
    if (
      !startedAt ||
      !/^\d+$/.test(seconds) ||
      Number(seconds) > 86400 ||
      !/^\d+$/.test(percent) ||
      Number(percent) > 100 ||
      !allowed.includes(after) ||
      summary.length > 5000 ||
      questions.length > 5000
    ) {
      setError('请检查本地时间、0～86400 的整数秒数、0～100 的整数进度及文本长度。')
      return
    }
    if (
      (after === 'UNREAD' || (after === 'ARCHIVED' && current.archived_from_status === 'UNREAD')) &&
      Number(percent) !== 0
    ) {
      setError('回到未开始需要你明确把进度填写为 0，不会自动清零。')
      return
    }
    if (archiveAction && (Number(percent) !== current.progress_percent || !archiveConfirmed)) {
      setError('请确认归档或恢复的影响；这一步必须保留当前进度。')
      return
    }
    if (
      after === current.status &&
      Number(percent) === current.progress_percent &&
      !summary.trim()
    ) {
      setError('状态和进度未变化时，请至少填写本次总结。')
      return
    }
    if (needsConfirm && !confirmed) {
      setError('请先核对最新进度和历史，再确认本次记录。')
      return
    }
    busy.current = true
    setPending(true)
    setError('')
    try {
      const value = await createRecord(resource, {
        expected_progress_version: current.version,
        started_at: startedAt,
        duration_seconds: Number(seconds),
        progress_before: current.progress_percent,
        progress_after: Number(percent),
        status_before: current.status,
        status_after: after,
        summary: summary || null,
        questions_next: questions || null,
      })
      if (alive.current) saved(value)
    } catch (cause) {
      if (alive.current) {
        setError(learningError(cause))
        if (
          !(cause instanceof ApiError) ||
          cause.status === 409 ||
          cause.status >= 500 ||
          ['NETWORK_ERROR', 'INVALID_RESPONSE', 'REQUEST_FAILED'].includes(cause.code)
        ) {
          setBlocked(true)
          setConfirmed(false)
          setNeedsConfirm(true)
        }
      }
    } finally {
      busy.current = false
      if (alive.current) setPending(false)
    }
  }
  async function reload() {
    if (busy.current) return
    busy.current = true
    setPending(true)
    try {
      const latest = await getResource(resource.id)
      if (alive.current) {
        reloaded(latest)
        setBlocked(false)
        setNeedsConfirm(true)
        setConfirmed(false)
        setArchiveConfirmed(false)
        if (
          (after === 'ARCHIVED' || latest.progress.status === 'ARCHIVED') &&
          after !== latest.progress.status
        )
          setPercent(String(latest.progress.progress_percent))
        setError('已读取最新进度并刷新历史，草稿已保留。请先核对历史，再确认是否需要提交。')
      }
    } catch (cause) {
      if (alive.current) {
        setBlocked(true)
        setError(learningError(cause))
      }
    } finally {
      busy.current = false
      if (alive.current) setPending(false)
    }
  }
  return (
    <form
      className="learning-form"
      aria-label="记录学习表单"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <h3>旧学习状态与进度管理</h3>
      <p className="resource-hint">
        当前快照：{statusLabels[current.status]} · {current.progress_percent}%（版本{' '}
        {current.version}）。
        草稿只保留在本页，收起、离开或刷新会丢失。已经发出的请求不会因离页撤销。
      </p>
      <fieldset disabled={pending}>
        <legend className="sr-only">本次学习内容</legend>
        <div className="record-fields">
          <label>
            学习开始时间
            <input
              type="datetime-local"
              step="1"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </label>
          <label>
            本次时长（秒）
            <input
              inputMode="numeric"
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
            />
          </label>
          <label>
            学习后状态
            <select value={after} onChange={(e) => selectStatus(e.target.value as Status)}>
              {!allowed.includes(after) && (
                <option value={after} disabled>
                  状态已变化，请重新选择
                </option>
              )}
              {allowed.map((value) => (
                <option value={value} key={value}>
                  {statusLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            学习后进度（%）
            <input
              inputMode="numeric"
              disabled={archiveAction}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </label>
        </div>
        <p className="resource-hint">
          60 秒 = 1 分钟；0 表示不记录时长，最多 86400 秒（24 小时）。时间使用本机时区 （
          {Intl.DateTimeFormat().resolvedOptions().timeZone}）；100%
          不会自动完成。复习计划操作尚未开放。
        </p>
        <label>
          本次总结（选填）
          <textarea maxLength={5000} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>
        <label>
          疑问与下一步（选填）
          <textarea
            maxLength={5000}
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
          />
        </label>
        {archiveAction && (
          <label className="record-confirm">
            <input
              type="checkbox"
              checked={archiveConfirmed}
              onChange={(e) => setArchiveConfirmed(e.target.checked)}
            />
            我确认
            {after === 'ARCHIVED'
              ? '归档后资料从默认资料库隐藏，原件、进度和历史保留'
              : '恢复到原来的' + statusLabels[after] + '状态，保留原进度和时间'}
            。
          </label>
        )}
        {needsConfirm && !blocked && (
          <label className="record-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            我已核对最新进度和历史，确认仍需提交这条记录。
          </label>
        )}
        <button
          className="journal-button primary"
          type="submit"
          disabled={blocked || (needsConfirm && !confirmed)}
        >
          {pending ? '正在保存或读取…' : '保存学习记录'}
        </button>
      </fieldset>
      {error && (
        <div role="alert" className="resource-error">
          <p>{error}</p>
          {needsConfirm && (
            <button
              type="button"
              className="journal-button"
              disabled={pending}
              onClick={() => void reload()}
            >
              保留草稿，读取最新进度
            </button>
          )}
        </div>
      )}
    </form>
  )
}

export function LearningPanel({ resource }: { resource: Resource }) {
  const [snapshot, setSnapshot] = useState(resource)
  const [open, setOpen] = useState(false)
  const [manage, setManage] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [historyRevision, setHistoryRevision] = useState(0)
  const [savedNotice, setSavedNotice] = useState(false)
  return (
    <section className="learning-panel" aria-label="资料学习手帐">
      <ResourceProgress resource={snapshot} />
      <button
        className="journal-button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          setManage(false)
        }}
      >
        {open ? '收起旧学习历史' : '查看旧学习历史'}
      </button>
      {savedNotice && <p role="status">学习记录已保存，当前进度已更新。</p>}
      {open && (
        <>
          <p className="resource-hint">
            这里保留以前的学习记录。新的理解或疑问直接写在上方心得中，不用登记时长、进度和状态。
          </p>
          <button
            className="journal-button"
            aria-expanded={manage}
            onClick={() => setManage(!manage)}
          >
            {manage ? '收起状态管理' : '更多：状态与归档管理'}
          </button>
          {manage && (
            <RecordForm
              key={'form-' + savedCount}
              resource={snapshot}
              started={() => setSavedNotice(false)}
              saved={(value) => {
                setSavedNotice(true)
                setSnapshot({ ...snapshot, progress: value })
                setSavedCount(savedCount + 1)
                setHistoryRevision(historyRevision + 1)
              }}
              reloaded={(value) => {
                setSnapshot(value)
                setHistoryRevision(historyRevision + 1)
              }}
            />
          )}
          <RecordHistory key={'history-' + historyRevision} resourceId={resource.id} />
        </>
      )}
    </section>
  )
}
