import { matchPath } from 'react-router-dom'

import type { IconName } from './Icon'

export interface ShellPage {
  path: string
  title: string
  caption: string
  icon: IconName
  /** 导航分区：'primary' 主入口（当前高频可用），'more' 次级/后续能力（仍可达）。 */
  section?: 'primary' | 'more'
  /**
   * 这一页自己渲染 `h1` 并把它交给外壳做焦点落点（TASK-044）。
   *
   * 阅读器页用它来把「资料详情」那个页头块整个去掉——那一页的标题本来就该是资料的
   * 名字。**`h1` 是路由切换后的焦点落点**（`App.tsx` 的 effect 聚焦它），所以「谁来渲染
   * 它」是一条无障碍契约而不只是版面选择：置为 true 的页面**必须在每一种状态下都恰好
   * 渲染一个 `h1`**（含读取中与读取失败），否则导航过去的键盘用户会失去落点。
   */
  ownHeading?: boolean
  /**
   * 这一页独占整个窗口（TASK-046）：外壳的左侧导航、顶部面包屑与页脚都不渲染。
   *
   * 阅读器页用它变成「一整页文章」。**代价是这一页没有全局导航**——除浏览器后退外，
   * 唯一的出口是页面自己渲染的「返回资料库」。因此置为 true 的页面**必须在每一种状态
   * 下都渲染一个真实可用的返回链接**（含读取中与读取失败），否则键盘/读屏用户会被困在
   * 页面上，而这在屏幕上完全看不出来。与 `ownHeading` 同一类约束：标志换来版面，
   * 页面用契约还债。
   */
  immersive?: boolean
  emptyTitle: string
  description: string
}

export const pages: ShellPage[] = [
  {
    path: '/',
    title: '学习概览',
    caption: '把零散的知识，慢慢串成自己的线索。',
    icon: 'overview',
    section: 'primary',
    emptyTitle: '',
    description: '',
  },
  {
    path: '/resources',
    title: '资料库',
    caption: '好内容值得收藏，也值得再次打开。',
    icon: 'library',
    section: 'primary',
    emptyTitle: '给想学的内容，留一个位置',
    description: '收藏网页、文件和粘贴内容，按来源、学习状态和关键词再次找到它们。',
  },
  {
    path: '/resources/new',
    title: '添加资料',
    caption: '从一篇网页、一份文件，或一段值得留下的文字开始。',
    icon: 'plus',
    emptyTitle: '',
    description: '',
  },
  {
    // 浏览器扩展采集后跳转到这里确认。不放进导航：它没有内容可看，
    // 只有从扩展过来才有意义。
    path: '/capture',
    title: '确认采集内容',
    caption: '刚读到的这一页，确认后才会存进资料库。',
    icon: 'plus',
    emptyTitle: '',
    description: '',
  },
  {
    path: '/resources/:resourceId',
    title: '资料详情',
    caption: '原始资料与自己的理解，各有一个位置。',
    icon: 'library',
    // 页头块在这一页整个不渲染，标题由 `ResourceDetail` 自己出（见 `ownHeading`）。
    // `title` 仍然在用：它是浏览器标签页的名字。
    ownHeading: true,
    // 打开一份资料 = 一整页文章（用户 2026-09-08 选定）：外壳全部让位（见 `immersive`）。
    immersive: true,
    emptyTitle: '打开收藏的这一页',
    description: '查看原始资料，随手写下心得，再回来继续补充。',
  },
  {
    path: '/study-records',
    title: '学习记录',
    caption: '以前的学习记录都在；新的心得，从资料详情随手写起。',
    icon: 'record',
    section: 'more',
    emptyTitle: '让学习过程有迹可循',
    description: '按时间回看旧学习活动；新的个人心得保存在对应资料详情。',
  },
  {
    path: '/reviews',
    title: '复习安排',
    caption: '适时回看，让熟悉的知识更清晰一点。',
    icon: 'review',
    section: 'more',
    emptyTitle: '为再次回顾，留一点时间',
    description:
      '复习接口尚未接入。之后可以查看到期与逾期的资料、记录复习结果，并由你决定下一次回顾日期。',
  },
  {
    path: '/topics',
    title: '主题统计',
    caption: '看见投入的方向，不必急着比较快慢。',
    icon: 'topic',
    section: 'more',
    emptyTitle: '积累的方向，会慢慢清晰',
    description:
      '主题统计接口尚未接入。之后可以查看各主题的资料数量、完成比例与学习投入；现在不展示示例图表或数字。',
  },
  {
    path: '/notes',
    title: '我的心得',
    caption: '独立记下此刻的理解与疑问，不先绑定资料。',
    icon: 'record',
    section: 'primary',
    emptyTitle: '还没有独立心得',
    description: '不必先收藏资料，随手记下的想法都会留在这里，可随时回看与修改。',
  },
  {
    path: '/classifications',
    title: '分类整理',
    caption: '给每一份好奇，贴上自己的线索。',
    icon: 'topic',
    section: 'primary',
    emptyTitle: '',
    description: '',
  },
]

/** 侧栏主区导航：当前真实可用的高频入口。 */
export const primaryNavigation = pages.filter((page) => page.section === 'primary')
/** 侧栏次级/后续能力导航：仍可达但降低视觉层级，不伪装未开放能力。 */
export const moreNavigation = pages.filter((page) => page.section === 'more')
/** 兼容旧引用：完整过滤（不把 /resources/ 详情、添加等当独立导航）。 */
export const navigation = pages.filter((page) => !page.path.startsWith('/resources/'))
export const missingPage: ShellPage = {
  path: '*',
  title: '没有找到这个页面',
  caption: '可能是地址写错了，也可能是这页还没有收录。',
  icon: 'library',
  emptyTitle: '换一个入口，继续看看',
  description: '你可以回到学习概览，或从导航选择已有页面。',
}

export function pageAt(pathname: string): ShellPage {
  return pages.find((page) => matchPath({ path: page.path, end: true }, pathname)) ?? missingPage
}
