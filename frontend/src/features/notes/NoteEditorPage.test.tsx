import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../App'
import { ApiError, api } from '../../api/client'
import { renderWithRouter } from '../../test/render'
import { resourceId, sample } from '../resources/fixtures'
import type { Note } from './api'
import { note as boundNote } from './fixtures'

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
    // 首次非空 → POST；标题跟着第一行走；地址换成这条心得。
    type('# 第一行\n\n正文')
    expect(screen.getByRole('heading', { name: '第一行', level: 1 })).toBeInTheDocument()
    await settle()
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ content: '# 第一行\n\n正文' })
    expect(status()).toHaveTextContent(/已保存/)
    // 再改 → PATCH 带 expected_version=1；内容未变 → 不发。
    type('# 第一行\n\n正文，再补一句')
    await settle()
    const patches = calls.filter((c) => c.method === 'PATCH')
    expect(patches).toHaveLength(1)
    expect(patches[0]?.body).toEqual({ content: '# 第一行\n\n正文，再补一句', expected_version: 1 })
    type('# 第一行\n\n正文，再补一句')
    await settle()
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1)
    // 写作框里的字一直是用户的，没有被保存结果盖掉。
    expect(editor()).toHaveValue('# 第一行\n\n正文，再补一句')
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
