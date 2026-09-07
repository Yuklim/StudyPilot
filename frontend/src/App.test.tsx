import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { api } from './api/client'
import { renderWithRouter } from './test/render'

/** 主内容区。「没有假输入」那几条断言只针对它，不针对左栏的真控件。 */
const main = () => document.getElementById('main-content')!

const routes = [
  ['/', '学习概览'],
  ['/reviews', '复习安排'],
  ['/topics', '主题统计'],
  ['/unknown-page', '没有找到这个页面'],
] as const

describe('StudyPilot journal shell', () => {
  beforeEach(() => {
    vi.spyOn(api, 'request').mockImplementation(() => new Promise(() => {}))
  })
  it('clearly distinguishes the shell from real learning data', () => {
    renderWithRouter(<App />)
    expect(screen.getByText('网页、文件与粘贴资料已开放')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '当前可用能力' })).toBeInTheDocument()
    expect(
      screen.getByText('复习安排与详细统计尚未开放；已有学习历史仍可在侧栏「后续能力」中查看。'),
    ).toBeInTheDocument()
    // 主界面只展示真实可用的能力入口，不放假数字或假统计。
    expect(screen.queryByText('未接入')).not.toBeInTheDocument()
    expect(screen.queryByText('本周学习时长')).not.toBeInTheDocument()
  })

  it.each(routes)(
    'renders %s directly with an honest status and no fake inputs',
    (route, title) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
      const { container } = renderWithRouter(<App />, route)
      expect(screen.getByRole('heading', { name: title, level: 1 })).toBeInTheDocument()
      expect(document.title).toBe(`${title} · StudyPilot`)
      // **开发阶段横幅 TASK-044 起只在概览页。** 它是一句关于产品阶段的说明，属于首页；
      // 此前每一页都显示，对每天用的人没有信息量，却在阅读器上占掉 45–87px。
      const notice = screen.queryByText('网页、文件与粘贴资料已开放')
      if (route === '/') expect(notice).toBeInTheDocument()
      else expect(notice).not.toBeInTheDocument()
      // 「没有假输入」这条守的是**主内容区**。左栏的折叠按钮是一个真控件，不该被它误伤，
      // 所以把范围收到 main 里——这比原来的全文档范围更贴近这条断言本来的意思。
      expect(within(main()).queryByRole('button')).not.toBeInTheDocument()
      expect(container.querySelector('input, textarea, select, form')).toBeNull()
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(api.request).not.toHaveBeenCalled()
      expect(storageSpy).not.toHaveBeenCalled()
    },
  )

  it('navigates between sections and moves keyboard focus to the new heading', () => {
    renderWithRouter(<App />)
    const primaryNav = within(screen.getByRole('navigation', { name: '主要导航' }))
    const moreNav = within(screen.getByRole('navigation', { name: '更多能力' }))
    expect(primaryNav.getAllByRole('link')).toHaveLength(4)
    expect(moreNav.getAllByRole('link')).toHaveLength(3)
    const cases = [
      { title: '资料库', link: () => primaryNav.getByRole('link', { name: '资料库' }) },
      { title: '我的心得', link: () => primaryNav.getByRole('link', { name: '我的心得' }) },
      { title: '分类整理', link: () => primaryNav.getByRole('link', { name: '分类整理' }) },
      { title: '学习记录', link: () => moreNav.getByRole('link', { name: '学习记录' }) },
      { title: '复习安排', link: () => moreNav.getByRole('link', { name: '复习安排' }) },
      { title: '主题统计', link: () => moreNav.getByRole('link', { name: '主题统计' }) },
      { title: '学习概览', link: () => primaryNav.getByRole('link', { name: '学习概览' }) },
    ]
    for (const { title, link } of cases) {
      const el = link()
      fireEvent.click(el)
      expect(el).toHaveAttribute('aria-current', 'page')
      const allActive = screen
        .getAllByRole('navigation')
        .flatMap((nav) => within(nav).queryAllByRole('link'))
        .filter((item) => item.hasAttribute('aria-current'))
      expect(allActive).toHaveLength(1)
      expect(allActive[0]).toHaveTextContent(title)
      expect(screen.getByRole('heading', { name: title, level: 1 })).toHaveFocus()
      expect(document.title).toBe(`${title} · StudyPilot`)
    }
  })

  it('opens the working form and clearly limits unavailable features', () => {
    renderWithRouter(<App />)
    fireEvent.click(screen.getByRole('link', { name: '添加资料' }))
    expect(screen.getByRole('heading', { name: '添加资料', level: 1 })).toHaveFocus()
    expect(screen.getByRole('form', { name: '添加资料表单' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /上传文件/ })).toBeEnabled()
    expect(
      screen.getByText('原件只保存、不解析。可先在分类整理中创建主题与标签，再回来选择。'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation', { name: '主要导航' })).getByRole('link', {
        name: '资料库',
      }),
    ).toHaveAttribute('aria-current', 'page')
    fireEvent.click(screen.getByRole('link', { name: '返回资料库' }))
    expect(screen.getByRole('heading', { name: '资料库', level: 1 })).toHaveFocus()
  })

  it.each([
    ['/resources/synthetic-id', '返回资料库', '资料库'],
    ['/resources', '返回学习概览', '学习概览'],
    ['/unknown-page', '返回学习概览', '学习概览'],
  ])('provides a real return path from %s', (route, label, destination) => {
    renderWithRouter(<App />, route)
    fireEvent.click(screen.getByRole('link', { name: label }))
    expect(screen.getByRole('heading', { name: destination, level: 1 })).toHaveFocus()
  })

  it('provides a focusable main target for skipping repeated navigation', () => {
    renderWithRouter(<App />)
    expect(screen.getByRole('link', { name: '跳到主要内容' })).toHaveAttribute(
      'href',
      '#main-content',
    )
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1')
  })
})
