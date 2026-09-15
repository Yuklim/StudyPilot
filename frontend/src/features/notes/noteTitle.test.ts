import { describe, expect, it } from 'vitest'

import { noteSnippet, noteTitle } from './noteTitle'

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

describe('noteSnippet', () => {
  it('joins the lines after the title into one line, stripping list and heading markers', () => {
    expect(noteSnippet('# 标题\n\n第一段。\n- 要点一\n1. 要点二\n> 引用')).toBe(
      '第一段。 要点一 要点二 引用',
    )
  })
  it('drops inline Markdown markers so only the words remain', () => {
    expect(
      noteSnippet('t\n**粗** 与 *斜* 与 `代码` 与 [链接](https://x.test) 与 ![图](a.png)'),
    ).toBe('粗 与 斜 与 代码 与 链接 与 图')
  })
  it('skips table rows and code fences and drops task-list checkboxes (TASK-062)', () => {
    expect(
      noteSnippet('# SQL\n| 函数 | 用途 |\n| --- | --- |\n| ROW_NUMBER() | 编号 |\n分组内排序。'),
    ).toBe('分组内排序。')
    expect(noteSnippet('t\n```text\n读 → 20%\n```\n所以。')).toBe('读 → 20% 所以。')
    expect(noteSnippet('周计划\n- [x] 线代\n- [ ] 英语\n* [X] 项目')).toBe('线代 英语 项目')
  })
  it('is empty when there is nothing after the title', () => {
    expect(noteSnippet('只有一行')).toBe('')
    expect(noteSnippet('')).toBe('')
  })
  it('truncates by code point with an ellipsis', () => {
    expect(noteSnippet('t\n' + '字'.repeat(90), 80)).toBe('字'.repeat(80) + '…')
  })
})
