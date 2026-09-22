/** 目录栏只要这三样；跳转与「当前是哪条」由各自的阅读器算（TASK-088）。 */
export type OutlineRow = { key: string; level: 2 | 3; text: string }

/**
 * 阅读器左侧目录栏（TASK-067，用户 2026-09-17 参考 Readwise Reader：「自动生成每个文档的
 * 大纲，在屏幕一侧显示所有标题和子标题目录」，并指定「放在页面左边」）。
 *
 * **TASK-088 起这是个纯展示组件，两种阅读器共用**：网页的目录来自 `h2/h3`、点击滚到那个元素；
 * PDF 的目录来自书签大纲（`pdfOutline.ts`）、点击跳到那一页。两边长得一模一样，
 * 「当前是哪一条」与「点了去哪」由各自的阅读器算好传进来——这个文件只负责画。
 *
 * 开关只有顶栏的「目录」按钮（`ResourceToolbar`）：栏内不放「隐藏」（用户 2026-09-17 要求
 * 去掉），一个入口开、同一个入口关，焦点也不会因为栏被卸载而丢。
 */

export function ReaderOutline({
  items,
  current,
  onJump,
  hint = '随正文滚动高亮当前节；点击跳转',
}: {
  items: OutlineRow[]
  /** 当前所在条目的下标；-1 表示还没读到任何一条。 */
  current: number
  onJump: (index: number) => void
  hint?: string
}) {
  if (items.length === 0) return null
  return (
    <nav className="reader-outline" aria-label="目录">
      <div className="reader-outline-heading">
        <span className="note-tab">目录</span>
        <span className="reader-outline-count">{items.length} 节</span>
      </div>
      <ol className="reader-outline-list">
        {items.map((item, index) => (
          <li
            key={item.key}
            className={`reader-outline-item level-${item.level}${index === current ? ' current' : ''}`}
          >
            <button
              type="button"
              aria-current={index === current ? 'location' : undefined}
              onClick={() => onJump(index)}
            >
              {item.text}
            </button>
          </li>
        ))}
      </ol>
      <p className="reader-outline-hint">{hint}</p>
    </nav>
  )
}
