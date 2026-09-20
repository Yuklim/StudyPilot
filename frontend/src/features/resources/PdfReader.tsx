import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { failureText } from './api'
import { downloadOriginal, type OriginalFile } from './files'
import { locatePage, readPdfPosition, scrollTopFor, writePdfPosition } from './pdfPosition'

/**
 * 站内读本地 PDF（TASK-073，用户 2026-09-20 在 Pencil 草图上确认的形态）。
 *
 * **字节必须自己 `fetch` 回来。** 本机门禁要求每个 `/api/v1/*` 请求带进程令牌且
 * `sec-fetch-dest: empty`；浏览器为 `<iframe src>`/`<embed>` 发的文档请求带不了自定义头、
 * `sec-fetch-dest` 也不是 `empty`，**必然被拒**。所以走既有的受控下载拿到 `Blob`，再把字节
 * 交给 pdf.js。这与快照图片走 `fetch` + `createObjectURL` 是同一条既有结论。
 *
 * **连续滚动 + 按需渲染。** 一份几十页的 PDF 不该等全渲染完才给看：先量出每页尺寸占好位，
 * 只渲染视口附近的页，远离视口的页把 canvas 释放掉，免得大文档把内存吃满。
 *
 * **只读。** 不做选中、标注、文本层搜索：高亮的锚点是快照正文的字符偏移，PDF 是另一套坐标
 * （页 + 页内位置），那是后续任务要动契约的事。
 *
 * pdf.js 是打包进来的 npm 依赖，worker 也一起打包——本机应用在运行时不该依赖外网。
 */

/** 视口上下各多渲染这么多页，滚动时不至于看见白页。 */
const NEAR_PAGES = 2
const MIN_SCALE = 0.5
const MAX_SCALE = 3

type Doc = {
  numPages: number
  getPage: (page: number) => Promise<PdfPage>
  destroy: () => Promise<void>
}
type PdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number }
  render: (options: {
    canvasContext: CanvasRenderingContext2D
    viewport: { width: number; height: number }
  }) => { promise: Promise<void>; cancel: () => void }
  cleanup: () => void
}
type Failure = { kind: 'password' | 'broken' | 'read'; detail: string }

/** pdf.js 按需加载：它体积不小，没有 PDF 的资料不该为它买单。 */
async function openDocument(bytes: ArrayBuffer): Promise<Doc> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return (await pdfjs.getDocument({ data: bytes }).promise) as unknown as Doc
}

function classify(cause: unknown): Failure {
  const name = (cause as { name?: string } | null)?.name ?? ''
  if (name === 'PasswordException')
    return { kind: 'password', detail: '这份 PDF 有打开口令，站内阅读器不收口令。' }
  if (name === 'InvalidPDFException')
    return { kind: 'broken', detail: '文件结构损坏，读不出页面。' }
  return { kind: 'read', detail: failureText(cause) }
}

