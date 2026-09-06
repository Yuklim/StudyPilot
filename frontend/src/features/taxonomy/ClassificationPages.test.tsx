import { useState } from 'react'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from '../../App'
import { api, ApiError } from '../../api/client'
import { renderWithRouter } from '../../test/render'
import { resourceId, sample, samplePage } from '../resources/fixtures'
import { ClassificationPicker, type Selection } from './ClassificationPicker'
import { category, categoryPage, tagId, topicId } from './fixtures'

const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const tag = category({ id: tagId, name: '合成标签' })
function reads(path: string) {
  if (path.startsWith('/api/v1/topics?')) return categoryPage()
  if (path.startsWith('/api/v1/tags?')) return categoryPage([tag])
  if (path === `/api/v1/topics/${topicId}`) return { data: category() }
  return { data: sample() }
}

describe('classification management', () => {
  it('distinguishes loading, failure, retry and empty results', async () => {
    vi.spyOn(api, 'request')
      .mockRejectedValueOnce(new ApiError('NETWORK_ERROR'))
      .mockResolvedValue(categoryPage([]))
    renderWithRouter(<App />, '/classifications')
    expect(screen.getByRole('status')).toHaveTextContent('正在加载主题')
    expect(await screen.findByRole('alert')).toHaveTextContent('无法连接')
    click('重新加载主题')
    expect(await screen.findByText('还没有主题，从一个小小的分类开始。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一页主题' })).toBeDisabled()
  })
  it('validates create lengths, preserves failed drafts and sends one write while busy', async () => {
    const pending = deferred<unknown>()
    const request = vi
      .spyOn(api, 'request')
      .mockImplementation(async (path, options) =>
        options?.method === 'POST' ? pending.promise : reads(path),
      )
    renderWithRouter(<App />, '/classifications')
    await screen.findByRole('heading', { name: '合成主题' })
    click('新建主题')
    click('保存主题')
    expect(screen.getByRole('alert')).toHaveTextContent('1～80')
    change('主题名称', '字'.repeat(81))
    click('保存主题')
    expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
    change('主题名称', ' 新主题 ')
    change('主题说明（选填）', '字'.repeat(501))
    click('保存主题')
    expect(screen.getByRole('alert')).toHaveTextContent('最多 500')
    change('主题说明（选填）', '说明')
    click('保存主题')
    expect(screen.getByRole('button', { name: '正在处理…' })).toBeDisabled()
    fireEvent.submit(screen.getByRole('button', { name: '正在处理…' }).closest('form')!)
    expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
    await act(async () => pending.resolve({ data: category({ name: '新主题' }) }))
    expect(await screen.findByText('操作成功，已重新读取分类列表。')).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith('/api/v1/topics', {
      method: 'POST',
      body: { name: '新主题', description: '说明' },
    })
  })
  it.each(['DUPLICATE_TOPIC', 'NETWORK_ERROR'] as const)(
    'keeps input after %s and does not automatically retry',
    async (code) => {
      const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
        if (options?.method === 'POST')
          throw new ApiError(code, code === 'DUPLICATE_TOPIC' ? 409 : 0)
        return reads(path)
      })
      renderWithRouter(<App />, '/classifications')
      await screen.findByText('合成主题')
      click('新建主题')
      change('主题名称', '保留草稿')
      click('保存主题')
      expect(await screen.findByRole('alert')).toHaveTextContent('没有自动重试')
      expect(screen.getByLabelText('主题名称')).toHaveValue('保留草稿')
      expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
    },
  )
  it('keeps stale edits unchanged until the user explicitly loads the latest version', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (options?.method === 'PATCH') {
        if ((options.body as { expected_version: number }).expected_version === 1)
          throw new ApiError('VERSION_CONFLICT', 409)
        return { data: category({ version: 3, name: '确认后的名称' }) }
      }
      if (path === `/api/v1/topics/${topicId}`)
        return { data: category({ version: 2, name: '最新名称' }) }
      return reads(path)
    })
    renderWithRouter(<App />, '/classifications')
    await screen.findByText('合成主题')
    click('修改主题 合成主题')
    change('主题名称', '我的草稿')
    click('保存主题')
    expect(await screen.findByRole('alert')).toHaveTextContent('内容已被修改')
    expect(screen.getByLabelText('主题名称')).toHaveValue('我的草稿')
    expect(request.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1)
    click('放弃草稿，载入最新版本')
    await waitFor(() => expect(screen.getByLabelText('主题名称')).toHaveValue('最新名称'))
    change('主题名称', '确认后的名称')
    click('保存主题')
    await screen.findByText('操作成功，已重新读取分类列表。')
    expect(request).toHaveBeenCalledWith(`/api/v1/topics/${topicId}`, {
      method: 'PATCH',
      body: { name: '确认后的名称', description: null, expected_version: 2 },
    })
  })
  it('requires deletion confirmation, supports cancellation and keeps referenced classifications visible', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (options?.method === 'DELETE')
        throw new ApiError('TAXONOMY_IN_USE', 409, undefined, { resource_count: 2 })
      return reads(path)
    })
    renderWithRouter(<App />, '/classifications')
    await screen.findByText('合成主题')
    click('删除主题 合成主题')
    expect(screen.getByText(/不能撤销/)).toBeInTheDocument()
    expect(request.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(0)
    click('取消')
    click('删除主题 合成主题')
    click('确认删除主题')
    expect(await screen.findByRole('alert')).toHaveTextContent('仍有 2 份资料')
    expect(request).toHaveBeenCalledWith(`/api/v1/topics/${topicId}`, {
      method: 'DELETE',
      ifMatchVersion: 1,
    })
    expect(screen.getByRole('heading', { name: '合成主题' })).toBeInTheDocument()
  })
  it('ignores a departed topic operation when switching to tags', async () => {
    const pending = deferred<unknown>()
    vi.spyOn(api, 'request').mockImplementation(async (path, options) =>
      options?.method === 'POST' ? pending.promise : reads(path),
    )
    renderWithRouter(<App />, '/classifications')
    await screen.findByText('合成主题')
    click('新建主题')
    change('主题名称', '延迟主题')
    click('保存主题')
    click('标签')
    expect(await screen.findByText('合成标签')).toBeInTheDocument()
    await act(async () => pending.resolve({ data: category() }))
    expect(screen.queryByText('操作成功，已重新读取分类列表。')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建标签' })).toBeEnabled()
  })
})

