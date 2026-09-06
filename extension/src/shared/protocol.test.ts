import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  CAPTURE_PAYLOAD,
  CAPTURE_READY,
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
const MIRROR = '../frontend/src/features/capture/protocol.ts'

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
  ])('shares the same %s message name', (name, value) => {
    expect(mirrorSource()).toContain(`export const ${name} = '${value}'`)
  })

  it.each([
    ['MAX_MARKDOWN', MAX_MARKDOWN],
    ['MAX_URL', MAX_URL],
    ['MAX_TITLE', MAX_TITLE],
  ])('shares the same %s limit', (name, value) => {
    // 比数值而不是比字面量文本：两边写 1_000_000 还是 1000000 无所谓，数值必须相等。
    const found = new RegExp(`export const ${name} = ([0-9_]+)`).exec(mirrorSource())
    expect(found, `镜像里没有 ${name}`).not.toBeNull()
    expect(Number(found?.[1].replace(/_/g, ''))).toBe(value)
  })

  it('shares the same validation rules verbatim', () => {
    // 逐字比对两个校验函数的函数体。措辞可以不同，规则不能不同 —— 所以这里比的是
    // 代码本身；两边任何一处放宽都会让这条红。
    const body = (source: string, name: string) => {
      const start = source.indexOf(`export function ${name}(`)
      expect(start, `找不到 ${name}`).toBeGreaterThan(-1)
      const end = source.indexOf('\n}', start)
      return source.slice(start, end).replace(/\s+/g, ' ')
    }
    const mine = readFileSync('src/shared/protocol.ts', 'utf8')
    const theirs = mirrorSource()
    for (const name of ['isSafeSourceUrl', 'isCapturePayload']) {
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
    ['不是 http(s)', 'javascript:alert(1)'],
    ['主机名为空', 'https://'],
    ['超长', `https://example.com/${'a'.repeat(3000)}`],
  ])('rejects a url %s', (_label, value) => {
    expect(isSafeSourceUrl(value)).toBe(false)
  })
})

describe('isCapturePayload', () => {
  const good = { title: '标题', url: 'https://example.com/a', markdown: '正文' }

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
