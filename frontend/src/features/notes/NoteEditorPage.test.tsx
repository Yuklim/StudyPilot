import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../App'
import { ApiError, api } from '../../api/client'
import { renderWithRouter } from '../../test/render'
import { resourceId, sample } from '../resources/fixtures'
import type { Note } from './api'
import { note as boundNote } from './fixtures'
import { NoteImageError, imageToMarkdown } from './noteImages'

// 图片压缩链路（解码/canvas/编码）在 jsdom 里不存在，由 noteImages.test 用桩守；这里只换掉
// 那一个函数，粘贴事件的识别、插入位置、状态文案与自动保存都是真的。
vi.mock('./noteImages', async (original) => ({
  ...(await original<typeof import('./noteImages')>()),
  imageToMarkdown: vi.fn(),
}))
const convert = vi.mocked(imageToMarkdown)

/** 独立心得（`resource_id` 为 null）；`getNote(null, …)` 会校验返回的绑定必须与请求一致。 */
const note = (overrides: Partial<Note> = {}): Note => boundNote({ resource_id: null, ...overrides })

/**
 * 整页心得编辑器（TASK-060，用户 2026-09-14）。契约（`content` 纯文本、版本化写）不变；
 * 这里守的是页面行为：自动保存三态、冲突处置、离开前保底、预览安全、快捷入口。
 */
const noteId = note().id
type Handler = (path: string, options?: { method?: string; body?: unknown }) => unknown
function mock(handler: Handler) {
  return vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
    const out = handler(path, options as { method?: string; body?: unknown })
    if (out instanceof Error) throw out
    return out
  })
}
const editor = () => screen.getByRole('textbox', { name: '心得正文（Markdown）' })
const status = () => screen.getByRole('status')
const type = (text: string) => fireEvent.change(editor(), { target: { value: text } })
/** 让自动保存的 1s 定时器走完，并把随后的 promise 都跑掉。 */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100)
  })
}

