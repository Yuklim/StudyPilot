import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CommentBox } from './CommentBox'

/**
 * 就地评论框（TASK-098）：三种保存时机（失焦 / ⌘↩ / 停笔）、只在有改动且非空时保存、失败保留文字、
 * 保存中又改了字就再补存一次、外部换了一版且没有未保存改动时跟着换。
 */

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
})

function mount(
  initial = '',
  onSave: (text: string) => Promise<void> = vi.fn(async () => {}),
  extra: Record<string, unknown> = {},
) {
  const view = render(
    <CommentBox label="评论：一段" initial={initial} idleMs={500} onSave={onSave} {...extra} />,
  )
  return { ...view, onSave, box: () => screen.getByRole('textbox', { name: '评论：一段' }) }
}

describe('CommentBox', () => {
  it('saves on blur and on ⌘/Ctrl+Enter, only when the text changed and is not empty', async () => {
    const { box, onSave } = mount('原来的')
    fireEvent.blur(box())
    fireEvent.keyDown(box(), { key: 'Enter', metaKey: true })
    expect(onSave).not.toHaveBeenCalled()
    // 清空不等于删除：不发请求。
    fireEvent.change(box(), { target: { value: '   ' } })
    fireEvent.blur(box())
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(box(), { target: { value: '改过的' } })
    fireEvent.blur(box())
    expect(onSave).toHaveBeenCalledWith('改过的')
    expect(await screen.findByText('已保存')).toBeInTheDocument()
    // 同样的文字再失焦：不重复保存。
    fireEvent.blur(box())
    expect(onSave).toHaveBeenCalledTimes(1)
    fireEvent.change(box(), { target: { value: '再改' } })
    fireEvent.keyDown(box(), { key: 'Enter', ctrlKey: true })
    expect(onSave).toHaveBeenLastCalledWith('再改')
  })

  it('saves by itself after the writer pauses', async () => {
    const { box, onSave } = mount()
    fireEvent.change(box(), { target: { value: '写到' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    fireEvent.change(box(), { target: { value: '写到一半' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    // 每次改动重置计时：第一次的 300ms 不算。
    expect(onSave).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('写到一半')
  })

  it('keeps the text and shows the reason when saving fails; the next edit clears the error', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('内容已被修改')
    })
    const { box } = mount('', onSave)
    fireEvent.change(box(), { target: { value: '要保存的' } })
    fireEvent.blur(box())
    expect(await screen.findByRole('alert')).toHaveTextContent('内容已被修改')
    expect(box()).toHaveValue('要保存的')
    fireEvent.change(box(), { target: { value: '要保存的。' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('saves once more with the latest text when edited while a save is in flight', async () => {
    let release!: () => void
    const onSave = vi
      .fn<(text: string) => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((done) => {
            release = done
          }),
      )
      .mockResolvedValue(undefined)
    const { box } = mount('', onSave)
    fireEvent.change(box(), { target: { value: '第一版' } })
    fireEvent.blur(box())
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(screen.getByText('保存中…')).toBeInTheDocument()
    fireEvent.change(box(), { target: { value: '第二版' } })
    fireEvent.blur(box())
    // 还在飞：不并发第二条。
    expect(onSave).toHaveBeenCalledTimes(1)
    await act(async () => {
      release()
    })
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSave).toHaveBeenLastCalledWith('第二版')
  })

  it('follows a new initial value only while there is nothing unsaved', () => {
    const onSave = vi.fn(async () => {})
    const { box, rerender } = mount('一', onSave)
    rerender(<CommentBox label="评论：一段" initial="二" idleMs={500} onSave={onSave} />)
    expect(box()).toHaveValue('二')
    fireEvent.change(box(), { target: { value: '二，还没存' } })
    rerender(<CommentBox label="评论：一段" initial="三" idleMs={500} onSave={onSave} />)
    expect(box()).toHaveValue('二，还没存')
  })

  it('takes focus when the token changes, with the caret at the end', () => {
    const onSave = vi.fn(async () => {})
    const { box, rerender } = mount('已有', onSave)
    expect(box()).not.toHaveFocus()
    rerender(<CommentBox label="评论：一段" initial="已有" focusToken={1} onSave={onSave} />)
    expect(box()).toHaveFocus()
    expect((box() as HTMLTextAreaElement).selectionStart).toBe(2)
  })
})
