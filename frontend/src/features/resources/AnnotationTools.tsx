import { Icon } from '../../shell/Icon'
import {
  COLOR_LABELS,
  HIGHLIGHT_COLORS,
  type AnnotationTool,
  type HighlightColor,
} from './highlights'

/**
 * 顶栏的标注工具区（TASK-094，用户 2026-09-26 在 Pencil 草图上确认）：荧光笔 + 四个颜色点 +
 * 下划线 + 橡皮。工具是**互斥的开关**：按下一个就亮着，再按一下取消；刷新页面回到「没选工具」
 * （用户选定，不记忆）。颜色是一组单选，荧光笔与下划线共用——「下划线跟荧光笔当前色走」。
 *
 * 点颜色的时候若没选工具（或选的是橡皮），顺手切到荧光笔：用户点了一个颜色，多半是想马上
 * 用它标点什么，让他再去按一下荧光笔是多一步。
 *
 * 图标按钮不留文字节点、名字由 `aria-label` 提供（顶栏既有约定，见 `ResourceToolbar`）。
 */
export function AnnotationTools({
  tool,
  color,
  onTool,
  onColor,
}: {
  tool: AnnotationTool | null
  color: HighlightColor
  onTool: (tool: AnnotationTool | null) => void
  onColor: (color: HighlightColor) => void
}) {
  const toggle = (next: AnnotationTool) => onTool(tool === next ? null : next)
  return (
    <div className="reader-tools" role="toolbar" aria-label="标注工具">
      <button
        type="button"
        className={`journal-button icon-button reader-tool ${color}`}
        aria-pressed={tool === 'mark'}
        aria-label="荧光笔"
        title="荧光笔：选中文字就标成高亮"
        onClick={() => toggle('mark')}
      >
        <Icon name="highlighter" />
      </button>
      <div className="reader-tool-colors" role="radiogroup" aria-label="颜色">
        {HIGHLIGHT_COLORS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            className={`reader-tool-color ${option}`}
            aria-checked={color === option}
            aria-label={`${COLOR_LABELS[option]}色`}
            title={`${COLOR_LABELS[option]}色`}
            onClick={() => onColor(option)}
          />
        ))}
      </div>
      <span className="reader-tools-divider" aria-hidden="true" />
      <button
        type="button"
        className={`journal-button icon-button reader-tool ${color}`}
        aria-pressed={tool === 'underline'}
        aria-label="下划线"
        title="下划线：选中文字就画上下划线"
        onClick={() => toggle('underline')}
      >
        <Icon name="underline" />
      </button>
      <button
        type="button"
        className="journal-button icon-button reader-tool eraser"
        aria-pressed={tool === 'eraser'}
        aria-label="橡皮"
        title="橡皮：点一下正文上的高亮或下划线就删掉，可撤销"
        onClick={() => toggle('eraser')}
      >
        <Icon name="eraser" />
      </button>
    </div>
  )
}
