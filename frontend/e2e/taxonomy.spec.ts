/// <reference lib="dom" />
import { expect, test } from '@playwright/test'

// No network recording: temporary token stays inside the browser context.
test.use({ trace: 'off' })

test('real taxonomy client lifecycle integrates with resource pages without exporting credentials', async ({
  page,
}) => {
  await page.goto('/')
  const ids = await page.evaluate(async () => {
    const modulePath = '/src/api/client.ts'
    const { api } = await import(modulePath)
    const topic = (
      await api.request('/api/v1/topics', {
        method: 'POST',
        body: { name: '分类浏览器合成', description: 'Synthetic topic' },
      })
    ).data
    const tag = (
      await api.request('/api/v1/tags', { method: 'POST', body: { name: '分类浏览器合成标签' } })
    ).data
    const unused = (
      await api.request('/api/v1/tags', { method: 'POST', body: { name: '分类浏览器合成待删' } })
    ).data
    const resource = (
      await api.request('/api/v1/resources', {
        method: 'POST',
        body: {
          source_type: 'WEB',
          title: '分类浏览器合成资料',
          source_url: 'https://example.com/taxonomy',
          topic_id: topic.id,
        },
      })
    ).data
    const path = '/api/v1/resources/' + resource.id + '/tags/' + tag.id
    const first = (await api.request(path, { method: 'PUT' })).data
    const second = (await api.request(path, { method: 'PUT' })).data
    if (JSON.stringify(first) !== JSON.stringify(second))
      throw new Error('association was not idempotent')
    const changed = (
      await api.request('/api/v1/topics/' + topic.id, {
        method: 'PATCH',
        body: { expected_version: 1, description: null },
      })
    ).data
    if (changed.version !== 2 || changed.description !== null)
      throw new Error('topic update failed')

    // The shared JSON client intentionally has no arbitrary-header escape hatch.
    // Test the existing If-Match contract directly, without changing production transport.
    const session = await fetch('/api/v1/local-session', {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
    if (!session.ok) throw new Error('bootstrap failed')
    const token = (await session.json()).data.token
    async function remove(path: string, version: number) {
      const response = await fetch(path, {
        method: 'DELETE',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: { 'X-StudyPilot-Token': token, 'If-Match': '"' + version + '"' },
      })
      return {
        status: response.status,
        code: response.status === 204 ? null : (await response.json()).error.code,
      }
    }
    const stale = await remove('/api/v1/topics/' + topic.id, 1)
    const inUse = await remove('/api/v1/topics/' + topic.id, 2)
    const deleted = await remove('/api/v1/tags/' + unused.id, 1)
    if (
      stale.status !== 409 ||
      stale.code !== 'VERSION_CONFLICT' ||
      inUse.status !== 409 ||
      inUse.code !== 'TAXONOMY_IN_USE' ||
      deleted.status !== 204
    )
      throw new Error('version/reference deletion protection failed')
    return { topic: topic.id as string, tag: tag.id as string, resource: resource.id as string }
  })
  await page.reload()
  const result = await page.evaluate(async (ids) => {
    const modulePath = '/src/api/client.ts'
    const { api } = await import(modulePath)
    const topics = await api.request('/api/v1/topics?q=分类浏览器合成')
    const tags = await api.request('/api/v1/tags?q=分类浏览器合成标签')
    const resources = await api.request(
      '/api/v1/resources?topic_id=' + ids.topic + '&tag_id=' + ids.tag,
    )
    return {
      topics: topics.data.length,
      tags: tags.data.length,
      resourceIds: resources.data.map((row: { id: string }) => row.id),
    }
  }, ids)
  expect(result).toEqual({ topics: 1, tags: 1, resourceIds: [ids.resource] })
  await page.goto('/resources/' + ids.resource)
  await expect(page.getByRole('heading', { name: '分类浏览器合成资料', level: 2 })).toBeVisible()
  await expect(page.getByText('分类浏览器合成标签', { exact: true })).toBeVisible()
  const removed = await page.evaluate(async (ids) => {
    const modulePath = '/src/api/client.ts'
    const { api } = await import(modulePath)
    const path = '/api/v1/resources/' + ids.resource + '/tags/' + ids.tag
    await api.request(path, { method: 'DELETE' })
    await api.request(path, { method: 'DELETE' })
    const detail = (await api.request('/api/v1/resources/' + ids.resource)).data
    return {
      count: detail.tags.length,
      topic: detail.topic_id,
      version: detail.version,
      status: detail.progress.status,
    }
  }, ids)
  expect(removed).toEqual({ count: 0, topic: ids.topic, version: 1, status: 'UNREAD' })
  await page.reload()
  await expect(page.getByText('暂无标签', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
  expect(await page.context().cookies()).toEqual([])
})
