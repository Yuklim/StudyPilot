import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../api/client'
import App from '../../App'
import { renderWithRouter } from '../../test/render'
import { resourceId, sample, sampleFile, samplePage } from './fixtures'
import { statusLabels, type Resource } from './api'

const detailPath = `/api/v1/resources/${resourceId}`
const body = '# 冻结的标题\n\n正文一段。\n'
const snapshot = {
  id: '018f1f58-4eb2-4a0d-a716-fb81b1960001',
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

function mount(item: Resource = sample()) {
  vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
    if (path === `${detailPath}/snapshot`) return { data: snapshot }
    if (path === `${detailPath}/snapshot/assets`) return { data: [] }
    if (path.startsWith(`${detailPath}/notes?`))
      return {
        data: [],
        page: { number: 1, size: 20, total_items: 0, total_pages: 0, has_more: false },
      }
    if (path === detailPath) return { data: item }
    return samplePage([])
  })
  renderWithRouter(<App />, `/resources/${resourceId}`)
}

const more = () => screen.getByRole('button', { name: '更多操作' })
// **状态徽章按真值表取名，不写字面量。** 初稿写的是 `/未开始|在读|读完|归档/`，
// 而实际标签是「学习中 / 已完成 / 待复习 / 已归档」——「未开始」恰好匹配上，于是
// 那条正则里三个分支全是错的却照样绿。断言必须绑在真正的数据上。
const statusBadge = () => screen.getByRole('button', { name: `${statusLabels.UNREAD} · 0%` })

beforeEach(() => {
  vi.spyOn(api, 'downloadSnapshotAsset').mockResolvedValue(new Blob([new Uint8Array([1])]))
})

describe('reader toolbar', () => {
  it('puts the body first: the rendered text comes before the notes block', async () => {
    // 这是本任务的全部意义。**断言的是 DOM 顺序，不是「两者都在页面上」**——
    // 后者在改版之前也成立，钉不住任何东西。
    mount()
    const heading = await screen.findByRole('heading', { name: '冻结的标题', level: 1 })
    const notes = screen.getByRole('region', { name: '记录与理解' })
    expect(heading.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps both toolbar layers visible without any click', async () => {
    // 上下文层常驻是一个产品决定：「我当初为什么收下这一页」不该藏进按钮。
    mount(sample({ save_reason: '想搞清双指针', tags: [{ id: resourceId, name: '算法' }] }))
    await screen.findByRole('button', { name: '更多操作' })
    expect(screen.getByRole('link', { name: '返回资料库' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '合成阅读资料', level: 2 })).toBeVisible()
    expect(statusBadge()).toBeVisible()
    expect(screen.getByRole('link', { name: '心得' })).toBeVisible()
    expect(screen.getByRole('link', { name: /原网页/ })).toBeVisible()
    expect(more()).toBeVisible()
    // 第二层：标签与保存原因，不需要任何点击。
    expect(
      within(screen.getByRole('navigation', { name: '资料标签' })).getByText('算法'),
    ).toBeVisible()
    expect(screen.getByText(/想搞清双指针/)).toBeVisible()
  })

  it('says so plainly when there is neither a tag nor a save reason', async () => {
    mount(sample({ save_reason: '', tags: [] }))
    await screen.findByRole('button', { name: '更多操作' })
    expect(screen.getByText('暂无标签')).toBeVisible()
    expect(screen.getByText(/还没有填写保存原因/)).toBeVisible()
  })

  it('opens and closes the more menu with the keyboard, returning focus to its trigger', async () => {
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    fireEvent.click(more())
    expect(more()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: '更多操作' })).toBeVisible()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    // **焦点必须回到触发按钮**：否则用键盘的人在菜单消失后掉到文档开头。
    expect(more()).toHaveFocus()
    expect(more()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the menu when the pointer goes somewhere else', async () => {
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    fireEvent.click(more())
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('keeps deletion at the bottom of the menu, separated from the ordinary actions', async () => {
    // 销毁性动作不与普通动作相邻（用户 2026-09-07 选定）。断言的是**顺序与分隔**，
    // 不只是「删除在菜单里」——后者在它紧挨着「编辑资料」时也成立。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    fireEvent.click(more())
    const menu = screen.getByRole('menu', { name: '更多操作' })
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual(['编辑资料', '编辑标签', '资料信息'])
    const remove = within(menu).getByRole('button', { name: '删除这份资料' })
    const separator = within(menu).getByRole('separator')
    const last = items[items.length - 1]!
    // 最后一个普通动作 → 分隔线 → 删除，顺序必须是这个。
    expect(last.compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      separator.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(remove).toHaveClass('danger')
  })

  it('opens the learning form straight onto the status controls', async () => {
    // 用户选「常驻工具条，点开即改」。默认形态要再点两层才够得着状态表单。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    fireEvent.click(statusBadge())
    const panel = await screen.findByRole('region', { name: '学习状态与进度' })
    expect(within(panel).getByLabelText('学习后状态')).toBeInTheDocument()
    // **改状态仍需一次明确提交**：搬到常驻区不等于点一下就写库。
    expect(within(panel).getByRole('button', { name: '保存学习记录' })).toBeInTheDocument()
  })

  it('shows one panel at a time so the body is not pushed off screen', async () => {
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    fireEvent.click(more())
    fireEvent.click(screen.getByRole('menuitem', { name: '资料信息' }))
    expect(await screen.findByRole('region', { name: '资料信息' })).toBeInTheDocument()
    fireEvent.click(statusBadge())
    expect(screen.queryByRole('region', { name: '资料信息' })).toBeNull()
    expect(screen.getByRole('region', { name: '学习状态与进度' })).toBeInTheDocument()
  })

  it('names the original panel after what the resource actually has', async () => {
    // PASTE 的面板不能叫「原件」——那份资料没有原件。
    mount(sample({ source_type: 'PASTE', pasted_content: '合成原文', source_url: undefined }))
    await screen.findByRole('button', { name: '更多操作' })
    fireEvent.click(screen.getByRole('button', { name: '粘贴原文' }))
    expect(await screen.findByRole('region', { name: '粘贴原文' })).toBeInTheDocument()
    expect(screen.getByLabelText('粘贴原文内容').textContent).toBe('合成原文')
  })

  it('offers a file resource its original behind the same entry', async () => {
    mount(sampleFile())
    await screen.findByRole('button', { name: '更多操作' })
    fireEvent.click(screen.getByRole('button', { name: '原件' }))
    expect(await screen.findByRole('region', { name: '原件' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载原件' })).toBeInTheDocument()
  })

  it('never renders a link for an unsafe original address', async () => {
    mount(sample({ source_url: 'javascript:alert(1)' }))
    await screen.findByRole('button', { name: '更多操作' })
    expect(screen.queryByRole('link', { name: /原网页/ })).toBeNull()
    expect(screen.getByText('原网址无法安全打开')).toHaveAttribute('role', 'alert')
  })

  it('points the notes button at the notes block that actually exists', async () => {
    // 锚点写错就是一个点了没反应的按钮，而这类失效不会让任何断言变红——除非把
    // href 和目标区块的 id 绑成一条。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    const href = screen.getByRole('link', { name: '心得' }).getAttribute('href') ?? ''
    expect(href.startsWith('#')).toBe(true)
    const target = document.getElementById(href.slice(1))
    expect(target).not.toBeNull()
    expect(target).toHaveAttribute('aria-label', '记录与理解')
  })
})
