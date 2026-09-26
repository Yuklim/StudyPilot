/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'

/**
 * 走真实后端与真实浏览器的高亮（TASK-072）：选中 → 标下来 → 刷新后还在原处上色，
 * 正文换过一版后变成「原文位置已找不到」而不是消失。
 *
 * 上色用 CSS Custom Highlight API，正文 DOM 里没有任何新节点，所以**不能**靠查
 * `<mark>` 来断言；这里直接问浏览器注册表里那份高亮覆盖的是哪段文字。
 */

async function call(page: Page, path: string, method = 'GET', body?: unknown) {
  return page.evaluate(
    async ([target, verb, payload]) => {
      const bootstrap = await fetch('/api/v1/local-session', {
        headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' },
      })
      const token = ((await bootstrap.json()) as { data: { token: string } }).data.token
      const response = await fetch('/api/v1' + target, {
        method: verb as string,
        headers: { 'X-StudyPilot-Token': token, 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      })
      return { status: response.status, ...(await response.json().catch(() => ({}))) }
    },
    [path, method, body] as const,
  )
}

const BODY =
  '# 神经网络\n\n神经网络主要由输入层、隐藏层、输出层构成。当隐藏层只有一层时，该网络称为两层神经网络。\n\n训练的核心是误差逆传播算法。\n'

async function seed(page: Page, suffix: string) {
  await page.goto('/resources')
  const created = await call(page, '/resources', 'POST', {
    source_type: 'WEB',
    title: `高亮 · 神经网络 ${suffix}`,
    source_url: `https://example.test/highlights-${suffix}`,
  })
  const id = created.data.id as string
  await call(page, `/resources/${id}/snapshot`, 'PUT', { content: BODY })
  return id
}

/** 在正文里选中一段文字（真实选区，不是替身）。 */
async function select(page: Page, text: string) {
  await page.locator('.snapshot-rendered').first().waitFor()
  await page.evaluate((wanted) => {
    const body = document.querySelector('.snapshot-rendered')!
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode() as Text | null
    while (node) {
      const at = node.nodeValue?.indexOf(wanted) ?? -1
      if (at !== -1) {
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, at + wanted.length)
        const selection = window.getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
        document.dispatchEvent(new Event('selectionchange'))
        return
      }
      node = walker.nextNode() as Text | null
    }
    throw new Error('selection target not found: ' + wanted)
  }, text)
}

/**
 * 打开右栏并切到「高亮」Tab。右栏默认收起，打开它的入口仍是工具条上的「心得」按钮
 * （TASK-045 起「按钮＝开合 + 聚焦」），Tab 在栏里。
 */
async function openHighlights(page: Page) {
  const tab = page.getByRole('tab', { name: /高亮/ })
  if (!(await tab.isVisible())) {
    await page.locator('.reader-toolbar').getByRole('button', { name: '心得', exact: true }).click()
  }
  await tab.click()
}

/** 浏览器注册表里那份高亮当前覆盖的文字。 */
async function painted(page: Page) {
  return page.evaluate(() => {
    const registry = (CSS as unknown as { highlights?: Map<string, Iterable<Range>> }).highlights
    const mark = registry?.get('studypilot-mark')
    return mark ? [...mark].map((range) => range.toString()) : []
  })
}

test('a marked passage survives a reload and is painted without touching the body', async ({
  page,
}) => {
  const id = await seed(page, 'A')
  await page.goto(`/resources/${id}`)
  await expect(page.getByRole('heading', { name: '神经网络', exact: true, level: 1 })).toBeVisible()

  await select(page, '输入层、隐藏层、输出层')
  await page.getByRole('button', { name: '标下来' }).click()

  // 右栏落在「高亮」Tab，列表里就是刚标的那段。
  const list = page.getByRole('list', { name: '高亮列表' })
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(list).toContainText('输入层、隐藏层、输出层')
  expect((await call(page, `/resources/${id}/highlights`)).data).toHaveLength(1)

  // 上色交给浏览器，而不是往正文里插节点。
  await expect.poll(() => painted(page)).toEqual(['输入层、隐藏层、输出层'])
  expect(await page.locator('.snapshot-rendered mark').count()).toBe(0)

  // 刷新后重新定位：锚点是存下来的，位置是现算的。
  await page.reload()
  await openHighlights(page)
  await expect(page.getByRole('list', { name: '高亮列表' })).toContainText('输入层、隐藏层、输出层')
  await expect.poll(() => painted(page)).toEqual(['输入层、隐藏层、输出层'])
})

