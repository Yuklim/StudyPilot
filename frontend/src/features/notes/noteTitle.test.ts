import { describe, expect, it } from 'vitest'

import { noteTitle } from './noteTitle'

describe('noteTitle', () => {
  it('takes the first non-empty line and strips a Markdown heading marker', () => {
    expect(noteTitle('\n\n# 三种状态\n\n正文')).toBe('三种状态')
    expect(noteTitle('  ## 小节 ')).toBe('小节')
    expect(noteTitle('第一行\n第二行')).toBe('第一行')
  })
  it('returns null for blank content', () => {
    expect(noteTitle('')).toBeNull()
    expect(noteTitle('  \n\n \t')).toBeNull()
  })
  it('truncates long first lines at 60 characters by code point', () => {
    const long = '字'.repeat(61) + '😀'
    expect(noteTitle(long)).toBe('字'.repeat(60) + '…')
    expect(noteTitle('😀'.repeat(60))).toBe('😀'.repeat(60))
  })
  it('does not strip hashes that are not a heading marker', () => {
    expect(noteTitle('C# 入门')).toBe('C# 入门')
    // Markdown 标题记号后面要有空格；`#hashtag` 不是标题，原样保留。
    expect(noteTitle('#hashtag 风格')).toBe('#hashtag 风格')
  })
})