function Picker({ initial = { topic: null, tags: [] } }: { initial?: Selection }) {
  const [value, setValue] = useState(initial)
  return <ClassificationPicker value={value} onChange={setValue} />
}
describe('classification selection and resource integration', () => {
  it('loads lazily, keeps selected tags through search/pages/closing and can remove them', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path.includes('tags?')) {
        const query = new URL(path, 'http://example.test').searchParams
        if (query.get('page') === '2' || query.has('q'))
          return categoryPage([category({ id: resourceId, name: '第二标签' })], {
            number: query.get('page') === '2' ? 2 : 1,
            total_items: 21,
            total_pages: 2,
          })
        return categoryPage([tag], { has_more: true, total_pages: 2, total_items: 21 })
      }
      return reads(path)
    })
    renderWithRouter(<Picker />)
    expect(request).not.toHaveBeenCalled()
    click('选择主题与标签（选填）')
    fireEvent.click(await screen.findByRole('checkbox', { name: '合成标签' }))
    click('下一页标签')
    fireEvent.click(await screen.findByRole('checkbox', { name: '第二标签' }))
    expect(screen.getByText(/已选 2 个标签/)).toBeInTheDocument()
    change('搜索标签', '第二')
    click('查找标签')
    await waitFor(() => expect(request.mock.lastCall?.[0]).toContain('page=1'))
    click('收起分类选择')
    click('选择主题与标签（选填）')
    expect(await screen.findByRole('checkbox', { name: '合成标签' })).toBeChecked()
    click('移除已选标签 合成标签 ×')
    expect(screen.getByRole('checkbox', { name: '合成标签' })).not.toBeChecked()
  })
  it('limits initial selection to 20 without preventing deselection', async () => {
    vi.spyOn(api, 'request').mockImplementation(async (path) => reads(path))
    const selected = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: `已选 ${i}` }))
    renderWithRouter(<Picker initial={{ topic: null, tags: selected }} />)
    click('选择主题与标签（选填）')
    expect(await screen.findByRole('checkbox', { name: '合成标签' })).toBeDisabled()
    click('移除已选标签 已选 0 ×')
    expect(screen.getByRole('checkbox', { name: '合成标签' })).toBeEnabled()
  })
  it('saves resource topic and tags in one request and shows its real topic name', async () => {
    const request = vi
      .spyOn(api, 'request')
      .mockImplementation(async (path) =>
        path === '/api/v1/resources' || path === `/api/v1/resources/${resourceId}`
          ? { data: sample({ topic_id: topicId, tags: [tag] }) }
          : reads(path),
      )
    renderWithRouter(<App />, '/resources/new')
    click('选择主题与标签（选填）')
    fireEvent.click(await screen.findByRole('radio', { name: '合成主题' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: '合成标签' }))
    change('标题', '合成资料')
    change('网页地址（必填）', 'https://example.com')
    click('保存到资料库')
    expect(await screen.findByRole('heading', { name: '资料详情', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('合成主题')).toBeInTheDocument()
    expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toEqual([
      [
        '/api/v1/resources',
        {
          method: 'POST',
          body: {
            title: '合成资料',
            source_type: 'WEB',
            source_url: 'https://example.com',
            topic_id: topicId,
            tag_ids: [tagId],
          },
        },
      ],
    ])
  })
  it('combines classifications with existing filters and clears them on reset', async () => {
    const request = vi
      .spyOn(api, 'request')
      .mockImplementation(async (path) =>
        path.startsWith('/api/v1/resources?') ? samplePage([]) : reads(path),
      )
    renderWithRouter(<App />, '/resources')
    await screen.findByText('给想学的内容，留一个位置')
    click('按主题与标签筛选')
    fireEvent.click(await screen.findByRole('radio', { name: '合成主题' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: '合成标签' }))
    change('资料类型', 'WEB')
    click('搜索 / 应用筛选')
    await waitFor(() =>
      expect(request.mock.lastCall?.[0]).toContain(`topic_id=${topicId}&tag_id=${tagId}`),
    )
    fireEvent.click(screen.getByRole('radio', { name: '仅未分配主题' }))
    click('搜索 / 应用筛选')
    await waitFor(() => expect(request.mock.lastCall?.[0]).toContain('topic_unassigned=true'))
    expect(request.mock.lastCall?.[0]).not.toContain('topic_id=')
    click('重置')
    await waitFor(() =>
      expect(request.mock.lastCall?.[0]).toBe(
        '/api/v1/resources?page=1&page_size=20&sort=-created_at',
      ),
    )
  })
  it('refreshes real details after one tag operation and preserves errors on failure', async () => {
    let attached = false
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (options?.method === 'PUT') {
        attached = true
        return {
          data: {
            resource_id: resourceId,
            tag_id: tagId,
            association_version: 1,
            created_at: category().created_at,
          },
        }
      }
      if (options?.method === 'DELETE') throw new ApiError('NETWORK_ERROR')
      if (path.startsWith(`/api/v1/resources/${resourceId}/notes?`))
        return {
          data: [],
          page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
        }
      if (path === `/api/v1/resources/${resourceId}`)
        return { data: sample({ tags: attached ? [tag] : [] }) }
      return reads(path)
    })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByText('合成阅读资料')
    fireEvent.change(screen.getByLabelText('这次想记下什么？'), {
      target: { value: '修改标签也要保留这份草稿' },
    })
    click('管理这份资料的标签')
    await screen.findByText('合成标签')
    click('添加标签 合成标签')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '管理这份资料的标签' })).toBeInTheDocument(),
    )
    expect(screen.getByText('合成标签')).toBeInTheDocument()
    expect(screen.getByLabelText('这次想记下什么？')).toHaveValue('修改标签也要保留这份草稿')
    click('管理这份资料的标签')
    await screen.findByRole('button', { name: '已添加 合成标签' })
    click('解除标签 合成标签')
    expect(await screen.findByRole('alert')).toHaveTextContent('没有自动重试')
    expect(
      within(screen.getByRole('region', { name: '资料标签管理' })).getByRole('button', {
        name: '解除标签 合成标签',
      }),
    ).toBeEnabled()
    expect(request.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(1)
  })
})

