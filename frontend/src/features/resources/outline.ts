import { useEffect, useState } from 'react'

/**
 * 目录数据（TASK-067）：从渲染后的正文 DOM 收集 h2/h3，正文变化时重收集。
 * 组件在 `ReaderOutline.tsx`（文件名不能只差大小写：macOS 不区分）；拆开是为了让那个文件只导出组件（react-refresh 规则）。
 * 为什么读 DOM 而不读 Markdown、为什么不给标题加 id，见那边的说明。
 */

export type OutlineItem = {
  key: string
  level: 2 | 3
  text: string
  element: HTMLElement
}

/** 顶栏 57px + 一点呼吸；标题滚到这条线之上就算「已经读到」。 */
const TOP_OFFSET = 80

export function collectOutline(root: ParentNode | null): OutlineItem[] {
  const rendered = root?.querySelector('.snapshot-rendered')
  if (!rendered) return []
  const items: OutlineItem[] = []
  rendered.querySelectorAll<HTMLElement>('h2, h3').forEach((element, index) => {
    const text = element.textContent?.trim() ?? ''
    if (!text) return
    items.push({ key: `${index}-${text}`, level: element.tagName === 'H2' ? 2 : 3, text, element })
  })
  return items
}

export function currentIndex(items: OutlineItem[]): number {
  let current = -1
  for (let i = 0; i < items.length; i++) {
    if (items[i].element.getBoundingClientRect().top <= TOP_OFFSET) current = i
    else break
  }
  return current
}

/** 从正文列里收集目录，正文变化时重收集。返回 `[]` 表示没有目录可显示。 */
export function useOutline(container: HTMLElement | null): OutlineItem[] {
  const [items, setItems] = useState<OutlineItem[]>([])
  useEffect(() => {
    if (!container) return
    let frame = 0
    const refresh = () => {
      // 合并同一帧内的多次 DOM 变更（渲染一篇正文是一次 innerHTML，但图片回填等会多次触发）。
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setItems(collectOutline(container)))
    }
    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(container, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [container])
  return items
}
