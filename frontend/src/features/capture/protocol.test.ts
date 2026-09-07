import { describe, expect, it } from 'vitest'

import {
  CAPTURE_PAYLOAD,
  MAX_MARKDOWN,
  MAX_TITLE,
  MAX_URL,
  capturedFrom,
  isCapturePayload,
  isSafeSourceUrl,
} from './protocol'

// 这份协议在仓库里有两份手写实现：本文件所测的这一份，与
// `extension/src/shared/protocol.ts`。两个顶层目录是独立 npm 工程、没有构建耦合，
// 编译器发现不了它们漂移。
//
// **扩展侧已有一份守卫，为什么这里还要一份，而且写法不同？**
// 因为 `check_task.py` 按路径前缀选检查组：只改**前端这一份**时只会选中 frontend 组，
// 扩展组根本不运行，住在扩展侧的那道守卫也就不会执行——而前端这一份的改动频率
// 更高，恰是更可能漂移的方向。单向守卫会让契约里「漂移不再只能靠人守」那句话
// 在最需要它为真的方向上是假的。
//
// 两侧的守卫**机制不同，这是有意的**：
//   - 扩展侧读前端源码做**逐字比对**（两份实现必须一模一样）；
//   - 前端这侧**不跨目录读文件**（Vite 的 `server.fs.allow` 不允许读项目根之外，
//     而 `frontend/vite.config.ts` 不在本任务的 allowed_paths 内，不能为此放宽），
//     改为把同一套规则**逐条钉成行为断言**：任何一处放宽都会让下面的用例变红。
// 前者保证「两份一模一样」，后者保证「这一份符合规格」。合起来两个方向都有机器守着。
// 下面每一条拒收用例都对应后端 `contracts.py` 的 `parsed_url` 里的一条规则。

describe('limits', () => {
  it('pins the three limits to what the backend accepts', () => {
    // 对应 backend 的 contracts.py（标题 200、source_url 2048）与
    // snapshots.py（正文 1_000_000）。改大任何一个都会让这里红，
    // 提醒改动者去核后端而不是想当然。
    expect(MAX_TITLE).toBe(200)
    expect(MAX_URL).toBe(2048)
    expect(MAX_MARKDOWN).toBe(1_000_000)
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
    ['authority 里只有一个空 @（后端同样拒）', 'https://@example.com/a'],
    ['scheme 大写（后端 startswith 大小写敏感）', 'HTTPS://example.com/a'],
    ['不是 http(s)', 'javascript:alert(1)'],
    ['主机名为空', 'https://'],
    ['超长', `https://example.com/${'a'.repeat(3000)}`],
  ])('rejects a url %s', (_label, value) => {
    expect(isSafeSourceUrl(value)).toBe(false)
  })
})

describe('capturedFrom', () => {
  const payload = { title: '标题', url: 'https://example.com/a', markdown: '正文', images: [] }
  const event = (overrides: Partial<MessageEventInit> = {}) =>
    new MessageEvent('message', {
      data: { type: CAPTURE_PAYLOAD, payload },
      origin: window.location.origin,
      source: window,
      ...overrides,
    })

  it('returns a copy, not the object that arrived', () => {
    // 「校验的即所用的」：返回解构后的副本，而不是原对象。
    const result = capturedFrom(event(), window)
    expect(result).toEqual(payload)
    expect(result).not.toBe(payload)
  })

  it.each([
    ['来自别的窗口', { source: {} as MessageEventSource }],
    ['来自别的源', { origin: 'https://evil.example' }],
    ['信封类型不对', { data: { type: 'other', payload } }],
  ])('rejects a message %s', (_label, overrides) => {
    expect(capturedFrom(event(overrides), window)).toBeNull()
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
