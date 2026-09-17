import { useEffect, useState } from 'react'

import { currentIndex, type OutlineItem } from './outline'

/**
 * 阅读器左侧目录栏（TASK-067，用户 2026-09-17 参考 Readwise Reader：「自动生成每个文档的
 * 大纲，在屏幕一侧显示所有标题和子标题目录」，并指定「放在页面左边」）。
 *
 * **目录从渲染后的 DOM 读，不从 Markdown 读。** 正文由 `snapshotMarkdown.ts` 以 `html: false`
 * 渲染成 `.snapshot-rendered`，那个文件是本项目唯一的 XSS 边界，本任务一个字符不进。这里只
 * 在它渲染完成之后 `querySelectorAll('h2, h3')`：标题文本就是 DOM 里的文本、跳转用元素引用
 * 而不是给标题加 id（加 id 要改渲染器）。
 *
 * 正文什么时候渲染完由 `MutationObserver` 盯着正文列告诉我们：快照读取是异步的，替换/删除
 * 正文、看源码/看渲染的切换都会换掉 `.snapshot-rendered`，目录必须跟着变；源码视图下没有
 * `.snapshot-rendered`，目录为空、整栏不渲染。
 *
 * 当前节 = 视口顶（让开 sticky 顶栏后）之上最后一个标题，滚动时更新；
 * 点击目录项平滑滚到标题（`scrollIntoView` 在 jsdom 里是空函数，用例只断言它被调用）。
 */

export function ReaderOutline({
  items,
  onHide,
}: {
  items: OutlineItem[]
  /** 「隐藏」按钮；再显示走顶栏的「目录」按钮（`ResourceToolbar`）。 */
  onHide: () => void
}) {
  const [current, setCurrent] = useState(-1)
  useEffect(() => {
    const update = () => setCurrent(currentIndex(items))
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [items])

  if (items.length === 0) return null
  return (
    <nav className="reader-outline" aria-label="目录">
      <div className="reader-outline-heading">
        <span className="note-tab">目录</span>
        <span className="reader-outline-count">{items.length} 节</span>
        <button
          type="button"
          className="text-link reader-outline-hide"
          onClick={onHide}
          title="隐藏目录（顶栏「目录」按钮可再显示）"
        >
          隐藏
        </button>
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
              onClick={() => {
                item.element.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              {item.text}
            </button>
          </li>
        ))}
      </ol>
      <p className="reader-outline-hint">随正文滚动高亮当前节；点击跳转</p>
    </nav>
  )
}
