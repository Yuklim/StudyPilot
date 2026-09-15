/** 页面上给心得当标题用的最大长度（字符数，按码点算）。 */
const MAX_TITLE = 60

/**
 * 心得没有标题字段（契约只有 `content`）。像备忘录一样**取第一个非空行当标题**：
 * 去掉行首的 Markdown 标题记号与首尾空白，超过 60 字截断加省略号。
 * 空内容返回 null，由调用方决定占位文案（「新心得」/「无标题心得」）。
 */
export function noteTitle(content: string): string | null {
  for (const raw of content.split(/\r?\n/)) {
    // 图片行只留替代文字（TASK-063：内嵌图片是一大串 base64，不能当标题）；只有图片没
    // 替代文字的行跳过。
    const line = raw
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(IMAGE, (_match, alt: string) => alt.trim())
      .trim()
    if (!line) continue
    const chars = [...line]
    return chars.length > MAX_TITLE ? chars.slice(0, MAX_TITLE).join('') + '…' : line
  }
  return null
}

/** 行内图片：`![替代文字](地址)`。地址里不会有 `)`，base64 也不会。 */
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g

/** 去掉行内 Markdown 记号（粗斜体、行内代码、链接），摘要里只留文字。 */
function plainInline(line: string): string {
  return line
    .replace(IMAGE, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
}

/** 列表里标题下面那行摘要：标题行之后的正文，折成一行，最多 `limit` 字。 */
export function noteSnippet(content: string, limit = 80): string {
  const lines = content.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() !== '')
  const rest = lines
    .slice(start + 1)
    // 表格行与代码围栏折成一行只剩竖线和反引号，跳过；任务列表只去掉勾选框。
    .filter((line) => !/^\s*(\||```|~~~)/.test(line))
    .map((line) =>
      plainInline(
        line.replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s*)/, '').replace(/^\[[ xX]\]\s*/, ''),
      ).trim(),
    )
    .filter(Boolean)
    .join(' ')
  const chars = [...rest]
  return chars.length > limit ? chars.slice(0, limit).join('') + '…' : rest
}

/**
 * 搜索/展示用的纯文本：内嵌图片换成「[图片]」（带替代文字则「[图片：替代文字]」），其余原样。
 * 心得页的页内搜索按它匹配（TASK-063）——base64 里什么字母都有，直接搜正文会假命中；
 * 阅读器侧栏的纯文本卡片也用它，不把 base64 铺到界面上。
 */
export function displayText(content: string): string {
  return content.replace(
    /!\[([^\]]*)\]\(data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]*\)/g,
    (_m, alt: string) => (alt.trim() && alt.trim() !== '图片' ? `[图片：${alt.trim()}]` : '[图片]'),
  )
}
