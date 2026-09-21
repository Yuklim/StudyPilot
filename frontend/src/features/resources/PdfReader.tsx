import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { failureText } from './api'
import { downloadOriginal, type OriginalFile } from './files'
import {
  locatePage,
  ratioWithinPage,
  readPdfPosition,
  scrollTopFor,
  writePdfPosition,
} from './pdfPosition'

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
/**
 * 一张画布最多开多少像素（TASK-082）。
 *
 * 两头都要管：**浏览器对 canvas 面积有硬上限**（Safari 约 16.7M 像素，撞上直接画不出来），
 * 以及**内存**——一张画布约 `像素数 × 4` 字节，而阅读器同时渲染视口上下各 `NEAR_PAGES` 页。
 * 10M 是量出来的：Retina 上「适合宽度」那一档需要 9.3M，刚好放得下、保持完全清晰；
 * 再往上缩放时按面积比降密度，而不是无上限地开。
 */
export const MAX_CANVAS_PIXELS = 10_000_000

/**
 * 这一页该按多少倍像素密度画。
 *
 * **为什么需要这个**：`node.width` 是画布的**像素**尺寸，而 CSS 的 `width: 100%` 决定它的
 * **CSS 尺寸**。两者相等时，高分屏（`devicePixelRatio > 1`）上每个 CSS 像素只有一个采样点，
 * 浏览器把它放大 dpr 倍显示——那就是「糊」。实测 Retina 上像素利用率只有 50%（TASK-082）。
 *
 * 返回值**不低于 1**：低于 1 会比不做还糊。超出预算时按面积开方降，保证 `w*h ≤ 预算`。
 */
export function pixelDensity(cssWidth: number, cssHeight: number, ratio: number): number {
  const wanted = Math.max(1, ratio)
  const area = cssWidth * cssHeight
  if (area <= 0) return wanted
  const affordable = Math.sqrt(MAX_CANVAS_PIXELS / area)
  return Math.max(1, Math.min(wanted, affordable))
}

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

/**
 * 跟随 `devicePixelRatio`。把窗口从内置高分屏拖到外接的普通屏（或反过来）时它会变，
 * 不重渲染的话就会一直糊着、或者白白多画四倍像素。
 *
 * 用 `matchMedia('(resolution: Xdppx)')` 而不是轮询：这个查询在**当前**像素比下为真，
 * 一旦变了就立刻失配、触发 change。每次变化后重新订阅新的值。
 */
function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(() =>
    typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
  )
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(`(resolution: ${ratio}dppx)`)
    const onChange = () => setRatio(window.devicePixelRatio || 1)
    // Safari 14 之前只有 addListener；本仓其它地方（useSqueezeLayout）也做了同样的兼容。
    if (query.addEventListener) query.addEventListener('change', onChange)
    else query.addListener(onChange)
    return () => {
      if (query.removeEventListener) query.removeEventListener('change', onChange)
      else query.removeListener(onChange)
    }
  }, [ratio])
  return ratio
}