describe('note editor page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('inserts a pasted image as its own Markdown line at the caret and autosaves it (TASK-063)', async () => {
    const png = new File([new Uint8Array(8)], 'shot.png', { type: 'image/png' })
    const clipboardData = {
      items: [{ kind: 'file', getAsFile: () => png }],
      files: [png],
      getData: () => '',
    }
    let release!: (line: string) => void
    convert.mockImplementationOnce(
      () =>
        new Promise<string>((done) => {
          release = done
        }),
    )
    const posts: unknown[] = []
    mock((path, options) => {
      if (path === '/api/v1/notes' && options?.method === 'POST') {
        posts.push(options.body)
        return { data: note({ content: (options.body as { content: string }).content }) }
      }
      return { data: [] }
    })
    renderWithRouter(<App />, '/notes/new')
    type('前文')
    const box = editor() as HTMLTextAreaElement
    box.setSelectionRange(2, 2)
    // 有图片的粘贴被接管（默认动作取消）；纯文本粘贴不受影响。
    expect(fireEvent.paste(box, { clipboardData })).toBe(false)
    expect(
      fireEvent.paste(box, { clipboardData: { items: [], files: [], getData: () => '' } }),
    ).toBe(true)
    expect(convert).toHaveBeenCalledWith(png)
    expect(status()).toHaveTextContent('正在处理图片…')
    await act(async () => {
      release('![图片](data:image/webp;base64,AAAA)')
    })
    // 写作框里只有占位符（TASK-064）；发出去的是真正的 data URI。
    expect(editor()).toHaveValue('前文\n![图片](image:1)')
    expect(screen.getByText(/图片在这里显示为/)).toBeInTheDocument()
    expect(status()).not.toHaveTextContent('正在处理图片')
    await settle()
    expect(posts).toEqual([{ content: '前文\n![图片](data:image/webp;base64,AAAA)' }])
  })

  it('collapses inline images to placeholders when opening a note and expands them on save (TASK-064)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const a = 'data:image/webp;base64,AAAA'
    const b = 'data:image/png;base64,BBBB'
    // 服务端存的是去首尾空白后的正文：夹具不能带尾换行，否则「没改」也会因修剪而不等。
    const content = `# 带图\n\n![截图](${a})\n中间\n![](${b})`
    const patches: unknown[] = []
    mock((path, options) => {
      if (path === `/api/v1/notes/${noteId}` && options?.method === 'PATCH') {
        patches.push(options.body)
        return {
          data: note({ content: (options.body as { content: string }).content, version: 2 }),
        }
      }
      if (path === `/api/v1/notes/${noteId}`) return { data: note({ content }) }
      return { data: [] }
    })
    renderWithRouter(<App />, `/notes/${noteId}`)
    await screen.findByDisplayValue(/带图/)
    expect(editor()).toHaveValue('# 带图\n\n![截图](image:1)\n中间\n![](image:2)')
    // 没改：不发。
    await settle()
    expect(patches).toEqual([])
    // 预览按展开后的正文渲染。
    fireEvent.click(screen.getByRole('button', { name: '预览' }))
    const imgs = screen.getByLabelText('预览').querySelectorAll('img')
    expect([...imgs].map((img) => img.getAttribute('src'))).toEqual([a, b])
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    // 删掉第一张的占位符 = 删掉那张图；第二张编号不变、仍回填。
    type('# 带图\n\n中间\n![](image:2)')
    await settle()
    expect(patches).toEqual([{ content: `# 带图\n\n中间\n![](${b})`, expected_version: 1 }])
    vi.useRealTimers()
  })

  it('accepts a dropped image and leaves a text-plus-image paste to the browser (Review F1/F2)', async () => {
    const png = new File([new Uint8Array(8)], 'shot.png', { type: 'image/png' })
    convert.mockResolvedValueOnce('![图片](data:image/webp;base64,BBBB)')
    mock(() => ({ data: [] }))
    renderWithRouter(<App />, '/notes/new')
    type('正文')
    const box = editor()
    // dragover 阶段只有 types：必须据此 preventDefault，否则 drop 不会触发。
    expect(
      fireEvent.dragOver(box, {
        dataTransfer: {
          types: ['Files'],
          files: [],
          items: [{ kind: 'file', getAsFile: () => null }],
        },
      }),
    ).toBe(false)
    expect(fireEvent.dragOver(box, { dataTransfer: { types: ['text/plain'], items: [] } })).toBe(
      true,
    )
    await act(async () => {
      fireEvent.drop(box, {
        dataTransfer: {
          types: ['Files'],
          files: [png],
          items: [{ kind: 'file', getAsFile: () => png }],
        },
      })
    })
    expect(editor()).toHaveValue('正文\n![图片](image:1)')
    // 拖入非图片文件：接住（否则浏览器会打开它）并提示。
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' })
    expect(
      fireEvent.drop(box, {
        dataTransfer: {
          types: ['Files'],
          files: [txt],
          items: [{ kind: 'file', getAsFile: () => txt }],
        },
      }),
    ).toBe(false)
    expect(status()).toHaveTextContent('只支持 PNG、JPEG、GIF 或 WebP 图片。')
    // 文字 + 图片一起粘贴（复制表格单元格）：不接管，浏览器按默认贴文字。
    convert.mockClear()
    expect(
      fireEvent.paste(box, {
        clipboardData: {
          items: [{ kind: 'file', getAsFile: () => png }],
          files: [png],
          getData: (t: string) => (t === 'text/plain' ? '单元格文字' : ''),
        },
      }),
    ).toBe(true)
    expect(convert).not.toHaveBeenCalled()
  })

  it('explains an over-limit body in terms of its images (TASK-063)', async () => {
    mock(() => ({ data: [] }))
    renderWithRouter(<App />, '/notes/new')
    type(`看图\n![图片](data:image/webp;base64,${'A'.repeat(2_000_000)})`)
    expect(status()).toHaveTextContent(/正文过大（含图片约 1\.4 MB），删掉一些图片才会保存/)
    type('x'.repeat(2_000_001))
    expect(status()).toHaveTextContent('超过 2,000,000 字，删减到上限内才会保存')
  })

  it('reports an image that cannot be inserted and leaves the text untouched (TASK-063)', async () => {
    const big = new File([new Uint8Array(8)], 'big.png', { type: 'image/png' })
    convert.mockRejectedValueOnce(new NoteImageError('IMAGE_TOO_LARGE', '这张图太大，没有插入。'))
    mock(() => ({ data: [] }))
    renderWithRouter(<App />, '/notes/new')
    type('文字')
    await act(async () => {
      fireEvent.paste(editor(), {
        clipboardData: {
          items: [{ kind: 'file', getAsFile: () => big }],
          files: [big],
          getData: () => '',
        },
      })
    })
    expect(status()).toHaveTextContent('这张图太大，没有插入。')
    expect(editor()).toHaveValue('文字')
    // 再敲字提示让位给保存状态。
    type('文字 continued')
    expect(status()).not.toHaveTextContent('这张图太大')
  })

  it('creates on the first non-empty pause, then patches with the version, and never saves unchanged text', async () => {
    const calls: Array<{ method?: string; body?: unknown; path: string }> = []
    let version = 0
    const request = mock((path, options) => {
      calls.push({ path, method: options?.method, body: options?.body })
      if (path === '/api/v1/notes' && options?.method === 'POST') {
        version = 1
        return { data: note({ content: (options.body as { content: string }).content, version }) }
      }
      if (path === `/api/v1/notes/${noteId}` && options?.method === 'PATCH') {
        version += 1
        return { data: note({ content: (options.body as { content: string }).content, version }) }
      }
      return { data: [] }
    })
    renderWithRouter(<App />, '/notes/new')
    expect(screen.getByRole('heading', { name: '新心得', level: 1 })).toBeInTheDocument()
    expect(status()).toHaveTextContent('开始输入后自动保存')
    // 空白不创建。
    type('   \n  ')
    await settle()
    expect(request).not.toHaveBeenCalled()
    // 首次非空 → POST；标题跟着第一行走；地址换成这条心得。（先把焦点放进写作框：真实用户
    // 是在里面打字的，下面「保存后焦点仍在写作框」的断言才有意义。）
    editor().focus()
    type('# 第一行\n\n正文')
    expect(screen.getByRole('heading', { name: '第一行', level: 1 })).toBeInTheDocument()
    await settle()
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ content: '# 第一行\n\n正文' })
    expect(status()).toHaveTextContent(/已保存/)
    // 首次保存把地址换成 /notes/:id——外壳的路由焦点契约会想把焦点交给 h1；用户此刻还在写，
    // 焦点必须留在写作框（独立 Review F1：否则接着敲的字落在标题上）。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5)
    })
    expect(editor()).toHaveFocus()
    // 再改 → PATCH 带 expected_version=1。
    type('# 第一行\n\n正文，再补一句')
    await settle()
    const patches = calls.filter((c) => c.method === 'PATCH')
    expect(patches).toHaveLength(1)
    expect(patches[0]?.body).toEqual({ content: '# 第一行\n\n正文，再补一句', expected_version: 1 })
    // 内容未变 → 不发：失焦与切换预览都会触发 flush，但相等守卫挡住（同值 change 事件
    // 在 React 里根本不触发 onChange，不能拿它来验这一条——独立 Review F6）。
    fireEvent.blur(editor())
    fireEvent.click(screen.getByRole('button', { name: '预览' }))
    await settle()
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    // 写作框里的字一直是用户的，没有被保存结果盖掉。
    expect(editor()).toHaveValue('# 第一行\n\n正文，再补一句')
  })

  it('re-schedules a save for text typed while a save was still in flight', async () => {
    // 独立 Review F2：保存请求进行中又敲了字，那次停笔的 flush 撞上 inflight 直接返回；
    // 请求完成后必须补排一次，否则状态「已保存」而最后几句没保存。用既有心得 + 慢 PATCH
    // 复现（新建那一路会因地址切换顺带触发一次保底 flush，测不到这个缺口）。
    let release: (() => void) | undefined
    const bodies: unknown[] = []
    let version = 1
    mock((path, options) => {
      if (path === `/api/v1/notes/${noteId}` && options?.method === 'PATCH') {
        bodies.push(options.body)
        const content = (options.body as { content: string }).content
        if (bodies.length === 1)
          return new Promise((resolve) => {
            release = () => resolve({ data: note({ content, version: ++version }) })
          })
        return { data: note({ content, version: ++version }) }
      }
      if (path === `/api/v1/notes/${noteId}`) return { data: note({ content: '原文' }) }
      return { data: [] }
    })
    renderWithRouter(<App />, `/notes/${noteId}`)
    await screen.findByRole('heading', { name: '原文', level: 1 })
    type('原文，第一段')
    await settle()
    expect(bodies).toEqual([{ content: '原文，第一段', expected_version: 1 }])
    expect(status()).toHaveTextContent('正在保存')
    // PATCH 还没回来，继续写并停笔：不会再发（inflight），也不会丢。
    type('原文，第一段，第二段')
    await settle()
    expect(bodies).toHaveLength(1)
    release!()
    await settle()
    expect(bodies[1]).toEqual({ content: '原文，第一段，第二段', expected_version: 2 })
    expect(status()).toHaveTextContent(/已保存/)
    expect(editor()).toHaveValue('原文，第一段，第二段')
  })

  it('does not retry a failed save on its own, only after the next keystroke', async () => {
    // 独立 Review F9：失败后草稿必然≠已保存内容，若保存结束时一律补排就成了每秒一次的
    // 无限重试。失败态只等用户再敲一次。
    let attempts = 0
    mock((path, options) => {
      if (path === `/api/v1/notes/${noteId}` && options?.method === 'PATCH') {
        attempts += 1
        if (attempts < 3) return new ApiError('NETWORK_ERROR')
        return {
          data: note({ content: (options.body as { content: string }).content, version: 2 }),
        }
      }
      if (path === `/api/v1/notes/${noteId}`) return { data: note({ content: '原文' }) }
      return { data: [] }
    })
    renderWithRouter(<App />, `/notes/${noteId}`)
    await screen.findByRole('heading', { name: '原文', level: 1 })
    type('原文，改一下')
    await settle()
    expect(attempts).toBe(1)
    expect(status()).toHaveTextContent('保存失败')
    // 再等两个周期：没有自动重试。
    await settle()
    await settle()
    expect(attempts).toBe(1)
    // 再敲一次 → 重试一次（这次还失败）→ 再敲 → 成功。
    type('原文，改一下，再改')
    await settle()
    expect(attempts).toBe(2)
    type('原文，改一下，再改，好了')
    await settle()
    expect(attempts).toBe(3)
    expect(status()).toHaveTextContent(/已保存/)
  })

  it('keeps one h1 and a way back when the note cannot be read', async () => {
    mock((path) => {
      if (path === `/api/v1/notes/${noteId}`) return new ApiError('NETWORK_ERROR')
      return { data: [] }
    })
    renderWithRouter(<App />, `/notes/${noteId}`)
    expect(
      await screen.findByRole('heading', { name: '这条心得打不开', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('连接失败')
    expect(screen.getByRole('link', { name: '返回我的心得' })).toHaveAttribute('href', '/notes')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('opens an existing standalone note and a resource-bound one on their own paths', async () => {
    const request = mock((path) => {
      if (path === `/api/v1/notes/${noteId}`) return { data: note({ content: '独立的一条' }) }
      if (path === `/api/v1/resources/${resourceId}/notes/${noteId}`)
        return { data: boundNote({ content: '绑定的一条', resource_id: resourceId }) }
      return { data: [] }
    })
    const view = renderWithRouter(<App />, `/notes/${noteId}`)
    expect(screen.getByRole('heading', { name: '正在打开心得', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '独立的一条', level: 1 })).toBeInTheDocument()
    expect(editor()).toHaveValue('独立的一条')
    expect(screen.getByRole('link', { name: '返回我的心得' })).toHaveAttribute('href', '/notes')
    view.unmount()
    renderWithRouter(<App />, `/notes/${noteId}?resource=${resourceId}`)
    expect(await screen.findByRole('heading', { name: '绑定的一条', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回资料' })).toHaveAttribute(
      'href',
      `/resources/${resourceId}`,
    )
    expect(request.mock.calls.map(([p]) => p)).toContain(
      `/api/v1/resources/${resourceId}/notes/${noteId}`,
    )
  })

  it('stops autosaving on a version conflict and lets the user reload or overwrite', async () => {
    let theirs = note({ content: '别处改过的', version: 2 })
    const patches: unknown[] = []
    mock((path, options) => {
      if (path === `/api/v1/notes/${noteId}` && options?.method === 'PATCH') {
        patches.push(options.body)
        const body = options.body as { expected_version: number; content: string }
        if (body.expected_version !== theirs.version) return new ApiError('VERSION_CONFLICT', 409)
        theirs = note({ content: body.content, version: theirs.version + 1 })
        return { data: theirs }
      }
      if (path === `/api/v1/notes/${noteId}`) return { data: theirs }
      return { data: [] }
    })
    // 打开时拿到的是 version 2；随后「别处」把它推到 3。
    renderWithRouter(<App />, `/notes/${noteId}`)
    await screen.findByRole('heading', { name: '别处改过的', level: 1 })
    theirs = note({ content: '别处又改了', version: 3 })
    type('我的改动')
    await settle()
    expect(status()).toHaveTextContent('这条心得已在别处修改')
    expect(patches).toHaveLength(1)
    // 冲突后再敲字**不再**自动保存。
    type('我的改动，继续写')
    await settle()
    expect(patches).toHaveLength(1)
    // 覆盖为我的版本：先取最新版本号，再以我的内容 PATCH。
    fireEvent.click(screen.getByRole('button', { name: '覆盖为我的版本' }))
    await waitFor(() => expect(patches).toHaveLength(2))
    expect(patches[1]).toEqual({ content: '我的改动，继续写', expected_version: 3 })
    await waitFor(() => expect(status()).toHaveTextContent(/已保存/))
    expect(editor()).toHaveValue('我的改动，继续写')
  })

  it("reloads the other side's text when asked to, discarding local edits", async () => {
    const theirs = note({ content: '别处的版本', version: 5 })
    mock((path, options) => {
      if (path === `/api/v1/notes/${noteId}` && options?.method === 'PATCH')
        return new ApiError('VERSION_CONFLICT', 409)
      if (path === `/api/v1/notes/${noteId}`) return { data: theirs }
      return { data: [] }
    })
    renderWithRouter(<App />, `/notes/${noteId}`)
    await screen.findByRole('heading', { name: '别处的版本', level: 1 })
    type('本地改动')
    await settle()
    expect(status()).toHaveTextContent('这条心得已在别处修改')
    fireEvent.click(screen.getByRole('button', { name: '重新读取' }))
    await waitFor(() => expect(editor()).toHaveValue('别处的版本'))
    expect(status()).not.toHaveTextContent('已在别处修改')
  })

  it('flushes a pending save when leaving the page', async () => {
    const posts: unknown[] = []
    mock((path, options) => {
      if (path === '/api/v1/notes' && options?.method === 'POST') {
        posts.push(options.body)
        return { data: note({ content: (options.body as { content: string }).content }) }
      }
      if (path.startsWith('/api/v1/notes?'))
        return {
          data: [],
          page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
        }
      return { data: [] }
    })
    renderWithRouter(<App />, '/notes/new')
    type('还没停笔就走了')
    // 不等 1s，直接点返回：卸载前保底保存要把它发出去。
    fireEvent.click(screen.getByRole('link', { name: '返回我的心得' }))
    await waitFor(() => expect(posts).toEqual([{ content: '还没停笔就走了' }]))
  })

  it('renders the preview with the same escaping renderer and does not repeat the title line', async () => {
    mock((path) => {
      if (path === `/api/v1/notes/${noteId}`)
        return { data: note({ content: '# 标题行\n\n**粗** <script>alert(1)</script>\n' }) }
      return { data: [] }
    })
    renderWithRouter(<App />, `/notes/${noteId}`)
    await screen.findByRole('heading', { name: '标题行', level: 1 })
    fireEvent.click(screen.getByRole('button', { name: '预览' }))
    const view = screen.getByLabelText('预览')
    expect(within(view).getByText('粗').tagName).toBe('STRONG')
    expect(view.querySelector('script')).toBeNull()
    expect(view.textContent).toContain('<script>alert(1)</script>')
    // 页面 h1 已是第一行；预览里不再出现同名 h1。
    expect(view.querySelector('h1')).toBeNull()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    expect(editor()).toHaveValue('# 标题行\n\n**粗** <script>alert(1)</script>\n')
  })

  it('deletes after one confirmation and returns to where it came from', async () => {
    const deleted: string[] = []
    mock((path, options) => {
      if (path === `/api/v1/notes/${noteId}` && options?.method === 'DELETE') {
        deleted.push(path)
        return undefined
      }
      if (path === `/api/v1/notes/${noteId}`) return { data: note({ content: '要删的' }) }
      if (path.startsWith('/api/v1/notes?'))
        return {
          data: [],
          page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
        }
      return { data: [] }
    })
    renderWithRouter(<App />, `/notes/${noteId}`)
    await screen.findByRole('heading', { name: '要删的', level: 1 })
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '删除心得…' }))
    const dialog = screen.getByRole('dialog', { name: '删除“要删的”？' })
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))
    await waitFor(() => expect(deleted).toHaveLength(1))
    expect(await screen.findByRole('heading', { name: '我的心得', level: 1 })).toBeInTheDocument()
  })
})

