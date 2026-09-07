import { describe, expect, it } from 'vitest'

import { deliveryText, imagePrompt, outcomeText, popupText } from './popup'

describe('popupText', () => {
  it('names the version', () => {
    expect(popupText('0.2.0')).toContain('0.2.0')
  })
})

describe('outcomeText', () => {
  it('tells the user where to go next on success', () => {
    expect(
      outcomeText({ ok: true, payload: { title: '', url: '', markdown: '', images: [] } }),
    ).toContain('确认')
  })

  it.each([
    ['no-tab', '标签页'],
    ['inject-failed', '不允许'],
    ['timeout', '超时'],
    ['unusable', '手工粘贴'],
    ['unusable-url', '网址存不了'],
  ] as const)('gives a specific reason and next step for %s', (reason, expected) => {
    // 「失败了」对用户没有用。每种失败都要说清是什么情况、下一步能做什么。
    const text = outcomeText({ ok: false, reason })
    expect(text).toContain(expected)
    expect(text.length).toBeGreaterThan(10)
  })

  it('gives a different message for every reason', () => {
    const reasons = ['no-tab', 'inject-failed', 'timeout', 'unusable', 'unusable-url'] as const
    const texts = reasons.map((reason) => outcomeText({ ok: false, reason }))
    expect(new Set(texts).size).toBe(reasons.length)
  })
})

describe('imagePrompt', () => {
  it('names the real count and says what refusing costs', () => {
    // 用户是据这个数字决定要不要授权的：不四舍五入、不说「一些图片」。
    const text = imagePrompt(12)
    expect(text).toContain('12 张图片')
    expect(text).toContain('权限')
    expect(text).toContain('不授权也能保存正文')
  })
})

describe('deliveryText', () => {
  it('distinguishes "text only" from "text plus images" instead of a blanket done', () => {
    expect(deliveryText(0)).toContain('图片保留原网站地址')
    expect(deliveryText(0)).not.toContain('张图片，请')
    expect(deliveryText(3)).toContain('3 张图片')
  })
})

describe('deliveryText when the grant did not land', () => {
  it('says the permission is why the images were left behind', () => {
    // 不能只说「已保存」：用户要了图、结果一张没带走，得知道为什么、以及怎么补救。
    const text = deliveryText(0, true)
    expect(text).toContain('权限')
    expect(text).toContain('重新点一次采集')
  })
})
