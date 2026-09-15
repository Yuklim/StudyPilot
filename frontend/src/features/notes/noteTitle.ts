/** 页面上给心得当标题用的最大长度（字符数，按码点算）。 */
const MAX_TITLE = 60

/**
 * 心得没有标题字段（契约只有 `content`）。像备忘录一样**取第一个非空行当标题**：
 * 去掉行首的 Markdown 标题记号与首尾空白，超过 60 字截断加省略号。
 * 空内容返回 null，由调用方决定占位文案（「新心得」/「无标题心得」）。
 */
export function noteTitle(content: string): string | null {
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/^\s*#{1,6}\s+/, '').trim()
    if (!line) continue
    const chars = [...line]
    return chars.length > MAX_TITLE ? chars.slice(0, MAX_TITLE).join('') + '…' : line
  }
  return null
}
