import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../api/client'
import App from '../../App'
import { renderWithRouter } from '../../test/render'
import { resourceId, sample, samplePage } from './fixtures'
import { collectOutline } from './outline'
import { fingerprintOf, positionKey, readPosition, writePosition } from './readerPosition'

// TASK-067：左侧目录栏 + 阅读位置记忆。目录从**渲染后的 DOM** 收集，所以用例走整页
// （App + 路由 + 真正的 markdown 渲染），不 mock 渲染器。

const detailPath = `/api/v1/resources/${resourceId}`
const article = [
  '# 文章自带的一级标题',
  '',
  '开头一段。',
  '',
  '## 1 什么是神经网络',
  '',
  '第一节。',
  '',
  '### 1.1 神经元模型',
  '',
  '一点一节。',
  '',
  '## 2 目标函数',
  '',
  '第二节。',
  '',
].join('\n')
const plain = '没有任何标题的一段正文。\n'

function snapshotOf(content: string) {
  return {
    id: '018f1f58-4eb2-4a0d-a716-fb81b1960001',
    resource_id: resourceId,
    format: 'MARKDOWN',
    content,
    char_count: content.length,
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
}

function mount(content = article) {
  vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
    if (path === `${detailPath}/snapshot`) return { data: snapshotOf(content) }
    if (path === `${detailPath}/snapshot/assets`) return { data: [] }
    if (path.startsWith(`${detailPath}/notes?`))
      return {
        data: [],
        page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
      }
    if (path === detailPath) return { data: sample() }
    return samplePage([])
  })
  return renderWithRouter(<App />, `/resources/${resourceId}`)
}

const outline = () => screen.queryByRole('navigation', { name: '目录' })
const outlineItems = () =>
  within(screen.getByRole('navigation', { name: '目录' }))
    .getAllByRole('listitem')
    .map((item) => within(item).getByRole('button'))

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(api, 'downloadSnapshotAsset').mockResolvedValue(new Blob([new Uint8Array([1])]))
  // jsdom 没有 scrollIntoView / 平滑滚动；目录只负责调用它。
  Element.prototype.scrollIntoView = vi.fn()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => {
  cleanup()
})

