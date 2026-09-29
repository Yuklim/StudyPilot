import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AnnotationTools } from './AnnotationTools'

/** 顶栏的标注工具区（TASK-094）：按下态、颜色单选、图标按钮不留文字。 */
describe('AnnotationTools', () => {
  it('exposes the tools as pressed toggles and the colours as a radio group', () => {
    const onTool = vi.fn()
    const onColor = vi.fn()
    render(<AnnotationTools tool="mark" color="green" onTool={onTool} onColor={onColor} />)
    const toolbar = screen.getByRole('toolbar', { name: '标注工具' })
    expect(within(toolbar).getByRole('button', { name: '荧光笔' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(toolbar).getByRole('button', { name: '下划线' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(within(toolbar).getByRole('button', { name: '橡皮' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(within(toolbar).getByRole('radio', { name: '绿色' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(within(toolbar).getAllByRole('radio')).toHaveLength(4)
    // 图标按钮一律不留文字节点（顶栏既有守卫）。
    for (const name of ['荧光笔', '下划线', '橡皮']) {
      expect(within(toolbar).getByRole('button', { name }).textContent).toBe('')
    }
    // 再按一下已按下的工具 = 取消；按别的 = 换过去。
    fireEvent.click(within(toolbar).getByRole('button', { name: '荧光笔' }))
    expect(onTool).toHaveBeenLastCalledWith(null)
    fireEvent.click(within(toolbar).getByRole('button', { name: '橡皮' }))
    expect(onTool).toHaveBeenLastCalledWith('eraser')
    fireEvent.click(within(toolbar).getByRole('radio', { name: '粉色' }))
    expect(onColor).toHaveBeenLastCalledWith('pink')
  })
})
