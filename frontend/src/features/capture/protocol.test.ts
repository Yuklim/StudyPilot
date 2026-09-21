import { describe, expect, it } from 'vitest'

import {
  CAPTURE_IMAGE_RESULT,
  CAPTURE_PAYLOAD,
  MAX_MARKDOWN,
  MAX_TITLE,
  MAX_URL,
  capturedFrom,
  imageResultFrom,
  isCapturedCitation,
  isCapturedPdf,
  isPdfProblem,
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
    // 旧版本扩展留下的暂存没有这些字段，一律归一成 null：「没有」只该有一种写法。
    expect(result).toEqual({ ...payload, citation: null, pdf: null, pdf_problem: null })
    // **把字段集整体钉住**：本文件已经三次因为「新字段忘了复制」踩坑（images、citation、
    // pdf）。往 CapturePayload 加字段却忘了在这里复制，这条就会红。
    expect(Object.keys(result!).sort()).toEqual([
      'citation',
      'images',
      'markdown',
      'pdf',
      'pdf_problem',
      'title',
      'url',
    ])
    expect(result).not.toBe(payload)
  })

  it('copies the citation too, down to its authors array', () => {
    // 上一次漏掉的是 images；这次是同一类错误的新面孔，所以一并钉住。
    const citation = {
      item_type: 'JOURNAL_ARTICLE',
      authors: ['李维'],
      issued_year: 2024,
      issued_date: null,
      container_title: 'Nature',
      volume: null,
      issue: null,
      pages: null,
      publisher: null,
      doi: '10.1/x',
      isbn: null,
    }
    const withCitation = { ...payload, citation }
    const result = capturedFrom(
      event({ data: { type: CAPTURE_PAYLOAD, payload: withCitation } }),
      window,
    )
    expect(result?.citation).toEqual(citation)
    expect(result?.citation).not.toBe(citation)
    expect(result?.citation?.authors).not.toBe(citation.authors)
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

describe('imageResultFrom', () => {
  const ok = {
    type: CAPTURE_IMAGE_RESULT,
    url: 'https://cdn.example.com/a.png',
    result: { ok: true, base64: 'iVBORw0KGgo=' },
  }
  const event = (data: unknown, overrides: Partial<MessageEventInit> = {}) =>
    ({
      source: window,
      origin: window.location.origin,
      data,
      ...overrides,
    }) as unknown as MessageEvent

  it('accepts a well-formed answer', () => {
    expect(imageResultFrom(event(ok), window)).toEqual({
      url: 'https://cdn.example.com/a.png',
      ok: true,
      base64: 'iVBORw0KGgo=',
    })
  })

  it.each([
    ['来自别的窗口', event(ok, { source: {} as Window })],
    ['来自别的源', event(ok, { origin: 'https://evil.test' })],
    ['不是本协议的消息', event({ ...ok, type: 'something-else' })],
    ['url 不是字符串', event({ ...ok, url: 42 })],
  ])('refuses an answer that %s', (_label, bad) => {
    expect(imageResultFrom(bad, window)).toBeNull()
  })

  it.each([
    ['base64 含非法字符', 'not base64!!'],
    ['base64 为空', ''],
    ['base64 不是字符串', 42],
  ])('marks bad bytes as a failure rather than passing them on when %s', (_label, base64) => {
    // fail-closed：形状不对就记一次失败，绝不把内容交给下游去 atob。
    expect(imageResultFrom(event({ ...ok, result: { ok: true, base64 } }), window)).toEqual({
      url: 'https://cdn.example.com/a.png',
      ok: false,
      reason: 'bad-bytes',
    })
  })

  it('carries the failure reason through without the site error text', () => {
    const failed = event({
      ...ok,
      result: { ok: false, reason: 'http-error', detail: '403 from cdn' },
    })
    expect(imageResultFrom(failed, window)).toEqual({
      url: 'https://cdn.example.com/a.png',
      ok: false,
      reason: 'http-error',
    })
  })

  it('ignores a reason that is not a string', () => {
    const odd = event({ ...ok, result: { ok: false, reason: { evil: true } } })
    expect(imageResultFrom(odd, window)).toEqual({
      url: 'https://cdn.example.com/a.png',
      ok: false,
      reason: undefined,
    })
  })
})

describe('isCapturedCitation', () => {
  // 契约第 14 节的分工：扩展那份靠逐字比对保证「两份一样」，前端这份把规则逐条钉成
  // 行为断言，保证「这一份符合规格」。每条拒收都对应后端 contracts.py 里的一条约束。
  const ok = {
    item_type: 'BOOK',
    authors: ['李维'],
    issued_year: 2024,
    issued_date: '2024',
    container_title: null,
    volume: null,
    issue: null,
    pages: null,
    publisher: null,
    doi: null,
    isbn: '978-7',
  }

  it.each([
    ['认不出（null）', null],
    ['旧版本扩展没这个字段（undefined）', undefined],
    ['一份完整的', ok],
    ['一位作者都没有', { ...ok, authors: [] }],
    ['刚好 100 位作者', { ...ok, authors: Array.from({ length: 100 }, () => '李') }],
    ['年份下界', { ...ok, issued_year: 1000 }],
    ['年份上界', { ...ok, issued_year: 2200 }],
  ])('accepts %s', (_label, value) => {
    expect(isCapturedCitation(value)).toBe(true)
  })

  it.each([
    ['不是对象', '文献'],
    ['是数组', [ok]],
    ['类型不在九种里', { ...ok, item_type: 'PAPER' }],
    ['作者不是数组', { ...ok, authors: '李维' }],
    ['101 位作者', { ...ok, authors: Array.from({ length: 101 }, () => '李') }],
    ['作者名 201 字', { ...ok, authors: ['李'.repeat(201)] }],
    ['作者名只有空白', { ...ok, authors: ['   '] }],
    ['年份 999', { ...ok, issued_year: 999 }],
    ['年份 2201', { ...ok, issued_year: 2201 }],
    ['年份不是整数', { ...ok, issued_year: 2024.5 }],
    ['年份是字符串', { ...ok, issued_year: '2024' }],
    ['出版日期 33 字', { ...ok, issued_date: '2'.repeat(33) }],
    ['出处 501 字', { ...ok, container_title: '刊'.repeat(501) }],
    ['卷 51 字', { ...ok, volume: '1'.repeat(51) }],
    ['DOI 201 字', { ...ok, doi: '1'.repeat(201) }],
    ['ISBN 33 字', { ...ok, isbn: '9'.repeat(33) }],
    ['空字符串不算「没有」', { ...ok, doi: '' }],
  ])('rejects %s', (_label, value) => {
    expect(isCapturedCitation(value)).toBe(false)
  })
})

describe('isCapturedPdf', () => {
  // 8 字节的假 PDF：长度与 base64 必须对得上，这正是下面要钉的规则之一。
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3])
  const ok = { name: 'paper.pdf', bytes: 8, base64: btoa(String.fromCharCode(...bytes)) }

  it.each([
    ['没有 PDF（null）', null],
    ['旧版本扩展没这个字段（undefined）', undefined],
    ['一份合法的', ok],
  ])('accepts %s', (_label, value) => {
    expect(isCapturedPdf(value)).toBe(true)
  })

  it.each([
    ['不是对象', 'paper.pdf'],
    ['是数组', [ok]],
    ['文件名为空', { ...ok, name: '   ' }],
    ['文件名过长', { ...ok, name: 'a'.repeat(201) }],
    ['字节数为 0', { ...ok, bytes: 0 }],
    ['字节数不是整数', { ...ok, bytes: 8.5 }],
    ['超过 25 MiB 上限', { ...ok, bytes: 26_214_401 }],
    ['base64 里有非法字符', { ...ok, base64: '@@@@' }],
    ['字节数与 base64 长度对不上', { ...ok, bytes: 9 }],
    // 契约 14.2 写明必以 `.pdf` 结尾（首轮 Review F7）。
    ['名字不以 .pdf 结尾', { ...ok, name: 'paper.txt' }],
    ['名字只是 pdf 三个字母', { ...ok, name: 'pdf' }],
  ])('rejects %s', (_label, value) => {
    expect(isCapturedPdf(value)).toBe(false)
  })

  it('accepts 大写的 .PDF', () => {
    expect(isCapturedPdf({ ...ok, name: 'paper.PDF' })).toBe(true)
  })
})

describe('isPdfProblem', () => {
  // 契约 14.7 只列五种取值；14.3 要求载荷逐条校验后才使用。首轮 Review F3：
  // 原先这个字段跟着载荷原样透传，`PdfProblem` 这个类型在运行时根本不存在。
  it.each([['cross-origin'], ['too-large'], ['not-pdf'], ['slow'], ['failed']])(
    'accepts the contract value %s',
    (value) => {
      expect(isPdfProblem(value)).toBe(true)
    },
  )

  it('accepts 没有这个字段', () => {
    expect(isPdfProblem(null)).toBe(true)
    expect(isPdfProblem(undefined)).toBe(true)
  })

  it.each([['paywall'], [''], [0], [{}], [['failed']], [true]])('rejects %s', (value) => {
    expect(isPdfProblem(value)).toBe(false)
  })
})
