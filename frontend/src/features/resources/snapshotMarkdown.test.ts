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

describe('relative image addresses', () => {
  // 冻结表里的键是采集时算好的**绝对**地址，而 Defuddle 产出的正文里常常留着
  // `/img/a.png`、`../img/a.png` 这类相对写法。不先解析成绝对地址，冻结表既匹配不上
  // （用户为它付过一次授权代价的本机副本白存），渲染出的 `src` 也是打不开的本机路径。
  const BASE = 'https://docs.example.com/guide/page.html'
  const ABSOLUTE = 'https://docs.example.com/img/a.png'
  const frozen = new Map([[ABSOLUTE, 'blob:http://127.0.0.1:5173/abc']])

  it.each(['/img/a.png', '../img/a.png', 'https://docs.example.com/img/a.png'])(
    'resolves %s against the captured address before looking it up',
    (src) => {
      const host = document.createElement('div')
      host.innerHTML = renderSnapshot(`![图](${src})`, frozen, BASE)
      expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:http://127.0.0.1:5173/abc')
    },
  )

  it('renders an unfrozen relative image at its absolute origin address', () => {
    const host = document.createElement('div')
    host.innerHTML = renderSnapshot('![图](/img/b.png)', new Map(), BASE)
    const img = host.querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://docs.example.com/img/b.png')
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('emits no img for a relative address with no base, but keeps the text visible', () => {
    // 手工粘贴的正文没有采集地址。此时相对地址无从解析，**不产生 img** 好过渲染一个
    // 指向本机 UI 自己的 `src`（那会向本机服务发一串必然 404 的请求）。
    // 但它不能被悄悄吞掉——走的是伪协议图片那条同样的降级路径：留下替代文字。
    const host = document.createElement('div')
    host.innerHTML = renderSnapshot('![一张图](/img/b.png)', new Map(), null)
    expect(host.querySelector('img')).toBeNull()
    expect(host.querySelector('.snapshot-image-refused')?.textContent).toBe('一张图')
  })
})

describe('non-canonical absolute addresses', () => {
  // 冻结表的键是采集时 `new URL(...).href` 算出来的规范形式。正文里的写法不规范时
  // 若不先规范化，查表就落空，那张图**静默走原站**——`failed` 计数不增、界面不提示，
  // 而用户为那份本机副本付过一次授权代价。这一组由 TASK-042 的独立验收指出。
  const CANONICAL = 'https://cdn.example.com/img/a.png'
  const frozen = new Map([[CANONICAL, 'blob:http://127.0.0.1:5173/abc']])

  it.each([
    ['大写协议与主机', 'HTTPS://CDN.Example.com/img/a.png'],
    ['带默认端口', 'https://cdn.example.com:443/img/a.png'],
    ['含点段', 'https://cdn.example.com/img/sub/../a.png'],
    ['已经是规范形式', CANONICAL],
  ])('matches the frozen copy for an address written %s', (_label, src) => {
    const host = document.createElement('div')
    host.innerHTML = renderSnapshot(`![图](${src})`, frozen)
    expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:http://127.0.0.1:5173/abc')
  })

  it('still refuses a non-http(s) absolute address after normalization', () => {
    // 规范化不能变成绕过：`data:`/`javascript:` 仍旧不产生 img。
    const host = document.createElement('div')
    host.innerHTML = renderSnapshot('![图](data:image/png;base64,AAAA)', frozen)
    expect(host.querySelector('img')).toBeNull()
  })
})

describe('a very long body', () => {
  // 完成条件 11 的一支：正文上限是 100 万字。此前既无用例也无实测——
  // 由 TASK-042 的独立验收指出，属实现者自评的空档。
  it('renders a body at the 1,000,000 character limit without throwing', () => {
    // **`<script>` 必须掺进被重复的正文里。** 初稿只在结尾断言 `querySelector('script')`
    // 为 null，而正文里根本没有 `<script>` —— 那条断言**永远为真**，转义即使在这个规模下
    // 失效它也照样通过，注释却写着「守卫在这个规模下同样成立」。R1 在复审里抓到这一条。
    const paragraph =
      '这是一段用来撑满上限的正文，包含 **粗体**、`代码`、<script>alert(1)</script> 与一个链接 [原文](https://example.com/a)。\n\n'
    const markdown = paragraph.repeat(Math.ceil(1_000_000 / paragraph.length)).slice(0, 1_000_000)
    expect(markdown).toHaveLength(1_000_000)
    const html = renderSnapshot(markdown, new Map())
    const host = document.createElement('div')
    host.innerHTML = html
    // 不只是「没抛异常」：内容确实渲染出来了。
    expect(host.querySelectorAll('p').length).toBeGreaterThan(1000)
    expect(host.querySelector('strong')?.textContent).toBe('粗体')
    // 转义守卫在这个规模下同样成立：没有 script 元素，但那串字符仍作为文本可见。
    expect(host.querySelector('script')).toBeNull()
    expect(host.textContent).toContain('<script>alert(1)</script>')
  })
})

describe('alt text', () => {
  it('keeps the alt so the image is still described when it cannot load', () => {
    // 自定义 image 规则一旦忘了填 alt，读屏与加载失败时的占位文字会一起消失。
    const host = document.createElement('div')
    host.innerHTML = renderSnapshot('![一张流程图](https://cdn.example.com/a.png)', new Map())
    expect(host.querySelector('img')?.getAttribute('alt')).toBe('一张流程图')
  })

  it('marks every rendered image as lazily loaded', () => {
    const host = document.createElement('div')
    host.innerHTML = renderSnapshot('![图](https://cdn.example.com/a.png)', new Map())
    expect(host.querySelector('img')?.getAttribute('loading')).toBe('lazy')
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
