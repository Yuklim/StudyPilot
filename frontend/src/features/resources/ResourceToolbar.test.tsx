import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import App from '../../App'
import { renderWithRouter } from '../../test/render'
import { resourceId, sample, sampleFile, samplePage } from './fixtures'
import { statusLabels, type Resource } from './api'

// pdf.js 在 jsdom 里跑不了（没有 canvas、没有 worker）。这里要验的不是渲染，而是
// **顶栏装配**：PDF 页的标题、页码、缩放到底在不在同一条工具条上。
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 2,
      getPage: () =>
        Promise.resolve({
          getViewport: ({ scale }: { scale: number }) => ({
            width: 600 * scale,
            height: 800 * scale,
          }),
          render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
          cleanup: () => {},
        }),
      destroy: () => Promise.resolve(),
    }),
  }),
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }))

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

// TASK-045：默认 mock 里这份资料没有心得（`notesTotal = 0`），于是角标不渲染、心得按钮
// 的 `textContent` 仍为空；需要验角标总数的用例传一个 > 0 的值。
function noteRows(count: number) {
  // 后端 `noteAt` 校验 id 必须是 uuid、resource_id 必须等于请求 scope——假数据要过
  // 这个校验才算真把列表读到了（否则落回错误态，角标永远不出现）。
  return Array.from({ length: count }, (_, index) => ({
    id: `10000000-0000-4000-8000-00000000000${index}`,
    resource_id: resourceId,
    content: `合成心得 ${index + 1}`,
    created_at: '2026-09-08T00:00:00Z',
    updated_at: '2026-09-08T00:00:00Z',
    version: 1,
  }))
}
function mount(item: Resource = sample(), notesTotal = 0) {
  vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
    if (path === `${detailPath}/snapshot`) return { data: snapshot }
    if (path === `${detailPath}/snapshot/assets`) return { data: [] }
    if (path.startsWith(`${detailPath}/notes?`))
      return {
        data: noteRows(notesTotal),
        page: { number: 1, size: 20, total_items: notesTotal, total_pages: 0, has_more: false },
      }
    if (path === detailPath) return { data: item }
    return samplePage([])
  })
  renderWithRouter(<App />, `/resources/${resourceId}`)
}

/** 一份原件是 PDF 的 FILE 资料，外加它的字节。 */
function pdfResource() {
  const bytes = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], {
    type: 'application/pdf',
  })
  vi.spyOn(api, 'downloadOriginal').mockResolvedValue({ blob: bytes, fileName: 'p.pdf' })
  return sampleFile({
    title: '一份合成论文',
    original_file: {
      id: '00000000-0000-4000-8000-000000000002',
      status: 'READY',
      original_name: 'p.pdf',
      size_bytes: bytes.size,
      media_type: 'application/pdf',
    },
  })
}

