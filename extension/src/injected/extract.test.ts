// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { MAX_TITLE } from '../shared/protocol'

import { extractFromDocument } from './extract'

// 一篇典型技术文章的骨架：正文外面裹着导航、页脚、推荐位和广告位。
// 提取的价值全在于「只留中间那块」——所以断言分两半：正文必须活下来，噪声必须消失。
const ARTICLE = `
  <nav><a href="/">首页</a><a href="/tags">标签</a><a href="/login">登录</a></nav>
  <header><h1 class="site">某某技术社区</h1></header>
  <article>
    <h1>如何理解数据库索引</h1>
    <p>索引的本质是<strong>用空间换时间</strong>，它让查询不必扫描整张表。</p>
    <p>下面这条语句会走主键索引：</p>
    <pre><code>SELECT * FROM users WHERE id = 1;</code></pre>
    <p>但如果条件里对列做了函数运算，索引就用不上了。</p>
  </article>
  <aside class="recommend"><h3>推荐阅读</h3><a href="/x">另一篇完全无关的文章</a></aside>
  <div class="ad">限时优惠 立即购买</div>
  <footer>版权所有 2026 某某社区 · 备案号 12345 · 联系我们</footer>
`

function pageWith(body: string, title = '如何理解数据库索引 - 某某技术社区') {
  document.title = title
  document.body.innerHTML = body
  return document
}

describe('extractFromDocument', () => {
  it('keeps the article and drops the furniture around it', () => {
    const { markdown } = extractFromDocument(pageWith(ARTICLE), 'https://example.com/db-index')

    expect(markdown).toContain('用空间换时间')
    expect(markdown).toContain('SELECT * FROM users WHERE id = 1;')
    expect(markdown).toContain('索引就用不上了')

    for (const noise of ['首页', '登录', '推荐阅读', '限时优惠', '版权所有', '备案号']) {
      expect(markdown, `噪声「${noise}」不该出现在正文里`).not.toContain(noise)
    }
  })

  it('produces Markdown rather than raw HTML', () => {
    const { markdown } = extractFromDocument(pageWith(ARTICLE), 'https://example.com/db-index')
    expect(markdown).toMatch(/^#{1,3} /m)
    expect(markdown).toContain('```')
    expect(markdown).not.toContain('<p>')
    expect(markdown).not.toContain('</article>')
  })

  it('carries the page title and url through', () => {
    const result = extractFromDocument(pageWith(ARTICLE), 'https://example.com/db-index')
    expect(result.title).toContain('数据库索引')
    expect(result.url).toBe('https://example.com/db-index')
  })

  it('clamps an over-long title to what the backend accepts', () => {
    const result = extractFromDocument(pageWith(ARTICLE, '标'.repeat(400)), 'https://example.com/a')
    expect(result.title.length).toBeLessThanOrEqual(MAX_TITLE)
  })

  it('returns empty markdown for a page with no article to speak of', () => {
    // 空正文不是崩溃，是一个 runCapture 会拒绝开确认页的正常结果。
    const result = extractFromDocument(pageWith('<nav>只有导航</nav>'), 'https://example.com/nav')
    expect(result.markdown.length).toBeLessThan(20)
  })
})
