// @vitest-environment jsdom
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { MAX_TITLE } from '../shared/protocol'

import { EXTRACT_OPTIONS, extractFromDocument, normalizeSourceUrl } from './extract'

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

  it('drops the fragment so the backend will actually accept the url', () => {
    // 后端的 source_url 不接受 `#`（contracts.py 的 parsed_url）。带锚点的地址若原样
    // 传下去，用户会一路预填成功、直到点保存才被 422 拒绝，而确认页没有网址编辑框。
    const result = extractFromDocument(pageWith(ARTICLE), 'https://example.com/a#section-3')
    expect(result.url).toBe('https://example.com/a')
  })

  it.each([
    ['https://example.com/a#anchor', 'https://example.com/a'],
    ['https://example.com/a?q=1#x', 'https://example.com/a?q=1'],
    ['https://example.com/a', 'https://example.com/a'],
    ['https://example.com/#/hash/route', 'https://example.com/'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeSourceUrl(input)).toBe(expected)
  })

  it('leaves an unparseable url alone rather than throwing', () => {
    expect(normalizeSourceUrl('not a url')).toBe('not a url')
  })

  it('pins the option that keeps the extension off the network', () => {
    // 「扩展不发网络请求」是写给用户的承诺。Defuddle 的 useAsync 默认 true，其
    // 异步抽取器会向第三方 API 发请求。**这条值断言是那句承诺真正的看守**：删掉
    // 这个选项、或把它改成 true，都会在这里变红，而不是等到有人发现流量。
    expect(EXTRACT_OPTIONS.useAsync).toBe(false)
    // 同时钉住调用的是同步 parse()：异步路径才是 fetch 的可达入口。
    // 下面这条是**辅助**防线，不是看守：源码扫描挡不住 'parse' + 'Async' 一类有意
    // 规避（`boundaries.test.ts` 对自己的扫描也写了同样的免责）。它的价值在于让
    // 「改用异步方法」这种无意改动当场变红。
    // jsdom 环境下 import.meta.url 不是 file: URL，用相对 vitest 工作目录的路径；
    // 必须先剥注释，因为那份源码的注释里正好在**讨论** parseAsync 与 fetch。
    const source = readFileSync('src/injected/extract.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(source).toContain('.parse()')
  })

  it('returns empty markdown for a page with no article to speak of', () => {
    // 空正文不是崩溃，是一个 runCapture 会拒绝开确认页的正常结果。
    const result = extractFromDocument(pageWith('<nav>只有导航</nav>'), 'https://example.com/nav')
    expect(result.markdown.length).toBeLessThan(20)
  })
})