export function PdfReader({
  resourceId,
  file,
  onPages,
}: {
  resourceId: string
  file: OriginalFile
  /** 把「第几页 / 共几页」报给工具条。 */
  onPages?: (state: { page: number; total: number }) => void
}) {
  const [doc, setDoc] = useState<Doc | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [sizes, setSizes] = useState<{ width: number; height: number }[]>([])
  const [scale, setScale] = useState(1)
  const [page, setPage] = useState(1)
  const container = useRef<HTMLDivElement>(null)
  const restored = useRef(false)

  // --- 取字节并打开 ---
  // 换一份原件就**整个重挂**（父级给 `key={file.id}`），所以这里不用在 effect 里同步重置
  // 状态——同步 setState 会触发级联渲染，项目的 lint 直接禁掉了这种写法。
  useEffect(() => {
    let alive = true
    let opened: Doc | null = null
    void (async () => {
      try {
        const download = await downloadOriginal(file)
        const bytes = await download.blob.arrayBuffer()
        if (!alive) return
        opened = await openDocument(bytes)
        if (!alive) {
          void opened.destroy()
          return
        }
        // 先量出每页在 scale=1 下的尺寸：占好位子，滚动条才不会随渲染跳动。
        const measured: { width: number; height: number }[] = []
        for (let at = 1; at <= opened.numPages; at += 1) {
          const target = await opened.getPage(at)
          const viewport = target.getViewport({ scale: 1 })
          measured.push({ width: viewport.width, height: viewport.height })
          target.cleanup()
        }
        if (!alive) {
          void opened.destroy()
          return
        }
        setDoc(opened)
        setSizes(measured)
      } catch (cause) {
        if (alive) setFailure(classify(cause))
      }
    })()
    return () => {
      alive = false
      if (opened) void opened.destroy()
    }
  }, [file])

  const total = doc?.numPages ?? 0
  useEffect(() => {
    onPages?.({ page, total })
  }, [page, total, onPages])

  // --- 位置记忆：恢复一次，之后滚动就写回 ---
  const offsets = useMemo(() => {
    const tops: number[] = []
    const heights: number[] = []
    let top = 0
    for (const size of sizes) {
      const height = size.height * scale + 16
      tops.push(top)
      heights.push(height)
      top += height
    }
    return { tops, heights }
  }, [sizes, scale])

  useEffect(() => {
    if (!sizes.length || restored.current) return
    restored.current = true
    const saved = readPdfPosition(resourceId)
    if (!saved || saved.fingerprint !== file.id) return
    const node = container.current
    if (!node) return
    node.scrollTop = scrollTopFor(saved, offsets.tops, offsets.heights, node.clientHeight)
    setPage(Math.min(saved.page, sizes.length))
  }, [sizes, offsets, resourceId, file.id])

  const onScroll = useCallback(() => {
    const node = container.current
    if (!node || !sizes.length) return
    const at = locatePage(node.scrollTop, offsets.tops, offsets.heights, node.clientHeight)
    setPage(at.page)
    writePdfPosition(resourceId, { ...at, fingerprint: file.id })
  }, [offsets, resourceId, sizes.length, file.id])

  const goTo = useCallback(
    (target: number) => {
      const node = container.current
      if (!node || !sizes.length) return
      const wanted = Math.min(Math.max(target, 1), sizes.length)
      // 跳页是把那一页的**顶部**带到视口顶（人的预期），不是把中线对齐；随后的 scroll 事件
      // 会按中线重算页码与位置，短文档滚不到底时得到的就是最接近的那一页。
      node.scrollTop = offsets.tops[wanted - 1] ?? 0
      setPage(wanted)
    },
    [offsets, sizes.length],
  )

  const fitWidth = useCallback(() => {
    const node = container.current
    if (!node || !sizes[0]) return
    // 让最宽的一页刚好放得下，留出滚动条与内边距。
    const widest = Math.max(...sizes.map((size) => size.width))
    setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, (node.clientWidth - 48) / widest)))
  }, [sizes])

  if (failure) {
    return (
      <div className="pdf-reader-failed" role="alert">
        <h2>这份 PDF 打不开</h2>
        <p>{failure.detail}</p>
        <p className="resource-hint">
          原件本身没有动过，可以用工具条里的「原件」把它下载下来，在别的阅读器里打开。
        </p>
      </div>
    )
  }
  return (
    <div className="pdf-reader">
      <div className="pdf-reader-tools">
        <label className="pdf-reader-page">
          第
          <input
            type="number"
            aria-label="页码"
            min={1}
            max={Math.max(total, 1)}
            value={page}
            onChange={(event) => goTo(Number(event.target.value))}
          />
          / {total || '…'} 页
        </label>
        <div className="pdf-reader-zoom">
          <button
            type="button"
            className="journal-button"
            aria-label="缩小"
            onClick={() =>
              setScale((value) => Math.max(MIN_SCALE, Number((value - 0.1).toFixed(2))))
            }
          >
            −
          </button>
          <span aria-live="polite">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            className="journal-button"
            aria-label="放大"
            onClick={() =>
              setScale((value) => Math.min(MAX_SCALE, Number((value + 0.1).toFixed(2))))
            }
          >
            ＋
          </button>
          <button type="button" className="journal-button" onClick={fitWidth}>
            适合宽度
          </button>
        </div>
      </div>
      <div className="pdf-reader-pages" ref={container} onScroll={onScroll} tabIndex={0}>
        {!doc && !sizes.length && (
          <p role="status" className="resource-loading">
            正在打开这份 PDF…
          </p>
        )}
        {sizes.map((size, index) => (
          <PdfPageView
            key={index}
            doc={doc}
            number={index + 1}
            width={size.width * scale}
            height={size.height * scale}
            scale={scale}
            near={Math.abs(index + 1 - page) <= NEAR_PAGES}
          />
        ))}
      </div>
    </div>
  )
}

/** 一页。离视口远时只占位不渲染，canvas 交还给浏览器。 */
function PdfPageView({
  doc,
  number,
  width,
  height,
  scale,
  near,
}: {
  doc: Doc | null
  number: number
  width: number
  height: number
  scale: number
  near: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!doc || !near) return
    let alive = true
    let task: { cancel: () => void } | null = null
    void (async () => {
      const target = await doc.getPage(number)
      if (!alive) return
      const viewport = target.getViewport({ scale })
      const node = canvas.current
      const context = node?.getContext('2d')
      if (!node || !context) return
      node.width = Math.floor(viewport.width)
      node.height = Math.floor(viewport.height)
      const render = target.render({ canvasContext: context, viewport })
      task = render
      try {
        await render.promise
      } catch {
        // 取消渲染会抛，属正常路径。
      }
      target.cleanup()
    })()
    return () => {
      alive = false
      task?.cancel()
    }
  }, [doc, number, scale, near])
  return (
    <div className="pdf-page" style={{ width, height }} data-page={number}>
      {near ? (
        <canvas ref={canvas} aria-label={`第 ${number} 页`} />
      ) : (
        <span className="pdf-page-placeholder" aria-hidden="true">
          {number}
        </span>
      )}
    </div>
  )
}