describe('write-note entry points', () => {
  it('binds the new note to the resource open in the reader', async () => {
    mock((path) => {
      if (path === `/api/v1/resources/${resourceId}`) return { data: sample() }
      if (path.startsWith(`/api/v1/resources/${resourceId}/notes?`))
        return {
          data: [],
          page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
        }
      return { data: [] }
    })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByRole('button', { name: '更多操作' })
    fireEvent.keyDown(document, { key: 'j', metaKey: true })
    expect(await screen.findByRole('heading', { name: '新心得', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回资料' })).toHaveAttribute(
      'href',
      `/resources/${resourceId}`,
    )
    expect(screen.getByText(/这条心得绑定在一份资料上/)).toBeInTheDocument()
  })

  it('asks before ⌘J leaves a dirty reader draft behind, and stays put on cancel (TASK-062)', async () => {
    mock((path) => {
      if (path === `/api/v1/resources/${resourceId}`) return { data: sample() }
      if (path.startsWith(`/api/v1/resources/${resourceId}/notes?`))
        return {
          data: [],
          page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
        }
      return { data: [] }
    })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    const notes = await screen.findByRole('form', { name: '心得编辑' })
    fireEvent.change(within(notes).getByRole('textbox'), { target: { value: '侧栏里写到一半' } })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.keyDown(document, { key: 'j', metaKey: true })
    expect(confirm).toHaveBeenCalledOnce()
    expect(screen.queryByRole('heading', { name: '新心得', level: 1 })).toBeNull()
    expect(within(screen.getByRole('form', { name: '心得编辑' })).getByRole('textbox')).toHaveValue(
      '侧栏里写到一半',
    )
    confirm.mockReturnValue(true)
    fireEvent.keyDown(document, { key: 'j', metaKey: true })
    expect(await screen.findByRole('heading', { name: '新心得', level: 1 })).toBeInTheDocument()
  })

  it('saves the note in hand before switching to another noteId, and a late result never lands on the new one (TASK-062)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const other = note({ id: '018f1f58-4eb2-4a0d-a716-fb81b1960bbb', content: '另一条' })
    const calls: Array<{ path: string; method?: string; body?: unknown }> = []
    let release!: () => void
    const slow = new Promise<void>((done) => {
      release = done
    })
    mock((path, options) => {
      calls.push({ path, method: options?.method, body: options?.body })
      const content = (options?.body as { content?: string } | undefined)?.content ?? ''
      // 旧那条的 PATCH 很慢：要等到新那条已经读进来之后才返回。
      if (path === `/api/v1/notes/${noteId}` && options?.method === 'PATCH')
        return slow.then(() => ({ data: note({ content, version: 2 }) }))
      if (path === `/api/v1/notes/${other.id}` && options?.method === 'PATCH')
        return { data: { ...other, content, version: 2 } }
      if (path === `/api/v1/notes/${noteId}`) return { data: note() }
      if (path === `/api/v1/notes/${other.id}`) return { data: other }
      return { data: [] }
    })
    let go!: (to: string) => void
    function Probe() {
      go = useNavigate()
      return null
    }
    render(
      <MemoryRouter initialEntries={[`/notes/${noteId}`]}>
        <App />
        <Probe />
      </MemoryRouter>,
    )
    await screen.findByDisplayValue(note().content)
    type('改了还没到停笔')
    await act(async () => {
      go(`/notes/${other.id}`)
    })
    await screen.findByDisplayValue('另一条')
    // 旧那条已用旧版本号发出保存。
    const patches = () => calls.filter((c) => c.method === 'PATCH')
    expect(patches()).toEqual([
      {
        path: `/api/v1/notes/${noteId}`,
        method: 'PATCH',
        body: { content: '改了还没到停笔', expected_version: 1 },
      },
    ])
    // 慢结果这时才回来：不能把旧那条当成手里这条。
    await act(async () => {
      release()
      await Promise.resolve()
    })
    expect(editor()).toHaveValue('另一条')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('另一条')
    type('另一条 补一句')
    await settle()
    expect(patches()).toHaveLength(2)
    expect(patches()[1]).toEqual({
      path: `/api/v1/notes/${other.id}`,
      method: 'PATCH',
      body: { content: '另一条 补一句', expected_version: 1 },
    })
    vi.useRealTimers()
  })

  it('saves and clears the note in hand when the address turns into /notes/new without a remount (TASK-062)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const calls: Array<{ path: string; method?: string; body?: unknown }> = []
    mock((path, options) => {
      calls.push({ path, method: options?.method, body: options?.body })
      const content = (options?.body as { content?: string } | undefined)?.content ?? ''
      if (path === `/api/v1/notes/${noteId}` && options?.method === 'PATCH')
        return { data: note({ content, version: 2 }) }
      if (path === `/api/v1/notes/${noteId}`) return { data: note() }
      if (path === '/api/v1/notes' && options?.method === 'POST')
        return { data: note({ id: '018f1f58-4eb2-4a0d-a716-fb81b1960ccc', content, version: 1 }) }
      return { data: [] }
    })
    let go!: (to: string) => void
    function Probe() {
      go = useNavigate()
      return null
    }
    render(
      <MemoryRouter initialEntries={[`/notes/${noteId}`]}>
        <App />
        <Probe />
      </MemoryRouter>,
    )
    await screen.findByDisplayValue(note().content)
    type('旧那条改了一笔')
    await act(async () => {
      go('/notes/new')
    })
    expect(editor()).toHaveValue('')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('新心得')
    expect(calls.filter((c) => c.method === 'PATCH')).toEqual([
      {
        path: `/api/v1/notes/${noteId}`,
        method: 'PATCH',
        body: { content: '旧那条改了一笔', expected_version: 1 },
      },
    ])
    type('全新的一条')
    await settle()
    // 新内容走 POST 新建，而不是 PATCH 到旧那条。
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1)
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ content: '全新的一条' })
    vi.useRealTimers()
  })

  it('offers a sidebar link and a global shortcut that binds to the open resource', async () => {
    mock((path) => {
      if (path === `/api/v1/resources/${resourceId}`) return { data: sample() }
      return { data: [] }
    })
    renderWithRouter(<App />, '/resources')
    const link = screen.getByRole('link', { name: '写心得' })
    expect(link).toHaveAttribute('href', '/notes/new')
    fireEvent.keyDown(document, { key: 'j', ctrlKey: true })
    expect(await screen.findByRole('heading', { name: '新心得', level: 1 })).toBeInTheDocument()
    // 编辑页里再按无动作（不会把正在写的丢掉）。
    type('写到一半')
    fireEvent.keyDown(document, { key: 'j', metaKey: true })
    expect(editor()).toHaveValue('写到一半')
    expect(screen.getByRole('link', { name: '返回我的心得' })).toBeInTheDocument()
  })
})
