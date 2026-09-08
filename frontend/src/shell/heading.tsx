import { createContext, useContext } from 'react'

/**
 * 路由切换后的焦点落点由**外壳统一管理**（`App.tsx` 的 effect 聚焦它）。
 *
 * TASK-044 起有的页面自己渲染 `h1`（阅读器页的标题就是资料名），于是需要一条通道把
 * 那个元素交回外壳。**焦点的权威仍然只有一个**——外壳；页面只负责把自己的 `h1` 登记
 * 上来。这样「谁聚焦」没有变成每页各写一遍的事，那正是这条无障碍契约容易破的地方。
 */
export const HeadingSlot = createContext<(element: HTMLHeadingElement | null) => void>(() => {})

/** 页面用它把自己的 `h1` 交给外壳：`<h1 ref={useHeadingSlot()} tabIndex={-1}>`。 */
export function useHeadingSlot() {
  return useContext(HeadingSlot)
}
