import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import { renderWithRouter } from '../../test/render'
import App from '../../App'
import { resourceId, sample } from '../resources/fixtures'

import { CAPTURE_PAYLOAD, CAPTURE_READY } from './protocol'

const captured = {
  title: '如何理解数据库索引',
  url: 'https://example.com/db-index',
  markdown: '# 如何理解数据库索引\n\n索引的本质是用空间换时间。\n',
}

/** 模拟扩展中转脚本的一次交付。默认构造一条**合法**消息。 */
function deliver(overrides: Partial<MessageEventInit> = {}, payload: unknown = captured) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: CAPTURE_PAYLOAD, payload },
      origin: window.location.origin,
      source: window,
      ...overrides,
    }),
  )
}

function mount(handler?: Parameters<typeof api.request>[1] extends never ? never : unknown) {
  void handler
  renderWithRouter(<App />, '/capture')
}

describe('capture page', () => {
  it('announces it is ready so the extension knows when to hand over', async () => {
    // 握手方向是「页面先说就绪」。反过来会因为 React 挂载时机不定而丢消息。
    const posted: unknown[] = []
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      posted.push(message)
    })
    vi.spyOn(api, 'request').mockResolvedValue(undefined)
    mount()
    await waitFor(() => expect(posted).toContainEqual({ type: CAPTURE_READY }))
  })

  it('waits with an honest empty state before anything arrives', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue(undefined)
    mount()
    expect(await screen.findByText(/还没有收到扩展发来的内容/)).toBeInTheDocument()
    expect(request.mock.calls.filter(([, options]) => options?.method)).toEqual([])
  })

  it('prefills the form but writes nothing until the user confirms', async () => {
    // 完成条件 2：打开后直接关掉，不能留下任何数据。
    const request = vi.spyOn(api, 'request').mockResolvedValue(undefined)
    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver()
    expect(await screen.findByDisplayValue('如何理解数据库索引')).toBeInTheDocument()
    expect(screen.getByRole('form', { name: '确认采集内容' })).toBeInTheDocument()
    expect(request.mock.calls.filter(([, options]) => options?.method)).toEqual([])
  })

  it.each([
    ['来自别的窗口（跨源 opener 或 iframe）', { source: {} as MessageEventSource }, captured],
    ['来自别的源', { origin: 'https://evil.example' }, captured],
    ['结构不对：缺正文', {}, { title: '标题', url: 'https://example.com/a' }],
    ['正文是空白', {}, { ...captured, markdown: '   ' }],
    ['网址不是 http(s)', {}, { ...captured, url: 'javascript:alert(1)' }],
    ['payload 是字符串', {}, 'not-an-object'],
  ])('discards a forged delivery %s', async (_label, overrides, payload) => {
    // 完成条件 4：任何网页都能向同源窗口 postMessage，所以这里是信任边界本身。
    vi.spyOn(api, 'request').mockResolvedValue(undefined)
    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver(overrides, payload)
    // 仍停在空态，没有崩溃、也没有出现表单。
    await waitFor(() => expect(screen.getByText(/还没有收到扩展发来的内容/)).toBeInTheDocument())
    expect(screen.queryByRole('form', { name: '确认采集内容' })).not.toBeInTheDocument()
  })

  it('creates a WEB resource and writes the snapshot on confirm', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (path === '/api/v1/resources' && options?.method === 'POST') return { data: sample() }
      if (path === `/api/v1/resources/${resourceId}/snapshot` && options?.method === 'PUT') {
        return {
          data: {
            id: resourceId,
            resource_id: resourceId,
            format: 'MARKDOWN',
            content: captured.markdown,
            char_count: 20,
            sha256: 'a'.repeat(64),
            captured_at: '2026-09-06T00:00:00Z',
            captured_from_url: null,
            extractor: 'manual',
            status: 'READY',
            failure_code: null,
            version: 1,
            created_at: '2026-09-06T00:00:00Z',
            updated_at: '2026-09-06T00:00:00Z',
          },
        }
      }
      return undefined
    })
    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver()
    fireEvent.click(await screen.findByRole('button', { name: '保存为资料' }))

    await waitFor(() => {
      const created = request.mock.calls.find(([, options]) => options?.method === 'POST')
      expect(created?.[1]?.body).toEqual({
        title: captured.title,
        source_type: 'WEB',
        source_url: captured.url,
      })
    })
    await waitFor(() => {
      const written = request.mock.calls.find(([, options]) => options?.method === 'PUT')
      expect(written?.[1]?.body).toEqual({ content: captured.markdown })
    })
  })

  it('says plainly when the resource was created but the text was not saved', async () => {
    // 完成条件 5：两次请求不是一个事务。半成功状态最容易被含糊过去。
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (path === '/api/v1/resources' && options?.method === 'POST') return { data: sample() }
      if (options?.method === 'PUT') throw new ApiError('UNKNOWN_ERROR', 500)
      return undefined
    })
    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver()
    fireEvent.click(await screen.findByRole('button', { name: '保存为资料' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('资料已经创建')
    expect(alert).toHaveTextContent('正文没有保存成功')
    expect(alert).toHaveTextContent('不会自动重试')
    expect(screen.getByRole('link', { name: '打开这份资料' })).toHaveAttribute(
      'href',
      `/resources/${resourceId}`,
    )
    // 不自动重试：PUT 只发过一次。
    expect(request.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1)
  })
})
