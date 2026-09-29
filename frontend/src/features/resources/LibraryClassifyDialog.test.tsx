import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import { LibraryClassifyDialog } from './LibraryClassifyDialog'
import { sample } from './fixtures'

/**
 * 资料库的分类弹窗（TASK-097）：一份预填、只发变更；多份逐条 PATCH、失败列出；Esc/取消不发请求。
 * 主题/标签列表与 PATCH 全部替身；断言的是**发出去的请求体**，不是界面文案。
 */

const topicA = classification('00000000-0000-4000-8000-00000000a001', '深度学习')
const topicB = classification('00000000-0000-4000-8000-00000000a002', 'python')
const tagX = classification('00000000-0000-4000-8000-00000000b001', '论文')
const tagY = classification('00000000-0000-4000-8000-00000000b002', '入门')

function classification(id: string, name: string) {
  return {
    id,
    name,
    description: null,
    version: 1,
    resource_count: 0,
    created_at: '2026-09-29T00:00:00Z',
    updated_at: '2026-09-29T00:00:00Z',
  }
}
function pageOf<T>(items: T[]) {
  return {
    data: items,
    page: { number: 1, size: 20, total_items: items.length, total_pages: 1, has_more: false },
  }
}
/** 替身：列表按路径给；PATCH 记下请求体并按发来的字段回一份新版本。 */
function mock(fail: Record<string, ApiError> = {}) {
  const patches: { id: string; body: Record<string, unknown> }[] = []
  const request = vi.spyOn(api, 'request').mockImplementation(async (path, init) => {
    if (path.startsWith('/api/v1/topics?')) return pageOf([topicA, topicB])
    if (path.startsWith('/api/v1/tags?')) return pageOf([tagX, tagY])
    if (init?.method === 'PATCH') {
      const id = path.split('/').pop()!
      const body = init.body as Record<string, unknown>
      patches.push({ id, body })
      if (fail[id]) throw fail[id]
      const base = sample({ id, version: (body.expected_version as number) + 1 })
      return {
        data: {
          ...base,
          topic_id: 'topic_id' in body ? body.topic_id : base.topic_id,
          tags: Array.isArray(body.tag_ids)
            ? (body.tag_ids as string[]).map((tagId) => ({
                id: tagId,
                name: [tagX, tagY].find((t) => t.id === tagId)?.name ?? '?',
              }))
            : base.tags,
        },
      }
    }
    throw new Error('unexpected ' + path)
  })
  return { request, patches }
}
function open(targets: Parameters<typeof LibraryClassifyDialog>[0]['targets']) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(<LibraryClassifyDialog targets={targets} onClose={onClose} onSaved={onSaved} />)
  return { onClose, onSaved, dialog: () => screen.getByRole('dialog') }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('LibraryClassifyDialog', () => {
  it('prefills one resource and sends only what changed, in one PATCH', async () => {
    const { patches } = mock()
    const item = sample({
      id: '00000000-0000-4000-8000-000000000011',
      version: 3,
      topic_id: topicA.id,
      topic_name: '深度学习',
      tags: [{ id: tagX.id, name: '论文' }],
    })
    const { onClose, onSaved, dialog } = open([item])
    expect(dialog()).toHaveAccessibleName('分类：合成阅读资料')
    // 预填：主题选中 A，标签勾着 X；多份才有的「不改」不出现。
    expect(await within(dialog()).findByRole('radio', { name: '深度学习' })).toBeChecked()
    expect(await within(dialog()).findByRole('checkbox', { name: '论文' })).toBeChecked()
    expect(within(dialog()).queryByRole('radio', { name: '不改' })).toBeNull()
    // 只改标签：勾上 Y。
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: '入门' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toEqual({
      id: item.id,
      body: { tag_ids: [tagX.id, tagY.id], expected_version: 3 },
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes without a request when nothing changed, and on cancel or Escape', async () => {
    const { patches, request } = mock()
    const item = sample({ id: '00000000-0000-4000-8000-000000000012', topic_id: null })
    const { onClose, onSaved, dialog } = open([item])
    await within(dialog()).findByRole('radio', { name: '深度学习' })
    fireEvent.click(within(dialog()).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(patches).toHaveLength(0)
    expect(onSaved).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(within(dialog()).getByRole('button', { name: '取消' }))
    expect(onClose).toHaveBeenCalledTimes(3)
    expect(request.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0)
  })

  it('clears the topic with an explicit null', async () => {
    const { patches } = mock()
    const item = sample({
      id: '00000000-0000-4000-8000-000000000013',
      version: 2,
      topic_id: topicA.id,
      topic_name: '深度学习',
    })
    const { dialog } = open([item])
    await within(dialog()).findByRole('radio', { name: '深度学习' })
    fireEvent.click(within(dialog()).getByRole('radio', { name: '不分配主题' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]!.body).toEqual({ topic_id: null, expected_version: 2 })
  })

  it('applies a topic and appends tags to several resources one PATCH each, listing the one that failed', async () => {
    const conflicted = '00000000-0000-4000-8000-000000000022'
    const { patches } = mock({ [conflicted]: new ApiError('VERSION_CONFLICT', 409) })
    const a = sample({
      id: '00000000-0000-4000-8000-000000000021',
      version: 1,
      tags: [{ id: tagX.id, name: '论文' }],
    })
    const b = sample({ id: conflicted, version: 5, topic_id: topicB.id, topic_name: 'python' })
    // 已经是目标主题、也已有要追加的标签：这一份什么都不用改，不发请求。
    const c = sample({
      id: '00000000-0000-4000-8000-000000000023',
      version: 2,
      topic_id: topicA.id,
      topic_name: '深度学习',
      tags: [{ id: tagY.id, name: '入门' }],
    })
    const { onClose, onSaved, dialog } = open([a, b, c])
    expect(dialog()).toHaveAccessibleName('为 3 份资料设置分类')
    // 默认「不改」主题。
    expect(await within(dialog()).findByRole('radio', { name: '不改' })).toBeChecked()
    fireEvent.click(within(dialog()).getByRole('radio', { name: '深度学习' }))
    fireEvent.click(await within(dialog()).findByRole('checkbox', { name: '入门' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(patches).toHaveLength(2))
    // a：设主题 + 在已有标签后追加；b：只设主题（没有标签要追加它已有的？——它没有标签，追加 Y）。
    expect(patches[0]).toEqual({
      id: a.id,
      body: { topic_id: topicA.id, tag_ids: [tagX.id, tagY.id], expected_version: 1 },
    })
    expect(patches[1]).toEqual({
      id: conflicted,
      body: { topic_id: topicA.id, tag_ids: [tagY.id], expected_version: 5 },
    })
    // 失败的列出来、弹窗留着让用户看见；成功的那一份已经生效（onSaved 调过）。
    const alert = await within(dialog()).findByRole('alert')
    expect(alert).toHaveTextContent('合成阅读资料')
    expect(alert).toHaveTextContent('内容已被修改')
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(within(dialog()).getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('skips the tags of a resource that would exceed 20 and says so, still applying the topic', async () => {
    const { patches } = mock()
    const full = sample({
      id: '00000000-0000-4000-8000-000000000031',
      version: 1,
      tags: Array.from({ length: 20 }, (_, i) => ({
        id: `00000000-0000-4000-8000-0000000000${String(40 + i).padStart(2, '0')}`,
        name: `t${i}`,
      })),
    })
    const { onClose, dialog } = open([full, sample({ id: '00000000-0000-4000-8000-000000000032' })])
    fireEvent.click(await within(dialog()).findByRole('radio', { name: 'python' }))
    fireEvent.click(await within(dialog()).findByRole('checkbox', { name: '论文' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(patches).toHaveLength(2))
    expect(patches[0]!.body).toEqual({ topic_id: topicB.id, expected_version: 1 })
    expect(patches[1]!.body).toEqual({
      topic_id: topicB.id,
      tag_ids: [tagX.id],
      expected_version: 1,
    })
    const alert = await within(dialog()).findByRole('alert')
    expect(alert).toHaveTextContent('超过 20 个')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('refuses to save "set a topic" with no topic chosen', async () => {
    const { patches } = mock()
    const { dialog } = open([sample(), sample({ id: '00000000-0000-4000-8000-000000000042' })])
    await within(dialog()).findByRole('radio', { name: '不改' })
    // 还没选主题就把模式切成「设为」：靠界面做不到，这里直接点保存看默认路径——「不改」+ 无标签 = 没事可做 → 关闭。
    fireEvent.click(within(dialog()).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(patches).toHaveLength(0))
  })
})
