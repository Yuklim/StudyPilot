import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
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
/**
 * 页面自己的一级标题（不含正文里的）。
 *
 * **正文渲染出来的 `# 标题` 本身就是 `h1`**（markdown-it 按原级别渲染），所以整页会有
 * 不止一个 `h1`。这在 TASK-044 之前就存在（那时是「资料详情」+ 正文标题），本任务只是
 * 让页面那一个变成了资料名。要把正文标题降级得改 `snapshotMarkdown.ts`，而那个文件是
 * 本任务明确排除的——已记入已知限制，留给后续任务。
 */
const pageHeadings = () =>
  screen
    .getAllByRole('heading', { level: 1 })
    .filter((element) => !element.closest('.snapshot-rendered'))

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
    expect(screen.getByRole('heading', { name: '合成阅读资料', level: 1 })).toBeVisible()
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

  it('makes the resource title the only h1, and the page heading block is gone', async () => {
    // TASK-044：这一页的标题本来就该是资料的名字，而不是「资料详情」四个字。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    const headings = pageHeadings()
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('合成阅读资料')
    expect(screen.queryByText('原始资料与自己的理解，各有一个位置。')).toBeNull()
  })

  it('still has exactly one h1 and a way back while the resource is loading', async () => {
    // **读取中也必须有 h1**：它是路由切换后的焦点落点，没有它键盘用户会失去落点，
    // 而这种失效在屏幕上完全看不出来。
    vi.spyOn(api, 'request').mockImplementation(() => new Promise(() => {}))
    renderWithRouter(<App />, `/resources/${resourceId}`)
    expect(pageHeadings()).toHaveLength(1)
    expect(pageHeadings()[0]).toHaveTextContent('正在打开资料')
    expect(screen.getByRole('link', { name: '返回资料库' })).toBeInTheDocument()
  })

  it('still has exactly one h1 and a way back when the resource cannot be read', async () => {
    vi.spyOn(api, 'request').mockRejectedValue(new ApiError('NETWORK_ERROR'))
    renderWithRouter(<App />, `/resources/${resourceId}`)
    await screen.findByRole('heading', { name: '这份资料打不开', level: 1 })
    expect(pageHeadings()).toHaveLength(1)
    expect(screen.getByRole('link', { name: '返回资料库' })).toBeInTheDocument()
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
    // **删除也必须是一个真正的 menuitem。** 此前它是塞在 `role="menu"` 里的一个普通
    // 按钮，辅助技术按菜单模型只看得到三项 —— 唯独看不到那个销毁性动作。
    expect(items.map((item) => item.textContent)).toEqual([
      '编辑资料',
      '编辑标签',
      '资料信息',
      '删除资料…',
    ])
    const remove = items[3]!
    const separator = within(menu).getByRole('separator')
    // 最后一个普通动作 → 分隔线 → 删除，顺序必须是这个。
    expect(
      items[2]!.compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      separator.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(remove).toHaveClass('danger')
  })

  it('runs the deletion flow outside the popup so a stray click cannot drop the token', async () => {
    // 删除流程渲染在面板里而不是菜单里：菜单是浮层，点一下别处就整块卸载，
    // 会把已经取到的一次性令牌、乃至在途的删除请求一起丢掉。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    fireEvent.click(more())
    fireEvent.click(screen.getByRole('menuitem', { name: '删除资料…' }))
    const panel = await screen.findByRole('region', { name: '放下这一页' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(within(panel).getByRole('button', { name: '删除这份资料' })).toBeInTheDocument()
    // 点面板外面不会把它收掉——那是菜单才有的行为。
    fireEvent.pointerDown(document.body)
    expect(screen.getByRole('region', { name: '放下这一页' })).toBeInTheDocument()
  })

  it('does not steal focus back when a click elsewhere closes the menu', async () => {
    // **这条断言的是「不抢焦点」，而不是「抢回来了」。** 初版在外点这一支调了
    // `menuTrigger.focus()`，jsdom 里绿，真实 Chromium 里被 `mousedown` 的默认聚焦
    // 动作覆盖（实测 `activeElement` 是 `BODY`）——那是一条只在测试环境成立的断言。
    // 用户点了别处，焦点就该跟着去别处；归还只属于 `Esc` 那一支（见上一条）。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    fireEvent.click(more())
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(more()).not.toHaveFocus()
  })

  it('keeps the back arrow out of the accessible name', async () => {
    // `::before`/`::after` 的生成内容在 Chromium 与 Firefox 里**是计入**可访问名称的，
    // 只有 jsdom 不算——所以箭头必须是 `aria-hidden` 的真实元素，否则「箭头不进名称」
    // 这句话只在测试环境里成立。这条断言在 jsdom 里同样能钉住结构：装饰元素必须带
    // `aria-hidden`，且可见文本里确实有那个箭头。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    const back = screen.getByRole('link', { name: '返回资料库' })
    expect(back.textContent).toContain('←')
    expect(back.querySelector('[aria-hidden="true"]')?.textContent).toBe('← ')
  })

  it('renders the icon buttons with no visible text but a real accessible name and tooltip', async () => {
    // **这一条是图标化唯一的机器守卫，而且它必须是「反向」的。** 本仓所有测试都按
    // 可访问名称查控件，所以把文字换成图标之后它们照样全绿——只断言名称是抓不到
    // 「按钮上没有可见文字了」这件事的。这里同时断言两面：可见文本为空、名称与
    // 悬停提示都在。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    for (const [role, name] of [
      ['link', '心得'],
      ['link', '原网页'],
      ['button', '更多操作'],
    ] as const) {
      const control = screen.getByRole(role, { name })
      expect(control.textContent).toBe('')
      // **要校验 `title` 的值，不只是它存在**：写错了照样绿。
      expect(control.getAttribute('title')).toContain(name)
      expect(control.querySelector('svg')).not.toBeNull()
    }
  })

  it.each([
    ['FILE', sampleFile(), '原件'],
    ['PASTE', sample({ source_type: 'PASTE', pasted_content: '合成原文' }), '粘贴原文'],
  ])('gives the %s original entry the same icon treatment', async (_source, item, name) => {
    // 这两个按钮在 `OriginalEntry` 的另一段 JSX 里，上一条覆盖不到——Reviewer 指出的。
    mount(item)
    const control = await screen.findByRole('button', { name })
    expect(control.textContent).toBe('')
    expect(control.getAttribute('title')).toContain(name)
    expect(control.querySelector('svg')).not.toBeNull()
  })

  it('does not steal focus when the resource is opened by its URL directly', async () => {
    // **这是 `focusedForRoute` 那个状态位存在的唯一理由**：直接打开一个网址不是路由
    // 切换，外壳不该聚焦；数据到达换掉占位标题时也不该顺手把焦点抢过去。
    // 此前只有实现、没有守卫。
    mount()
    const title = await screen.findByRole('heading', { name: '合成阅读资料', level: 1 })
    expect(title).not.toHaveFocus()
    expect(document.body).toHaveFocus()
  })

  it('keeps the status badge as text, because it shows a value and not an action', async () => {
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    expect(statusBadge().textContent).toBe(`${statusLabels.UNREAD} · 0%`)
  })

  it('moves focus into the menu when it opens', async () => {
    // 不移焦点的话，按下 ⋯ 之后第一次 Tab 会落到下面那层的标签链接上。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    fireEvent.click(more())
    expect(screen.getByRole('menuitem', { name: '编辑资料' })).toHaveFocus()
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
