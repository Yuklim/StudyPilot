import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../../api/client'
import { renderWithRouter } from '../../test/render'
import { sample, samplePage } from '../resources/fixtures'
import { NotesPanel } from './NotesPanel'
import { note, notePage } from './fixtures'
import type { Note } from './api'

const resourceId = note().resource_id
const base = `/api/v1/resources/${resourceId}/notes`
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { resolve, promise }
}
function type(content: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: content } })
}
function submit() {
  fireEvent.submit(screen.getByRole('form', { name: '心得编辑' }))
}
function setup(initial: Note[] = []) {
  let rows = initial
  const request = vi.spyOn(api, 'request').mockImplementation(async (path, init) => {
    if (!path.startsWith(base)) throw new Error('unexpected endpoint')
    if (init?.method === 'POST') {
      const value = note({ content: (init.body as { content: string }).content })
      rows = [value, ...rows]
      return { data: value }
    }
    if (init?.method === 'PATCH') {
      const value = note({
        content: (init.body as { content: string }).content,
        version: rows[0].version + 1,
        updated_at: '2026-09-03T02:01:00Z',
      })
      rows = [value]
      return { data: value }
    }
    if (init?.method === 'DELETE') {
      rows = []
      return undefined
    }
    if (path.includes('?')) return notePage(rows)
    return { data: rows[0] }
  })
  renderWithRouter(<NotesPanel resourceId={resourceId} />)
  return request
}
describe('quick personal notes', () => {
  it('preserves a draft but stops writes when the parent resource cannot be confirmed', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue(notePage())
    const view = render(<NotesPanel resourceId={resourceId} />)
    await screen.findByText('还没有心得，写下一句话就可以开始。')
    type('父资料重读不能丢掉我')
    view.rerender(<NotesPanel resourceId={resourceId} available={false} />)
    expect(screen.getByRole('textbox')).toHaveValue('父资料重读不能丢掉我')
    expect(screen.getByRole('button', { name: '保存心得' })).toBeDisabled()
    submit()
    expect(request.mock.calls.some(([, init]) => init?.method)).toBe(false)
    view.rerender(<NotesPanel resourceId={resourceId} />)
    expect(screen.getByRole('textbox')).toHaveValue('父资料重读不能丢掉我')
    expect(screen.getByRole('button', { name: '保存心得' })).toBeEnabled()
  })
  it('needs only text, saves plain content once and keeps learning data untouched', async () => {
    const request = setup()
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    await screen.findByText('还没有心得，写下一句话就可以开始。')
    const form = screen.getByRole('form', { name: '心得编辑' })
    expect(within(form).getAllByRole('textbox')).toHaveLength(1)
    expect(form.querySelector('select,input')).toBeNull()
    const content = '<script>fake()</script>\n一条理解'
    type(content)
    const pending = deferred<unknown>()
    request.mockReturnValueOnce(pending.promise)
    submit()
    submit()
    expect(screen.getByRole('button', { name: '正在处理…' })).toBeDisabled()
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    request.mockResolvedValue(notePage([note({ content })]))
    await act(async () => pending.resolve({ data: note({ content }) }))
    expect(await screen.findByText(/心得已保存/)).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(
      await within(screen.getByRole('list', { name: '心得列表' })).findByText(content, {
        normalizer: (text) => text,
      }),
    ).toBeInTheDocument()
    expect(form.ownerDocument.querySelector('script')).toBeNull()
    expect(storage).not.toHaveBeenCalled()
    expect(request.mock.calls.every(([path]) => path.startsWith(base))).toBe(true)
    expect(request.mock.calls.find(([, init]) => init?.method === 'POST')?.[1]?.body).toEqual({
      content,
    })
  })
  it('rejects whitespace and excess length without posting', async () => {
    const request = setup()
    type(' \n ')
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('写下一点内容')
    type('x'.repeat(50001))
    submit()
    expect(request.mock.calls.some(([, init]) => init?.method)).toBe(false)
    await screen.findByText('还没有心得，写下一句话就可以开始。')
  })
  it('handles read failure and retry without clearing the composer', async () => {
    const request = vi.spyOn(api, 'request').mockRejectedValue(new ApiError('NETWORK_ERROR'))
    renderWithRouter(<NotesPanel resourceId={resourceId} />)
    type('仍在写的内容')
    await screen.findByRole('button', { name: '重新读取心得列表' })
    request.mockResolvedValue(notePage())
    fireEvent.click(screen.getByRole('button', { name: '重新读取心得列表' }))
    await screen.findByText('还没有心得，写下一句话就可以开始。')
    expect(screen.getByRole('textbox')).toHaveValue('仍在写的内容')
  })
  it('edits using a fresh version and asks before discarding a draft', async () => {
    const request = setup([note()])
    await screen.findByRole('button', { name: '编辑' })
    type('未完成草稿')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox')).toHaveValue('未完成草稿')
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    await screen.findByRole('button', { name: '保存修改' })
    expect(request).toHaveBeenLastCalledWith(base + '/' + note().id)
    type('新的理解')
    submit()
    await screen.findByText(/心得已保存/)
    expect(request.mock.calls.find(([, init]) => init?.method === 'PATCH')?.[1]?.body).toEqual({
      content: '新的理解',
      expected_version: 1,
    })
    await within(await screen.findByRole('list', { name: '心得列表' })).findByText('新的理解')
  })
  it('keeps a conflicting draft, requires successful reload and explicit re-confirmation', async () => {
    const request = setup([note()])
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
    await screen.findByRole('button', { name: '保存修改' })
    type('保留这个草稿')
    request.mockRejectedValueOnce(new ApiError('VERSION_CONFLICT', 409))
    submit()
    await screen.findByText(/操作结果需要核对/)
    expect(screen.getByRole('textbox')).toHaveValue('保留这个草稿')
    expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled()
    request.mockRejectedValueOnce(new ApiError('NETWORK_ERROR'))
    fireEvent.click(screen.getByRole('button', { name: '保留草稿，读取最新心得' }))
    await screen.findByText(/无法连接本机服务/)
    expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled()
    request.mockResolvedValueOnce({ data: note({ content: '别处的新内容', version: 2 }) })
    fireEvent.click(screen.getByRole('button', { name: '保留草稿，读取最新心得' }))
    await within(await screen.findByRole('region', { name: '最新已保存内容' })).findByText(
      '别处的新内容',
    )
    expect(screen.getByRole('textbox')).toHaveValue('保留这个草稿')
    expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled()
    fireEvent.click(
      screen.getByRole('checkbox', { name: '我已核对最新心得，确认仍需保存当前草稿' }),
    )
    request.mockResolvedValueOnce({ data: note({ content: '保留这个草稿', version: 3 }) })
    submit()
    await screen.findByText(/心得已保存/)
    expect(
      request.mock.calls.filter(([, init]) => init?.method === 'PATCH').at(-1)?.[1]?.body,
    ).toEqual({ content: '保留这个草稿', expected_version: 2 })
  })
  it('keeps an uncertain create locked until the latest list is read and checked', async () => {
    const request = setup()
    await screen.findByText('还没有心得，写下一句话就可以开始。')
    type('网络中断时的想法')
    request.mockRejectedValueOnce(new ApiError('NETWORK_ERROR'))
    submit()
    await screen.findByText(/操作结果需要核对/)
    submit()
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    request.mockResolvedValueOnce(notePage([note({ content: '网络中断时的想法' })]))
    fireEvent.click(screen.getByRole('button', { name: '保留草稿，读取最新心得' }))
    const checked = await screen.findByRole('region', { name: '刚读取的最新心得' })
    expect(within(checked).getByText('网络中断时的想法')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('网络中断时的想法')
    expect(screen.getByRole('button', { name: '保存心得' })).toBeDisabled()
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  })
  it('confirms the target and fresh version before deleting, with re-confirmation on conflict', async () => {
    const request = setup([note()])
    fireEvent.click(await screen.findByRole('button', { name: '删除' }))
    await screen.findByText('删除这条心得？')
    expect(screen.getByRole('button', { name: '确认删除心得' })).toBeDisabled()
    submit()
    expect(request.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
    fireEvent.click(screen.getByRole('checkbox', { name: '我确认永久删除上方这条心得' }))
    request.mockRejectedValueOnce(new ApiError('VERSION_CONFLICT', 409))
    submit()
    await screen.findByText(/操作结果需要核对/)
    request.mockResolvedValueOnce({ data: note({ content: '新版本，不能误删', version: 2 }) })
    fireEvent.click(screen.getByRole('button', { name: '保留草稿，读取最新心得' }))
    await screen.findByText('新版本，不能误删')
    expect(screen.getByRole('button', { name: '确认删除心得' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: '我确认永久删除上方这条心得' }))
    submit()
    await screen.findByText('这条心得已删除，资料与其他记录仍保留。')
    expect(
      request.mock.calls.filter(([, init]) => init?.method === 'DELETE').at(-1)?.[1]
        ?.ifMatchVersion,
    ).toBe(2)
    await screen.findByText('还没有心得，写下一句话就可以开始。')
  })
  it('does not silently recreate a removed note and offers an explicit draft conversion', async () => {
    const request = setup([note()])
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
    await screen.findByRole('button', { name: '保存修改' })
    type('不能丢掉')
    request.mockRejectedValueOnce(new ApiError('NOTE_NOT_FOUND', 404))
    submit()
    await screen.findByText(/操作结果需要核对/)
    request.mockRejectedValueOnce(new ApiError('NOTE_NOT_FOUND', 404))
    fireEvent.click(screen.getByRole('button', { name: '保留草稿，读取最新心得' }))
    await screen.findByText('这条心得已不存在。草稿仍保留，不会自动新增或再次删除。')
    expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '作为新心得继续编辑' }))
    expect(screen.getByRole('textbox')).toHaveValue('不能丢掉')
    expect(screen.getByRole('button', { name: '保存心得' })).toBeEnabled()
    expect(request.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })
  it('keeps editing content on paging and ignores an outdated page response', async () => {
    const old = deferred<unknown>()
    const request = vi.spyOn(api, 'request').mockResolvedValueOnce(notePage([note()], 1, 21))
    renderWithRouter(<NotesPanel resourceId={resourceId} />)
    await screen.findByRole('button', { name: '下一页心得' })
    type('翻页不能清空')
    request.mockReturnValueOnce(old.promise)
    fireEvent.click(screen.getByRole('button', { name: '下一页心得' }))
    request.mockResolvedValueOnce(notePage([], 2))
    fireEvent.click(screen.getByRole('button', { name: '刷新心得列表' }))
    await screen.findByText('这一页已没有心得，可以返回上一页。')
    await act(async () => old.resolve(notePage([note({ content: '迟到的旧内容' })], 2, 21)))
    expect(screen.queryByText('迟到的旧内容')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('翻页不能清空')
  })
  it('does not carry a late save or draft into a different resource', async () => {
    const pending = deferred<unknown>()
    const request = vi.spyOn(api, 'request').mockResolvedValue(notePage())
    const screenA = renderWithRouter(<NotesPanel resourceId={resourceId} />)
    await screen.findByText('还没有心得，写下一句话就可以开始。')
    type('属于旧资料')
    request.mockReturnValueOnce(pending.promise)
    submit()
    screenA.unmount()
    renderWithRouter(<NotesPanel resourceId="018f1f58-4eb2-4a0d-a716-fb81b1960999" />)
    await act(async () => pending.resolve({ data: note({ content: '属于旧资料' }) }))
    await waitFor(() => expect(screen.queryByText(/心得已保存/)).not.toBeInTheDocument())
    expect(screen.getByRole('textbox')).toHaveValue('')
  })
})