describe('creating a tag where it is used', () => {
  const fresh = category({ id: resourceId, name: '临时想到的标签' })
  it('creates and selects a tag without leaving the resource form or losing the draft', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (options?.method === 'POST' && path === '/api/v1/tags') return { data: fresh }
      return reads(path)
    })
    renderWithRouter(<App />, '/resources/new')
    change('标题', '正在填的资料')
    click('选择主题与标签（选填）')
    await screen.findByRole('checkbox', { name: '合成标签' })
    change('新建标签', '  临时想到的标签  ')
    click('新建并选用')
    await waitFor(() => expect(screen.getByText(/已选 1 个标签/)).toBeInTheDocument())
    expect(request.mock.calls.find(([, o]) => o?.method === 'POST')).toEqual([
      '/api/v1/tags',
      { method: 'POST', body: { name: '临时想到的标签' } },
    ])
    // The point of the feature: the half-written资料 draft is still there.
    expect(screen.getByLabelText('标题')).toHaveValue('正在填的资料')
    expect(
      screen.getByRole('button', { name: '移除已选标签 临时想到的标签 ×' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('新建标签')).toHaveValue('')
  })
  it('reports a duplicate name from the server and validates length before asking', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (options?.method === 'POST') throw new ApiError('DUPLICATE_TAG', 409)
      return reads(path)
    })
    renderWithRouter(<Picker />)
    click('选择主题与标签（选填）')
    await screen.findByRole('checkbox', { name: '合成标签' })
    change('新建标签', '字'.repeat(51))
    click('新建并选用')
    expect(screen.getByRole('alert')).toHaveTextContent('1～50 字')
    expect(request.mock.calls.filter(([, o]) => o?.method === 'POST')).toHaveLength(0)
    change('新建标签', '合成标签')
    click('新建并选用')
    expect(await screen.findByRole('alert')).toHaveTextContent('已有同名标签')
    // A rejected create keeps what was typed so it can be edited rather than retyped.
    expect(screen.getByLabelText('新建标签')).toHaveValue('合成标签')
    expect(screen.getByText(/已选 0 个标签/)).toBeInTheDocument()
  })
  it('creates and attaches in one step from the resource detail tag manager', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (options?.method === 'POST' && path === '/api/v1/tags') return { data: fresh }
      if (options?.method === 'PUT')
        return {
          data: {
            resource_id: resourceId,
            tag_id: fresh.id,
            association_version: 1,
            created_at: '2026-09-03T00:00:00Z',
          },
        }
      if (path.startsWith(`/api/v1/resources/${resourceId}/notes?`))
        return {
          data: [],
          page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
        }
      if (path === `/api/v1/resources/${resourceId}`)
        return { data: sample({ tags: [{ id: fresh.id, name: fresh.name }] }) }
      return reads(path)
    })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByText('合成阅读资料')
    click('管理这份资料的标签')
    await screen.findByRole('button', { name: '添加标签 合成标签' })
    change('新建标签', '临时想到的标签')
    click('新建并选用')
    await waitFor(() =>
      expect(
        request.mock.calls.some(
          ([path, o]) => o?.method === 'PUT' && path.endsWith(`/tags/${fresh.id}`),
        ),
      ).toBe(true),
    )
  })
})
