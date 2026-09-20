import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import { ReaderCitation } from './ReaderCitation'
import type { Citation } from './citation'

/**
 * 右栏「信息」Tab 里的文献信息（TASK-078）：三个状态、整份替换的请求形状、
 * 本地校验落到字段、清空要二次确认，以及**读取失败不许喊 alert**。
 */

const resourceId = '018f1f58-4eb2-4a0d-a716-fb81b1960001'

function row(overrides: Partial<Citation> = {}): Citation {
  return {
    resource_id: resourceId,
    item_type: 'JOURNAL_ARTICLE',
    authors: ['Anna Karpathy', '李维'],
    issued_year: 2024,
    issued_date: null,
    container_title: 'Nature Machine Intelligence',
    volume: '6',
    issue: '3',
    pages: '245–259',
    publisher: 'Springer Nature',
    doi: '10.1038/s42256-024-00812-x',
    isbn: null,
    abstract: null,
    version: 2,
    created_at: '2026-09-20T02:00:00Z',
    updated_at: '2026-09-20T03:00:00Z',
    ...overrides,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('citation in the info tab', () => {
  it('shows what it is good for when nothing is filled in yet', async () => {
    vi.spyOn(api, 'request').mockRejectedValue(new ApiError('CITATION_NOT_FOUND', 404))
    render(<ReaderCitation resourceId={resourceId} />)
    expect(await screen.findByText(/还没有记作者、年份、期刊/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '填写文献信息' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('writes the whole citation in one save and comes back read-only', async () => {
    const request = vi
      .spyOn(api, 'request')
      .mockRejectedValueOnce(new ApiError('CITATION_NOT_FOUND', 404))
      .mockResolvedValue({ data: row({ authors: ['李维'], version: 1 }) })
    render(<ReaderCitation resourceId={resourceId} />)
    fireEvent.click(await screen.findByRole('button', { name: '填写文献信息' }))
    fireEvent.change(screen.getByLabelText('第 1 位作者'), { target: { value: '李维' } })
    fireEvent.change(screen.getByLabelText('年份'), { target: { value: '2024' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByText('Springer Nature')
    const [, options] = request.mock.calls[1]!
    // 首次写入不带 expected_version；没填的格子整个不出现在请求体里。
    expect(options).toMatchObject({ method: 'PUT' })
    expect(options!.body).toEqual({ item_type: 'OTHER', authors: ['李维'], issued_year: 2024 })
    // 已填态：DOI 是可点开的链接。
    // DOI 里的斜杠是地址的一部分，不能编成 %2F——编了就不是同一个 DOI 了。
    expect(screen.getByRole('link', { name: '10.1038/s42256-024-00812-x' })).toHaveAttribute(
      'href',
      'https://doi.org/10.1038/s42256-024-00812-x',
    )
  })

  it('carries expected_version when replacing, and says so when someone else got there first', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ data: row() })
    render(<ReaderCitation resourceId={resourceId} />)
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
    request.mockRejectedValueOnce(new ApiError('VERSION_CONFLICT', 409))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/刚在别处改过/)
    // 保存失败不许把表单关掉——用户填的东西还在里面。
    expect(screen.getByLabelText('第 1 位作者')).toHaveValue('Anna Karpathy')
    const [, options] = request.mock.calls[1]!
    expect(options!.body).toMatchObject({ expected_version: 2 })

    // 光有提示没用：手里这份的版本已经过时，再按保存只会再撞一次，所以编辑态里
    // 必须当场给出一条出路（Review F2）。
    request.mockResolvedValue({ data: row({ publisher: '别处改过的出版方', version: 7 }) })
    fireEvent.click(screen.getByRole('button', { name: '重新读取（放弃这次修改）' }))
    await waitFor(() =>
      expect((screen.getByLabelText('出版方') as HTMLInputElement).value).toBe('别处改过的出版方'),
    )
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(request).toHaveBeenCalledTimes(4))
    // 重读之后再保存带的是新版本，不是那个已经撞过的旧版本。
    expect(request.mock.calls[3]![1]!.body).toMatchObject({ expected_version: 7 })
  })

  it('does not quietly drop an ISBN it has no input box for', async () => {
    // PUT 是整份替换：界面不认识的字段如果不带回去，按一次保存就被抹掉了。
    const request = vi.spyOn(api, 'request').mockResolvedValue({ data: row({ isbn: '978-7-111' }) })
    render(<ReaderCitation resourceId={resourceId} />)
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    expect(request.mock.calls[1]![1]!.body).toMatchObject({ isbn: '978-7-111' })
  })

  it('stops a bad year at the field it belongs to, without asking the server', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ data: row() })
    render(<ReaderCitation resourceId={resourceId} />)
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('年份'), { target: { value: '999' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText(/年份要在 1000–2200 之间/)).toBeInTheDocument()
    // 只发过那一次读取：本地就拦住了，没有白跑一趟服务端。
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('asks before clearing, because clearing cannot be undone', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ data: row() })
    render(<ReaderCitation resourceId={resourceId} />)
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
    fireEvent.click(screen.getByRole('button', { name: '清空文献信息' }))
    const dialog = await screen.findByRole('alertdialog', { name: '确认清空文献信息' })
    expect(request).toHaveBeenCalledTimes(1)

    request.mockResolvedValueOnce(undefined)
    fireEvent.click(within(dialog).getByRole('button', { name: '确定清空' }))
    await screen.findByRole('button', { name: '填写文献信息' })
    expect(request.mock.calls[1]![1]).toEqual({ method: 'DELETE', ifMatchVersion: 2 })
  })

  it('stays quiet when the citation cannot be read, and offers to try again', async () => {
    // 被动失败不该对读屏器喊：它只是「这块没读到」。一条既有用例曾被这个 alert 撞飞。
    const request = vi.spyOn(api, 'request').mockRejectedValue(new ApiError('NETWORK_ERROR'))
    render(<ReaderCitation resourceId={resourceId} />)
    expect(await screen.findByText(/没读到文献信息/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: '填写文献信息' })).toBeNull()

    request.mockResolvedValue({ data: row() })
    fireEvent.click(screen.getByRole('button', { name: '重新读取' }))
    await waitFor(() => expect(screen.getByText('Springer Nature')).toBeInTheDocument())
  })
})
