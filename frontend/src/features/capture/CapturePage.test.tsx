import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import { renderWithRouter } from '../../test/render'
import { imageFailureText } from './freeze'
import App from '../../App'
import { resourceId, sample, sampleFile } from '../resources/fixtures'

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

describe('capture page · citation', () => {
  const citation = {
    item_type: 'JOURNAL_ARTICLE' as const,
    authors: ['Karpathy, Anna', '李维'],
    issued_year: 2024,
    issued_date: '2024/03/01',
    container_title: 'Nature Machine Intelligence',
    volume: '6',
    issue: '3',
    pages: '245-259',
    publisher: 'Springer Nature',
    doi: '10.1038/s42256-024-00812-x',
    isbn: null,
  }
  const paper = { ...captured, citation }

  /** 后端真的会回的那一份文献（`citationAt` 会逐字校验，随便回个 `{}` 会被判不合格）。 */
  const storedCitation = {
    resource_id: sample().id,
    ...citation,
    abstract: null,
    version: 1,
    created_at: '2026-09-20T02:00:00Z',
    updated_at: '2026-09-20T02:00:00Z',
  }

  /** 资料与正文都成功；文献那一次由调用方决定怎么回。 */
  function backend(onCitation: () => unknown = () => ({ data: storedCitation })) {
    return vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (path === '/api/v1/resources' && options?.method === 'POST') return { data: sample() }
      if (path.endsWith('/citation')) return onCitation()
      if (options?.method === 'PUT') return { data: snapshotSample }
      return undefined
    })
  }

  it('shows what it recognised, ticked, and stores it alongside the resource', async () => {
    const request = backend()
    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver({}, paper)
    const toggle = await screen.findByRole('checkbox', { name: /一并存下来/ })
    expect(toggle).toBeChecked()
    expect(screen.getByText('Karpathy, Anna；李维')).toBeInTheDocument()
    expect(screen.getByText('Nature Machine Intelligence')).toBeInTheDocument()
    expect(screen.getByText('期刊论文')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '保存为资料' }))
    await waitFor(() =>
      expect(
        request.mock.calls.some(
          ([path, options]) => path.endsWith('/citation') && options?.method === 'PUT',
        ),
      ).toBe(true),
    )
    // 写成功就该离开这一页去资料页——上一版这里的假响应通不过 `citationAt` 校验，
    // 这条用例实际落在失败分支上，名不副实（Review F2）。
    await waitFor(() => expect(screen.queryByRole('form', { name: '确认采集内容' })).toBeNull())
    expect(screen.queryByText(/文献信息没存上/)).toBeNull()
    const [, options] = request.mock.calls.find(([path]) => path.endsWith('/citation'))!
    // 整份写入、首次不带 expected_version；空字段不出现。
    expect(options!.body).toEqual({
      item_type: 'JOURNAL_ARTICLE',
      authors: ['Karpathy, Anna', '李维'],
      issued_year: 2024,
      issued_date: '2024/03/01',
      container_title: 'Nature Machine Intelligence',
      volume: '6',
      issue: '3',
      pages: '245-259',
      publisher: 'Springer Nature',
      doi: '10.1038/s42256-024-00812-x',
    })
  })

  it('writes nothing extra when the user unticks it', async () => {
    const request = backend()
    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver({}, paper)
    fireEvent.click(await screen.findByRole('checkbox', { name: /一并存下来/ }))
    fireEvent.click(screen.getByRole('button', { name: '保存为资料' }))
    await waitFor(() =>
      expect(request.mock.calls.some(([path]) => path === '/api/v1/resources')).toBe(true),
    )
    expect(request.mock.calls.filter(([path]) => path.endsWith('/citation'))).toEqual([])
  })

  it('adds nothing at all to the page when the page is not a paper', async () => {
    backend()
    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver()
    await screen.findByDisplayValue('如何理解数据库索引')
    expect(screen.queryByRole('checkbox', { name: /一并存下来/ })).toBeNull()
    expect(screen.queryByText(/这页看起来是一篇文献/)).toBeNull()
  })

  it('tells both truths when the images and the citation each failed, and still only once', async () => {
    // Review 第二轮指出：这个组合状态当时没有任何用例，而文案里「只有文献信息没存上」
    // 在这里恰好是假的。两块提示都该在，「打开这份资料」只该有一个。
    const withImage = { ...paper, images: ['https://cdn.example.com/a.png'] }
    // 假扮中转脚本，答「这张取不到」——页面不这么问一句，冻结会一直等下去。
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      const envelope = message as { type?: string; url?: string }
      if (envelope?.type !== CAPTURE_IMAGE_REQUEST || !envelope.url) return
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: CAPTURE_IMAGE_RESULT, url: envelope.url, result: { ok: false } },
          origin: window.location.origin,
          source: window,
        }),
      )
    })
    vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (path === '/api/v1/resources' && options?.method === 'POST') return { data: sample() }
      if (path.endsWith('/citation')) throw new ApiError('UNKNOWN_ERROR', 500)
      if (options?.method === 'PUT') return { data: snapshotSample }
      return undefined
    })
    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver({}, withImage)
    fireEvent.click(await screen.findByRole('button', { name: '保存为资料' }))
    await screen.findByText(/文献信息没存上/)
    expect(screen.queryByText(/只有文献信息没存上/)).toBeNull()
    expect(screen.queryByRole('form', { name: '确认采集内容' })).toBeNull()
    expect(screen.getAllByRole('link', { name: '打开这份资料' })).toHaveLength(1)
  })

  it('keeps the resource when only the citation fails to save, and says where to fix it', async () => {
    const request = backend(() => {
      throw new ApiError('UNKNOWN_ERROR', 500)
    })
    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver({}, paper)
    fireEvent.click(await screen.findByRole('button', { name: '保存为资料' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/文献信息没存上/)
    expect(screen.getByRole('link', { name: '打开这份资料' })).toBeInTheDocument()
    // **表单必须消失**：留着它，用户再点一次「保存为资料」会静默新建第二份资料 +
    // 第二份快照 + 重下全部图片。图片分支当初就是为这个缺陷改的，这里不能再犯（Review F1）。
    expect(screen.queryByRole('form', { name: '确认采集内容' })).toBeNull()
    expect(screen.queryByRole('button', { name: '保存为资料' })).toBeNull()
    // 不因为这次失败重新建一份资料。
    expect(
      request.mock.calls.filter(
        ([path, options]) => path === '/api/v1/resources' && options?.method === 'POST',
      ),
    ).toHaveLength(1)
  })
})

