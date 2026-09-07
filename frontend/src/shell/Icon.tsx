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
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

// Reuse the existing TASK-002 book sketch, not a new external illustration asset.
export function BookSketch() {
  return (
    <svg className="book-sketch" viewBox="0 0 180 90" fill="none" aria-hidden="true">
      <path d="M10 22C42 15 67 19 88 34V77C67 64 42 61 10 68V22Z" />
      <path d="M170 22C138 15 113 19 92 34V77C113 64 138 61 170 68V22Z" />
      <path d="M90 33V80M27 34C44 31 59 34 72 42M108 42C121 34 136 31 153 34" />
    </svg>
  )
}
