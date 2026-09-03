/// <reference lib="dom" />

import { expect, test } from '@playwright/test'

// A browser trace records network bodies/headers. Never save real runtime tokens.
test.use({ trace: 'off' })

test('real shared client bootstraps through the proxy without exposing or persisting its token', async ({
  page,
}) => {
  await page.goto('/')
  const observed: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/'))
      observed.push(new URL(request.url()).pathname)
  })
  const result = await page.evaluate(async () => {
    const modulePath = '/src/api/client.ts'
    const { api } = await import(modulePath)
    const initialized = await Promise.all([api.connect(), api.connect()])
    let rejection: { code: string; status: number } | undefined
    try {
      await api.request('/api/v1/unknown')
    } catch (error) {
      const controlled = error as { code: string; status: number }
      rejection = { code: controlled.code, status: controlled.status }
    }
    return {
      initialized: initialized.every((value) => value === undefined),
      rejection,
      persisted: localStorage.length + sessionStorage.length,
      cookie: document.cookie,
    }
  })
  expect(result).toEqual({
    initialized: true,
    rejection: { code: 'REQUEST_FAILED', status: 404 },
    persisted: 0,
    cookie: '',
  })
  expect(observed).toEqual(['/api/v1/local-session', '/api/v1/unknown'])
  // Unknown route remains 404 after authentication; resources now has real APIs.
  await expect(page.getByText('网页与粘贴资料已开放')).toBeVisible()
})

test('bootstrap refuses navigation and cross-site context, and allows only approved preflight', async ({
  page,
  request,
}) => {
  await page.goto('/')
  const navigation = await page.goto('/api/v1/local-session')
  expect(navigation?.status()).toBe(403)
  const crossed = await request.get('/api/v1/local-session', {
    headers: {
      'Sec-Fetch-Site': 'cross-site',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
    },
  })
  expect(crossed.status()).toBe(403)
  const alternateHost = await request.get('/api/v1/local-session', {
    headers: {
      Host: 'localhost:15173',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
    },
  })
  expect(alternateHost.status()).toBe(403)
  expect((await alternateHost.json()).error.code).toBe('HOST_FORBIDDEN')
  const allowed = await request.fetch('/api/v1/resources', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://127.0.0.1:15173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type, X-StudyPilot-Token',
    },
  })
  expect(allowed.status()).toBe(204)
  expect(allowed.headers()['access-control-allow-origin']).toBe('http://127.0.0.1:15173')
  expect(allowed.headers()['access-control-allow-credentials']).toBeUndefined()
  const bad = await request.fetch('/api/v1/resources', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://127.0.0.1:15173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Cookie',
    },
  })
  expect(bad.status()).toBe(403)
  expect((await bad.json()).error.code).toBe('REQUEST_ORIGIN_FORBIDDEN')
  expect(bad.headers()['x-request-id']).toMatch(/^req_[a-f0-9]{32}$/)
})

test('real browser rejects simple writes and refresh starts a fresh client session', async ({
  page,
}) => {
  await page.goto('/')
  const results = await page.evaluate(async () => {
    const statuses: number[] = []
    for (const type of [
      'text/plain',
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=synthetic',
    ]) {
      statuses.push(
        (
          await fetch('/api/v1/resources', {
            method: 'POST',
            headers: { 'Content-Type': type },
            body: 'synthetic input',
          })
        ).status,
      )
    }
    // Inspect only booleans, never send the bootstrap body/token to test output.
    const response = await fetch('/api/v1/local-session', {
      credentials: 'omit',
      cache: 'no-store',
      mode: 'cors',
    })
    const envelope = await response.json()
    return {
      statuses,
      valid:
        typeof envelope.data?.token === 'string' &&
        envelope.data.token.length >= 43 &&
        envelope.data.expires_on_restart === true,
      noStore: response.headers.get('cache-control') === 'no-store',
    }
  })
  expect(results).toEqual({ statuses: [403, 403, 403], valid: true, noStore: true })
  await page.reload()
  const after = await page.evaluate(async () => {
    const modulePath = '/src/api/client.ts'
    const { api } = await import(modulePath)
    return (await api.connect()) === undefined
  })
  expect(after).toBe(true)
})