test('when the body is replaced the passage is kept and marked as lost', async ({ page }) => {
  const id = await seed(page, 'B')
  await page.goto(`/resources/${id}`)
  await select(page, '误差逆传播算法')
  await page.getByRole('button', { name: '标下来' }).click()
  await expect(page.getByRole('list', { name: '高亮列表' })).toContainText('误差逆传播算法')

  // 整份换掉正文：那段话不在了。
  const snapshot = (await call(page, `/resources/${id}/snapshot`)).data as { version: number }
  const replaced = await call(page, `/resources/${id}/snapshot`, 'PUT', {
    content: '# 换了一篇\n\n这份正文与原来那篇没有任何关系。\n',
    expected_version: snapshot.version,
  })
  expect(replaced.status).toBe(200)

  await page.reload()
  await openHighlights(page)
  const list = page.getByRole('list', { name: '高亮列表' })
  // 内容留着，并说清原因；不静默消失，也不乱标到别的地方。
  await expect(list).toContainText('误差逆传播算法')
  await expect(list).toContainText('原文位置已找不到')
  expect(await painted(page)).toEqual([])
  // 换回原来的正文，它自己就对上了——孤立状态从不落库。
  const again = (await call(page, `/resources/${id}/snapshot`)).data as { version: number }
  await call(page, `/resources/${id}/snapshot`, 'PUT', {
    content: BODY,
    expected_version: again.version,
  })
  await page.reload()
  await openHighlights(page)
  await expect(page.getByRole('list', { name: '高亮列表' })).not.toContainText('原文位置已找不到')
  await expect.poll(() => painted(page)).toEqual(['误差逆传播算法'])
})

test('deleting from the tab really deletes: the row, the paint and the server row all go', async ({
  page,
}) => {
  // TASK-092（用户 2026-09-26「右栏 Tab 里的删除按了也没消」）：单元测试里删除一直是替身，
  // 真正的客户端把这条路径拒在白名单外，请求根本没发出去。这条走真后端。
  const id = await seed(page, 'D')
  await page.goto(`/resources/${id}`)
  await select(page, '输入层、隐藏层、输出层')
  await page.getByRole('button', { name: '标下来' }).click()
  const list = page.getByRole('list', { name: '高亮列表' })
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect.poll(() => painted(page)).toEqual(['输入层、隐藏层、输出层'])

  const row = list.getByRole('listitem').first()
  await row.getByRole('button', { name: '删除' }).click()
  await row.getByRole('button', { name: '确认删除' }).click()
  await expect(page.getByRole('heading', { name: '还没有标下任何一段' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect.poll(() => painted(page)).toEqual([])
  expect((await call(page, `/resources/${id}/highlights`)).data).toEqual([])
  // 刷新后也不会回来。
  await page.reload()
  await openHighlights(page)
  await expect(page.getByRole('heading', { name: '还没有标下任何一段' })).toBeVisible()
})

test('「记下这段」marks the passage and pairs the note that follows', async ({ page }) => {
  const id = await seed(page, 'C')
  await page.goto(`/resources/${id}`)
  await select(page, '当隐藏层只有一层时')
  await page.getByRole('button', { name: '记下这段' }).click()

  const editor = page.getByRole('textbox', { name: '这次想记下什么？' })
  await expect(editor).toHaveValue(/> 当隐藏层只有一层时/)
  await editor.fill('> 当隐藏层只有一层时\n\n两层网络这个叫法要记住。')
  await page.getByRole('button', { name: '保存心得', exact: true }).click()
  await expect(page.getByText(/心得已保存/)).toBeVisible()

  // 后端那条高亮已经配上了刚保存的心得。
  await expect
    .poll(async () => {
      const rows = (await call(page, `/resources/${id}/highlights`)).data as {
        note_id: string | null
      }[]
      return rows.length === 1 ? rows[0]!.note_id !== null : false
    })
    .toBe(true)
  await openHighlights(page)
  // 列表里那条高亮显示「配了心得」：心得的首行就是引文本身（与「我的心得」同一口径），
  // 所以这里认的是「有 ✎ 那一行」与动作变成「改写心得」，不是心得的第二行。
  const row = page.getByRole('list', { name: '高亮列表' }).getByRole('listitem').first()
  await expect(row).toContainText('✎')
  await expect(row.getByRole('button', { name: '改写心得' })).toBeVisible()
})
