// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { RENDERER_OPTIONS, createRenderer, renderSnapshot } from './snapshotMarkdown'

const noFrozen = new Map<string, string>()

describe('renderer configuration', () => {
  it('is constructed with html off, asserted on the configuration itself', () => {
    // **按 TASK-040 决定日志立下的检查动作**：配置要有一条直接看那个配置的用例，
    // 而不是只断言「某个样例没被渲染成 HTML」——后者是本项目已被咬过的形态。
    expect(RENDERER_OPTIONS.html).toBe(false)
    expect(createRenderer(() => null).options.html).toBe(false)
  })

  it('does not turn bare addresses into links on its own', () => {
    expect(RENDERER_OPTIONS.linkify).toBe(false)
    expect(renderSnapshot('见 https://example.com/x 这一页', noFrozen)).not.toContain('<a')
  })
})

describe('raw HTML never reaches the DOM', () => {
  it.each([
    ['<script>alert(1)</script>', 'script'],
    ['<iframe src="https://evil.test"></iframe>', 'iframe'],
    ['<img src=x onerror=alert(1)>', 'img'],
    ['<object data="x"></object>', 'object'],
    ['<style>body{display:none}</style>', 'style'],
  ])('escapes %s instead of rendering it', (markdown, tag) => {
    const html = renderSnapshot(markdown, noFrozen)
    const host = document.createElement('div')
    host.innerHTML = html
    expect(host.querySelector(tag)).toBeNull()
    // 它必须仍然**看得见**：转义成字面文本，而不是被悄悄吞掉。
    expect(host.textContent).toContain(markdown.slice(0, 12))
  })

  it('escapes an event attribute even when the tag itself looks harmless', () => {
    const host = document.createElement('div')
    host.innerHTML = renderSnapshot('<b onmouseover="alert(1)">x</b>', noFrozen)
    expect(host.querySelector('b')).toBeNull()
    // 要守的是「**没有元素带上这个属性**」，不是「HTML 文本里不出现这串字符」——
    // 转义之后 `onmouseover=` 本来就会作为普通文本出现，断言后者等于断错了东西。
    expect(host.querySelector('[onmouseover]')).toBeNull()
    expect(host.textContent).toContain('onmouseover')
  })
})

describe('dangerous protocols', () => {
  it.each(['javascript:alert(1)', 'vbscript:alert(1)', 'data:text/html,<script>alert(1)</script>'])(
    'refuses a link to %s',
    (href) => {
      const host = document.createElement('div')
      host.innerHTML = renderSnapshot(`[点我](${href})`, noFrozen)
      const link = host.querySelector('a')
      // markdown-it 的 validateLink 拒掉后不产生 href；无论如何都不能出现该协议。
      expect(link?.getAttribute('href') ?? '').not.toMatch(/^(javascript|vbscript|data):/i)
    },
  )

  it('refuses an image with a dangerous protocol without emitting an img element', () => {
    const host = document.createElement('div')
    host.innerHTML = renderSnapshot('![图](javascript:alert(1))', noFrozen)
    expect(host.querySelector('img')).toBeNull()
  })
})

describe('image sources', () => {
  const FROZEN = 'https://cdn.example.com/a.png'
  const NOT_FROZEN = 'https://cdn.example.com/b.png'
  const frozen = new Map([[FROZEN, 'blob:http://127.0.0.1:5173/abc']])

  it('prefers the local copy for an image that was frozen', () => {
    // **不得因为「反正未冻结的也会加载」就跳过匹配** —— 那会让冻结白做。
    const host = document.createElement('div')
    host.innerHTML = renderSnapshot(`![图](${FROZEN})`, frozen)
    const img = host.querySelector('img')
    expect(img?.getAttribute('src')).toBe('blob:http://127.0.0.1:5173/abc')
    expect(img?.getAttribute('referrerpolicy')).toBeNull()
    expect(img?.getAttribute('data-origin-image')).toBeNull()
  })

  it('loads an unfrozen image from its origin, with the referrer withheld', () => {
    // 用户 2026-09-07 在知情后选择自动加载；`referrerpolicy` 是本任务对此的唯一缓解，
    // 漏掉它会静默失效，所以这条断言必须在。
    const host = document.createElement('div')
    host.innerHTML = renderSnapshot(`![图](${NOT_FROZEN})`, frozen)
    const img = host.querySelector('img')
    expect(img?.getAttribute('src')).toBe(NOT_FROZEN)
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(img?.getAttribute('data-origin-image')).toBe('true')
  })

  it('keeps both kinds straight in one document', () => {
    const host = document.createElement('div')
    host.innerHTML = renderSnapshot(`![a](${FROZEN})\n\n![b](${NOT_FROZEN})`, frozen)
    const sources = [...host.querySelectorAll('img')].map((img) => img.getAttribute('src'))
    expect(sources).toEqual(['blob:http://127.0.0.1:5173/abc', NOT_FROZEN])
  })
})

describe('links in the body', () => {
  it('opens externally without carrying the local address along', () => {
    const host = document.createElement('div')
    host.innerHTML = renderSnapshot('[原文](https://example.com/a)', noFrozen)
    const link = host.querySelector('a')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noreferrer noopener')
  })
})

describe('ordinary Markdown still renders', () => {
  it('renders headings, lists, emphasis and code', () => {
    const host = document.createElement('div')
    host.innerHTML = renderSnapshot('# 标题\n\n- 一\n- 二\n\n**粗** 与 `代码`\n', noFrozen)
    expect(host.querySelector('h1')?.textContent).toBe('标题')
    expect(host.querySelectorAll('li')).toHaveLength(2)
    expect(host.querySelector('strong')?.textContent).toBe('粗')
    expect(host.querySelector('code')?.textContent).toBe('代码')
  })

  it('leaves C++ style angle brackets in code alone', () => {
    // 用户库里的真实语料：`cout << endl`、`vector<len>` 会命中 `<`，但它们不是 HTML。
    const host = document.createElement('div')
    host.innerHTML = renderSnapshot('```cpp\ncout << endl;\nvector<int> v;\n```', noFrozen)
    expect(host.querySelector('code')?.textContent).toContain('vector<int>')
    expect(host.querySelector('int')).toBeNull()
  })
})
