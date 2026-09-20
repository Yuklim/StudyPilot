import { afterEach, describe, expect, it } from 'vitest'

import {
  clearPdfPosition,
  locatePage,
  pdfPositionKey,
  ratioWithinPage,
  readPdfPosition,
  scrollTopFor,
  writePdfPosition,
} from './pdfPosition'

/** PDF 的位置记忆（TASK-073）：记的是「第几页 + 页内比例」，不是像素——换个缩放像素就没意义了。 */

const resourceId = '018f1f58-4eb2-4a0d-a716-fb81b1960001'
const tops = [0, 800, 1600, 2400]
const heights = [800, 800, 800, 800]

afterEach(() => localStorage.clear())

describe('pdf reading position', () => {
  it('locates the page under the scroll offset and how far into it', () => {
    expect(locatePage(0, tops, heights)).toEqual({ page: 1, ratio: 0 })
    expect(locatePage(1200, tops, heights)).toEqual({ page: 2, ratio: 0.5 })
    expect(locatePage(2400, tops, heights)).toEqual({ page: 4, ratio: 0 })
    // 滚过末页底部：停在末页，比例夹在 1。
    expect(locatePage(99999, tops, heights)).toEqual({ page: 4, ratio: 1 })
    expect(locatePage(500, [], [])).toEqual({ page: 1, ratio: 0 })
  })

  it('keeps a pinned jump invertible instead of writing ratio 0 (第二轮 Review)', () => {
    const viewport = 600
    // 「跳到第 2 页」是把这一页的顶部带到视口顶；此刻中线已经落进这一页 300px 处。
    const top = tops[1]!
    const ratio = ratioWithinPage(2, top, tops, heights, viewport)
    expect(ratio).toBeCloseTo(300 / 800)
    // 记下来的位置要能原样回到离开处。
    expect(scrollTopFor({ page: 2, ratio }, tops, heights, viewport)).toBeCloseTo(top)
    // 写死 0 就会落在页顶再往上半个视口——比离开的地方高半屏。
    expect(scrollTopFor({ page: 2, ratio: 0 }, tops, heights, viewport)).toBeCloseTo(top - 300)
    // 页比半个视口还矮时比例夹在 1，回来的落点差在一页之内。
    expect(ratioWithinPage(1, 0, [0], [100], viewport)).toBe(1)
    expect(ratioWithinPage(1, 0, [], [], viewport)).toBe(0)
  })

  it('goes back to the same place, whatever the zoom is', () => {
    const at = locatePage(1200, tops, heights)
    expect(scrollTopFor(at, tops, heights)).toBe(1200)
    // 放大一倍后每页更高：同一个「第 2 页的一半」落在新的像素位置上。
    const zoomed = [0, 1600, 3200, 4800]
    const tall = [1600, 1600, 1600, 1600]
    expect(scrollTopFor(at, zoomed, tall)).toBe(2400)
    // 页码越界时夹回来，不抛。
    expect(scrollTopFor({ page: 99, ratio: 0 }, tops, heights)).toBe(2400)
  })

  it('keeps the position per resource and refuses one saved for another file', () => {
    writePdfPosition(resourceId, { page: 3, ratio: 0.25, fingerprint: 'file-a' })
    const saved = readPdfPosition(resourceId)!
    expect([saved.page, saved.ratio, saved.fingerprint]).toEqual([3, 0.25, 'file-a'])
    expect(Date.parse(saved.savedAt)).not.toBeNaN()
    expect(readPdfPosition('018f1f58-4eb2-4a0d-a716-fb81b1960099')).toBeNull()
    clearPdfPosition(resourceId)
    expect(readPdfPosition(resourceId)).toBeNull()
  })

  it('ignores a damaged or nonsense record instead of jumping somewhere random', () => {
    for (const bad of [
      'not json',
      '{"page":0,"ratio":0,"fingerprint":"a","savedAt":"x"}',
      '{"page":1,"ratio":2,"fingerprint":"a","savedAt":"x"}',
      '{"page":1,"ratio":0,"fingerprint":"","savedAt":"x"}',
      '{"page":1.5,"ratio":0,"fingerprint":"a","savedAt":"x"}',
      '[]',
    ]) {
      localStorage.setItem(pdfPositionKey(resourceId), bad)
      expect(readPdfPosition(resourceId)).toBeNull()
    }
  })
})
