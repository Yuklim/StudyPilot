import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  createFileResource,
  createResource,
  failureText,
  putResourceSnapshot,
  uploadSnapshotAsset,
} from '../resources/api'

import { EMPTY_DRAFT, ITEM_TYPE_LABELS, putCitation } from '../resources/citation'
import { askExtensionForImage, freezeImages, imageFailureText } from './freeze'
import type { CapturedPdf, PdfProblem } from './protocol'
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
/** base64 的字节还原成待上传的文件。 */
function pdfFile(pdf: CapturedPdf): File {
  const bytes = Uint8Array.from(atob(pdf.base64), (char) => char.charCodeAt(0))
  return new File([bytes], pdf.name, { type: 'application/pdf' })
}

/** 没取到 PDF 时如实说清是哪一种，不含糊成「失败了」。 */
const pdfProblemText: Record<PdfProblem, string> = {
  'cross-origin': 'PDF 在另一个域名下，扩展没有那个域名的权限，所以这次存的是网页正文。',
  'too-large': 'PDF 超过 25 MiB 上限，存不进来，所以这次存的是网页正文。',
  'not-pdf': '那个地址取回来的不是 PDF（多半是登录页或付费墙），所以这次存的是网页正文。',
  failed:
    'PDF 没能取下来——多数出版社要求先登录才给，而扩展从不带你的账号信息；也可能只是网络不通。这次存的是网页正文。',
}

