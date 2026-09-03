/// <reference lib="dom" />

import { expect, test } from '@playwright/test'

// Actual API token remains inside the browser, never in trace or test output.
test.use({ trace: 'off' })

test('real client saves WEB/PASTE and reads persistent summaries/details after reload', async ({
  page,
}) => {
  await page.goto('/')
  const ids = await page.evaluate(async () => {
    const modulePath = '/src/api/client.ts'
    const { api } = await import(modulePath)
    const created: string[] = []
    for (const body of [
      { source_type: 'WEB', title: '浏览器合成网页', source_url: 'https://example.test/guide' },
      {
        source_type: 'PASTE',
        title: '浏览器合成摘录',
        pasted_content: '# Synthetic\n  preserve me',
      },
    ]) {
      const response = await api.request('/api/v1/resources', { method: 'POST', body })
      created.push(response.data.id)
    }
    return created
  })
  expect(ids).toHaveLength(2)
  await page.reload()
  const result = await page.evaluate(async (identities) => {
    const modulePath = '/src/api/client.ts'
    const { api } = await import(modulePath)
    const listed = await api.request('/api/v1/resources?q=浏览器合成')
    const details = await Promise.all(
      identities.map(async (id) => (await api.request(`/api/v1/resources/${id}`)).data),
    )
    return {
      ids: listed.data.map((row: { id: string }) => row.id).sort(),
      count: listed.page.total_items,
      summariesOnly: listed.data.every(
        (row: object) => !('source_url' in row) && !('pasted_content' in row),
      ),
      source: details[0].source_url,
      pasted: details[1].pasted_content,
      initialized: details.every(
        (row) => row.progress.status === 'UNREAD' && row.progress.progress_percent === 0,
      ),
      persistedToken: localStorage.length + sessionStorage.length,
    }
  }, ids)
  expect(result).toEqual({
    ids: [...ids].sort(),
    count: 2,
    summariesOnly: true,
    source: 'https://example.test/guide',
    pasted: '# Synthetic\n  preserve me',
    initialized: true,
    persistedToken: 0,
  })
  // Keep direct-client coverage in addition to the user-facing form scenarios.
  await expect(page.getByText('网页、文件与粘贴资料已开放')).toBeVisible()
})
