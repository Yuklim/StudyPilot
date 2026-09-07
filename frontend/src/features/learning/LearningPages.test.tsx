import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from '../../App'
import { api, ApiError } from '../../api/client'
import { renderWithRouter } from '../../test/render'
import { sample } from '../resources/fixtures'
import { LearningPanel } from './LearningPanel'
import { RecordHistory } from './RecordHistory'
import type { StudyCommand } from './api'
import { records, result } from './fixtures'

function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
function open() {
  fireEvent.click(screen.getByRole('button', { name: '查看旧学习历史' }))
  fireEvent.click(screen.getByRole('button', { name: '更多：状态与归档管理' }))
}
function submit() {
  fireEvent.submit(screen.getByRole('form', { name: '记录学习表单' }))
}
function fill() {
  change('学习开始时间', '2026-09-03T12:00:00')
  change('本次时长（秒）', '1200')
  change('学习后状态', 'IN_PROGRESS')
  change('学习后进度（%）', '30')
  change('本次总结（选填）', '保留我的合成草稿')
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
describe('learning form', () => {
  it('loads history only on demand, prevents reentry and updates both history and progress', async () => {
    const pending = deferred<unknown>()
    const request = vi
      .spyOn(api, 'request')
      .mockImplementation((_path, init) =>
        init?.method === 'POST' ? pending.promise : Promise.resolve(records([])),
      )
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    renderWithRouter(<LearningPanel resource={sample()} />)
    expect(request).not.toHaveBeenCalled()
    open()
    fill()
    submit()
    submit()
    await waitFor(() =>
      expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1),
    )
    expect(screen.getByRole('button', { name: '正在保存或读取…' })).toBeDisabled()
    const command = request.mock.calls.find(([, init]) => init?.method === 'POST')![1]!
      .body as unknown as StudyCommand
    expect(command).toMatchObject({
      expected_progress_version: 1,
      progress_before: 0,
      status_before: 'UNREAD',
      duration_seconds: 1200,
    })
    await act(async () => pending.resolve(result(command)))
    expect(await screen.findByText('学习中 · 30%')).toBeInTheDocument()
    expect(screen.getByText('学习记录已保存，当前进度已更新。')).toBeInTheDocument()
    expect(screen.getByLabelText('本次总结（选填）')).toHaveValue('')
    expect(storage).not.toHaveBeenCalled()
  })
  it.each(['1.5', '-1', '101', ''])('rejects invalid progress %s before saving', async (value) => {
    const request = vi.spyOn(api, 'request').mockResolvedValue(records([]))
    renderWithRouter(<LearningPanel resource={sample()} />)
    open()
    fill()
    change('学习后进度（%）', value)
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('整数进度')
    expect(request.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })
  it('requires meaningful same-state records, explicit zero and archive confirmation', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue(records([]))
    const item = sample({
      progress: { ...sample().progress, status: 'IN_PROGRESS', progress_percent: 30 },
    })
    renderWithRouter(<LearningPanel resource={item} />)
    open()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('至少填写本次总结')
    change('学习后状态', 'UNREAD')
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('明确把进度填写为 0')
    change('学习后状态', 'ARCHIVED')
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('请确认归档或恢复')
    expect(screen.getByLabelText('学习后进度（%）')).toBeDisabled()
    expect(request.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })
  it.each([new ApiError('VERSION_CONFLICT', 409), new ApiError('NETWORK_ERROR')])(
    'retains drafts, blocks replay and requires explicit reread/confirmation after %s',
    async (error) => {
      const item = sample()
      const latest = sample({
        progress: { ...item.progress, status: 'IN_PROGRESS', progress_percent: 40, version: 2 },
      })
      let writes = 0
      let reads = 0
      const request = vi.spyOn(api, 'request').mockImplementation((path, init) => {
        if (init?.method === 'POST') {
          writes++
          return writes === 1
            ? Promise.reject(error)
            : Promise.resolve(result(init.body as unknown as StudyCommand, latest))
        }
        if (!path.includes('study-records')) {
          reads++
          return reads === 1
            ? Promise.reject(new ApiError('NETWORK_ERROR'))
            : Promise.resolve({ data: latest })
        }
        return Promise.resolve(records([]))
      })
      renderWithRouter(<LearningPanel resource={item} />)
      open()
      fill()
      submit()
      await waitFor(() =>
        expect(screen.getByRole('button', { name: '保存学习记录' })).toBeDisabled(),
      )
      expect(screen.getByLabelText('本次总结（选填）')).toHaveValue('保留我的合成草稿')
      submit()
      expect(writes).toBe(1)
      fireEvent.click(screen.getByRole('button', { name: '保留草稿，读取最新进度' }))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: '保留草稿，读取最新进度' })).toBeEnabled(),
      )
      expect(screen.getByRole('button', { name: '保存学习记录' })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: '保留草稿，读取最新进度' }))
      const confirmation = await screen.findByRole('checkbox', { name: /我已核对最新进度和历史/ })
      expect(screen.getByLabelText('本次总结（选填）')).toHaveValue('保留我的合成草稿')
      expect(screen.getByRole('button', { name: '保存学习记录' })).toBeDisabled()
      fireEvent.click(confirmation)
      submit()
      await screen.findByText('学习记录已保存，当前进度已更新。')
      expect(writes).toBe(2)
      expect(
        request.mock.calls.filter(([, init]) => init?.method === 'POST')[1][1]?.body,
      ).toMatchObject({
        expected_progress_version: 2,
        progress_before: 40,
        status_before: 'IN_PROGRESS',
      })
    },
  )
  it('does not report a departed form result or update a new page', async () => {
    const pending = deferred<unknown>()
    const request = vi
      .spyOn(api, 'request')
      .mockImplementation((_path, init) =>
        init?.method === 'POST' ? pending.promise : Promise.resolve(records([])),
      )
    renderWithRouter(<LearningPanel resource={sample()} />)
    open()
    fill()
    submit()
    fireEvent.click(screen.getByRole('button', { name: '收起旧学习历史' }))
    const command = request.mock.calls.find(([, init]) => init?.method === 'POST')![1]!
      .body as unknown as StudyCommand
    await act(async () => pending.resolve(result(command)))
    expect(screen.queryByText('学习记录已保存，当前进度已更新。')).not.toBeInTheDocument()
    expect(screen.getByText('未开始 · 0%')).toBeInTheDocument()
  })
  it('tells the caller a record was saved, so a caller-owned status display cannot go stale', async () => {
    // **TASK-043 起这不是可选的锦上添花。** 阅读器工具条上的状态徽章是改版之后唯一
    // 常驻的状态显示（进度条随本面板收了起来），而它读的是**调用方**手里的那份资料。
    // 本组件此前只更新自己的 `snapshot`，于是保存成功后徽章仍写着旧状态，用户可能
    // 以为没存上而再提交一条记录。这条守的就是那个通知。
    const changed = vi.fn()
    vi.spyOn(api, 'request').mockImplementation((_path, init) =>
      init?.method === 'POST'
        ? Promise.resolve(result(init.body as unknown as StudyCommand))
        : Promise.resolve(records([])),
    )
    renderWithRouter(<LearningPanel resource={sample()} changed={changed} initialView="manage" />)
    fill()
    submit()
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1))
    // 保存成功才通知：写失败时不能让调用方以为进度变了。
    expect(screen.getByText('学习记录已保存，当前进度已更新。')).toBeInTheDocument()
  })
  it('stays silent towards the caller when the write fails', async () => {
    const changed = vi.fn()
    vi.spyOn(api, 'request').mockImplementation((_path, init) =>
      init?.method === 'POST'
        ? Promise.reject(new ApiError('VALIDATION_ERROR', 422))
        : Promise.resolve(records([])),
    )
    renderWithRouter(<LearningPanel resource={sample()} changed={changed} initialView="manage" />)
    fill()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('记录未通过检查')
    expect(changed).not.toHaveBeenCalled()
  })
  it('keeps validation failures editable without automatic retries', async () => {
    let writes = 0
    vi.spyOn(api, 'request').mockImplementation((_path, init) => {
      if (init?.method === 'POST') {
        writes++
        return Promise.reject(new ApiError('VALIDATION_ERROR', 422))
      }
      return Promise.resolve(records([]))
    })
    renderWithRouter(<LearningPanel resource={sample()} />)
    open()
    fill()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('记录未通过检查')
    expect(screen.getByRole('button', { name: '保存学习记录' })).toBeEnabled()
    expect(writes).toBe(1)
  })
})