export function CapturePage() {
  const navigate = useNavigate()
  // 识别到文献时默认勾上：识别到了却默认不存，等于白识别。取消只影响这一次。
  const [saveCitation, setSaveCitation] = useState(true)
  // 取到 PDF 时默认就存 PDF：用户要的是「点一下，文献进库」。仍然可以改存网页正文。
  const [savePdf, setSavePdf] = useState(true)
  const [citationMiss, setCitationMiss] = useState<{ id: string; reason: string } | null>(null)
  const [captured, setCaptured] = useState<CapturePayload | null>(null)
  const [title, setTitle] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [error, setError] = useState('')
  const [partial, setPartial] = useState<{ id: string; reason: string } | null>(null)
  const [pending, setPending] = useState(false)
  const [images, setImages] = useState<{
    id: string
    frozen: number
    failed: number
    reasons: Record<string, number>
  } | null>(null)
  const [freezing, setFreezing] = useState<{ done: number; total: number } | null>(null)
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
    const savingPdf = Boolean(captured.pdf && savePdf)
    if (!savingPdf && (!markdown.trim() || markdown.length > MAX_MARKDOWN)) {
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
    setCitationMiss(null)
    setImages(null)
    let created: { id: string } | null = null
    try {
      // **PDF 这条路**：原件就是这份 PDF，不存网页正文、不冻图片、不留原页地址
      //（契约不允许 FILE 资料带 source_url）。用户 2026-09-21 定案：「有了 pdf 就不用
      // 再要拔下来 pdf 那个网页了」。
      if (savingPdf && captured.pdf) {
        created = await createFileResource(
          { ...(cleanTitle ? { title: cleanTitle } : {}) },
          pdfFile(captured.pdf),
        )
        if (captured.citation && saveCitation) {
          try {
            await putCitation(created.id, { ...EMPTY_DRAFT, ...captured.citation }, null)
          } catch (cause) {
            if (!alive.current) return
            setCitationMiss({ id: created.id, reason: failureText(cause) })
            return
          }
        }
        if (alive.current) navigate(`/resources/${created.id}`)
        return
      }
      created = await createResource({
        ...(cleanTitle ? { title: cleanTitle } : {}),
        source_type: 'WEB',
        source_url: captured.url,
      })
      const snapshot = await putResourceSnapshot(created.id, markdown)
      // 文献信息与图片是两件互不相干的附加物，**谁失败都不该把另一件跳过**。
      // 先写文献（一次小请求），失败只记下来继续冻图片，末尾一起如实汇报
      // （Review F5：原先文献写在图片之后，图片部分失败时直接 return，勾了
      // 「一并存下来」的文献既没写也没提，提示里只讲图片）。
      let citationFailure: string | null = null
      if (captured.citation && saveCitation) {
        try {
          await putCitation(created.id, { ...EMPTY_DRAFT, ...captured.citation }, null)
        } catch (cause) {
          citationFailure = failureText(cause)
        }
      }
      if (!alive.current) return
      // 图片必须在正文写成之后：上传资产要带**快照**版本作前置条件。
      if (captured.images.length > 0) {
        if (alive.current) setFreezing({ done: 0, total: captured.images.length })
        const result = await freezeImages(created.id, captured.images, snapshot.version, {
          ask: askExtensionForImage(window),
          upload: uploadSnapshotAsset,
          onProgress: (done, total) => {
            if (alive.current) setFreezing({ done, total })
          },
        })
        if (!alive.current) return
        setFreezing(null)
        // 有图没冻上就**停在这一页如实说清**，不跳转 —— 跳走等于把「12 张里只存下 3 张」
        // 这件事咽掉，而用户此刻还能重新采集。全部成功才走。
        if (result.failed > 0) {
          setImages({ id: created.id, ...result })
          if (citationFailure) setCitationMiss({ id: created.id, reason: citationFailure })
          return
        }
      }
      if (citationFailure) {
        setCitationMiss({ id: created.id, reason: citationFailure })
        return
      }
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
      if (alive.current) {
        setPending(false)
        setFreezing(null)
      }
    }
  }

  // 这次点保存会存成 PDF 原件还是网页正文——界面据它决定显示什么。
  const savingNow = Boolean(captured?.pdf && savePdf)

  return (
    <section className="resource-sheet" aria-labelledby="capture-title">
      <div className="resource-sheet-heading">
        <span className="small-label">FROM THE PAGE YOU WERE READING</span>
        <h2 id="capture-title">确认要保存的正文</h2>
      </div>

      {freezing ? (
        <p role="status">
          正文已保存，正在下载图片（{freezing.done} / {freezing.total}
          ）。这一步失败不会影响已经保存的正文。
        </p>
      ) : null}

      {images ? (
        <div className="resource-error">
          <p role="alert">
            正文已经保存好了。图片冻结了 {images.frozen} 张，有 {images.failed} 张没能保存 ——
            那几张仍然指向原网站，原网站改版或删图后会失效。这里不会自动重试。
          </p>
          <ul>
            {Object.entries(images.reasons).map(([reason, count]) => (
              <li key={reason}>{imageFailureText(reason, count)}</li>
            ))}
          </ul>
          <Link className="journal-button" to={`/resources/${images.id}`}>
            打开这份资料
          </Link>
        </div>
      ) : null}

      {citationMiss ? (
        <div className="resource-error">
          <p role="alert">
            {/*
              不写「**只有**文献信息没存上」：图片也可能同时没冻上，那句话在组合状态下
              就是假的（Review 第二轮）。同理，图片那块已经给了「打开这份资料」时这里
              不再重复一个同名按钮。
            */}
            资料和正文都保存好了，文献信息没存上：{citationMiss.reason}{' '}
            打开这份资料，在右栏的「信息」里可以自己补。这里不会自动重试，也不会因此重新建一份。
          </p>
          {images ? null : (
            <Link className="journal-button" to={`/resources/${citationMiss.id}`}>
              打开这份资料
            </Link>
          )}
        </div>
      ) : null}

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
      ) : images || citationMiss ? null : (
        // 图片部分失败时**不再渲染表单**：留着它，用户看完「2 张里 1 张没保存」
        // 再点一次「保存为资料」，会静默新建第二份资料 + 第二份快照并重下全部图片。
        // 同页的 partial 分支早就是这么处理的（替换掉表单），这里补齐同样的处置。
        <form onSubmit={save} aria-label="确认采集内容" noValidate>
          <fieldset disabled={pending}>
            <legend className="sr-only">采集到的内容</legend>
            <p className="resource-hint">来自：{captured.url}</p>
            {captured.pdf ? (
              <div className="capture-pdf">
                <label className="capture-citation-toggle">
                  <input
                    type="checkbox"
                    checked={savePdf}
                    onChange={(event) => setSavePdf(event.target.checked)}
                  />
                  保存这份 PDF（{captured.pdf.name}，{(captured.pdf.bytes / 1048576).toFixed(1)}{' '}
                  MB）
                </label>
                <p className="resource-hint">
                  {savePdf
                    ? '存下来的是 PDF 原件，打开资料就能在 StudyPilot 里读，不用再回原网站。这一页的正文不会保存——它只是对这篇文献的描述。'
                    : '改为保存这一页的网页正文。PDF 不会存下来。'}
                </p>
              </div>
            ) : null}
            {captured.pdf_problem ? (
              <p className="resource-hint">{pdfProblemText[captured.pdf_problem]}</p>
            ) : null}
            {savingNow ? null : (
              <p className="resource-hint">
                这是保存当时的副本，不随原文更新。如果你在扩展里选了「连图片一并保存」，正文里的图片会在保存后逐张下载到本机；没选或没有授权时，图片仍指向原网站。
              </p>
            )}
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
            {savingNow ? null : (
              <label className="resource-field">
                正文（Markdown，共 {Array.from(markdown).length} 字）
                <textarea
                  rows={16}
                  value={markdown}
                  onChange={(event) => setMarkdown(event.target.value)}
                />
              </label>
            )}
            {captured.citation ? (
              <div className="capture-citation">
                <label className="capture-citation-toggle">
                  <input
                    type="checkbox"
                    checked={saveCitation}
                    onChange={(event) => setSaveCitation(event.target.checked)}
                  />
                  这页看起来是一篇文献，一并存下来
                </label>
                <dl className="reader-info-list">
                  <dt>类型</dt>
                  <dd>{ITEM_TYPE_LABELS[captured.citation.item_type]}</dd>
                  {captured.citation.authors.length > 0 ? (
                    <>
                      <dt>作者</dt>
                      <dd>{captured.citation.authors.join('；')}</dd>
                    </>
                  ) : null}
                  {captured.citation.issued_year !== null ? (
                    <>
                      <dt>年份</dt>
                      <dd>{captured.citation.issued_year}</dd>
                    </>
                  ) : null}
                  {captured.citation.container_title ? (
                    <>
                      <dt>出处</dt>
                      <dd>{captured.citation.container_title}</dd>
                    </>
                  ) : null}
                  {captured.citation.doi ? (
                    <>
                      <dt>DOI</dt>
                      <dd>{captured.citation.doi}</dd>
                    </>
                  ) : null}
                </dl>
                <p className="resource-hint">
                  识别可能不准，而且只看这一页自己声明的内容，没有联网核对。存下来之后在资料的「信息」里随时能改或清空。
                </p>
              </div>
            ) : null}
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
