import { useCallback, useEffect, useState } from 'react'

import { ApiError } from '../../api/client'
import { failureText } from './api'
import {
  containerLine,
  deleteCitation,
  doiUrl,
  draftProblems,
  EMPTY_DRAFT,
  getCitation,
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  MAX_AUTHORS,
  MAX_YEAR,
  MIN_YEAR,
  normalizeDraft,
  putCitation,
  type Citation,
  type CitationDraft,
  type DraftProblem,
  type ItemType,
} from './citation'

/**
 * 右栏「信息」Tab 里的文献信息（TASK-078，用户 2026-09-20 在 Pencil 草图上确认的形态）。
 *
 * 三个状态：还没填（空态卡片 + 为什么值得填）、正在填（整块表单）、填好了（只读 + 编辑）。
 * **不新开 Tab**：作者、年份、期刊和「来源 / 收藏时间」是同一类东西——这篇资料是什么，
 * 不是能对它做什么。
 *
 * **整块表单、一次保存**，因为后端的 `PUT` 就是整份替换：逐字段行内编辑会让人以为没动的
 * 字段是安全的，实际上漏填就被清空了。界面照着真实语义长。
 */

function toDraft(citation: Citation): CitationDraft {
  const { resource_id, version, created_at, updated_at, ...draft } = citation
  void resource_id
  void version
  void created_at
  void updated_at
  return draft
}

function isConflict(cause: unknown): boolean {
  return (
    cause instanceof ApiError &&
    (cause.code === 'VERSION_CONFLICT' || cause.code === 'VERSION_REQUIRED')
  )
}

/** 冲突类错误要说清楚「别处改过」，其余按共享客户端的中文提示走。 */
function saveFailureText(cause: unknown): string {
  if (isConflict(cause)) return '这条文献信息刚在别处改过。先拿到最新的一份，再把你的修改填上去。'
  if (cause instanceof ApiError && cause.code === 'VALIDATION_ERROR')
    return '有字段不符合要求，服务端没有收下。请检查年份、DOI 与各字段长度后再保存。'
  return failureText(cause)
}

