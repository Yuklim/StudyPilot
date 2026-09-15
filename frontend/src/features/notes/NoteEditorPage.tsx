import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { ApiError } from '../../api/client'
import { useHeadingSlot } from '../../shell/heading'
import { Icon } from '../../shell/Icon'
import { failureText, isResourceId } from '../resources/api'
import { renderSnapshot } from '../resources/snapshotMarkdown'
import { MAX_CONTENT, cleanContent, deleteNote, getNote, saveNote, type Note } from './api'
import {
  NoteImageError,
  collapseImages,
  draggingFiles,
  expandImages,
  imageFiles,
  imagePlaceholder,
  imageToMarkdown,
  inlineImageBytes,
} from './noteImages'
import { noteTitle } from './noteTitle'

/** 停笔多久之后自动保存。 */
const AUTOSAVE_DELAY = 1000
const MAX_CHARS = MAX_CONTENT

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'failed'; message: string }
  | { kind: 'conflict' }

/**
 * 整页心得编辑器（TASK-060，用户 2026-09-14「像备忘录 / Typora 那样的编辑页面」，Markdown 选 B）。
 *
 * - 路由 `/notes/new`（新建独立心得；`?resource=<id>` 新建并绑定该资料）与 `/notes/:noteId`
 *   （编辑；`?resource=<id>` 表示这是该资料下的心得——心得接口按绑定分两条路径）。
 * - 沉浸式：外壳不渲染，出口是顶栏的「← 返回」。**每一种状态都恰好一个 `h1`**（路由焦点契约），
 *   标题取第一个非空行（`noteTitle`）。
 * - Markdown B：编辑态是整页 `textarea`（源码），「预览」用与正文快照**同一个**渲染器
 *   （`html:false`），不引入新依赖。
 * - 自动保存：停笔 1s / 失焦 / 切换预览时保存；首次非空 POST，之后 PATCH 带 `expected_version`；
 *   409 停止自动保存并让用户选（重新读取 / 覆盖）；离开前有未保存改动先发一次保存。
 *   **空内容永不创建、永不保存**——备忘录里空白页不会变成一条记录。
 */
