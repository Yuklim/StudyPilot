import { describe, expect, it } from 'vitest'

import { anchorFrom, locate, mapText, rangeFor, type Anchor } from './highlightAnchor'

/**
 * 锚点与重定位（TASK-072）。这两件事错了，用户会看见「标过的段落不见了」，所以四级降级
 * 每一级都有定向用例，且每一级都验过判别性（去掉该级则对应用例变红）。
 */

const ARTICLE =
  '神经网络主要由输入层、隐藏层、输出层构成。' +
  '当隐藏层只有一层时，该网络称为两层神经网络。' +
  '误差逆传播算法先前向计算输出，再把误差逐层回传。'

function render(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.append(root)
  return root
}

function anchor(overrides: Partial<Anchor> = {}): Anchor {
  return {
    exact: '输入层、隐藏层、输出层',
    prefix: '神经网络主要由',
    suffix: '构成。',
    start_offset: 7,
    end_offset: 18,
    ...overrides,
  }
}

describe('从选区取锚点', () => {
  it('takes the passage with its surrounding context and offsets', () => {
    const root = render(`<p>${ARTICLE}</p>`)
    const text = root.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 7)
    range.setEnd(text, 18)
    const taken = anchorFrom(root, range)!
    expect(taken.exact).toBe('输入层、隐藏层、输出层')
    expect(taken.prefix).toBe('神经网络主要由')
    expect(taken.suffix?.startsWith('构成。')).toBe(true)
    expect([taken.start_offset, taken.end_offset]).toEqual([7, 18])
  })

  it('spans element boundaries and reports offsets over the rendered text', () => {
    // 正文里有行内标记时，选区跨了两个文本节点；偏移必须按**整段纯文本**算，
    // 否则重定位时两端用的不是同一套坐标。
    const root = render('<p>神经网络主要由<strong>输入层</strong>、隐藏层构成。</p>')
    const before = root.querySelector('p')!.firstChild!
    const inside = root.querySelector('strong')!.firstChild!
    const range = document.createRange()
    range.setStart(before, 7)
    range.setEnd(inside, 3)
    const taken = anchorFrom(root, range)!
    expect(taken.exact).toBe('输入层')
    expect([taken.start_offset, taken.end_offset]).toEqual([7, 10])
    expect(mapText(root).text.slice(7, 10)).toBe('输入层')
  })

  it('refuses selections outside the body, empty ones and oversized ones', () => {
    const root = render(`<p>${ARTICLE}</p>`)
    const outside = render('<p>别处的文字</p>')
    const stray = document.createRange()
    stray.selectNodeContents(outside.querySelector('p')!)
    expect(anchorFrom(root, stray)).toBeNull()

    const text = root.querySelector('p')!.firstChild!
    const empty = document.createRange()
    empty.setStart(text, 3)
    empty.setEnd(text, 3)
    expect(anchorFrom(root, empty)).toBeNull()

    const long = render(`<p>${'长'.repeat(2100)}</p>`)
    const all = document.createRange()
    all.selectNodeContents(long.querySelector('p')!)
    expect(anchorFrom(long, all)).toBeNull()
  })
})

describe('把锚点落回正文（四级降级）', () => {
  it('1. uses the only occurrence of the passage', () => {
    const found = locate(ARTICLE, anchor())!
    expect([found.start, found.end]).toEqual([7, 18])
    expect(found.degraded).toBe(false)
  })

  it('2. tells repeated wording apart by its context, even when the offset lies', () => {
    // 同一句话出现两次，而且**偏移已经不可信**（正文上方插过字，存的偏移指向第一处）。
    // 这时只有前后文能救：判别性靠这一点——去掉前后文打分，本例必红。
    const repeated = '开头讲到关键一步，随后展开。中段又说关键一步，这次是结论。'
    const first = repeated.indexOf('关键一步')
    const second = repeated.indexOf('关键一步', first + 1)
    const found = locate(
      repeated,
      anchor({
        exact: '关键一步',
        prefix: '中段又说',
        suffix: '，这次是结论。',
        start_offset: first,
        end_offset: first + 4,
      }),
    )!
    expect(found.start).toBe(second)
    expect(found.degraded).toBe(false)

    // 反过来：前后文指向第一处时也要选第一处，不被偏移牵着走。
    const back = locate(
      repeated,
      anchor({
        exact: '关键一步',
        prefix: '开头讲到',
        suffix: '，随后展开。',
        start_offset: second,
        end_offset: second + 4,
      }),
    )!
    expect(back.start).toBe(first)
  })

  it('3. still finds it when only the whitespace around it changed', () => {
    // 正文重新排过版：换行与缩进变了，字没变。判别性：去掉折叠空白这一级，本例必红。
    const reflowed = '神经网络主要由\n  输入层、隐藏层、\n输出层\n构成。'
    const found = locate(reflowed, anchor())!
    expect(reflowed.slice(found.start, found.end).replace(/\s+/g, '')).toBe(
      '输入层、隐藏层、输出层',
    )
    expect(found.degraded).toBe(true)
  })

  it('4. falls back to the neighbourhood when the passage itself was edited', () => {
    // 这段话被改过尾巴（「输出层」→「输出层等三层」），开头还在。判别性：去掉模糊匹配，本例必红。
    const edited = '神经网络主要由输入层、隐藏层、输出层等三层结构构成。'
    const found = locate(edited, anchor({ exact: '输入层、隐藏层、输出层构成' }))!
    expect(found.start).toBe(7)
    expect(found.degraded).toBe(true)
  })

  it('reports an orphan instead of guessing when the passage is gone', () => {
    const replaced = '这篇正文已经整份换成了别的内容，和原来那段没有任何关系。'
    expect(locate(replaced, anchor())).toBeNull()
    // 片段太短时不做模糊匹配：否则「一层」这种词会落到任意位置。
    expect(locate(replaced, anchor({ exact: '一层', start_offset: 0, end_offset: 2 }))).toBeNull()
  })

  it('keeps the found offsets usable as a DOM range', () => {
    const root = render(`<p>神经网络主要由</p><p><em>输入层、隐藏层、输出层</em>构成。</p>`)
    const range = rangeFor(root, anchor())!
    expect(range.toString()).toBe('输入层、隐藏层、输出层')
    // 上色不改正文：取 Range 不应动 DOM。
    expect(root.querySelectorAll('mark, span').length).toBe(0)
  })

  it('returns no range for an orphaned anchor', () => {
    const root = render('<p>整份换过的正文。</p>')
    expect(rangeFor(root, anchor())).toBeNull()
  })
})
