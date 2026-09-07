import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import { renderWithRouter } from '../../test/render'
import { imageFailureText } from './freeze'
import App from '../../App'
import { resourceId, sample } from '../resources/fixtures'

import {
  CAPTURE_IMAGE_REQUEST,
  CAPTURE_IMAGE_RESULT,
  CAPTURE_PAYLOAD,
  CAPTURE_READY,
} from './protocol'

/** 后端返回的快照与资产形状，只用到本测试关心的字段。 */
const snapshotSample = {
  id: resourceId,
  resource_id: resourceId,
  format: 'MARKDOWN',
  content: '正文',
  char_count: 2,
  sha256: '0'.repeat(64),
  captured_at: '2026-09-07T02:00:00Z',
  captured_from_url: null,
  extractor: 'manual',
  status: 'READY',
  failure_code: null,
  version: 1,
  created_at: '2026-09-07T02:00:00Z',
  updated_at: '2026-09-07T02:00:00Z',
}

const assetSample = {
  id: '018f1f58-4eb2-4a0d-a716-fb81b1960010',
  snapshot_id: resourceId,
  source_url: 'https://cdn.example.com/a.png',
  media_type: 'image/png',
  size_bytes: 8,
  sha256: '0'.repeat(64),
  created_at: '2026-09-07T02:00:00Z',
}

const captured = {
  title: '如何理解数据库索引',
  url: 'https://example.com/db-index',
  markdown: '# 如何理解数据库索引\n\n索引的本质是用空间换时间。\n',
  images: [],
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

function mount() {
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
    ['网址带片段标识符（后端会拒）', {}, { ...captured, url: 'https://example.com/a#x' }],
    ['网址带凭据', {}, { ...captured, url: 'https://u:p@example.com/a' }],
  ])('discards a forged delivery %s', async (_label, overrides, payload) => {
    // 完成条件 4：任何网页都能向同源窗口 postMessage，所以这里是信任边界本身。
    vi.spyOn(api, 'request').mockResolvedValue(undefined)
    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver(overrides, payload)
    // 鉴别力全在下面那条 form 断言上：空态在 deliver 之前就已存在，对它的断言近似恒真，
    // 只用来等一次微任务冲刷，不承担防线。
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
    // 提示语让用户「把下面这段正文粘贴进去」，那段正文就必须还在屏幕上：
    // 扩展暂存在交付时已删、原网页可能已关，这是用户手上唯一的一份。
    expect(screen.getByLabelText(/待粘贴的正文/)).toHaveValue(captured.markdown)
  })
})