describe('capture page · pdf', () => {
  /** 8 字节的假 PDF：`%PDF-` 开头，长度与 base64 对得上（接收端会校验这一点）。 */
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3])
  const base64 = btoa(String.fromCharCode(...bytes))
  const pdf = { name: '2401.00001.pdf', bytes: bytes.length, base64 }
  const citation = {
    item_type: 'PREPRINT' as const,
    authors: ['李维'],
    issued_year: 2024,
    issued_date: null,
    container_title: null,
    volume: null,
    issue: null,
    pages: null,
    publisher: null,
    doi: '10.48550/arXiv.2401.00001',
    isbn: null,
  }
  const paper = { ...captured, citation, pdf, pdf_problem: null }

  function backend() {
    const upload = vi.spyOn(api, 'uploadResource').mockResolvedValue({ data: sampleFile() })
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (path === '/api/v1/resources' && options?.method === 'POST') return { data: sample() }
      if (path.endsWith('/citation'))
        return {
          data: {
            resource_id: sampleFile().id,
            ...citation,
            abstract: null,
            version: 1,
            created_at: '2026-09-21T02:00:00Z',
            updated_at: '2026-09-21T02:00:00Z',
          },
        }
      if (options?.method === 'PUT') return { data: snapshotSample }
      return undefined
    })
    return { upload, request }
  }

  it('saves the PDF itself, not the page it was described on', async () => {
    const { upload, request } = backend()
    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver({}, paper)
    expect(await screen.findByRole('checkbox', { name: /保存这份 PDF/ })).toBeChecked()
    // 存 PDF 时正文不该还摆在那儿——那一页只是对文献的描述。
    expect(screen.queryByLabelText(/正文（Markdown/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '保存为资料' }))
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
    const form = upload.mock.calls[0]![0]
    expect(form.get('source_type')).toBe('FILE')
    const file = form.get('file') as File
    expect(file.name).toBe('2401.00001.pdf')
    expect(file.type).toBe('application/pdf')
    expect(file.size).toBe(8)
    // 没有快照那一步：不存网页正文。
    expect(
      request.mock.calls.filter(([p, o]) => p.endsWith('/snapshot') && o?.method === 'PUT'),
    ).toEqual([])
    // 文献信息照样存。
    await waitFor(() =>
      expect(request.mock.calls.some(([p]) => p.endsWith('/citation'))).toBe(true),
    )
  })

  it('falls back to the page text when the user unticks it', async () => {
    const { upload, request } = backend()
    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver({}, paper)
    fireEvent.click(await screen.findByRole('checkbox', { name: /保存这份 PDF/ }))
    // 取消后正文回来了，可编辑。
    expect(await screen.findByLabelText(/正文（Markdown/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存为资料' }))
    await waitFor(() =>
      expect(
        request.mock.calls.some(([p, o]) => p === '/api/v1/resources' && o?.method === 'POST'),
      ).toBe(true),
    )
    expect(upload).not.toHaveBeenCalled()
  })

  // 四种拿不到 PDF 的原因各说各的话：用户看到的不能是一句笼统的「失败了」，
  // 因为该怎么办完全不同（换个入口／自己下载／登录后再来）。
  it.each([
    ['cross-origin', /PDF 在另一个域名下/],
    ['too-large', /超过 25 MiB/],
    ['not-pdf', /取回来的不是 PDF/],
    ['failed', /没能取下来/],
  ] as const)('says plainly why a paper came without its PDF: %s', async (problem, said) => {
    backend()
    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver({}, { ...captured, citation, pdf: null, pdf_problem: problem })
    expect(await screen.findByText(said)).toBeInTheDocument()
    // 没有 PDF 就照旧存网页正文，正文仍在。
    expect(screen.getByLabelText(/正文（Markdown/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /保存这份 PDF/ })).toBeNull()
  })

  it('adds nothing for a page that is not a paper', async () => {
    backend()
    mount()
    await screen.findByText(/还没有收到扩展发来的内容/)
    deliver()
    await screen.findByDisplayValue('如何理解数据库索引')
    expect(screen.queryByRole('checkbox', { name: /保存这份 PDF/ })).toBeNull()
    expect(screen.getByLabelText(/正文（Markdown/)).toBeInTheDocument()
  })
})
