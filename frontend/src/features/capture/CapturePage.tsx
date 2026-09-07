import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { createResource, failureText, putResourceSnapshot } from '../resources/api'

import {
  CAPTURE_READY,
  MAX_MARKDOWN,
  MAX_TITLE,
  capturedFrom,
  type CapturePayload,
} from './protocol'

/**
 * 浏览器扩展采集到的正文在这里落地。
 *
 * 三条设计约束，缺一条这个页面就不该存在：
 *  1. **必须由用户点确认才写入。** 任何网页都能向同源窗口 postMessage，所以到达这里
 *     的内容一律当作不可信输入 —— 它只能预填一个表单，不能自己触发写入。
 *  2. **正文按纯文本处理。** 存的是 Markdown 源码，展示也是源码；本页不渲染 HTML，
 *     渲染属阅读器范畴（与资料详情的快照区一致）。
 *  3. **创建资料与写快照是两次请求，不是事务。** 第一步成功第二步失败时，必须说清
 *     发生了什么、下一步去哪，不能谎称成功、也不能自动重试。
 */
export function CapturePage() {
  const navigate = useNavigate()
  const [captured, setCaptured] = useState<CapturePayload | null>(null)
  const [title, setTitle] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [error, setError] = useState('')
  const [partial, setPartial] = useState<{ id: string; reason: string } | null>(null)
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const receive = useCallback((event: MessageEvent) => {
    const payload = capturedFrom(event, window)
    if (!payload) return
    setCaptured(payload)
    setTitle(payload.title)
    setMarkdown(payload.markdown)
  }, [])

  useEffect(() => {
    window.addEventListener('message', receive)
    // 握手：页面先说自己准备好了，中转脚本再交付。反过来（脚本一加载就推）会因为
    // React 挂载时机不定而丢消息。
    window.postMessage({ type: CAPTURE_READY }, window.location.origin)
    return () => window.removeEventListener('message', receive)
  }, [receive])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy.current || !captured) return
    const cleanTitle = title.trim()
    // 与手工录入路径一致（ContentSnapshot.tsx:68,72）：用 trim 判空，但**原样发送**。
    // 采集到的正文不该被这一步悄悄改动。
    if (!markdown.trim() || markdown.length > MAX_MARKDOWN) {
      setError('正文不能为空，且最多 100 万字。')
      return
    }
    if (cleanTitle.length > MAX_TITLE) {
      setError('标题最多 200 字。')
      return
    }
    busy.current = true
    setPending(true)
    setError('')
    setPartial(null)
    let created: { id: string } | null = null
    try {
      created = await createResource({
        ...(cleanTitle ? { title: cleanTitle } : {}),
        source_type: 'WEB',
        source_url: captured.url,
      })
      await putResourceSnapshot(created.id, markdown)
      if (alive.current) navigate(`/resources/${created.id}`)
    } catch (cause) {
      if (!alive.current) return
      if (created) {
        // 资料建好了、正文没写进去。这是最容易被含糊过去的状态，必须点破：
        // 资料在哪、正文没保存、下一步怎么办。不自动重试。
        setPartial({ id: created.id, reason: failureText(cause) })
      } else {
        setError(failureText(cause))
      }
    } finally {
      busy.current = false
      if (alive.current) setPending(false)
    }
  }

  return (
    <section className="resource-sheet" aria-labelledby="capture-title">
      <div className="resource-sheet-heading">
        <span className="small-label">FROM THE PAGE YOU WERE READING</span>
        <h2 id="capture-title">确认要保存的正文</h2>
      </div>

      {partial ? (
        <div className="resource-error">
          <p role="alert">
            资料已经创建，但正文没有保存成功：{partial.reason} 已经保存的资料还在，
            你可以打开它，把下面这段正文粘贴进去。这里不会自动重试。
          </p>
          <Link className="journal-button" to={`/resources/${partial.id}`}>
            打开这份资料
          </Link>
          {/*
            正文必须留在屏幕上。扩展的暂存在交付时就删了、原网页可能已经关掉，
            这份文本是用户手上唯一的一份 —— 把它连同「粘贴进去」的提示一起抹掉，
            等于让提示指向一个并不存在的东西。
          */}
          <label className="resource-field">
            待粘贴的正文（可全选复制）
            <textarea rows={12} value={markdown} readOnly />
          </label>
        </div>
      ) : !captured ? (
        <p className="resource-hint">
          还没有收到扩展发来的内容。请在想保存的网页上点一次 StudyPilot 扩展图标；
          这一页会等着接收。直接关掉也不会保存任何东西。
        </p>
      ) : (
        <form onSubmit={save} aria-label="确认采集内容" noValidate>
          <fieldset disabled={pending}>
            <legend className="sr-only">采集到的内容</legend>
            <p className="resource-hint">来自：{captured.url}</p>
            <p className="resource-hint">
              这是保存当时的副本，不随原文更新。图片仍指向原站，本版本不冻结图片。
            </p>
            <label className="resource-field">
              标题
              <input
                type="text"
                value={title}
                maxLength={MAX_TITLE}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="留空则显示为「未命名资料」"
              />
            </label>
            <label className="resource-field">
              正文（Markdown，共 {Array.from(markdown).length} 字）
              <textarea
                rows={16}
                value={markdown}
                onChange={(event) => setMarkdown(event.target.value)}
              />
            </label>
            {error ? <p role="alert">{error}</p> : null}
            <div className="resource-actions">
              <button type="submit" className="journal-button primary">
                保存为资料
              </button>
              <Link className="text-link" to="/resources">
                不保存，去资料库
              </Link>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  )
}
