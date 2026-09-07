import { describe, expect, it, vi } from 'vitest'

import { CAPTURE_EXTRACTED } from '../shared/protocol'

import { deliverCapture, extractedPayload, runCapture, type CaptureBridge } from './capture'

const payload = {
  title: '如何理解数据库索引',
  url: 'https://example.com/db-index',
  markdown: '# 标题\n\n正文。\n',
  images: [],
}

/**
 * 记录调用顺序的假 bridge。`emits` 就是注入脚本回传的东西：
 * 传 `NOTHING` 表示脚本跑了但什么都没回来（用于测超时）。
 */
const NOTHING = Symbol('nothing')

function bridgeWith(emits: unknown = payload, overrides: Partial<CaptureBridge> = {}) {
  const calls: string[] = []
  let deliver: ((value: unknown) => void) | undefined
  const bridge: CaptureBridge = {
    activeTabId: async () => 7,
    onExtracted: (handler) => {
      calls.push('subscribe')
      deliver = handler
      return () => calls.push('unsubscribe')
    },
    inject: async () => {
      calls.push('inject')
      if (emits !== NOTHING) deliver?.(emits)
    },
    stash: async () => {
      calls.push('stash')
    },
    openConfirmPage: async () => {
      calls.push('open')
    },
    requestImageAccess: async () => {
      calls.push('permission')
      return true
    },
    ...overrides,
  }
  return { bridge, calls }
}

describe('runCapture', () => {
  it('subscribes before injecting, and does not deliver on its own', async () => {
    // 顺序不是风格问题：注入脚本一跑完就发消息，晚一步订阅就永远收不到。
    //
    // TASK-040 起提取与交付分开：`runCapture` 只提取。交付要等用户在 popup 上就
    // 图片作出选择，因为权限请求必须发生在那一次点击的手势里。
    const { bridge, calls } = bridgeWith()
    await expect(runCapture(bridge)).resolves.toEqual({ ok: true, payload })
    expect(calls).toEqual(['subscribe', 'inject', 'unsubscribe'])
  })

  it.each([
    // 结论必须是 unusable/unusable-url 而不是 timeout —— 后者只说明内容没送达，
    // 那样就验不到「送达了但不可用，仍然拒绝」这件事。
    // 两种原因要分开：正文没提取出来，和正文好好的但网址存不了，对用户是
    // 完全不同的情况，一句「没能提取出正文」会把人指向错误的方向。
    ['回传的结构不对', { title: 't' }, 'unusable'],
    ['回传的正文是空的', { ...payload, markdown: '   ' }, 'unusable'],
    ['回传的正文超出后端上限', { ...payload, markdown: 'x'.repeat(1_000_001) }, 'unusable'],
    ['网址不是 http(s)', { ...payload, url: 'javascript:alert(1)' }, 'unusable-url'],
    ['网址带片段标识符', { ...payload, url: 'https://example.com/a#x' }, 'unusable-url'],
    ['网址带凭据', { ...payload, url: 'https://u:p@example.com/a' }, 'unusable-url'],
    ['网址超长', { ...payload, url: `https://example.com/${'a'.repeat(3000)}` }, 'unusable-url'],
  ])('never opens the confirm page when %s', async (_label, bad, reason) => {
    const { bridge, calls } = bridgeWith(bad)
    await expect(runCapture(bridge, 200)).resolves.toEqual({ ok: false, reason })
    expect(calls).not.toContain('stash')
    expect(calls).not.toContain('open')
    expect(calls).not.toContain('permission')
  })

  it('reports the page refusing injection instead of hanging', async () => {
    const { bridge, calls } = bridgeWith(payload, {
      inject: async () => {
        throw new Error('Cannot access contents of the page')
      },
    })
    await expect(runCapture(bridge, 50)).resolves.toEqual({ ok: false, reason: 'inject-failed' })
    expect(calls).toEqual(['subscribe', 'unsubscribe'])
  })

  it('gives up after the timeout rather than waiting forever', async () => {
    const { bridge, calls } = bridgeWith(NOTHING)
    await expect(runCapture(bridge, 10)).resolves.toEqual({ ok: false, reason: 'timeout' })
    expect(calls).not.toContain('stash')
  })

  it('says so when there is no active tab', async () => {
    const { bridge, calls } = bridgeWith(payload, { activeTabId: async () => undefined })
    await expect(runCapture(bridge, 10)).resolves.toEqual({ ok: false, reason: 'no-tab' })
    expect(calls).toEqual([])
  })

  it('always unsubscribes, even when the page refuses injection', async () => {
    const unsubscribe = vi.fn()
    const { bridge } = bridgeWith(payload, {
      onExtracted: () => unsubscribe,
      inject: async () => {
        throw new Error('nope')
      },
    })
    await runCapture(bridge, 10)
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})

describe('extractedPayload', () => {
  it('only unwraps its own envelope', () => {
    expect(extractedPayload({ type: CAPTURE_EXTRACTED, payload })).toEqual(payload)
    expect(extractedPayload({ type: 'other', payload })).toBeUndefined()
    expect(extractedPayload(null)).toBeUndefined()
    expect(extractedPayload('nonsense')).toBeUndefined()
  })
})

describe('deliverCapture', () => {
  const withImages = {
    ...payload,
    images: ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.jpg'],
  }

  it('asks for permission only when images are actually being taken', async () => {
    const { bridge, calls } = bridgeWith()
    await expect(deliverCapture(bridge, payload, true)).resolves.toEqual({ images: 0 })
    // 没有图片就没有要问的：不该弹权限框。
    expect(calls).toEqual(['stash', 'open'])
  })

  it('drops the image list when the user chose text only', async () => {
    // 留着地址清单，页面就会去逐张请求 —— 那正是用户拒绝的事。
    const stashed: unknown[] = []
    const { bridge, calls } = bridgeWith(payload, {
      stash: async (value) => {
        stashed.push(value)
      },
    })
    await expect(deliverCapture(bridge, withImages, false)).resolves.toEqual({ images: 0 })
    expect(calls).not.toContain('permission')
    expect(stashed).toEqual([{ ...withImages, images: [] }])
  })

  it('delivers the images once permission is granted', async () => {
    const stashed: unknown[] = []
    const { bridge } = bridgeWith(payload, {
      stash: async (value) => {
        stashed.push(value)
      },
    })
    await expect(deliverCapture(bridge, withImages, true)).resolves.toEqual({ images: 2 })
    expect(stashed).toEqual([withImages])
  })

  it('still delivers the text when permission is refused', async () => {
    // 拒绝授权不阻断采集：正文照存，图片保留原站地址。
    const stashed: unknown[] = []
    const { bridge, calls } = bridgeWith(payload, {
      requestImageAccess: async () => false,
      stash: async (value) => {
        stashed.push(value)
      },
    })
    await expect(deliverCapture(bridge, withImages, true)).resolves.toEqual({ images: 0 })
    expect(calls).toContain('open')
    expect(stashed).toEqual([{ ...withImages, images: [] }])
  })
})
