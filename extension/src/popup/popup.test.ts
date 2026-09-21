import { describe, expect, it } from 'vitest'

import type { CapturePayload } from '../shared/protocol'

import {
  deliveryText,
  imagePrompt,
  needsPdfDecision,
  outcomeText,
  pdfFailureText,
  popupText,
  shouldAskAboutImages,
} from './popup'

/** 一份最小载荷；各用例只改它关心的那两个字段。 */
function payload(overrides: Partial<CapturePayload> = {}): CapturePayload {
  return { title: '', url: 'https://x.test/a', markdown: 'x', images: [], ...overrides }
}

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

describe('needsPdfDecision（TASK-085）', () => {
  const citation = {
    item_type: 'PREPRINT' as const,
    authors: [],
    issued_year: null,
    issued_date: null,
    container_title: null,
    volume: null,
    issue: null,
    pages: null,
    publisher: null,
    doi: null,
    isbn: null,
  }

  it('stops only when a paper was tried and came back without its PDF', () => {
    // 这是「停在 popup 里问一句」的唯一入口：是文献、试过、没拿到。
    expect(needsPdfDecision(payload({ citation, pdf_problem: 'failed' }))).toBe(true)
    // 拿到了就不该停——用户要的是一次点击。
    expect(
      needsPdfDecision(
        payload({ citation, pdf: { name: 'a.pdf', bytes: 3, base64: 'AAAA' }, pdf_problem: null }),
      ),
    ).toBe(false)
    // 这一页本来就没声明 PDF：不是失败，是没有。
    expect(needsPdfDecision(payload({ citation }))).toBe(false)
    // 不是文献：一个字都不该变（普通网页的路径）。
    expect(needsPdfDecision(payload({ pdf_problem: 'failed' }))).toBe(false)
    expect(needsPdfDecision(payload())).toBe(false)
  })
})

describe('pdfFailureText（TASK-085）', () => {
  it.each([
    ['cross-origin', /另一个域名/],
    ['too-large', /25 MiB/],
    ['not-pdf', /不是 PDF/],
    ['slow', /20 秒内没下完/],
    ['failed', /先登录/],
  ] as const)('says what actually happened: %s', (problem, said) => {
    // 五种原因各说各的话：该怎么办完全不同（换个入口／自己下载／登录后再来／再试一次）。
    expect(pdfFailureText(problem)).toMatch(said)
  })

  it('never reuses the same sentence for two different reasons', () => {
    const all = (['cross-origin', 'too-large', 'not-pdf', 'slow', 'failed'] as const).map(
      pdfFailureText,
    )
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('shouldAskAboutImages', () => {
  const images = ['https://x.test/1.png', 'https://x.test/2.png']
  const pdf = { name: 'a.pdf', bytes: 3, base64: 'AAAA' }

  it('asks only when the images will actually be used', () => {
    // 有图、没 PDF：问——这是图片冻结本来的路。
    expect(shouldAskAboutImages(payload({ images }))).toBe(true)
    // 没图：没什么可问的。
    expect(shouldAskAboutImages(payload())).toBe(false)
  })

  it('never asks for site access the PDF path will not use', () => {
    // **首轮 Review F1。** 抓到了 PDF 时确认页在冻图之前就 return，图片一张不碰；
    // 照问等于让用户为一件不会发生的事授出 `<all_urls>`。实测 PLOS ONE 正是
    // 「5 张图 + PDF 抓取成功」这一类，arXiv 图片数为 0 所以先前没暴露。
    expect(shouldAskAboutImages(payload({ images, pdf }))).toBe(false)
  })
})

describe('deliveryText', () => {
  it('distinguishes "text only" from "text plus images" instead of a blanket done', () => {
    expect(deliveryText(0)).toContain('图片保留原网站地址')
    expect(deliveryText(0)).not.toContain('张图片，请')
    expect(deliveryText(3)).toContain('3 张图片')
  })
})

describe('deliveryText for the PDF path', () => {
  it('does not promise the image download that will not happen', () => {
    const text = deliveryText(0, false, true)
    expect(text).toContain('PDF')
    // 这条路上正文与图片都不参与，回执不能照抄正文那一套（首轮 Review F1）。
    expect(text).not.toContain('逐张下载')
    expect(text).not.toContain('图片保留原网站地址')
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