describe('reader outline', () => {
  it('lists h2/h3 of the rendered body in document order with their levels', async () => {
    mount()
    await waitFor(() => expect(outline()).not.toBeNull())
    const items = outlineItems()
    // 只收 h2/h3：文章自带的 `# 一级标题` 不进目录（它与页面 h1 同级，不是章节）。
    expect(items.map((item) => item.textContent)).toEqual([
      '1 什么是神经网络',
      '1.1 神经元模型',
      '2 目标函数',
    ])
    expect(items[0].closest('li')).toHaveClass('level-2')
    expect(items[1].closest('li')).toHaveClass('level-3')
    expect(within(outline()!).getByText('3 节')).toBeInTheDocument()
    // 目录在正文列之前（页面左侧）。
    const main = document.querySelector('.reader-main')!
    expect(outline()!.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(document.querySelector('.reader-body')).toHaveClass('outline-open')
  })

  it('renders no outline column when the body has no headings', async () => {
    mount(plain)
    await screen.findByRole('region', { name: '正文快照' })
    await screen.findByText('没有任何标题的一段正文。')
    expect(outline()).toBeNull()
    expect(document.querySelector('.reader-body')).not.toHaveClass('outline-open')
    // 菜单里也没有目录开关：没有目录可显示。
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }))
    expect(screen.queryByRole('menuitem', { name: /目录/ })).toBeNull()
  })

  it('scrolls the heading into view when an item is clicked', async () => {
    mount()
    await waitFor(() => expect(outline()).not.toBeNull())
    fireEvent.click(outlineItems()[2])
    const heading = screen.getByRole('heading', { name: '2 目标函数', level: 2 })
    expect(heading.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('marks the last heading above the fold as current and follows scrolling', async () => {
    mount()
    await waitFor(() => expect(outline()).not.toBeNull())
    const [h2a, h3, h2b] = ['1 什么是神经网络', '1.1 神经元模型', '2 目标函数'].map((name) =>
      screen.getByRole('heading', { name }),
    )
    const place = (tops: number[]) => {
      ;[h2a, h3, h2b].forEach((element, index) => {
        vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
          top: tops[index],
        } as DOMRect)
      })
      fireEvent.scroll(window)
    }
    // 第 1 节标题已滚过顶栏，1.1 还在下面 → 当前是第 1 节。
    place([-200, 300, 900])
    await waitFor(() => expect(outlineItems()[0]).toHaveAttribute('aria-current', 'location'))
    expect(outlineItems()[1]).not.toHaveAttribute('aria-current')
    // 继续滚：1.1 也过了顶栏 → 当前是 1.1。
    place([-800, -100, 500])
    await waitFor(() => expect(outlineItems()[1]).toHaveAttribute('aria-current', 'location'))
    expect(outlineItems()[1].closest('li')).toHaveClass('current')
    expect(outlineItems()[0].closest('li')).not.toHaveClass('current')
  })

  it('hides with the 隐藏 button, ⌘\\ or the menu, and remembers the choice', async () => {
    mount()
    await waitFor(() => expect(outline()).not.toBeNull())
    fireEvent.click(within(outline()!).getByRole('button', { name: '隐藏' }))
    expect(outline()).toBeNull()
    expect(localStorage.getItem('studypilot.reader.outline')).toBe('0')
    // ⌘\ 再显示；Ctrl+\ 同样有效，带 Shift 的不算。
    fireEvent.keyDown(document, { key: '\\', metaKey: true })
    expect(outline()).not.toBeNull()
    fireEvent.keyDown(document, { key: '\\', metaKey: true, shiftKey: true })
    expect(outline()).not.toBeNull()
    fireEvent.keyDown(document, { key: '\\', ctrlKey: true })
    expect(outline()).toBeNull()
    // 菜单项文案随状态变。
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '显示目录' }))
    expect(outline()).not.toBeNull()
    expect(localStorage.getItem('studypilot.reader.outline')).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }))
    expect(screen.getByRole('menuitem', { name: '隐藏目录' })).toBeInTheDocument()
  })

  it('starts hidden when the user hid it last time', async () => {
    localStorage.setItem('studypilot.reader.outline', '0')
    mount()
    await screen.findByRole('heading', { name: '2 目标函数', level: 2 })
    expect(outline()).toBeNull()
  })

  it('collects nothing from a container without a rendered body', () => {
    const root = document.createElement('div')
    root.innerHTML = '<pre class="snapshot-body"><h2>源码里的标题</h2></pre>'
    expect(collectOutline(root)).toEqual([])
    expect(collectOutline(null)).toEqual([])
  })
})

describe('reader position memory', () => {
  it('saves the scroll position with a body fingerprint, and restores it next time', async () => {
    const first = mount()
    await screen.findByRole('heading', { name: '2 目标函数', level: 2 })
    // 恢复只发生在正文出现后；首次打开没有记录，不滚。
    expect(window.scrollTo).not.toHaveBeenCalled()
    const body = document.querySelector('.snapshot-rendered')!
    const fingerprint = fingerprintOf(body)
    expect(fingerprint).toBeGreaterThan(0)
    // 滚动 → 记下位置（按帧节流）。
    Object.defineProperty(window, 'scrollY', { value: 640, configurable: true })
    fireEvent.scroll(window)
    await waitFor(() => expect(readPosition(resourceId)?.top).toBe(640))
    expect(readPosition(resourceId)?.fingerprint).toBe(fingerprint)
    first.unmount()
    cleanup()
    // 再次打开：正文一到就恢复到 640。
    mount()
    await screen.findByRole('heading', { name: '2 目标函数', level: 2 })
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith({ top: 640 }))
  })

  it('does not restore when the body changed since (fingerprint mismatch)', async () => {
    writePosition(resourceId, {
      top: 900,
      percent: 50,
      fingerprint: 1,
      savedAt: '2026-09-17T00:00:00Z',
    })
    mount()
    await screen.findByRole('heading', { name: '2 目标函数', level: 2 })
    // 给 MutationObserver 一个回合。
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('ignores corrupt storage', () => {
    localStorage.setItem(positionKey(resourceId), '{"top":"x"}')
    expect(readPosition(resourceId)).toBeNull()
    localStorage.setItem(positionKey(resourceId), 'not json')
    expect(readPosition(resourceId)).toBeNull()
  })
})
