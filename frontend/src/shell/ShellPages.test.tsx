import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { api } from '../api/client'
import { renderWithRouter } from '../test/render'
import { pageAt } from './pages'

// TASK-044：外壳压缩后的两件事——开发阶段横幅只在概览页，左栏可折叠。
//
// **图标化的退化本仓测试结构性抓不到**（所有测试都按可访问名称查控件），所以这里的
// 折叠断言必须是反向的：可见文本为空、而可访问名称仍在。

const sidebar = () => screen.getByRole('complementary', { name: '学习空间导航' })
const NOTICE = '网页、文件与粘贴资料已开放'

beforeEach(() => {
  vi.spyOn(api, 'request').mockImplementation(() => new Promise(() => {}))
  try {
    localStorage.clear()
  } catch {
    // 本用例不依赖存储可用。
  }
})

describe('development-stage notice', () => {
  it('appears on the overview page', () => {
    renderWithRouter(<App />, '/')
    expect(screen.getByText(NOTICE)).toBeVisible()
  })

  it.each([
    ['/resources', '资料库'],
    ['/classifications', '分类整理'],
    ['/notes', '我的心得'],
    // 这一页叫「学习记录」，不是「学习历史」——参数虽然没被用上，写错的字面量
    // 仍然是这个仓库反复栽跟头的那个形态，改对。
    ['/study-records', '学习记录'],
  ])('is gone from %s', (route) => {
    // 它是一句关于产品阶段的说明，属于首页。此前每一页都显示，对每天用的人没有信息量，
    // 却在阅读器上占掉 45–87px。
    renderWithRouter(<App />, route)
    expect(screen.queryByText(NOTICE)).toBeNull()
  })
})

describe('other pages keep their heading block', () => {
  // 完成条件 5 要求「其余页面的 h1 与**说明句**保持原样」。h1 那一半本来就有覆盖，
  // 说明句这一半此前一条用例都没有——Reviewer 指出的缺口。
  // **从真值表取，不写字面量。** 我第一版凭印象写了两句 caption，全都不对——
  // 这正是本仓反复栽的那个形态（断言绑在臆想的字符串上）。
  it.each([['/'], ['/resources'], ['/study-records'], ['/classifications'], ['/notes']])(
    'keeps the heading and caption on %s',
    (route) => {
      const page = pageAt(route)
      renderWithRouter(<App />, route)
      expect(screen.getByRole('heading', { name: page.title, level: 1 })).toBeVisible()
      expect(screen.getByText(page.caption)).toBeVisible()
    },
  )

  it('is the reader page that loses the heading block, and only it', () => {
    renderWithRouter(<App />, '/resources/018f1f58-4eb2-4a0d-a716-fb81b1960000')
    expect(screen.queryByText(pageAt('/resources/x').caption)).toBeNull()
    expect(screen.queryByText('STUDYPILOT / YOUR LEARNING JOURNAL')).toBeNull()
  })
})

describe('collapsible navigation', () => {
  it('starts expanded and shows the entry names as visible text', () => {
    renderWithRouter(<App />, '/')
    expect(screen.getByRole('button', { name: '收起导航栏' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(within(sidebar()).getByRole('link', { name: '资料库' }).textContent).toContain('资料库')
  })

  it('collapses to icons only, keeping every entry reachable by name', () => {
    renderWithRouter(<App />, '/')
    fireEvent.click(screen.getByRole('button', { name: '收起导航栏' }))
    // **可见文本为空**——这是「文字确实拿掉了」那一面；折叠时那个文字节点根本不渲染，
    // 不是用 CSS 藏起来的（CSS 隐藏在 jsdom 里查不出来，断言会假绿）。
    for (const name of ['学习概览', '资料库', '分类整理', '我的心得', '添加资料']) {
      const entry = within(sidebar()).getByRole('link', { name })
      expect(entry.textContent).toBe('')
      expect(entry).toHaveAttribute('title', name)
      expect(entry.querySelector('svg')).not.toBeNull()
    }
    expect(screen.getByRole('button', { name: '展开导航栏' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('remembers the choice across a reload', () => {
    const view = renderWithRouter(<App />, '/')
    fireEvent.click(screen.getByRole('button', { name: '收起导航栏' }))
    view.unmount()
    renderWithRouter(<App />, '/')
    expect(screen.getByRole('button', { name: '展开导航栏' })).toBeInTheDocument()
    expect(within(sidebar()).getByRole('link', { name: '资料库' }).textContent).toBe('')
  })

  it('falls back to expanded when the stored choice cannot be read', () => {
    // 隐私模式、禁用站点数据都会让读取抛异常。**展开是安全的默认**：认不出图标的人
    // 至少还看得见文字。
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    renderWithRouter(<App />, '/')
    expect(screen.getByRole('button', { name: '收起导航栏' })).toBeInTheDocument()
    expect(within(sidebar()).getByRole('link', { name: '资料库' }).textContent).toContain('资料库')
  })

  it('still collapses when the choice cannot be stored', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    renderWithRouter(<App />, '/')
    fireEvent.click(screen.getByRole('button', { name: '收起导航栏' }))
    // 存不下只影响「下次还记得」，不该让这一次折叠也失败。
    expect(screen.getByRole('button', { name: '展开导航栏' })).toBeInTheDocument()
  })
})