export function NoteEditorPage({ noteId }: { noteId?: string }) {
  // 应用没有 <Routes>：路径参数由 `Screen` 用 `useMatch` 取出后以 prop 传入（与阅读器一致）。
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const headingSlot = useHeadingSlot()
  const resourceParam = params.get('resource')
  const scope = resourceParam && isResourceId(resourceParam) ? resourceParam : null
  const creating = noteId === undefined || noteId === 'new'
  // 回来处：独立心得 → 我的心得；绑定资料的心得 → 那份资料的阅读页。
  const backTo = scope ? `/resources/${scope}` : '/notes'
  const backLabel = scope ? '返回资料' : '返回我的心得'

  const [note, setNote] = useState<Note | null>(null)
  // `draft` 是**折叠后**的文本：内嵌图片在写作框里只显示 `![图片](image:N)`（TASK-064，用户
  // 「一串很长的文字很影响书写」），真正的 data URI 在 `gallery[N-1]`；预览、比较、发送都先
  // `expandImages`。存进后端的内容不变。
  const [draft, setDraft] = useState('')
  const [gallery, setGallery] = useState<string[]>([])
  const [loading, setLoading] = useState(!creating)
  const [loadFailure, setLoadError] = useState<unknown>(null)
  // 上一条打不开的错误不带进「新建」（TASK-062 Review F5）：新建页没有读取这回事。
  const loadError = creating ? null : loadFailure
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  const [preview, setPreview] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const alive = useRef(true)
  // 保存要读到**最新**草稿与最新 note，而定时器/卸载回调握着的是旧闭包：走 ref。
  const latest = useRef({ draft, gallery, note, save })
  useEffect(() => {
    latest.current = { draft, gallery, note, save }
  })
  /** 展开后的正文（要发给后端、要与已保存内容比较的那份）。 */
  const source = () => expandImages(latest.current.draft, latest.current.gallery)
  function load(content: string) {
    const { text, images } = collapseImages(content)
    setGallery(images)
    setDraft(text)
    latest.current = { ...latest.current, draft: text, gallery: images }
  }
  const timer = useRef<number | null>(null)
  const inflight = useRef<Promise<void> | null>(null)
  // 读取 effect 要在换到另一条心得前先把手里这条保下来，而 flush 定义在它后面：走 ref。
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // --- 读取（编辑既有心得） ---
  useEffect(() => {
    if (creating) {
      // 从一条既有心得直接换到「新建」而组件没重挂（独立 Review F2）：先把旧的保下来，
      // 再把手里的东西清空，否则继续键入会 PATCH 到旧那条。
      if (latest.current.note) {
        void flushRef.current()
        setNote(null)
        setDraft('')
        setGallery([])
        setSave({ kind: 'idle' })
        setPreview(false)
      }
      return
    }
    // 刚在本页新建、地址已换成 /notes/:id：这条就是手里这条，不再从服务端读回来盖掉
    // 用户在保存期间继续敲的字。换到**另一条**心得（noteId 变了且不是手里这条）才重读，
    // 并把保存状态与预览态归零。
    if (latest.current.note?.id === noteId) return
    // 从一条既有心得直接换到另一条（TASK-060 Review F7）：先把旧的保下来（下面那个卸载保底
    // effect 因 navigate 换了身份也会 flush 一次，这里显式写出意图；inflight 会把两次合成一次）。
    // 保存回调只在「手里仍是那条」时写状态，不会把旧心得写回新地址（见 flush 的 stale）。
    if (latest.current.note) void flushRef.current()
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setSave({ kind: 'idle' })
    setPreview(false)
    setNote(null)
    setDraft('')
    setGallery([])
    getNote(scope, noteId)
      .then((loaded) => {
        if (cancelled) return
        setNote(loaded)
        load(loaded.content)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(cause)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [creating, noteId, scope])

  // --- 保存 ---
  const flush = useCallback((): Promise<void> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    if (inflight.current) return inflight.current
    const { note: current, save: state } = latest.current
    const text = source()
    if (state.kind === 'conflict') return Promise.resolve()
    const cleaned = cleanContent(text)
    // 空内容不创建、不保存；内容与已保存的一样也不发。
    if (!cleaned || [...cleaned].length > MAX_CHARS) return Promise.resolve()
    if (current && cleaned === current.content) return Promise.resolve()
    setSave({ kind: 'saving' })
    // 保存期间可能已经换到另一条心得（F7）：那时手里的 note 不再是 current，结果只算完成，不写状态。
    const stale = () => (latest.current.note?.id ?? null) !== (current?.id ?? null)
    const run = saveNote(scope, text, current)
      .then((saved) => {
        if (!alive.current || stale()) return
        setNote(saved)
        setSave({ kind: 'saved', at: new Date() })
        // 同步写进 ref：紧接着的补排程/卸载保底要拿到刚保存的版本，不能等下一次 commit 的 effect。
        latest.current = { ...latest.current, note: saved, save: { kind: 'saved', at: new Date() } }
        // 新建后把地址换成这条心得的编辑地址：刷新、后退都还在这条上。
        if (!current) {
          // 地址一换，外壳的路由焦点契约通常会把焦点交给 h1；用户此刻正在写作框里打字，
          // 外壳对「焦点在可编辑控件里」的切换不接管（独立 Review F1，见 App.tsx）。
          navigate(`/notes/${saved.id}${scope ? `?resource=${scope}` : ''}`, { replace: true })
        }
      })
      .catch((cause: unknown) => {
        if (!alive.current || stale()) return
        const next: SaveState =
          cause instanceof ApiError && cause.code === 'VERSION_CONFLICT'
            ? { kind: 'conflict' }
            : { kind: 'failed', message: failureText(cause) }
        setSave(next)
        latest.current = { ...latest.current, save: next }
      })
      .finally(() => {
        inflight.current = null
        // 保存进行中又敲了字：那次停笔的 flush 撞上 inflight 直接返回了，这里补排一次
        // （独立 Review F2），否则状态显示「已保存」而最后几句其实没保存。
        if (!alive.current) return
        const { note: current, save: state } = latest.current
        const cleaned = cleanContent(source())
        // **只在这次保存成功后**补排。失败/冲突时草稿必然≠已保存内容，若也补排就是每秒一次的
        // 无限重试（独立 Review F9）；失败由用户下一次键入重排，冲突等用户选。
        // 已换到另一条（F7）：这次结果不算数，但新那条在旧保存占着 inflight 期间可能被敲了字，
        // 也补排一次——只此一次，不构成循环。
        if (
          (state.kind === 'saved' || stale()) &&
          cleaned &&
          cleaned !== (current?.content ?? '')
        ) {
          schedule()
        }
      })
    inflight.current = run
    return run
    // schedule 只用 timer/flush 两个 ref，不需要进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, scope])

  // 在 commit 阶段同步给读取 effect 用（TASK-062 Review F4：不在渲染期写 ref）。
  useLayoutEffect(() => {
    flushRef.current = flush
  }, [flush])
  function schedule() {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      void flush()
    }, AUTOSAVE_DELAY)
  }

  // 离开路由（组件卸载）前把没保存的保下来；关闭标签页时若还有未保存改动，让浏览器问一声。
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      const { note: current } = latest.current
      const cleaned = cleanContent(source())
      if (cleaned && cleaned !== (current?.content ?? '')) {
        void flush()
        event.preventDefault()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      void flush()
    }
  }, [flush])

  // 失败后再次改动会重新排程；冲突则不再自动保存，等用户选。
  const [images, setImages] = useState<{ pending: number; error: string | null }>({
    pending: 0,
    error: null,
  })
  function onChange(value: string) {
    setDraft(value)
    if (latest.current.save.kind === 'failed') setSave({ kind: 'idle' })
    if (latest.current.save.kind !== 'conflict') schedule()
    // 图片没插进去的提示只到下一次改动为止。
    setImages((state) => (state.error ? { ...state, error: null } : state))
  }

  // --- 图片（TASK-063）：粘贴/拖入 → 压缩成 data URI → 作为一行 Markdown 插到光标处 ---
  function insertAtCursor(text: string) {
    const element = textarea.current
    const current = latest.current.draft
    const start = element?.selectionStart ?? current.length
    const end = element?.selectionEnd ?? current.length
    const before = current.slice(0, start)
    const after = current.slice(end)
    // 图片自成一段：前后各保证一个换行，不粘在别的句子上。
    const lead = before && !before.endsWith('\n') ? '\n' : ''
    const trail = after && !after.startsWith('\n') ? '\n' : ''
    const next = before + lead + text + trail + after
    onChange(next)
    // 连续插几张：下一张要接在这张后面，不能等下一次 commit 才更新。
    latest.current = { ...latest.current, draft: next }
    const caret = (before + lead + text + trail).length
    window.setTimeout(() => {
      if (textarea.current === element && element) {
        element.setSelectionRange(caret, caret)
        element.focus()
      }
    }, 0)
  }
  async function insertImages(files: File[]) {
    if (files.length === 0) return
    setImages((state) => ({ pending: state.pending + files.length, error: null }))
    for (const file of files) {
      try {
        const line = await imageToMarkdown(file)
        if (!alive.current) return
        // 写作框里只放占位符；data URI 进图片表（TASK-064）。同步写进 ref：连续几张要接着编号。
        const { images } = collapseImages(line)
        const url = images[0]
        if (url === undefined) throw new NoteImageError('DECODE_FAILED', '这张图无法处理。')
        const next = [...latest.current.gallery, url]
        setGallery(next)
        latest.current = { ...latest.current, gallery: next }
        insertAtCursor(imagePlaceholder('图片', next.length))
      } catch (cause) {
        if (!alive.current) return
        const message = cause instanceof NoteImageError ? cause.message : '这张图无法处理。'
        setImages((state) => ({ ...state, error: message }))
      } finally {
        if (alive.current) setImages((state) => ({ ...state, pending: state.pending - 1 }))
      }
    }
  }
  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = imageFiles(event.clipboardData)
    if (files.length === 0) return
    // 剪贴板同时带着文字（Excel/Word 复制单元格常见）：用户要的是文字，走默认粘贴
    // （独立 Review F2）；只有图片时才接管。
    if (event.clipboardData.getData('text/plain').trim()) return
    event.preventDefault()
    void insertImages(files)
  }
  function onDrop(event: React.DragEvent<HTMLTextAreaElement>) {
    const files = imageFiles(event.dataTransfer)
    if (files.length === 0) {
      // dragover 已放行了文件拖拽：不接住的话浏览器会打开那个文件（TASK-063 Review F7）。
      if (!draggingFiles(event.dataTransfer)) return
      event.preventDefault()
      setImages((state) => ({ ...state, error: '只支持 PNG、JPEG、GIF 或 WebP 图片。' }))
      return
    }
    event.preventDefault()
    void insertImages(files)
  }

  async function reload() {
    if (!note) return
    try {
      const fresh = await getNote(scope, note.id)
      if (!alive.current) return
      setNote(fresh)
      load(fresh.content)
      setSave({ kind: 'idle' })
    } catch (cause) {
      if (alive.current) setSave({ kind: 'failed', message: failureText(cause) })
    }
  }
  async function overwrite() {
    if (!note) return
    try {
      // 先拿到对方的版本号，再用自己的内容覆盖：版本化写仍然成立，只是明确以我为准。
      const fresh = await getNote(scope, note.id)
      if (!alive.current) return
      setNote(fresh)
      setSave({ kind: 'idle' })
      latest.current = { ...latest.current, note: fresh, save: { kind: 'idle' } }
      await flush()
    } catch (cause) {
      if (alive.current) setSave({ kind: 'failed', message: failureText(cause) })
    }
  }

  async function remove() {
    if (!note || deleting) return
    setDeleting(true)
    try {
      await deleteNote(scope, note)
      if (!alive.current) return
      // 已删除：卸载时的保底保存不能再把它写回去。
      latest.current = { draft: '', gallery: [], note: null, save: { kind: 'idle' } }
      setDraft('')
      setGallery([])
      navigate(backTo)
    } catch (cause) {
      if (!alive.current) return
      setDeleting(false)
      setConfirmDelete(false)
      setSave({ kind: 'failed', message: failureText(cause) })
    }
  }

  // 新建：焦点进写作框。路由切换后的焦点先落在 h1（外壳的契约），随后把它交给写作框——
  // 用户按快捷键/点「写心得」的意图就是立刻开始写；编辑既有心得则维持 h1 落点。
  useEffect(() => {
    if (!creating) return
    const handle = window.setTimeout(() => textarea.current?.focus(), 0)
    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc 关菜单/确认。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (confirmDelete) {
        if (!deleting) setConfirmDelete(false)
      } else if (menuOpen) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [confirmDelete, deleting, menuOpen])

  const title = noteTitle(draft)
  const heading = title ?? (creating && !note ? '新心得' : '无标题心得')
  // 展开后的正文：预览、长度与「含图片约 N MB」都按它算（写作框里只有占位符）。
  const expanded = useMemo(() => expandImages(draft, gallery), [draft, gallery])
  // 预览：与正文快照同一渲染器；页面 h1 已经是第一行，正文开头同名的 `#` 标题不再渲染一遍
  // （TASK-053 的去重规则同样适用）。
  const rendered = useMemo(
    () =>
      preview
        ? renderSnapshot(expanded, new Map(), null, { pageTitle: title, inlineImages: true })
        : '',
    [preview, expanded, title],
  )
  const length = [...cleanContent(expanded)].length
  const tooLong = length > MAX_CHARS

  const status = (() => {
    if (tooLong) {
      const imageBytes = inlineImageBytes(expanded)
      return imageBytes > 0
        ? `正文过大（含图片约 ${(imageBytes / 1024 / 1024).toFixed(1)} MB），删掉一些图片才会保存`
        : `超过 ${MAX_CHARS.toLocaleString()} 字，删减到上限内才会保存`
    }
    if (images.pending > 0) return '正在处理图片…'
    if (images.error) return images.error
    switch (save.kind) {
      case 'saving':
        return '正在保存…'
      case 'saved':
        return `已保存 ${save.at.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
      case 'failed':
        return `保存失败：${save.message}`
      case 'conflict':
        return '这条心得已在别处修改'
      default:
        return note ? '' : '开始输入后自动保存'
    }
  })()

  return (
    <section className="note-editor-page" aria-label="心得编辑">
      <div className="note-editor-bar">
        <Link className="text-link reader-back" to={backTo}>
          <span aria-hidden="true">← </span>
          <span className="reader-back-text">{backLabel}</span>
        </Link>
        <span className="note-editor-status" role="status" aria-live="polite">
          {status}
        </span>
        <div className="note-editor-actions">
          {save.kind === 'conflict' && (
            <>
              <button type="button" className="journal-button" onClick={() => void reload()}>
                重新读取
              </button>
              <button type="button" className="journal-button" onClick={() => void overwrite()}>
                覆盖为我的版本
              </button>
            </>
          )}
          <button
            type="button"
            className="journal-button"
            aria-pressed={preview}
            onClick={() => {
              if (!preview) void flush()
              setPreview(!preview)
            }}
          >
            {preview ? '编辑' : '预览'}
          </button>
          <div className="note-editor-more">
            <button
              type="button"
              className="journal-button icon-button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="更多操作"
              title="更多操作"
              disabled={!note}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Icon name="more" />
            </button>
            {menuOpen && (
              <div className="reader-menu" role="menu" aria-label="更多操作">
                <button
                  type="button"
                  role="menuitem"
                  className="reader-menu-item danger"
                  onClick={() => {
                    setMenuOpen(false)
                    setConfirmDelete(true)
                  }}
                >
                  删除心得…
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="note-editor-body">
        <h1 className="note-editor-title" ref={headingSlot} tabIndex={-1}>
          {loading ? '正在打开心得' : loadError !== null ? '这条心得打不开' : heading}
        </h1>
        {loading && <p role="status">正在打开这条心得…</p>}
        {loadError !== null && (
          <div className="resource-error" role="alert">
            <p>{failureText(loadError)}</p>
          </div>
        )}
        {!loading && loadError === null && (
          <>
            {scope && (
              <p className="resource-hint note-editor-scope">
                这条心得绑定在一份资料上；
                <Link to={`/resources/${scope}`}>打开那份资料</Link>。
              </p>
            )}
            {preview ? (
              <div
                className="snapshot-rendered note-editor-preview"
                aria-label="预览"
                // 与正文快照同一渲染器、同一 `html:false` 配置：原始 HTML 被转义成字面文本。
                dangerouslySetInnerHTML={{
                  __html: rendered || '<p class="resource-hint">还没有内容。</p>',
                }}
              />
            ) : (
              <textarea
                ref={textarea}
                className="note-editor-textarea"
                aria-label="心得正文（Markdown）"
                placeholder="写下此刻的理解、疑问或下一步。支持 Markdown，可直接粘贴图片，停笔后自动保存。"
                value={draft}
                onChange={(event) => onChange(event.target.value)}
                onBlur={() => void flush()}
                onPaste={onPaste}
                onDrop={onDrop}
                onDragOver={(event) => {
                  // dragover 阶段拿不到文件本身（protected mode），只能看 types（独立 Review F1）。
                  if (draggingFiles(event.dataTransfer)) event.preventDefault()
                }}
                spellCheck={false}
              />
            )}
            {!preview && gallery.length > 0 && (
              <p className="resource-hint note-editor-images-hint">
                图片在这里显示为 <code>![图片](image:N)</code>{' '}
                占位，预览和保存时会还原；删掉占位符就是删掉那张图。
              </p>
            )}
          </>
        )}
      </div>

      {confirmDelete && note && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) setConfirmDelete(false)
          }}
        >
          <div
            className="modal-dialog deletion-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="note-delete-title"
          >
            <h2 id="note-delete-title">删除“{heading}”？</h2>
            <div className="deletion-dialog-body">
              <p className="deletion-warning">删除后不可恢复。</p>
            </div>
            <div className="resource-actions">
              <button
                type="button"
                className="journal-button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                取消
              </button>
              <button
                type="button"
                className="journal-button danger"
                onClick={() => void remove()}
                disabled={deleting}
              >
                {deleting ? '正在删除…' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
