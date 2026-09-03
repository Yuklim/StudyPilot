import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { createResource, failureText, safeWebUrl } from './api'

export function ResourceForm() {
  const navigate = useNavigate()
  const alive = useRef(true)
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [source, setSource] = useState<'WEB' | 'PASTE'>('WEB')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [content, setContent] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const length = (value: string) => Array.from(value).length
    const cleanTitle = title.trim()
    let invalid = ''
    if (!cleanTitle || length(cleanTitle) > 200) invalid = '请填写 1～200 字的标题。'
    else if (length(sourceName) > 120 || length(reason) > 1000)
      invalid = '来源名称最多 120 字，保存原因最多 1000 字。'
    else if (source === 'WEB' && (!safeWebUrl(url.trim()) || length(url.trim()) > 2048))
      invalid = '请填写完整的 http 或 https 网址，不含账号、密码、空格或 # 片段，最多 2048 字。'
    else if (source === 'PASTE' && (!content.trim() || length(content) > 1_000_000))
      invalid = '请粘贴非空原文，最多 100 万字。'
    if (invalid) {
      setError(invalid)
      return
    }
    busy.current = true
    setPending(true)
    setError('')
    setUncertain(false)
    const common = {
      title: cleanTitle,
      ...(sourceName ? { source_name: sourceName } : {}),
      ...(reason ? { save_reason: reason } : {}),
    }
    try {
      const saved = await createResource(
        source === 'WEB'
          ? { ...common, source_type: 'WEB', source_url: url.trim() }
          : { ...common, source_type: 'PASTE', pasted_content: content },
      )
      if (alive.current) navigate(`/resources/${saved.id}`)
    } catch (cause) {
      if (alive.current) {
        setError(failureText(cause))
        // Even a lost/malformed response may follow a successful save. Never auto-replay.
        setUncertain(true)
      }
    } finally {
      busy.current = false
      if (alive.current) setPending(false)
    }
  }

  return (
    <section className="resource-sheet" aria-labelledby="resource-form-title">
      <div className="resource-sheet-heading">
        <span className="small-label">COLLECT A LITTLE CURIOSITY</span>
        <h2 id="resource-form-title">收好一份值得再看的内容</h2>
      </div>
      <p className="resource-hint" id="draft-note">
        未保存的内容只留在当前页面；离开或刷新会丢失。网址只保存地址，不抓取网页。
      </p>
      <form
        onSubmit={submit}
        noValidate
        autoComplete="off"
        aria-label="添加资料表单"
        aria-describedby="draft-note"
      >
        <fieldset disabled={pending} className="resource-fields">
          <legend className="sr-only">资料内容</legend>
          <div className="source-choice" role="group" aria-label="资料来源">
            <label>
              <input
                type="radio"
                name="source"
                checked={source === 'WEB'}
                onChange={() => setSource('WEB')}
              />
              <span>
                01 <strong>网页链接</strong>
                <small>留一条通往知识的路</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="source"
                checked={source === 'PASTE'}
                onChange={() => setSource('PASTE')}
              />
              <span>
                02 <strong>粘贴内容</strong>
                <small>原样收好一段文字</small>
              </span>
            </label>
          </div>
          <label className="resource-field">
            标题（必填）
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              placeholder="给这份好奇起个名字"
            />
          </label>
          {source === 'WEB' ? (
            <label className="resource-field">
              网页地址（必填）
              <input
                type="url"
                inputMode="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                required
                placeholder="https://example.com/article"
              />
            </label>
          ) : (
            <label className="resource-field">
              粘贴原文（必填）
              <textarea
                className="paste-input"
                rows={9}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                required
                placeholder="纯文本或 Markdown 都会原样保存，不会执行其中的代码。"
              />
            </label>
          )}
          <div className="resource-form-columns">
            <label className="resource-field">
              来源名称（选填）
              <input
                value={sourceName}
                onChange={(event) => setSourceName(event.target.value)}
                placeholder="作者、网站或书名 · 最多 120 字"
              />
            </label>
            <label className="resource-field">
              保存原因（选填）
              <textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="为什么想再读一遍？最多 1000 字"
              />
            </label>
          </div>
          <button className="journal-button primary" type="submit">
            {pending ? '正在保存…' : '保存到资料库'}
          </button>
        </fieldset>
        {pending && (
          <p role="status" className="resource-hint">
            正在保存，请稍候；离开页面不会取消已发送的请求。
          </p>
        )}
        {error && (
          <div className="resource-error" role="alert">
            <p>{error}</p>
            {uncertain && <p>保存结果尚未确认，请先查看资料库，避免重复保存。输入仍保留在本页。</p>}
          </div>
        )}
      </form>
      <p className="resource-hint feature-boundary">文件上传、主题与标签管理尚未开放。</p>
      <Link className="text-link" to="/resources">
        返回资料库
      </Link>
    </section>
  )
}