describe('reader toolbar · PDF 页（TASK-081）', () => {
  it('puts the title, the source badge and the PDF controls on one toolbar', async () => {
    mount(pdfResource())
    const toolbar = await screen
      .findByRole('button', { name: '更多操作' })
      .then((b) => b.closest('.reader-toolbar')!)
    // 标题与来源徽章进了顶栏——这正是省下那 64px 的地方。
    expect(within(toolbar as HTMLElement).getByRole('heading', { level: 1 })).toHaveTextContent(
      '一份合成论文',
    )
    // 页码与缩放也在同一条上，而不是底下自成一条。
    await waitFor(() =>
      expect(within(toolbar as HTMLElement).getByLabelText('页码')).toBeInTheDocument(),
    )
    expect(
      within(toolbar as HTMLElement).getByRole('button', { name: '适合宽度' }),
    ).toBeInTheDocument()
    // 正文列里不再有第二个标题块：一页两个 h1 既是无障碍问题，也正是要省掉的高度。
    expect(document.querySelectorAll('h1')).toHaveLength(1)
    expect(document.querySelector('.reader-header')).toBeNull()
  })

  it('spells out 心得 and 原件 instead of showing bare icons', async () => {
    mount(pdfResource())
    const notes = await screen.findByRole('button', { name: '心得' })
    expect(notes.textContent).toBe('心得')
    expect(notes).not.toHaveClass('icon-button')
    const original = screen.getByRole('button', { name: '原件' })
    expect(original.textContent).toBe('原件')
  })

  it('does not name the page-level class after the per-page one', async () => {
    // `.pdf-page` 是 `PdfReader` 给**每一页 PDF** 用的类，它的裸选择器里带
    // `align-items: center`。页级修饰类若同名，那条规则会连整张 sheet 一起命中：
    // 顶栏收成内容宽并居中（实测 1440 视口下只有 950px、左边距 245px），
    // `fitWidth` 量到的也不再是窗口宽，「适合宽度」每点一次反而缩一点
    // （100%→97%→95%）。这是独立 Review F1 抓到、我在真实 Edge 里实测确认的缺陷。
    mount(pdfResource())
    await screen.findByRole('button', { name: '更多操作' })
    const sheet = document.querySelector('.resource-sheet')!
    expect(sheet.classList.contains('reader-pdf')).toBe(true)
    expect(sheet.classList.contains('pdf-page')).toBe(false)
  })

  it('keeps the controls the sketch did not draw', async () => {
    // 用户 2026-09-21：「都放在顶部工具条吧」——草图没画学习状态与 `⋯`，但它们是
    // TASK-073 之前就有的入口（`⋯` 里装着元数据/标签/编辑/删除），不能因为草图没画就删掉。
    mount(pdfResource())
    expect(await screen.findByRole('button', { name: /未开始/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更多操作' })).toBeInTheDocument()
  })
})

describe('reader toolbar · 非 PDF 页不受影响（TASK-081）', () => {
  it.each([
    ['网页资料', () => sample()],
    ['非 PDF 的文件资料', () => sampleFile()],
  ])('keeps %s exactly as it was', async (_label, make) => {
    mount(make())
    await screen.findByRole('button', { name: '更多操作' })
    // 大标题块仍在正文列里（TASK-052 的口径），顶栏里没有内联标题。
    expect(document.querySelector('.reader-header')).not.toBeNull()
    expect(document.querySelector('.reader-toolbar-title')).toBeNull()
    expect(document.querySelector('.reader-toolbar-pdf')).toBeNull()
    // 心得仍是图标按钮：`textContent` 为空正是「图标化」那条既有守卫的判据。
    const notes = screen.getByRole('button', { name: '心得' })
    expect(notes).toHaveClass('icon-button')
    expect(notes.textContent).toBe('')
  })
})

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

  it('keeps the action layer visible, and moves tags + save reason into the 信息 tab', async () => {
    // TASK-046 时上下文层常驻正文顶部；TASK-067 起（用户 2026-09-17 按 Pencil 草图选定）
    // 它在右栏「信息」Tab 里——正文紧接标题，元信息点一下 Tab 就有。
    mount(sample({ save_reason: '想搞清双指针', tags: [{ id: resourceId, name: '算法' }] }))
    await screen.findByRole('button', { name: '更多操作' })
    expect(screen.getByRole('link', { name: '返回资料库' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '合成阅读资料', level: 1 })).toBeVisible()
    expect(statusBadge()).toBeVisible()
    expect(screen.getByRole('button', { name: '心得' })).toBeVisible()
    expect(screen.getByRole('link', { name: /原网页/ })).toBeVisible()
    expect(more()).toBeVisible()
    // 正文列里不再有标签/保存原因。
    expect(document.querySelector('.reader-main .reader-context')).toBeNull()
    // 打开右栏 → 默认「心得」Tab；切到「信息」才看到标签与保存原因。
    fireEvent.click(screen.getByRole('button', { name: '心得' }))
    expect(screen.getByRole('tab', { name: '心得' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: '信息' }))
    expect(screen.getByRole('tab', { name: '信息' })).toHaveAttribute('aria-selected', 'true')
    expect(
      within(screen.getByRole('navigation', { name: '资料标签' })).getByText('算法'),
    ).toBeVisible()
    expect(screen.getByText(/想搞清双指针/)).toBeVisible()
    // 信息 Tab 还汇总来源、学习进度与收藏时间。
    const info = screen.getByRole('tabpanel', { name: '信息' })
    expect(within(info).getByText('来源')).toBeInTheDocument()
    expect(within(info).getByText('学习进度')).toBeInTheDocument()
    expect(within(info).getByText('收藏时间')).toBeInTheDocument()
    // 心得写作框仍然挂载着（只是隐藏）：切 Tab 不能丢草稿。
    const notesPanel = document.getElementById('reader-tabpanel-notes')!
    expect(notesPanel).not.toBeVisible()
    expect(within(notesPanel).getByRole('textbox', { hidden: true })).toBeInTheDocument()
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

  it('draws the learning progress as a line under the toolbar (TASK-067)', async () => {
    mount(
      sample({ progress: { ...sample().progress, status: 'IN_PROGRESS', progress_percent: 38 } }),
    )
    await screen.findByRole('button', { name: '更多操作' })
    const line = document.querySelector('.reader-toolbar .reader-progress')!
    // 只是徽章的另一种呈现：aria-hidden，数值仍由徽章读出。
    expect(line).toHaveAttribute('aria-hidden', 'true')
    expect(line.querySelector('.reader-progress-bar')).toHaveStyle({ width: '38%' })
    expect(screen.getByRole('button', { name: `${statusLabels.IN_PROGRESS} · 38%` })).toBeVisible()
  })

  it('says so plainly when there is neither a tag nor a save reason', async () => {
    mount(sample({ save_reason: '', tags: [] }))
    await screen.findByRole('button', { name: '更多操作' })
    fireEvent.click(screen.getByRole('button', { name: '心得' }))
    fireEvent.click(screen.getByRole('tab', { name: '信息' }))
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

  it('lets the toolbar menu own Escape while the notes sidebar is open', async () => {
    // R1 复审 finding 2：心得侧栏开着时再开 ⋯ 菜单，焦点已进菜单。两个 Esc 监听都挂在
    // document 上，若心得那侧的监听不看焦点在哪，一次 Esc 会把菜单**和**侧栏一起关掉，
    // 焦点也被心得按钮抢走。Esc 只该关当前正被操作的那个表面（菜单）并回到它的触发钮。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    const toggle = screen.getByRole('button', { name: '心得' })
    fireEvent.click(toggle) // 展开侧栏：心得侧的 document Esc 监听随之上树
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'))
    fireEvent.click(more()) // 再开菜单；菜单自己把焦点送进首个菜单项
    expect(screen.getByRole('menuitem', { name: '编辑资料' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    // 菜单关了，侧栏还开着、焦点回到 ⋯ 触发按钮而不是被心得按钮抢走。
    expect(more()).toHaveFocus()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes the notes sidebar on the second Escape once the menu is gone', async () => {
    // TASK-045 遗留 1「死键」：上一条用例的守卫把「焦点在工具条内的任何非心得控件」一律
    // 让给表面自身，可菜单一关、焦点回到 ⋯ 触发钮之后，那里**已经没有表面在开**——再按
    // Esc 什么都不发生，侧栏只能用鼠标点「收起」。Esc 只该让给**正打开的**表面。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    const toggle = screen.getByRole('button', { name: '心得' })
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'))
    fireEvent.click(more())
    expect(screen.getByRole('menuitem', { name: '编辑资料' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(more()).toHaveFocus()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // 第二下：菜单已关、焦点停在 ⋯ 上，这一下属于侧栏。
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'))
    expect(toggle).toHaveFocus()
  })

  it('lets an open panel own Escape while the notes sidebar is open', async () => {
    // TASK-046 把面板移出了 sticky 的 `.reader-toolbar` 盒子。心得那侧的 Esc 守卫此前只认
    // `.reader-toolbar`，面板一搬走，焦点在面板里按 Esc 就会连侧栏一起关掉、焦点还被
    // 心得按钮抢走——正是上一条用例修掉的形态换个位置长回来。守卫因此改认
    // `.reader-toolbar, .reader-panel`，这条钉住新位置。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    const toggle = screen.getByRole('button', { name: '心得' })
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'))
    fireEvent.click(more())
    fireEvent.click(screen.getByRole('menuitem', { name: '资料信息' }))
    const panel = await screen.findByRole('region', { name: '资料信息' })
    // 面板确实在 `.reader-toolbar` 之外了；否则这条用例守的是旧结构。
    expect(panel.closest('.reader-toolbar')).toBeNull()
    const close = within(panel).getByRole('button', { name: '收起' })
    close.focus()
    fireEvent.keyDown(document, { key: 'Escape' })
    // 侧栏不受影响，焦点也没被抢走。
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(close).toHaveFocus()
  })

  it('returns focus to the more button after a menu action that opens nothing', async () => {
    // 「看 Markdown 源码」不开面板、也没有会自动接住焦点的输入框：菜单一关，焦点会掉到
    // `body`，用键盘的人得从头 Tab 一遍。所以这一支要把焦点还给 `⋯`。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    fireEvent.click(more())
    fireEvent.click(screen.getByRole('menuitem', { name: '看 Markdown 源码' }))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(more()).toHaveFocus()
    // 视图真的切过去了，菜单项文案也跟着当前视图走。
    expect(document.querySelector('pre.snapshot-body')).not.toBeNull()
    fireEvent.click(more())
    expect(screen.getByRole('menuitem', { name: '看渲染后的正文' })).toBeInTheDocument()
  })

  it('keeps an exit and exactly one page heading while the resource is loading or broken', async () => {
    // 沉浸页没有左栏，返回链接是唯一的出口；`h1` 是路由切换后的焦点落点。**两者在
    // 读取中与读取失败这两屏同样必须在**——这两屏没有工具条，链接与标题由
    // `ResourceDetail` 自己渲染，改版最容易漏掉的正是它们。
    vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path === detailPath) throw new ApiError('RESOURCE_NOT_FOUND', 404)
      return samplePage([])
    })
    renderWithRouter(<App />, `/resources/${resourceId}`)
    // 读取中那一屏。
    expect(screen.getByRole('link', { name: '返回资料库' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    // 读取失败那一屏。
    await screen.findByRole('heading', { name: '这份资料打不开', level: 1 })
    expect(screen.getByRole('link', { name: '返回资料库' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
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
    // TASK-046 起正文的三个动作也在这个菜单里：两个普通动作排在「资料信息」之后，
    // 「删除正文…」与「删除资料…」同在分隔线之下的销毁区。
    expect(items.map((item) => item.textContent)).toEqual([
      '编辑资料',
      '编辑标签',
      '资料信息',
      '看 Markdown 源码',
      '替换正文',
      '删除正文…',
      '删除资料…',
    ])
    const remove = items[6]!
    const separator = within(menu).getByRole('separator')
    // 最后一个普通动作 → 分隔线 → 删除，顺序必须是这个。
    expect(
      items[4]!.compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // 「删除正文…」也在分隔线之下：它同样是不可撤销的销毁性动作。
    expect(
      separator.compareDocumentPosition(items[5]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      separator.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(remove).toHaveClass('danger')
  })

  it('runs the deletion flow outside the popup so a stray click cannot drop the token', async () => {
    // 删除流程渲染在菜单之外：菜单是浮层，点一下别处就整块卸载，会把已经取到的一次性
    // 令牌、乃至在途的删除请求一起丢掉。TASK-056 起它是模态弹窗（portal 到 body），
    // 菜单关掉、弹窗留下；点页面别处（不是遮罩）不会关掉它。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    fireEvent.click(more())
    fireEvent.click(screen.getByRole('menuitem', { name: '删除资料…' }))
    const dialog = await screen.findByRole('dialog', { name: /^删除“/ })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(dialog.closest('.reader-menu')).toBeNull()
    expect(within(dialog).getByRole('button', { name: '删除' })).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    fireEvent.mouseDown(document.body)
    expect(screen.getByRole('dialog', { name: /^删除“/ })).toBeInTheDocument()
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

  it('keeps the title and source chip in the article column, not in the sticky toolbar', async () => {
    // TASK-052（用户 2026-09-12 选定「标题移出顶栏、全部宽度统一」）：顶栏只装动作。
    // 页面 `h1` 仍恰好一个、仍是资料标题（路由焦点契约不变），只是它现在在正文列里、
    // 上下文层之前；来源徽章跟着它走。**断言的是 DOM 归属**，不是「标题在页面上」——
    // 后者改前也成立。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    // 页面级 h1 恰好一个（正文 Markdown 自带的 `# 一级标题` 是 TASK-046 遗留 B，与它无关）。
    const headings = pageHeadings()
    expect(headings).toHaveLength(1)
    const [title] = headings
    expect(title.closest('.reader-toolbar')).toBeNull()
    expect(title.closest('.reader-main')).not.toBeNull()
    // 标题在正文快照之前（标签/保存原因 TASK-067 起在右栏，不在正文列）。
    const body = screen.getByRole('region', { name: '正文快照' })
    expect(title.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 来源徽章：顶栏里没有，文章头里有。
    const toolbar = document.querySelector('.reader-toolbar')!
    expect(toolbar.querySelector('.source-chip')).toBeNull()
    expect(title.closest('.reader-header')?.querySelector('.source-chip')).toHaveTextContent('网页')
    // 顶栏里剩下的：返回链接与动作，没有任何标题。
    expect(
      within(toolbar as HTMLElement).getByRole('link', { name: '返回资料库' }),
    ).toBeInTheDocument()
    expect(within(toolbar as HTMLElement).queryByRole('heading')).toBeNull()
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
    //
    // TASK-045 起「心得」从跳转链接变成有状态的开合按钮（默认 mock 没有心得，角标
    // 不渲染），可见文本在数量为 0 时仍为空；数量 >0 时的角标由专门的用例断言。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    for (const [role, name] of [
      ['button', '心得'],
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

  it('opens the notes region and focuses the writing box; Escape closes and returns focus', async () => {
    // TASK-045：心得入口从「跳到正文下方的心得块」变成有状态的**开合 + 聚焦**按钮。
    // 侧栏始终挂载、由 CSS 显隐，jsdom 能断言的只有状态（aria-expanded）、焦点去向与
    // Esc 归还；「真的看得见/看不见」交给真实浏览器（reader-notes-sidebar.spec.ts）。
    mount()
    await screen.findByRole('button', { name: '更多操作' })
    const toggle = screen.getByRole('button', { name: '心得' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // 收起态点击＝展开并聚焦写作框。
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: '这次想记下什么？' })).toHaveFocus(),
    )
    // 展开态再点＝焦点回写作框（先把焦点挪走再点，证明真是按钮带回来的）。
    screen.getByRole('button', { name: '更多操作' }).focus()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: '这次想记下什么？' })).toHaveFocus(),
    )
    // Esc 收起，焦点还给触发按钮。
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'))
    expect(toggle).toHaveFocus()
  })

  it('shows the bound note count on the notes button once the mounted panel has read it', async () => {
    // 角标数量来自侧栏挂载后的 `total_items`（数据真实，不是第二份请求、不会漂移）。
    // 默认 0 条时不渲染角标（上面的图标化守卫因此仍成立）；这里验 >0 的形态。
    mount(sample(), 3)
    await screen.findByRole('button', { name: '更多操作' })
    const toggle = screen.getByRole('button', { name: '心得' })
    await waitFor(() => expect(toggle.textContent).toBe('3'))
    const badge = toggle.querySelector('.notes-badge')
    expect(badge).not.toBeNull()
    expect(badge).toHaveAttribute('aria-hidden', 'true')
    expect(toggle.getAttribute('title')).toContain('心得')
  })
})
