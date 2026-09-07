import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  CAPTURE_IMAGE_REQUEST,
  CAPTURE_IMAGE_RESULT,
  CAPTURE_PAYLOAD,
  CAPTURE_READY,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_MARKDOWN,
  MAX_TITLE,
  MAX_URL,
  isCapturePayload,
  isSafeSourceUrl,
} from './protocol'

// 这份协议在仓库里有**两份手写实现**：本文件所测的这一份，以及
// `frontend/src/features/capture/protocol.ts`。两个顶层目录是独立 npm 工程、
// 没有构建耦合，因此编译器和类型系统都发现不了它们漂移。
//
// **加这条检查是主 Agent 的决定，不是审查结论**：R1 指出了「无机械耦合、只能靠人守」
// 这个缺口并请合并判断，R2 独立核对了当前三处一致但**没有**要求加检查。它属于
// 「测试全绿但东西是坏的」那一族，所以值得一道门闩。
//
// 读跨目录文件只发生在测试里，不构成构建耦合（extension 仍不依赖 frontend 的任何产物）。
// 用 import.meta.url 解析，不依赖 process.cwd()：换个工作目录跑 vitest 也成立。
const projectFile = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const MIRROR = projectFile('../../../frontend/src/features/capture/protocol.ts')

function mirrorSource(): string {
  return readFileSync(MIRROR, 'utf8')
}

describe('protocol mirror', () => {
  it('finds the frontend copy where it is expected', () => {
    // 路径写错会让下面几条静默通过成空断言，先把这条钉住。
    expect(mirrorSource()).toContain('export function isCapturePayload')
  })

  it.each([
    ['CAPTURE_READY', CAPTURE_READY],
    ['CAPTURE_PAYLOAD', CAPTURE_PAYLOAD],
    // TASK-040 新增的两条图片消息。上一版守卫没跟上新增，而记录却称「两端消息格式
    // 由平行 protocol 的守卫覆盖」—— 那句话当时比事实宽，这两行把它变成事实。
    ['CAPTURE_IMAGE_REQUEST', CAPTURE_IMAGE_REQUEST],
    ['CAPTURE_IMAGE_RESULT', CAPTURE_IMAGE_RESULT],
  ])('shares the same %s message name', (name, value) => {
    expect(mirrorSource()).toContain(`export const ${name} = '${value}'`)
  })

  it.each([
    ['MAX_MARKDOWN', MAX_MARKDOWN],
    ['MAX_URL', MAX_URL],
    ['MAX_TITLE', MAX_TITLE],
    ['MAX_IMAGES', MAX_IMAGES],
    ['MAX_IMAGE_BYTES', MAX_IMAGE_BYTES],
  ])('shares the same %s limit', (name, value) => {
    // 比数值而不是比字面量文本：两边写 1_000_000 还是 1000000 无所谓，数值必须相等。
    // 允许右侧是算式（`10 * 1024 * 1024`）：比的是**数值**，不是写法。
    // **右锚是必须的**：没有它，镜像写成 `60 + 1` 只会捕获到 `60 `，算出来仍等于 60
    // 而照样绿。放宽到「右侧可以是算式」之后，这个洞比以前更不容易被人眼发现。
    const found = new RegExp(`export const ${name} = ([0-9_ *]+)\\s*$`, 'm').exec(mirrorSource())
    expect(found, `镜像里没有 ${name}`).not.toBeNull()
    const literal = found?.[1].replace(/_/g, '').trim() ?? ''
    const computed = literal.split('*').reduce((total, part) => total * Number(part), 1)
    expect(computed).toBe(value)
  })

  it('shares the same validation rules verbatim', () => {
    // 逐字比对两个校验函数的函数体，**连函数体内的注释也必须一致** —— 切片不剥
    // 注释，这是有意的：两边任何一处不同步（无论是规则还是对规则的说明）都该红。
    // 已知脆弱点：两个工程的 prettier 配置若将来分叉，会误红；那是 2 秒可修的红，
    // 不会掩盖缺陷。
    // 切片**从函数上方的 JSDoc 开始**，不只是函数体。
    // 理由：上一轮我收紧了规则却没回头改「与 safeWebUrl 同规则」那句注释，守卫因为
    // 不看 JSDoc 而全绿放过——修复 N-R1 时若只改一边，同样不会红。把 JSDoc 纳入比对，
    // 「两边同改」就从人工纪律变成机械保证。
    const body = (source: string, name: string) => {
      const declaration = source.indexOf(`export function ${name}(`)
      expect(declaration, `找不到 ${name}`).toBeGreaterThan(-1)
      const doc = source.lastIndexOf('/**', declaration)
      const start = doc === -1 ? declaration : doc
      const end = source.indexOf('\n}', declaration)
      return source.slice(start, end).replace(/\s+/g, ' ')
    }
    const mine = readFileSync(projectFile('./protocol.ts'), 'utf8')
    const theirs = mirrorSource()
    // `isSafeImageUrl` 决定扩展会**真的向哪些地址发请求**，两边不同步的后果比
    // 另外两个更直接，必须一并逐字比对。
    for (const name of [
      'isSafeSourceUrl',
      'isSafeImageUrl',
      'isImageList',
      'matchPatternFor',
      'isCapturePayload',
    ]) {
      expect(body(theirs, name)).toBe(body(mine, name))
    }
  })
})

