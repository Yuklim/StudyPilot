/// <reference lib="dom" />

import { expect, test } from '@playwright/test'

test.use({ trace: 'off' })

test('real browser uploads a multipart original and downloads identical bytes', async ({
  page,
}) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    // Backend probe only. Keep the token here; never return, log or persist it.
    const bootstrap = await fetch('/api/v1/local-session', {
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    })
    const { data: session } = await bootstrap.json()
    const headers = { 'X-StudyPilot-Token': session.token }
    const original = '仅合成测试资料\n# 原件\n'
    const form = new FormData()
    form.append('source_type', 'FILE')
    form.append('title', '浏览器文件后端验证')
    form.append('file', new File([original], '合成笔记.md', { type: 'text/markdown' }))
    const response = await fetch('/api/v1/resources', {
      method: 'POST',
      headers,
      body: form,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    })
    if (response.status !== 201) return { uploaded: response.status }
    const { data: resource } = await response.json()
    const detail = await fetch(`/api/v1/resources/${resource.id}`, {
      headers,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    })
    const download = await fetch(`/api/v1/files/${resource.original_file.id}/download`, {
      headers,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    })
    return {
      uploaded: response.status,
      detail: detail.status,
      downloaded: download.status,
      identical: (await download.text()) === original,
      state: resource.original_file.status,
      cache: download.headers.get('cache-control'),
      attachment: download.headers.get('content-disposition')?.startsWith('attachment;'),
      persisted: localStorage.length + sessionStorage.length,
      cookie: document.cookie,
    }
  })
  expect(result).toEqual({
    uploaded: 201,
    detail: 200,
    downloaded: 200,
    identical: true,
    state: 'READY',
    cache: 'private, no-store',
    attachment: true,
    persisted: 0,
    cookie: '',
  })
})