export function PdfReader({
  resourceId,
  file,
  toolbarSlot,
}: {
  resourceId: string
  file: OriginalFile
  /**
   * 页码/缩放/「适合宽度」要挂到哪里（TASK-081）。
   *
   * 草图里它们和返回、标题、下载原件、心得在**同一条**工具条上；而这些控件的状态
   * （当前页、缩放、文档尺寸、滚动容器）全都长在这个组件里。与其把那套状态连同
   * TASK-073 的滚动与位置记忆逻辑一起抬到 `ResourceDetail`（改动面大、风险高），
   * 不如让控件本身投递到工具条里的挂载点——状态一行不动。
   *
   * 三态，含义各不相同：
   * - `undefined`（不传）：控件留在阅读器自己头上。单测独立渲染本组件时走这条，
   *   TASK-073 的既有用例因此一字不用改。
   * - `null`：要投递，但挂载点还没挂上（首帧）。这时**什么都不渲染**——渲染在原位
   *   再跳走会闪一下。
   * - 元素：投递过去。
   */
  toolbarSlot?: HTMLElement | null
}) {
  const [doc, setDoc] = useState<Doc | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [sizes, setSizes] = useState<{ width: number; height: number }[]>([])
  const [scale, setScale] = useState(1)
  const [page, setPage] = useState(1)
  const ratio = useDevicePixelRatio()
  const container = useRef<HTMLDivElement>(null)
  const restored = useRef(false)
  /** 最近一次「跳到第 N 页」的意图：滚动稳定在 `top` 上时页码就按它显示。 */
  const pinned = useRef<{ page: number; top: number } | null>(null)
  const frame = useRef(0)

  // --- 取字节并打开 ---
  // 换一份原件就**整个重挂**（父级给 `key={file.id}`），所以这里不用在 effect 里同步重置
  // 状态——同步 setState 会触发级联渲染，项目的 lint 直接禁掉了这种写法。
  //
  // 依赖只看 `file.id`，**不看 `file` 这个对象**（Review F1）：改标签、存学习记录、编辑资料
  // 都会让父级重读资料、给出一个内容相同的新对象；按引用依赖会整份 PDF 重新下载重解析，
  // 而 cleanup 又会 `destroy()` 掉此刻 state 里仍在用的文档，那个窗口里一滚动就是空白页。
  // 拆成基本类型再进依赖：对象引用每次重读资料都会变，这几个值不会（同一份原件不可更换）。
  const { id: fileId, size_bytes: fileSize, media_type: fileType } = file
  useEffect(() => {
    let alive = true
    let opened: Doc | null = null
    void (async () => {
      try {
        const download = await downloadOriginal({
          id: fileId,
          original_name: '',
          size_bytes: fileSize,
          media_type: fileType,
          status: 'READY',
        })
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
  }, [fileId, fileSize, fileType])

  const total = doc?.numPages ?? 0
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

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
    if (!saved || saved.fingerprint !== fileId) return
    const node = container.current
    if (!node) return
    node.scrollTop = scrollTopFor(saved, offsets.tops, offsets.heights, node.clientHeight)
    const wanted = Math.min(saved.page, sizes.length)
    pinned.current = { page: wanted, top: node.scrollTop }
    setPage(wanted)
  }, [sizes, offsets, resourceId, fileId])

  const onScroll = useCallback(() => {
    const node = container.current
    if (!node || !sizes.length) return
    // 按帧节流：滚动事件一秒能来上百次，每次都 `JSON.stringify` + 写 localStorage 会卡顿
    // （Review F2；与正文阅读位置那边同一套做法）。
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const current = container.current
      if (!current) return
      // 跳页是明确的意图：滚动稳定到目标位置之前，页码按用户点的那页显示，别被中线判据改口
      // （Review F4：一页比半个视口还矮时，顶部对齐后中线会落进下一页）。
      const target = pinned.current
      if (target && Math.abs(current.scrollTop - target.top) < 2) {
        setPage(target.page)
        // 页码按意图走，**页内比例仍按真实位置算**：ratio 的定义是视口中线落在页内的比例，
        // 与 `scrollTopFor` 互逆。原本这里写死 0，于是（一）跳页后离开，回来会落在「页顶再往上
        // 半个视口」处，比离开的地方高半屏；（二）恢复位置时赋值 `scrollTop` 触发的这次 scroll
        // 正好命中本分支，把刚读出来的精确比例覆盖成 0——读到一半离开，页内位置就丢了。
        writePdfPosition(resourceId, {
          page: target.page,
          ratio: ratioWithinPage(
            target.page,
            current.scrollTop,
            offsets.tops,
            offsets.heights,
            current.clientHeight,
          ),
          fingerprint: fileId,
        })
        return
      }
      pinned.current = null
      const at = locatePage(current.scrollTop, offsets.tops, offsets.heights, current.clientHeight)
      setPage(at.page)
      writePdfPosition(resourceId, { ...at, fingerprint: fileId })
    })
  }, [offsets, resourceId, sizes.length, fileId])

  const goTo = useCallback(
    (target: number) => {
      const node = container.current
      if (!node || !sizes.length) return
      // 输入框被清空时 `Number('')` 是 0：那不是「跳到第 0 页」，是还没输完（Review F3）。
      if (!Number.isFinite(target) || target < 1) return
      const wanted = Math.min(Math.round(target), sizes.length)
      // 跳页是把那一页的**顶部**带到视口顶（人的预期），并记下这次意图。
      const top = offsets.tops[wanted - 1] ?? 0
      pinned.current = { page: wanted, top }
      node.scrollTop = top
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
  const tools = (
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
          onClick={() => setScale((value) => Math.max(MIN_SCALE, Number((value - 0.1).toFixed(2))))}
        >
          −
        </button>
        <span aria-live="polite">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          className="journal-button"
          aria-label="放大"
          onClick={() => setScale((value) => Math.min(MAX_SCALE, Number((value + 0.1).toFixed(2))))}
        >
          ＋
        </button>
        <button type="button" className="journal-button" onClick={fitWidth}>
          适合宽度
        </button>
      </div>
    </div>
  )

  const pages = (
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
          ratio={ratio}
          near={Math.abs(index + 1 - page) <= NEAR_PAGES}
        />
      ))}
    </div>
  )

  // 控件去了工具条时，这里只剩页面本身——阅读器因此从视口顶部直接开始（TASK-081）。
  if (toolbarSlot !== undefined) {
    return (
      <div className="pdf-reader in-toolbar">
        {toolbarSlot && createPortal(tools, toolbarSlot)}
        {pages}
      </div>
    )
  }
  return (
    <div className="pdf-reader">
      {tools}
      {pages}
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
  ratio,
  near,
}: {
  doc: Doc | null
  number: number
  width: number
  height: number
  scale: number
  /** 屏幕的设备像素比；画布按它加密，CSS 尺寸不变（TASK-082）。 */
  ratio: number
  near: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!doc || !near) return
    let alive = true
    let task: { cancel: () => void } | null = null
    void (async () => {
      // 卸载或换文件时文档已被 `destroy()`，这里的 `getPage` 会抛；没人接就是一条未捕获的
      // rejection（只污染控制台，但没必要留着）。
      const target = await doc.getPage(number).catch(() => null)
      if (!alive || !target) return
      // 先按 CSS 尺寸量这一页，据此决定能加多少密度，再按加密后的比例要视口。
      const css = target.getViewport({ scale })
      const density = pixelDensity(css.width, css.height, ratio)
      const viewport = target.getViewport({ scale: scale * density })
      const node = canvas.current
      const context = node?.getContext('2d')
      if (!node || !context) return
      // 画布开到设备像素；显示尺寸由 CSS 的 `width/height: 100%` 锁在 `.pdf-page` 的框上，
      // 所以这里**不设**内联尺寸——一旦两边都写，缩放时它们会各自舍入、互相打架。
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
  }, [doc, number, scale, ratio, near])
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
