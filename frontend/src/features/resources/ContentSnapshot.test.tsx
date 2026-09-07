import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import App from '../../App'
import { renderWithRouter } from '../../test/render'

import { tagId } from '../taxonomy/fixtures'
import { resourceId, sample, samplePage } from './fixtures'

const detailPath = `/api/v1/resources/${resourceId}`
const snapshotPath = `${detailPath}/snapshot`
const assetsPath = `${snapshotPath}/assets`
const FROZEN_URL = 'https://cdn.example.com/frozen.png'
const ORIGIN_URL = 'https://cdn.example.com/not-frozen.png'
const assetId = tagId

const body = `# 冻结的标题\n\n正文一段。\n\n![已冻结](${FROZEN_URL})\n\n![没冻上](${ORIGIN_URL})\n`

const snapshot = {
  id: tagId,
  resource_id: resourceId,
  format: 'MARKDOWN',
  content: body,
  char_count: body.length,
  sha256: 'a'.repeat(64),
  captured_at: '2026-09-06T00:00:00Z',
  captured_from_url: null,
  extractor: 'manual',
  status: 'READY',
  failure_code: null,
  version: 1,
  created_at: '2026-09-06T00:00:00Z',
  updated_at: '2026-09-06T00:00:00Z',
}

const asset = {
  id: assetId,
  snapshot_id: tagId,
  source_url: FROZEN_URL,
  media_type: 'image/png',
  size_bytes: 8,
  sha256: 'b'.repeat(64),
  created_at: '2026-09-06T00:00:00Z',
}

function mount(
  options: {
    assets?: unknown
    failAssets?: boolean
    snapshot?: Record<string, unknown>
  } = {},
) {
  vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
    if (path === assetsPath) {
      if (options.failAssets) throw new ApiError('SNAPSHOT_NOT_FOUND', 404)
      return { data: options.assets ?? [asset] }
    }
    if (path === snapshotPath) return { data: options.snapshot ?? snapshot }
    if (path.startsWith(`${detailPath}/notes?`))
      return {
        data: [],
        page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
      }
    if (path === detailPath) return { data: sample() }
    return samplePage([])
  })
  renderWithRouter(<App />, `/resources/${resourceId}`)
}

