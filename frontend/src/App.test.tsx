import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from './App'
import { renderWithRouter } from './test/render'

const routes = [
  ['/', '学习概览'],
  ['/resources', '资料库'],
  ['/resources/new', '添加资料'],
  ['/resources/synthetic-id', '资料详情'],
  ['/study-records', '学习记录'],
  ['/reviews', '复习安排'],
  ['/topics', '主题统计'],
  ['/unknown-page', '没有找到这个页面'],
] as const

describe('StudyPilot journal shell', () => {
  it('clearly distinguishes the shell from real learning data', () => {
    renderWithRouter(<App />)
    expect(screen.getByText('工程框架已运行，业务功能尚未实现')).toBeInTheDocument()
    expect(screen.getByText('学习数据尚未接入，暂不展示资料或进度。')).toBeInTheDocument()
    const metrics = within(screen.getByRole('region', { name: '统计尚未接入' }))
    expect(metrics.getAllByText('未接入')).toHaveLength(3)
    expect(metrics.queryByText(/\d/)).not.toBeInTheDocument()
  })

  it.each(routes)(
    'renders %s directly with an honest status and no fake inputs',
    (route, title) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
      const { container } = renderWithRouter(<App />, route)
      expect(screen.getByRole('heading', { name: title, level: 1 })).toBeInTheDocument()
      expect(document.title).toBe(`${title} · StudyPilot`)
      expect(screen.getByText('工程框架已运行，业务功能尚未实现')).toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      expect(container.querySelector('input, textarea, select, form')).toBeNull()
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(storageSpy).not.toHaveBeenCalled()
    },
  )

  it('navigates between sections and moves keyboard focus to the new heading', () => {
    renderWithRouter(<App />)
    const nav = within(screen.getByRole('navigation', { name: '主要导航' }))
    expect(nav.getAllByRole('link')).toHaveLength(5)
    for (const title of ['资料库', '学习记录', '复习安排', '主题统计', '学习概览']) {
      const link = nav.getByRole('link', { name: title })
      fireEvent.click(link)
      expect(link).toHaveAttribute('aria-current', 'page')
      expect(
        nav.getAllByRole('link').filter((item) => item.hasAttribute('aria-current')),
      ).toHaveLength(1)
      expect(screen.getByRole('heading', { name: title, level: 1 })).toHaveFocus()
      expect(document.title).toBe(`${title} · StudyPilot`)
    }
  })

  it('opens the explicitly labelled add preview rather than a working form', () => {
    renderWithRouter(<App />)
    fireEvent.click(screen.getByRole('link', { name: '添加资料页面预览' }))
    expect(screen.getByRole('heading', { name: '添加资料', level: 1 })).toHaveFocus()
    expect(screen.getAllByText('尚未开放')).toHaveLength(3)
    expect(screen.getByText(/目前不能保存或上传/)).toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation')).getByRole('link', { name: '资料库' }),
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
