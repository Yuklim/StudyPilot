/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'

/**
 * 文献信息（TASK-078），走真实后端与真实 Chromium：填一份 → 刷新后还在 → 清空后回到空态。
 *
 * 单元测试里接口是替身，能验的是「我们发出去的形状对不对」；这里验的是**后端真的收下了**，
 * 以及整份替换、乐观锁、`If-Match` 这几条契约在真实往返里成立。
 */

async function seed(page: Page, suffix: string) {
  await page.goto('/resources')
  return page.evaluate(async (tail) => {
    const bootstrap = await fetch('/api/v1/local-session', {
      headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' },
    })
    const token = ((await bootstrap.json()) as { data: { token: string } }).data.token
    const response = await fetch('/api/v1/resources', {
      method: 'POST',
      headers: { 'X-StudyPilot-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: 'WEB',
        title: `文献信息 · ${tail}`,
        source_url: `https://example.test/citation-${tail}`,
      }),
    })
    return ((await response.json()) as { data: { id: string } }).data.id
  }, suffix)
}

/** 打开资料详情并切到右栏的「信息」Tab。 */
async function openInfo(page: Page, id: string) {
  await page.goto(`/resources/${id}`)
  await page.locator('.reader-toolbar').getByRole('button', { name: '心得', exact: true }).click()
  await page.getByRole('tab', { name: '信息' }).click()
}

test('a citation is filled in, survives a reload, and can be cleared again', async ({ page }) => {
  const id = await seed(page, 'A')
  await openInfo(page, id)

  const panel = page.getByRole('region', { name: '文献信息' })
  await expect(panel.getByText(/还没有记作者、年份、期刊/)).toBeVisible()
  await panel.getByRole('button', { name: '填写文献信息' }).click()

  await panel.getByLabel('类型', { exact: true }).selectOption('JOURNAL_ARTICLE')
  await panel.getByLabel('第 1 位作者', { exact: true }).fill('Anna Karpathy')
  await panel.getByRole('button', { name: '＋ 添加一位作者' }).click()
  await panel.getByLabel('第 2 位作者', { exact: true }).fill('李维')
  await panel.getByLabel('年份', { exact: true }).fill('2024')
  await panel.getByLabel('出处 / 期刊', { exact: true }).fill('Nature Machine Intelligence')
  await panel.getByLabel('卷', { exact: true }).fill('6')
  await panel.getByLabel('期', { exact: true }).fill('3')
  await panel.getByLabel('页', { exact: true }).fill('245-259')
  await panel.getByLabel('DOI', { exact: true }).fill('10.1038/s42256-024-00812-x')
  await panel.getByRole('button', { name: '保存' }).click()

  // 已填态：服务端真的收下了整份。
  await expect(panel.getByText('Anna Karpathy；李维')).toBeVisible()
  await expect(panel.getByText('Nature Machine Intelligence · 6(3), 245-259')).toBeVisible()
  await expect(panel.getByRole('link', { name: '10.1038/s42256-024-00812-x' })).toHaveAttribute(
    'href',
    'https://doi.org/10.1038/s42256-024-00812-x',
  )

  // 刷新后仍在：这一份存进了库，不是只活在这个页面里。
  await openInfo(page, id)
  await expect(panel.getByText('Anna Karpathy；李维')).toBeVisible()

  // 再保存一次（这次带 expected_version），改一个字段，验整份替换不是逐字段合并：
  // 把出处清空，保存后它应当**消失**，而不是留着上一次的值。
  await panel.getByRole('button', { name: '编辑' }).click()
  await panel.getByLabel('出处 / 期刊', { exact: true }).fill('')
  await panel.getByRole('button', { name: '保存' }).click()
  await expect(panel.getByText('Anna Karpathy；李维')).toBeVisible()
  await expect(panel.getByText('Nature Machine Intelligence')).toHaveCount(0)

  // 清空要先确认，确认之后回到空态。
  await panel.getByRole('button', { name: '编辑' }).click()
  await panel.getByRole('button', { name: '清空文献信息' }).click()
  await page
    .getByRole('alertdialog', { name: '确认清空文献信息' })
    .getByRole('button', { name: '确定清空' })
    .click()
  await expect(panel.getByRole('button', { name: '填写文献信息' })).toBeVisible()

  await openInfo(page, id)
  await expect(panel.getByText(/还没有记作者、年份、期刊/)).toBeVisible()
})

test('a bad year is stopped at the field, leaving the resource info above untouched', async ({
  page,
}) => {
  const id = await seed(page, 'B')
  await openInfo(page, id)
  const panel = page.getByRole('region', { name: '文献信息' })
  await panel.getByRole('button', { name: '填写文献信息' }).click()
  await panel.getByLabel('年份', { exact: true }).fill('999')
  await panel.getByRole('button', { name: '保存' }).click()
  await expect(panel.getByText(/年份要在 1000–2200 之间/)).toBeVisible()
  // 原有的三行资料信息还在，文献区块只是它下面多出来的一块。
  await expect(page.getByText('学习进度')).toBeVisible()
  await expect(page.getByText('收藏时间')).toBeVisible()
})