describe('capture page with images', () => {
  const withImages = {
    ...captured,
    images: ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png'],
  }
  const PNG = btoa('\x89PNG\r\n\x1a\n')

  /** 假扮中转脚本：页面每问一张图，就按 answers 给出答复。 */
  function relay(answers: Record<string, { ok: boolean; base64?: string }>) {
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      const envelope = message as { type?: string; url?: string }
      if (envelope?.type !== CAPTURE_IMAGE_REQUEST || !envelope.url) return
      const answer = answers[envelope.url] ?? { ok: false }
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: CAPTURE_IMAGE_RESULT, url: envelope.url, result: answer },
          origin: window.location.origin,
          source: window,
        }),
      )
    })
  }

  it('uploads images only after the snapshot exists, with its version', async () => {
    // 顺序不是风格问题：上传资产要带**快照**版本作前置条件，正文没写成就没有版本。
    const calls: string[] = []
    vi.spyOn(api, 'request').mockImplementation(async (path: string, options = {}) => {
      if (options.method === 'POST' && path === '/api/v1/resources') {
        calls.push('create')
        return { data: sample() }
      }
      if (options.method === 'PUT' && path.endsWith('/snapshot')) {
        calls.push('snapshot')
        return { data: { ...snapshotSample, version: 4 } }
      }
      return undefined
    })
    const upload = vi
      .spyOn(api, 'uploadSnapshotAsset')
      .mockImplementation(async () => ({ data: assetSample }))
    relay({
      'https://cdn.example.com/a.png': { ok: true, base64: PNG },
      'https://cdn.example.com/b.png': { ok: true, base64: PNG },
    })

    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver({}, withImages)
    await screen.findByDisplayValue('如何理解数据库索引')
    fireEvent.submit(screen.getByRole('form', { name: '确认采集内容' }))

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2))
    expect(calls).toEqual(['create', 'snapshot'])
    expect(upload.mock.calls.map((call) => call[2])).toEqual([4, 4])
  })

  it('stays on the page and says how many images were not saved', async () => {
    // 跳走等于把「2 张里只存下 1 张」咽掉，而用户此刻还能重新采集。
    vi.spyOn(api, 'request').mockImplementation(async (_path: string, options = {}) => {
      if (options.method === 'POST') return { data: sample() }
      if (options.method === 'PUT') return { data: { ...snapshotSample, version: 1 } }
      return undefined
    })
    vi.spyOn(api, 'uploadSnapshotAsset').mockImplementation(async () => ({ data: assetSample }))
    relay({
      'https://cdn.example.com/a.png': { ok: true, base64: PNG },
      'https://cdn.example.com/b.png': { ok: false },
    })

    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver({}, withImages)
    await screen.findByDisplayValue('如何理解数据库索引')
    fireEvent.submit(screen.getByRole('form', { name: '确认采集内容' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('冻结了 1 张')
    expect(alert.textContent).toContain('1 张没能保存')
    expect(alert.textContent).toContain('仍然指向原网站')
    expect(screen.getByRole('link', { name: '打开这份资料' })).toBeInTheDocument()
  })

  it('asks for nothing when the capture carried no images', async () => {
    const posted: unknown[] = []
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      posted.push(message)
    })
    vi.spyOn(api, 'request').mockImplementation(async (_path: string, options = {}) => {
      if (options.method === 'POST') return { data: sample() }
      if (options.method === 'PUT') return { data: { ...snapshotSample, version: 1 } }
      return undefined
    })
    const upload = vi.spyOn(api, 'uploadSnapshotAsset')

    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver()
    await screen.findByDisplayValue('如何理解数据库索引')
    fireEvent.submit(screen.getByRole('form', { name: '确认采集内容' }))

    await waitFor(() => expect(screen.queryByRole('form')).not.toBeInTheDocument())
    expect(upload).not.toHaveBeenCalled()
    expect(posted.filter((m) => (m as { type?: string })?.type === CAPTURE_IMAGE_REQUEST)).toEqual(
      [],
    )
  })
})

describe('imageFailureText', () => {
  it('names the cause a user can act on, per reason', () => {
    expect(imageFailureText('no-permission', 3)).toContain('权限')
    expect(imageFailureText('http-error', 1)).toContain('拒绝')
    expect(imageFailureText('too-large', 2)).toContain('10 MiB')
    expect(imageFailureText('failed', 1)).toContain('没能取到')
    // **兜底不许臆断原因。** 上传被后端拒时这里拿到的是后端错误码，把它说成
    // 「扩展未响应、网络不通」会把人指向 chrome://extensions，而问题不在那里。
    const conflict = imageFailureText('VERSION_CONFLICT', 1)
    expect(conflict).not.toContain('扩展未响应')
    expect(conflict).toContain('VERSION_CONFLICT')
    expect(imageFailureText('no-answer', 1)).toContain('chrome://extensions')
    // 认不出的原因**必须仍然说人话**。上一版这里会渲染成「1 张：（upload-failed）」——
    // 一个字都没说，而当时的断言（不含「扩展未响应」、含原始码）正好绕过了空串。
    // 我们自己的内部标记可以安全回显，别和注入垃圾同一个下场。
    expect(imageFailureText('upload-failed', 1)).toContain('upload-failed')
    // 认不出的原因**必须仍然说人话**，不能渲染成「1 张：（xxx）」这种一个字没说的提示。
    const unknown = imageFailureText('SOME_NEW_CODE', 1)
    expect(unknown).not.toContain('扩展未响应')
    expect(unknown).toContain('没能保存到本机')
    // 不可信的 reason 不拿去查 messages，也不回显。
    const injected = imageFailureText('constructor', 1)
    expect(injected).toBe('1 张：没能保存到本机。')
    expect(imageFailureText('VERSION_CONFLICT', 1)).toContain('VERSION_CONFLICT')
  })
})
