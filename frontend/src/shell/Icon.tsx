export type IconName =
  | 'overview'
  | 'library'
  | 'record'
  | 'review'
  | 'topic'
  | 'plus'
  | 'arrow'
  | 'info'
  // TASK-044 起工具条与左栏用图标代替文字。**图标只是装饰**（`aria-hidden`），
  // 名字一律由按钮自己的 `aria-label` 提供，见 `ResourceToolbar.tsx`。
  | 'note'
  | 'external'
  | 'file'
  | 'paste'
  | 'more'
  | 'collapse'
  | 'expand'
  | 'trash'
  // TASK-067：阅读器顶栏的「目录」开关。
  | 'outline'
  // TASK-094：顶栏的标注工具。
  | 'highlighter'
  | 'underline'
  | 'eraser'
  // TASK-099：顶栏的「注释」工具（对话气泡 + 一笔）。
  | 'comment'
  // TASK-097：资料库行上的「分类」。
  | 'tags'

const paths: Record<IconName, string> = {
  overview: 'M3 10 12 3l9 7M5 9v11h5v-6h4v6h5V9',
  library: 'M4 4h5v16H4zM11 4h4v16h-4zM17 5l3-1 3 15-3 1z',
  record: 'M5 3h14v18H5zM3 7h4M3 12h4M3 17h4M10 8h5M10 12h5M10 16h3',
  review: 'M4 10a8 8 0 1 1 1 7M4 4v6h6M12 7v5l3 2',
  topic: 'M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7M3 20h18',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M4 12h16M14 6l6 6-6 6',
  info: 'M12 8v1M12 12v5M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  note: 'M4 4h11l5 5v11H4zM15 4v5h5M8 13h8M8 17h5',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  paste: 'M9 3h6v3H9zM7 5H5v16h14V5h-2M9 11h6M9 15h4',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  collapse: 'M15 6l-6 6 6 6',
  expand: 'M9 6l6 6-6 6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  outline: 'M4 6h16M4 12h10M4 18h13',
  highlighter: 'M9 11l-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4',
  underline: 'M6 4v6a6 6 0 0 0 12 0V4M4 20h16',
  eraser:
    'M7 21l-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21M22 21H7M5 11l9 9',
  comment: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  tags: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01',
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