describe('learning history', () => {
  it('renders the live global route, safe text and corresponding resource links', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue(records())
    const { container } = renderWithRouter(<App />, '/study-records')
    expect(await screen.findByText('合成总结 <script>不执行</script>')).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByRole('link', { name: '打开这条记录对应的资料' })).toHaveAttribute(
      'href',
      '/resources/' + sample().id,
    )
    expect(request).toHaveBeenCalledExactlyOnceWith(
      '/api/v1/study-records?sort=-started_at&page=1&page_size=20',
    )
  })
  it('handles read failures, empty state, stable pagination and applied filters', async () => {
    const request = vi
      .spyOn(api, 'request')
      .mockRejectedValueOnce(new ApiError('NETWORK_ERROR'))
      .mockResolvedValueOnce(records([], { total_items: 21, total_pages: 2, has_more: true }))
      .mockResolvedValue(records([]))
    renderWithRouter(<RecordHistory />)
    expect(await screen.findByRole('alert')).toHaveTextContent('历史暂时无法读取')
    fireEvent.click(screen.getByRole('button', { name: '重新读取历史' }))
    await screen.findByText('这一页还没有学习记录')
    fireEvent.click(screen.getByRole('button', { name: '下一页记录' }))
    await waitFor(() => expect(request.mock.lastCall?.[0]).toContain('page=2'))
    change('记录开始时间起', '2026-09-02T12:00')
    change('记录开始时间止', '2026-09-03T12:00')
    change('记录排序', '-duration_seconds')
    fireEvent.submit(screen.getByRole('form', { name: '筛选学习历史' }))
    await waitFor(() => expect(request.mock.lastCall?.[0]).toContain('sort=-duration_seconds'))
    const query = new URL(request.mock.lastCall![0], 'http://synthetic.test').searchParams
    expect(query.get('page')).toBe('1')
    expect(query.get('started_from')).toBe(new Date('2026-09-02T12:00').toISOString())
    fireEvent.click(screen.getByRole('button', { name: '重置记录筛选' }))
    await waitFor(() => expect(request.mock.lastCall?.[0]).toContain('sort=-started_at&page=1'))
  })
  it('ignores a stale query and rejects reversed time bounds without a request', async () => {
    const old = deferred<unknown>()
    const request = vi
      .spyOn(api, 'request')
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue(records([]))
    renderWithRouter(<RecordHistory />)
    change('记录排序', 'started_at')
    fireEvent.submit(screen.getByRole('form', { name: '筛选学习历史' }))
    await screen.findByText('这一页还没有学习记录')
    await act(async () => old.resolve(records()))
    expect(screen.queryByText('合成疑问')).not.toBeInTheDocument()
    change('记录开始时间起', '2026-09-04T12:00')
    change('记录开始时间止', '2026-09-03T12:00')
    fireEvent.submit(screen.getByRole('form', { name: '筛选学习历史' }))
    expect(screen.getByRole('alert')).toHaveTextContent('结束时间不能早于')
    expect(request).toHaveBeenCalledTimes(2)
  })
})
