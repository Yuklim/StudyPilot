import { describe, expect, it } from 'vitest'

import { outcomeText, popupText } from './popup'

describe('popupText', () => {
  it('names the version', () => {
    expect(popupText('0.2.0')).toContain('0.2.0')
  })
})

describe('outcomeText', () => {
  it('tells the user where to go next on success', () => {
    expect(outcomeText({ ok: true, payload: { title: '', url: '', markdown: '' } })).toContain(
      '确认',
    )
  })

  it.each([
    ['no-tab', '标签页'],
    ['inject-failed', '不允许'],
    ['timeout', '超时'],
    ['unusable', '手工粘贴'],
  ] as const)('gives a specific reason and next step for %s', (reason, expected) => {
    // 「失败了」对用户没有用。每种失败都要说清是什么情况、下一步能做什么。
    const text = outcomeText({ ok: false, reason })
    expect(text).toContain(expected)
    expect(text.length).toBeGreaterThan(10)
  })

  it('gives a different message for every reason', () => {
    const reasons = ['no-tab', 'inject-failed', 'timeout', 'unusable'] as const
    const texts = reasons.map((reason) => outcomeText({ ok: false, reason }))
    expect(new Set(texts).size).toBe(reasons.length)
  })
})