describe('rendered snapshot', () => {
  let created: string[]
  let revoked: string[]

  beforeEach(() => {
    created = []
    revoked = []
    let next = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:http://127.0.0.1:5173/${(next += 1)}`
      created.push(url)
      return url
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
      revoked.push(url)
    })
  })

  it('renders the Markdown instead of showing its source', async () => {
    vi.spyOn(api, 'downloadSnapshotAsset').mockResolvedValue(new Blob([new Uint8Array([1])]))
    mount()
    const heading = await screen.findByRole('heading', { name: '冻结的标题', level: 1 })
    expect(heading).toBeInTheDocument()
  })

  it('shows the local copy for a frozen image and the origin address for one that is not', async () => {
    // **不得因为「反正未冻结的也会加载」就跳过匹配** —— 那会让冻结白做。
    const download = vi
      .spyOn(api, 'downloadSnapshotAsset')
      .mockResolvedValue(new Blob([new Uint8Array([1])]))
    mount()
    await screen.findByRole('heading', { name: '冻结的标题', level: 1 })
    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(2))
    const [frozenImg, originImg] = [...document.querySelectorAll('img')]
    expect(download).toHaveBeenCalledWith(resourceId, assetId)
    expect(frozenImg?.getAttribute('src')).toBe(created[0])
    expect(frozenImg?.getAttribute('referrerpolicy')).toBeNull()
    expect(originImg?.getAttribute('src')).toBe(ORIGIN_URL)
    // 用户在知情三条隐私代价后选择自动加载；这个属性是唯一的缓解，漏掉会静默失效。
    expect(originImg?.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('keeps the Markdown source reachable', async () => {
    // TASK-042 之前用户只能看到源码，不该因为加了渲染就失去它。
    vi.spyOn(api, 'downloadSnapshotAsset').mockResolvedValue(new Blob([new Uint8Array([1])]))
    mount()
    await screen.findByRole('heading', { name: '冻结的标题', level: 1 })
    fireEvent.click(screen.getByRole('button', { name: '看 Markdown 源码' }))
    expect(await screen.findByText(/!\[已冻结\]/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '冻结的标题', level: 1 })).toBeNull()
  })

  it('releases every blob URL it created when the page goes away', async () => {
    vi.spyOn(api, 'downloadSnapshotAsset').mockResolvedValue(new Blob([new Uint8Array([1])]))
    vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path === assetsPath) return { data: [asset] }
      if (path === snapshotPath) return { data: snapshot }
      if (path.startsWith(`${detailPath}/notes?`))
        return {
          data: [],
          page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
        }
      if (path === detailPath) return { data: sample() }
      return samplePage([])
    })
    const view = renderWithRouter(<App />, `/resources/${resourceId}`)
    await waitFor(() => expect(created).toHaveLength(1))
    // 离开这一页：每个建过的 blob URL 都要回收，否则看得越多留在内存里的越多。
    view.unmount()
    await waitFor(() => expect(revoked).toEqual(created))
  })

  it('still renders the text when the asset list cannot be read, and says every image went to the origin', async () => {
    // 取不到资产列表时**必须给出空映射而不是停在等待态**：正文明明已经在手上了。
    mount({ failAssets: true })
    expect(await screen.findByRole('heading', { name: '冻结的标题', level: 1 })).toBeInTheDocument()
    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(2))
    for (const img of document.querySelectorAll('img')) {
      expect(img.getAttribute('src')).toMatch(/^https:\/\/cdn\.example\.com\//)
    }
    // **这一支必须和「一张都没冻」区分开**：这里所有已冻结的图片都静默改走了原站，
    // 而用户对「向图床发请求」的知情同意只针对「这张没冻上」。此前它记 failed: 0，
    // 界面一个字都不说，等于把知情同意的缺口从一张扩大到全部。
    expect(await screen.findByRole('alert')).toHaveTextContent('已冻结图片的清单没有读出来')
  })

  it('falls back to the origin address for a frozen image whose bytes fail, and says so', async () => {
    vi.spyOn(api, 'downloadSnapshotAsset').mockRejectedValue(new ApiError('FILE_CORRUPTED', 409))
    mount()
    await screen.findByRole('heading', { name: '冻结的标题', level: 1 })
    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(2))
    expect(document.querySelectorAll('img')[0]?.getAttribute('src')).toBe(FROZEN_URL)
    expect(created).toEqual([])
    // **必须让用户看见**：他对「向图床发请求」的知情同意是针对「这张没冻上」给的。
    // 本机副本坏掉时静默改走原站，等于在他以为看的是本机那一份时发了外部请求。
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '1 张已冻结的图片，本机那一份读不出来',
    )
  })

  it('resolves relative image addresses against the address the snapshot was captured from', async () => {
    // 采集地址（`captured_from_url`）优先。不解析成绝对地址，冻结表匹配不上，
    // 用户为它付过一次授权代价的本机副本就白存了。
    const relative = `![已冻结](/frozen.png)\n\n![没冻上](/not-frozen.png)\n`
    vi.spyOn(api, 'downloadSnapshotAsset').mockResolvedValue(new Blob([new Uint8Array([1])]))
    mount({
      snapshot: {
        ...snapshot,
        content: relative,
        char_count: relative.length,
        captured_from_url: 'https://cdn.example.com/guide/page.html',
      },
    })
    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(2))
    const [frozenImg, originImg] = [...document.querySelectorAll('img')]
    expect(frozenImg?.getAttribute('src')).toBe(created[0])
    expect(originImg?.getAttribute('src')).toBe(ORIGIN_URL)
  })

  it('renders no img for a relative address when the snapshot has no captured address', async () => {
    // 手工粘贴进来的快照没有 `captured_from_url`，此时相对地址无从解析。
    // **不产生 img** 好过渲染一个指向本机 UI 自己的 src（那会向本机服务发必然 404
    // 的请求）。留下的是替代文字（span.snapshot-image-refused），不是图片——已记入已知限制 7。
    const relative = '![图](/img/a.png)\n\n正文一段。\n'
    mount({ snapshot: { ...snapshot, content: relative, char_count: relative.length }, assets: [] })
    expect(await screen.findByText('正文一段。')).toBeInTheDocument()
    expect(document.querySelectorAll('img')).toHaveLength(0)
    // 它没有被悄悄吞掉：替代文字仍然在页面上。
    expect(document.querySelector('.snapshot-image-refused')?.textContent).toBe('图')
  })

  it('never writes anything just to display the text', async () => {
    const request = vi.spyOn(api, 'downloadSnapshotAsset').mockResolvedValue(new Blob([]))
    mount()
    await screen.findByRole('heading', { name: '冻结的标题', level: 1 })
    const writes = vi
      .mocked(api.request)
      .mock.calls.filter(([, options]) => options?.method && options.method !== 'GET')
    expect(writes).toEqual([])
    expect(request).toHaveBeenCalled()
  })
})
