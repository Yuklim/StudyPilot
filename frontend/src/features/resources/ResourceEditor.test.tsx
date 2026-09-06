import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import { renderWithRouter } from '../../test/render'
import { category, categoryPage, tagId, topicId } from '../taxonomy/fixtures'
import { ResourceEditor } from './ResourceEditor'
import { ResourceDetail } from './ResourceDetail'
import { resourceId, sample, sampleFile } from './fixtures'
import type { Resource } from './api'

const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const submit = () => fireEvent.submit(screen.getByRole('form', { name: '编辑资料表单' }))
const oldTagId = '00000000-0000-4000-8000-000000000021'
function open(item = sample()) {
  const refreshed = vi.fn()
  const view = render(<ResourceEditor resource={item} refreshed={refreshed} />)
  fireEvent.click(screen.getByRole('button', { name: '编辑资料' }))
  return { ...view, refreshed }
}
function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise<unknown>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('resource editor', () => {
  it('starts collapsed and unchanged input never writes, even after title trim', () => {
    const request = vi.spyOn(api, 'request')
    renderWithRouter(<ResourceEditor resource={sample()} refreshed={vi.fn()} />)
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '编辑资料' }))
    change('标题', ` ${sample().title} `)
    submit()
    expect(request).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '保存资料修改' })).toBeDisabled()
  })
  it('sends changed fields only, clears nullable metadata, and prevents double submit', async () => {
    const pending = deferred()
    const request = vi.spyOn(api, 'request').mockReturnValue(pending.promise)
    const { refreshed } = open()
    change('标题', ' 新标题 ')
    change('来源名称（选填）', '')
    change('保存原因 / 简介（选填）', '')
    submit()
    submit()
    expect(request).toHaveBeenCalledExactlyOnceWith(`/api/v1/resources/${resourceId}`, {
      method: 'PATCH',
      body: { title: '新标题', source_name: null, save_reason: null, expected_version: 1 },
    })
    expect(screen.getByRole('button', { name: '取消编辑' })).toBeDisabled()
    await act(async () => pending.resolve({ data: sample({ version: 2 }) }))
    expect(screen.getByRole('status')).toHaveTextContent('资料修改已保存')
    expect(refreshed).toHaveBeenCalledOnce()
  })
  it('emptying the title sends an explicit null so the resource becomes untitled', async () => {
    const request = vi
      .spyOn(api, 'request')
      .mockResolvedValue({ data: sample({ title: null, version: 2 }) })
    open()
    change('标题', '')
    submit()
    await screen.findByText('资料修改已保存。')
    expect(request).toHaveBeenCalledExactlyOnceWith(`/api/v1/resources/${resourceId}`, {
      method: 'PATCH',
      body: { title: null, expected_version: 1 },
    })
  })
  it.each([
    ['标题', '字'.repeat(201), '最多 200 字'],
    ['来源名称（选填）', '字'.repeat(121), '最多 120'],
    ['保存原因 / 简介（选填）', '字'.repeat(1001), '最多 1000'],
    ['网页地址（必填）', 'javascript:alert(1)', 'http 或 https'],
    ['网页地址（必填）', 'https://user:pass@example.com', 'http 或 https'],
    ['网页地址（必填）', 'https://example.com/#x', 'http 或 https'],
    ['网页地址（必填）', 'https://example.com/' + 'a'.repeat(2048), '2048'],
  ])('validates %s without sending a request', (label, value, message) => {
    const request = vi.spyOn(api, 'request')
    open()
    change(label, value)
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(request).not.toHaveBeenCalled()
  })
  it('counts Unicode characters and preserves PASTE whitespace without executable markup', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({
      data: sample({ source_type: 'PASTE', pasted_content: '保存', version: 2 }),
    })
    open(sample({ source_type: 'PASTE', source_url: undefined, pasted_content: ' 旧原文\n ' }))
    expect(screen.getByLabelText('粘贴原文（必填）')).toHaveValue(' 旧原文\n ')
    const content = ' \n<script>bad()</script>\n '
    change('标题', '🌱'.repeat(200))
    change('粘贴原文（必填）', content)
    submit()
    await screen.findByText('资料修改已保存。')
    expect(request.mock.calls[0][1]?.body).toEqual({
      title: '🌱'.repeat(200),
      pasted_content: content,
      expected_version: 1,
    })
    expect(document.querySelector('main script')).toBeNull()
  })
  it.each(['', '字'.repeat(1_000_001)])('validates PASTE length', (content) => {
    const request = vi.spyOn(api, 'request')
    open(sample({ source_type: 'PASTE', pasted_content: '原文' }))
    change('粘贴原文（必填）', content)
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('1～100 万字')
    expect(request).not.toHaveBeenCalled()
  })
  it('keeps FILE immutable while permitting metadata editing', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ data: sampleFile({ version: 2 }) })
    open(sampleFile())
    expect(screen.getByText(/文件原件不能替换/)).toBeInTheDocument()
    expect(document.querySelector('input[type=file]')).toBeNull()
    expect(screen.queryByLabelText('网页地址（必填）')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('粘贴原文（必填）')).not.toBeInTheDocument()
    change('标题', '文件标题')
    submit()
    await screen.findByText('资料修改已保存。')
    expect(request.mock.calls[0][1]?.body).toEqual({ title: '文件标题', expected_version: 1 })
  })
  it.each([false, true])(
    'chooses or clears the major topic, using the shared browser: clear=%s',
    async (clear) => {
      const request = vi
        .spyOn(api, 'request')
        .mockImplementation(async (path) =>
          path.startsWith('/api/v1/topics?') ? categoryPage() : { data: sample({ version: 2 }) },
        )
      open(sample(clear ? { topic_id: topicId, topic_name: '合成主题' } : {}))
      fireEvent.click(screen.getByRole('button', { name: '更改主要主题' }))
      fireEvent.click(await screen.findByRole('radio', { name: clear ? '未分配主题' : '合成主题' }))
      submit()
      await screen.findByText('资料修改已保存。')
      expect(
        request.mock.calls.find(([, options]) => options?.method === 'PATCH')?.[1]?.body,
      ).toEqual({ topic_id: clear ? null : topicId, expected_version: 1 })
    },
  )
  it('replaces the whole tag set in one patch and treats the original set as no change', async () => {
    const request = vi
      .spyOn(api, 'request')
      .mockImplementation(async (path) =>
        path.startsWith('/api/v1/tags?')
          ? categoryPage([category({ id: tagId, name: '合成标签' })])
          : { data: sample({ version: 2 }) },
      )
    open(sample({ tags: [{ id: oldTagId, name: '旧标签' }] }))
    fireEvent.click(screen.getByRole('button', { name: '更改标签' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: '合成标签' }))
    // Back to the original set: a reordered or restored set must not count as a change.
    fireEvent.click(screen.getByRole('button', { name: '移除已选标签 合成标签 ×' }))
    expect(screen.getByRole('button', { name: '保存资料修改' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: '合成标签' }))
    fireEvent.click(screen.getByRole('button', { name: '移除已选标签 旧标签 ×' }))
    submit()
    await screen.findByText('资料修改已保存。')
    expect(
      request.mock.calls.find(([, options]) => options?.method === 'PATCH')?.[1]?.body,
    ).toEqual({ tag_ids: [tagId], expected_version: 1 })
  })
  it('clears every tag with an empty array and keeps that draft through a conflict', async () => {
    const request = vi
      .spyOn(api, 'request')
      .mockRejectedValueOnce(
        new ApiError('VERSION_CONFLICT', 409, undefined, { current_version: 3 }),
      )
      .mockResolvedValueOnce({
        data: sample({ version: 3, tags: [{ id: tagId, name: '别处加的标签' }] }),
      })
      .mockResolvedValue({ data: sample({ version: 4, tags: [] }) })
    open(sample({ tags: [{ id: oldTagId, name: '旧标签' }] }))
    fireEvent.click(screen.getByRole('button', { name: '移除已选标签 旧标签 ×' }))
    submit()
    await screen.findByText(/操作结果需要核对/)
    fireEvent.click(screen.getByRole('button', { name: '保留草稿，读取最新资料' }))
    const latest = await screen.findByRole('region', { name: '最新已保存资料' })
    expect(latest).toHaveTextContent('别处加的标签')
    // The draft still says "no tags", and it is not overwritten by the newer server set.
    expect(screen.getByText('标签：未添加')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('checkbox', { name: '我已核对最新资料，确认仍需保存本页修改' }),
    )
    submit()
    await screen.findByText('资料修改已保存。')
    expect(request.mock.calls.at(-1)?.[1]?.body).toEqual({ tag_ids: [], expected_version: 3 })
  })
  it('creates a tag from the edit page and includes it in the replacement set', async () => {
    const fresh = category({ id: tagId, name: '边改边建的标签' })
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (options?.method === 'POST' && path === '/api/v1/tags') return { data: fresh }
      if (path.startsWith('/api/v1/tags?')) return categoryPage([])
      return { data: sample({ version: 2 }) }
    })
    open(sample({ tags: [{ id: oldTagId, name: '旧标签' }] }))
    fireEvent.click(screen.getByRole('button', { name: '更改标签' }))
    fireEvent.change(await screen.findByLabelText('新建标签'), {
      target: { value: '边改边建的标签' },
    })
    fireEvent.click(screen.getByRole('button', { name: '新建并选用' }))
    await screen.findByRole('button', { name: '移除已选标签 边改边建的标签 ×' })
    submit()
    await screen.findByText('资料修改已保存。')
    expect(
      request.mock.calls.find(([, options]) => options?.method === 'PATCH')?.[1]?.body,
    ).toEqual({ tag_ids: [oldTagId, tagId], expected_version: 1 })
  })
  it.each([
    new ApiError('VERSION_CONFLICT', 409, undefined, { current_version: 99 }),
    new ApiError('VERSION_REQUIRED', 428),
    new ApiError('NETWORK_ERROR'),
    new ApiError('UNKNOWN_ERROR', 500),
    new ApiError('INVALID_RESPONSE'),
    new ApiError('RESOURCE_NOT_FOUND', 404),
    new ApiError('SOURCE_TYPE_MISMATCH', 409),
  ])(
    'requires a successful fresh read and confirmation after %s, never replaying or erasing draft',
    async (error) => {
      const request = vi
        .spyOn(api, 'request')
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(new ApiError('NETWORK_ERROR'))
        .mockResolvedValueOnce({
          data: sample({ title: '另一处标题', source_name: '另一处新来源', version: 3 }),
        })
        .mockResolvedValue({ data: sample({ version: 4 }) })
      open()
      change('标题', '本页草稿')
      submit()
      await screen.findByText(/操作结果需要核对/)
      expect(screen.getByLabelText('标题')).toHaveValue('本页草稿')
      submit()
      expect(request).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByRole('button', { name: '保留草稿，读取最新资料' }))
      await screen.findByText(/连接失败/)
      expect(screen.getByRole('button', { name: '保存资料修改' })).toBeDisabled()
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '保留草稿，读取最新资料' }))
      expect(await screen.findByRole('region', { name: '最新已保存资料' })).toHaveTextContent(
        '另一处新来源',
      )
      expect(screen.getByLabelText('标题')).toHaveValue('本页草稿')
      expect(screen.getByRole('button', { name: '保存资料修改' })).toBeDisabled()
      fireEvent.click(
        screen.getByRole('checkbox', { name: '我已核对最新资料，确认仍需保存本页修改' }),
      )
      submit()
      await screen.findByText('资料修改已保存。')
      expect(request.mock.calls.at(-1)?.[1]?.body).toEqual({
        title: '本页草稿',
        expected_version: 3,
      })
      expect(request).toHaveBeenCalledTimes(4)
    },
  )
  it('allows correcting a disappeared topic or validation error without discarding fields', async () => {
    const request = vi
      .spyOn(api, 'request')
      .mockRejectedValueOnce(new ApiError('TOPIC_NOT_FOUND', 404))
      .mockResolvedValue({ data: sample({ version: 2 }) })
    open()
    change('标题', '保留草稿')
    submit()
    await screen.findByText('这个主题已不存在，请重新选择。')
    expect(screen.queryByText(/操作结果需要核对/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存资料修改' })).toBeEnabled()
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('retains editing through unavailable detail and ignores late results after unmount', async () => {
    const pending = deferred()
    const request = vi.spyOn(api, 'request').mockReturnValue(pending.promise)
    const { rerender, unmount, refreshed } = open()
    change('标题', '保留修改')
    rerender(<ResourceEditor resource={undefined} refreshed={refreshed} />)
    expect(screen.getByLabelText('标题')).toHaveValue('保留修改')
    submit()
    expect(request).not.toHaveBeenCalled()
    rerender(<ResourceEditor resource={sample()} refreshed={refreshed} />)
    submit()
    unmount()
    await act(async () => pending.resolve({ data: sample({ version: 2 }) }))
    expect(refreshed).not.toHaveBeenCalled()
  })
  it('asks before discarding unsaved edits', () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    open()
    change('标题', '本页草稿')
    fireEvent.click(screen.getByRole('button', { name: '取消编辑' }))
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
    expect(screen.getByLabelText('标题')).toHaveValue('本页草稿')
    fireEvent.click(screen.getByRole('button', { name: '取消编辑' }))
    fireEvent.click(screen.getByRole('button', { name: '确认放弃修改' }))
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(storage).not.toHaveBeenCalled()
  })
  it('keeps the quick-note draft mounted while saving and reloading resource metadata', async () => {
    let item: Resource = sample()
    vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (path.includes('/notes?'))
        return {
          data: [],
          page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
        }
      if (options?.method === 'PATCH') item = sample({ title: '新的资料标题', version: 2 })
      return { data: item }
    })
    renderWithRouter(<ResourceDetail resourceId={resourceId} />)
    const notes = await screen.findByRole('form', { name: '心得编辑' })
    fireEvent.change(within(notes).getByRole('textbox'), {
      target: { value: '不能丢失的心得草稿' },
    })
    fireEvent.click(screen.getByRole('button', { name: '编辑资料' }))
    change('标题', '新的资料标题')
    submit()
    await screen.findByRole('heading', { name: '新的资料标题' })
    expect(within(screen.getByRole('form', { name: '心得编辑' })).getByRole('textbox')).toHaveValue(
      '不能丢失的心得草稿',
    )
  })
})