export function ReaderCitation({ resourceId }: { resourceId: string }) {
  const [citation, setCitation] = useState<Citation | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<CitationDraft>(EMPTY_DRAFT)
  const [problems, setProblems] = useState<DraftProblem[]>([])
  // 读取失败与**操作**失败分开：前者只是「这块没读到」，安静地给一行提示和重读按钮；
  // 后者是用户刚点了保存/清空、必须立刻知道，才用 role="alert"。都塞进 alert 会让阅读器里
  // 每一处被动失败都对读屏器喊一嗓子（也确实把一条既有用例的断言撞飞了）。
  const [loadFailure, setLoadFailure] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // 冲突之后光有提示没用：手里这份的版本已经过时，再按保存只会再撞一次。
  // 标记它，好在编辑态里就地给一个「重新读取」的出路。
  const [conflicted, setConflicted] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setCitation(await getCitation(resourceId))
      setLoadFailure(null)
    } catch (cause) {
      setLoadFailure(failureText(cause))
    } finally {
      setLoading(false)
    }
  }, [resourceId])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const found = await getCitation(resourceId)
        if (!alive) return
        setCitation(found)
        setLoadFailure(null)
      } catch (cause) {
        if (alive) setLoadFailure(failureText(cause))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [resourceId])

  const startEditing = () => {
    setDraft(citation ? toDraft(citation) : EMPTY_DRAFT)
    setProblems([])
    setFailure(null)
    setConfirming(false)
    setConflicted(false)
    setEditing(true)
  }

  const save = async () => {
    const cleaned = normalizeDraft(draft)
    const found = draftProblems(cleaned)
    setProblems(found)
    if (found.length) return
    setPending(true)
    try {
      setCitation(await putCitation(resourceId, cleaned, citation?.version ?? null))
      setEditing(false)
      setFailure(null)
      setConflicted(false)
    } catch (cause) {
      // 保存失败时**不关表单**：用户填的东西还在里面，关掉就等于替他丢掉。
      setFailure(saveFailureText(cause))
      setConflicted(isConflict(cause))
    } finally {
      setPending(false)
    }
  }

  const reread = async () => {
    setPending(true)
    try {
      const latest = await getCitation(resourceId)
      setCitation(latest)
      setDraft(latest ? toDraft(latest) : EMPTY_DRAFT)
      setFailure(null)
      setConflicted(false)
      if (!latest) setEditing(false)
    } catch (cause) {
      setFailure(failureText(cause))
    } finally {
      setPending(false)
    }
  }

  const clear = async () => {
    if (!citation) return
    setPending(true)
    try {
      await deleteCitation(resourceId, citation.version)
      setCitation(null)
      setEditing(false)
      setConfirming(false)
      setFailure(null)
    } catch (cause) {
      setFailure(saveFailureText(cause))
    } finally {
      setPending(false)
    }
  }

  const problemFor = (field: DraftProblem['field']) =>
    problems.find((problem) => problem.field === field)?.message
  const field = (label: string, key: keyof CitationDraft, extra: { placeholder?: string } = {}) => {
    const message = problemFor(key)
    return (
      <label className="resource-field">
        {label}
        <input
          value={(draft[key] as string | null) ?? ''}
          placeholder={extra.placeholder}
          aria-invalid={message ? true : undefined}
          onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
        />
        {message && <span className="citation-problem">{message}</span>}
      </label>
    )
  }

  if (loading) return <p className="resource-hint">正在读取文献信息…</p>

  if (editing) {
    const authors = draft.authors ?? ['']
    const authorProblem = problemFor('authors')
    const yearProblem = problemFor('issued_year')
    return (
      <section className="reader-citation" aria-label="文献信息">
        <h3>文献信息</h3>
        <fieldset className="resource-fields" disabled={pending}>
          <legend className="sr-only">文献信息</legend>
          <label className="resource-field">
            类型
            {/* 包着的 <label> 里还有 <select> 自己的选项文字，可访问名会变成「类型期刊论文…」；
                这里显式给个 aria-label，名字才是干净的「类型」。 */}
            <select
              aria-label="类型"
              value={draft.item_type}
              onChange={(event) =>
                setDraft({ ...draft, item_type: event.target.value as ItemType })
              }
            >
              {ITEM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ITEM_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <div className="citation-authors">
            <span className="citation-authors-label" id="citation-authors-label">
              作者（一行一位）
            </span>
            {authors.map((name, index) => (
              <div className="citation-author-row" key={index}>
                <input
                  aria-label={`第 ${index + 1} 位作者`}
                  value={name}
                  onChange={(event) => {
                    const next = [...authors]
                    next[index] = event.target.value
                    setDraft({ ...draft, authors: next })
                  }}
                />
                <button
                  type="button"
                  className="journal-button"
                  aria-label={`删掉第 ${index + 1} 位作者`}
                  onClick={() =>
                    setDraft({ ...draft, authors: authors.filter((_, at) => at !== index) })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            {authors.length < MAX_AUTHORS && (
              <button
                type="button"
                className="journal-button"
                onClick={() => setDraft({ ...draft, authors: [...authors, ''] })}
              >
                ＋ 添加一位作者
              </button>
            )}
            {authorProblem && <span className="citation-problem">{authorProblem}</span>}
          </div>
          <div className="resource-form-columns">
            <label className="resource-field">
              年份
              <input
                type="number"
                min={MIN_YEAR}
                max={MAX_YEAR}
                value={draft.issued_year ?? ''}
                aria-invalid={yearProblem ? true : undefined}
                onChange={(event) => {
                  const raw = event.target.value.trim()
                  const parsed = Number(raw)
                  setDraft({
                    ...draft,
                    issued_year: raw && Number.isFinite(parsed) ? Math.trunc(parsed) : null,
                  })
                }}
              />
              {yearProblem && <span className="citation-problem">{yearProblem}</span>}
            </label>
            {field('出处 / 期刊', 'container_title')}
          </div>
          <div className="resource-form-columns">
            {field('卷', 'volume')}
            {field('期', 'issue')}
            {field('页', 'pages')}
          </div>
          {field('DOI', 'doi', { placeholder: '10.xxxx/xxxxx' })}
          {field('出版方', 'publisher')}
          <p className="resource-hint">
            标题与来源地址不在这里改——它们是资料本身的字段，在「编辑资料」里改。
          </p>
        </fieldset>
        {failure && <p role="alert">{failure}</p>}
        {conflicted && (
          <div className="citation-actions">
            <button type="button" className="journal-button" disabled={pending} onClick={reread}>
              重新读取（放弃这次修改）
            </button>
          </div>
        )}
        {confirming ? (
          <div className="citation-confirm" role="alertdialog" aria-label="确认清空文献信息">
            <p>清空之后这份文献信息就没有了，恢复只能重新填一遍。确定吗？</p>
            <div className="citation-actions">
              <button type="button" className="journal-button" onClick={() => setConfirming(false)}>
                取消
              </button>
              <button type="button" className="journal-button" disabled={pending} onClick={clear}>
                确定清空
              </button>
            </div>
          </div>
        ) : (
          <div className="citation-actions">
            {citation && (
              <button
                type="button"
                className="journal-button"
                disabled={pending}
                onClick={() => setConfirming(true)}
              >
                清空文献信息
              </button>
            )}
            <button
              type="button"
              className="journal-button"
              disabled={pending}
              onClick={() => {
                setEditing(false)
                setProblems([])
                setFailure(null)
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="journal-button primary"
              disabled={pending}
              onClick={save}
            >
              保存
            </button>
          </div>
        )}
      </section>
    )
  }

  if (!citation) {
    return (
      <section className="reader-citation" aria-label="文献信息">
        <h3>文献信息</h3>
        <p className="resource-hint">
          {loadFailure
            ? `没读到文献信息：${loadFailure}`
            : '还没有记作者、年份、期刊这些。填了之后这份资料才算一条文献——将来做引文导出、按作者或年份找东西，靠的都是这里。'}
        </p>
        {failure && <p role="alert">{failure}</p>}
        <div className="citation-actions">
          {loadFailure && (
            <button type="button" className="journal-button" onClick={() => void load()}>
              重新读取
            </button>
          )}
          {!loadFailure && (
            <button type="button" className="journal-button" onClick={startEditing}>
              填写文献信息
            </button>
          )}
        </div>
      </section>
    )
  }

  const place = containerLine(citation)
  return (
    <section className="reader-citation" aria-label="文献信息">
      <div className="citation-head">
        <h3>文献信息</h3>
        <button type="button" className="text-link" onClick={startEditing}>
          编辑
        </button>
      </div>
      <p className="citation-kind">
        <span className="source-chip">{ITEM_TYPE_LABELS[citation.item_type]}</span>
        {citation.issued_year !== null && (
          <span className="citation-year">{citation.issued_year}</span>
        )}
      </p>
      <dl className="reader-info-list">
        {citation.authors && (
          <>
            <dt>作者</dt>
            <dd>{citation.authors.join('；')}</dd>
          </>
        )}
        {place && (
          <>
            <dt>出处</dt>
            <dd>{place}</dd>
          </>
        )}
        {citation.publisher && (
          <>
            <dt>出版方</dt>
            <dd>{citation.publisher}</dd>
          </>
        )}
        {citation.doi && (
          <>
            <dt>DOI</dt>
            <dd>
              <a
                className="text-link"
                href={doiUrl(citation.doi)}
                target="_blank"
                rel="noreferrer noopener"
              >
                {citation.doi}
              </a>
            </dd>
          </>
        )}
      </dl>
      {failure && <p role="alert">{failure}</p>}
    </section>
  )
}
