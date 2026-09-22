import { describe, expect, it, vi } from 'vitest'

import { currentBookmark, readPdfOutline, readingPercentOf, type OutlineDoc } from './pdfOutline'

/**
 * PDF 的书签大纲（TASK-088）。这里守的是**解析**：书签指向的目标有三种形态（具名、显式
 * 数组、直接页序号），任何一条解析不出页码就该被丢掉，而不是显示一条点了没反应的目录项。
 */

/** 一个最小的文档替身：`ref` 用 `{ num }` 表示页引用，页码＝`num`。 */
function docOf(tree: unknown[] | null, named: Record<string, unknown[]> = {}): OutlineDoc {
  return {
    getOutline: () => Promise.resolve(tree),
    getDestination: (id: string) => Promise.resolve(named[id] ?? null),
    getPageIndex: (ref: unknown) => {
      const page = (ref as { num?: number } | null)?.num
      if (typeof page !== 'number') return Promise.reject(new Error('unknown ref'))
      return Promise.resolve(page - 1)
    },
  }
}

describe('书签大纲 → 目录条目', () => {
  it('flattens two levels and resolves each bookmark to a page', async () => {
    const items = await readPdfOutline(
      docOf([
        { title: '一、开头', dest: [{ num: 1 }, '/XYZ'] },
        {
          title: '二、方法',
          dest: [{ num: 2 }, '/XYZ'],
          items: [{ title: '2.1 细节', dest: [{ num: 3 }, '/XYZ'] }],
        },
      ]),
    )
    expect(items.map((item) => [item.level, item.text, item.page])).toEqual([
      [2, '一、开头', 1],
      [2, '二、方法', 2],
      [3, '2.1 细节', 3],
    ])
    // key 要唯一：同名的两节（「小结」这种）在列表里不能撞 key。
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length)
  })

  it('looks up a named destination', async () => {
    const items = await readPdfOutline(
      docOf([{ title: '正文', dest: 'chapter.1' }], { 'chapter.1': [{ num: 7 }, '/Fit'] }),
    )
    expect(items).toEqual([{ key: '0-正文', level: 2, text: '正文', page: 7 }])
  })

  it('takes a destination that carries the page index directly', async () => {
    // 有些文件的目标第一项就是 0 起的页序号，而不是页引用。
    const items = await readPdfOutline(docOf([{ title: '附录', dest: [4, '/XYZ'] }]))
    expect(items[0]?.page).toBe(5)
  })

  it('drops the entries it cannot resolve instead of showing half a broken outline', async () => {
    const items = await readPdfOutline(
      docOf(
        [
          { title: '好的', dest: [{ num: 2 }, '/XYZ'] },
          { title: '坏目标', dest: [{ bad: true }, '/XYZ'] }, // getPageIndex 抛错
          { title: '空目标', dest: null },
          { title: '查不到的具名目标', dest: 'nope' },
          { title: '   ', dest: [{ num: 3 }, '/XYZ'] }, // 空标题
        ],
        {},
      ),
    )
    expect(items.map((item) => item.text)).toEqual(['好的'])
  })

  it('treats no outline, an empty outline and a throwing one as "no outline at all"', async () => {
    expect(await readPdfOutline({})).toEqual([])
    expect(await readPdfOutline(docOf(null))).toEqual([])
    expect(await readPdfOutline(docOf([]))).toEqual([])
    expect(await readPdfOutline({ getOutline: () => Promise.reject(new Error('broken')) })).toEqual(
      [],
    )
  })

  it('keeps reading even when one bookmark blows up mid-tree', async () => {
    const boom = vi.fn(() => Promise.reject(new Error('nope')))
    const items = await readPdfOutline({
      getOutline: () =>
        Promise.resolve([
          { title: '炸的', dest: 'x' },
          { title: '好的', dest: [5, '/XYZ'] },
        ]),
      getDestination: boom,
    })
    expect(items.map((item) => item.text)).toEqual(['好的'])
    expect(boom).toHaveBeenCalled()
  })
})

describe('当前读到哪一条', () => {
  const items = [{ page: 1 }, { page: 4 }, { page: 9 }]

  it('is the last bookmark at or before the current page', () => {
    expect(currentBookmark(items, 1)).toBe(0)
    expect(currentBookmark(items, 3)).toBe(0)
    expect(currentBookmark(items, 4)).toBe(1)
    expect(currentBookmark(items, 99)).toBe(2)
  })

  it('is -1 before the first bookmark, and -1 when there is no outline', () => {
    expect(currentBookmark([{ page: 3 }], 1)).toBe(-1)
    expect(currentBookmark([], 5)).toBe(-1)
  })

  it('does not stop at the first bookmark that is past the page', () => {
    // 书签顺序由作者决定，见过附录排在正文前面的文件：不能像网页那版一样提前 break。
    expect(currentBookmark([{ page: 9 }, { page: 2 }], 3)).toBe(1)
  })
})

describe('读到整份的百分之几', () => {
  it('counts the page you are on plus how far into it you are', () => {
    expect(readingPercentOf(1, 0, 10)).toBe(0)
    expect(readingPercentOf(1, 0.5, 10)).toBe(5)
    expect(readingPercentOf(6, 0, 10)).toBe(50)
    expect(readingPercentOf(10, 1, 10)).toBe(100)
  })

  it('stays inside 0–100 and gives up when the page count is unusable', () => {
    expect(readingPercentOf(1, -3, 10)).toBe(0)
    expect(readingPercentOf(20, 5, 10)).toBe(100)
    expect(readingPercentOf(1, 0, 0)).toBeNull()
    expect(readingPercentOf(1, 0, Number.NaN)).toBeNull()
  })
})