describe('attach/detach note binding', () => {
  const standaloneId = '018f1f58-4eb2-4a0d-a716-fb81b1960100'

  it('attaches a standalone note to a searched resource, then removes it from the list', async () => {
    const row = note({ resource_id: null, id: standaloneId, content: '先独立记下' })
    const target = sample({ title: '后贴目标资料' })
    let rows = [row]
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path.startsWith('/api/v1/resources?')) return samplePage([target])
      if (path.endsWith('/attach')) {
        rows = []
        return { data: { ...row, resource_id: target.id, version: 2 } }
      }
      if (path.includes('?')) return notePage(rows)
      throw new Error('unexpected endpoint ' + path)
    })
    renderWithRouter(<NotesPanel resourceId={null} />)
    await screen.findByText('先独立记下')
    fireEvent.click(screen.getByRole('button', { name: '后贴到资料' }))
    fireEvent.change(screen.getByPlaceholderText('输入标题搜索资料库'), {
      target: { value: '目标' },
    })
    fireEvent.submit(screen.getByRole('form', { name: '搜索要后贴的资料' }))
    fireEvent.click(await screen.findByRole('button', { name: '后贴到《后贴目标资料》' }))
    const link = await screen.findByRole('link', { name: /打开《后贴目标资料》查看/ })
    expect(link).toHaveAttribute('href', `/resources/${target.id}`)
    await waitFor(() => expect(screen.queryByText('先独立记下')).not.toBeInTheDocument())
    expect(request.mock.calls.find(([path]) => path.endsWith('/attach'))?.[1]?.body).toEqual({
      resource_id: target.id,
      expected_version: 1,
    })
  })

  it('detaches a bound note back to standalone after confirmation', async () => {
    const bound = note()
    let rows = [bound]
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === `/api/v1/resources/${resourceId}/notes/${bound.id}/detach`) {
        rows = []
        return { data: { ...bound, resource_id: null, version: 2 } }
      }
      if (path.includes('?')) return notePage(rows)
      throw new Error('unexpected endpoint ' + path)
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderWithRouter(<NotesPanel resourceId={resourceId} />)
    await screen.findByText('这是合成心得。')
    fireEvent.click(screen.getByRole('button', { name: '解除绑定' }))
    const link = await screen.findByRole('link', { name: /去「我的心得」查看/ })
    expect(link).toHaveAttribute('href', '/notes')
    await waitFor(() => expect(screen.queryByText('这是合成心得。')).not.toBeInTheDocument())
    expect(request.mock.calls.find(([path]) => path.endsWith('/detach'))?.[1]?.body).toEqual({
      expected_version: 1,
    })
  })

  it('shows an error, refreshes and does not silently retry a failed attach', async () => {
    const row = note({ resource_id: null, id: standaloneId, content: '要后贴的一句' })
    const target = sample()
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path.startsWith('/api/v1/resources?')) return samplePage([target])
      if (path.endsWith('/attach')) throw new ApiError('VERSION_CONFLICT', 409)
      if (path.includes('?')) return notePage([row])
      throw new Error('unexpected endpoint ' + path)
    })
    renderWithRouter(<NotesPanel resourceId={null} />)
    await screen.findByText('要后贴的一句')
    fireEvent.click(screen.getByRole('button', { name: '后贴到资料' }))
    fireEvent.change(screen.getByPlaceholderText('输入标题搜索资料库'), {
      target: { value: '目标' },
    })
    fireEvent.submit(screen.getByRole('form', { name: '搜索要后贴的资料' }))
    fireEvent.click(await screen.findByRole('button', { name: /后贴到《/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('状态可能已变化')
    expect(request.mock.calls.filter(([path]) => path.endsWith('/attach'))).toHaveLength(1)
    expect(await screen.findByText('要后贴的一句')).toBeInTheDocument()
  })
})