describe('isSafeSourceUrl', () => {
  it.each(['https://example.com/a', 'http://example.com/a?q=1', 'https://example.com:8443/a'])(
    'accepts %s',
    (value) => {
      expect(isSafeSourceUrl(value)).toBe(true)
    },
  )

  it.each([
    ['带片段标识符（后端会拒）', 'https://example.com/a#anchor'],
    ['带空白', 'https://example.com/a b'],
    ['带反斜杠', 'https://example.com\\a'],
    ['带凭据', 'https://user:pw@example.com/a'],
    ['带控制字符', 'https://example.com/a\u0001b'],
    ['不是 http(s)', 'javascript:alert(1)'],
    ['主机名为空', 'https://'],
    ['超长', `https://example.com/${'a'.repeat(3000)}`],
  ])('rejects a url %s', (_label, value) => {
    expect(isSafeSourceUrl(value)).toBe(false)
  })
})

describe('isCapturePayload', () => {
  const good = { title: '标题', url: 'https://example.com/a', markdown: '正文', images: [] }

  it('accepts a well-formed payload and an empty title', () => {
    expect(isCapturePayload(good)).toBe(true)
    expect(isCapturePayload({ ...good, title: '' })).toBe(true)
  })

  it.each([
    ['正文空白', { ...good, markdown: '   ' }],
    ['标题超长', { ...good, title: '标'.repeat(201) }],
    ['正文超长', { ...good, markdown: 'x'.repeat(1_000_001) }],
    ['网址带锚点', { ...good, url: 'https://example.com/a#x' }],
    ['缺字段', { title: '标题' }],
    ['不是对象', 'nope'],
    ['是 null', null],
  ])('rejects %s', (_label, value) => {
    expect(isCapturePayload(value)).toBe(false)
  })
})

describe('image list', () => {
  const good = {
    title: '标题',
    url: 'https://example.com/a',
    markdown: '正文',
    images: ['https://cdn.example.com/a.png'],
  }

  it('accepts absolute http(s) image addresses, including ones with a fragment', () => {
    // `#` 在资料网址上是拒的（后端不接受），在图片地址上不是 —— 后端对资产的
    // source_url 不设该限制，在这里一并拒掉会让带 # 的图连原样保留都做不到。
    expect(isCapturePayload(good)).toBe(true)
    expect(isCapturePayload({ ...good, images: ['https://cdn.example.com/a.png#x'] })).toBe(true)
  })

  it.each([
    ['缺少 images 字段', undefined],
    ['不是数组', 'https://cdn.example.com/a.png'],
    ['含非字符串', [1]],
    ['含 data: 地址', ['data:image/png;base64,AAAA']],
    ['含 blob: 地址', ['blob:https://example.com/abc']],
    ['含 file: 地址', ['file:///etc/passwd']],
    ['含相对地址', ['/img/a.png']],
    ['含带凭据的地址', ['https://u:p@cdn.example.com/a.png']],
    ['含空白字符', ['https://cdn.example.com/a b.png']],
    [
      '超过张数上限',
      Array.from({ length: MAX_IMAGES + 1 }, (_, i) => `https://cdn.example.com/${i}.png`),
    ],
  ])('refuses a payload whose images %s', (_label, images) => {
    expect(isCapturePayload({ ...good, images })).toBe(false)
  })

  it('refuses an image address longer than the backend accepts', () => {
    const long = `https://cdn.example.com/${'a'.repeat(MAX_URL)}.png`
    expect(isCapturePayload({ ...good, images: [long] })).toBe(false)
  })
})
