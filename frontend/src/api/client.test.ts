import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, createApiClient } from './client'

const token = 's'.repeat(43) // Synthetic, never a runtime credential.
const restartedToken = 'n'.repeat(43)
const session = (value = token) =>
  Response.json({ data: { token: value, expires_on_restart: true } })
const denied = (code = 'LOCAL_TOKEN_INVALID') =>
  Response.json(
    {
      error: {
        code,
        message: 'must not be trusted',
        details: {},
        request_id: 'req_' + 'a'.repeat(32),
      },
    },
    { status: 403 },
  )
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('memory-only local API client', () => {
  it('bootstraps once for parallel callers, exposes no token, and never persists', async () => {
    const store = vi.spyOn(Storage.prototype, 'setItem')
    const log = vi.spyOn(console, 'log')
    const client = createApiClient()
    fetchMock.mockResolvedValueOnce(session())
    expect(await Promise.all([client.connect(), client.connect()])).toEqual([undefined, undefined])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(client)).not.toContain(token)
    expect(store).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
    const [, init] = fetchMock.mock.calls[0]
    expect(init).toMatchObject({
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
    expect(new Headers(init?.headers).has('X-StudyPilot-Token')).toBe(false)
  })

  it('sends same-origin JSON with the private token and preserves the envelope', async () => {
    fetchMock
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(Response.json({ data: { id: 'synthetic-id' } }))
    const client = createApiClient()
    await expect(
      client.request('/api/v1/resources', { method: 'POST', body: { title: 'synthetic' } }),
    ).resolves.toEqual({ data: { id: 'synthetic-id' } })
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/v1/resources')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('X-StudyPilot-Token')).toBe(token)
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(init?.body).toBe(JSON.stringify({ title: 'synthetic' }))
    expect(init?.credentials).toBe('omit')
  })

  it.each([
    'https://evil.invalid/api/v1/resources',
    '//evil.invalid/api/v1/resources',
    '/api/v1/../../health',
    '/api/v1/%2e%2e/%2e%2e/health',
    '/api/v1/\\evil',
    '/api/v1/%5cevil',
    '/api/v1/x#token',
    '/api/v1/%00x',
    '/api/v1/%',
    '/api/v1/local-session',
    '/api/v1/%6cocal-session',
  ])('rejects unsafe or token-exposing path %s before network', async (path) => {
    await expect(createApiClient().request(path)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects body-bearing GET requests before initialization', async () => {
    await expect(
      createApiClient().request('/api/v1/resources', { body: {} }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not decode an encoded path a second time before the server receives it', async () => {
    fetchMock
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
    await expect(createApiClient().request('/api/v1/%256cocal-session')).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      status: 404,
    })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/%256cocal-session')
  })

  it('can initialize again after network or invalid bootstrap responses', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('sensitive raw transport'))
      .mockResolvedValueOnce(Response.json({ data: { token: 'bad', expires_on_restart: true } }))
      .mockResolvedValueOnce(session())
    const client = createApiClient()
    await expect(client.connect()).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    await expect(client.connect()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    await expect(client.connect()).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('invalidates an expired token but never automatically replays a write', async () => {
    fetchMock
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(denied())
      .mockResolvedValueOnce(session(restartedToken))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const client = createApiClient()
    await expect(
      client.request('/api/v1/resources', { method: 'POST', body: {} }),
    ).rejects.toMatchObject({ code: 'LOCAL_TOKEN_INVALID', status: 403 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // This second explicit user-level action, not a retry loop, gets a new session.
    await expect(
      client.request('/api/v1/resources', { method: 'POST', body: {} }),
    ).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(new Headers(fetchMock.mock.calls[3][1]?.headers).get('X-StudyPilot-Token')).toBe(
      restartedToken,
    )
  })

  it('does not evict a fresh token when an older parallel request fails late', async () => {
    let finishOld!: (response: Response) => void
    const old = new Promise<Response>((resolve) => {
      finishOld = resolve
    })
    fetchMock
      .mockResolvedValueOnce(session())
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce(denied())
      .mockResolvedValueOnce(session(restartedToken))
      .mockResolvedValue(Response.json({ data: null }))
    const client = createApiClient()
    await client.connect()
    const first = client.request('/api/v1/resources').catch((error: unknown) => error)
    await expect(client.request('/api/v1/resources')).rejects.toBeInstanceOf(ApiError)
    await client.connect()
    finishOld(denied())
    expect(await first).toBeInstanceOf(ApiError)
    await expect(client.request('/api/v1/resources')).resolves.toEqual({ data: null })
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(new Headers(fetchMock.mock.calls[4][1]?.headers).get('X-StudyPilot-Token')).toBe(
      restartedToken,
    )
  })

  it('does not replay transport failures or retain their sensitive message', async () => {
    fetchMock
      .mockResolvedValueOnce(session())
      .mockRejectedValueOnce(new Error('private body and token'))
    const error = await createApiClient()
      .request('/api/v1/resources', { method: 'POST', body: {} })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'NETWORK_ERROR' })
    expect(String(error)).not.toContain('private')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([
    new Response('private path or stack', {
      status: 500,
      headers: { 'content-type': 'text/html' },
    }),
    Response.json(
      {
        error: {
          code: 'private-secret',
          message: 'private note',
          details: { token },
          request_id: 'private-path',
        },
      },
      { status: 500 },
    ),
  ])('sanitizes untrusted error responses', async (response) => {
    fetchMock.mockResolvedValueOnce(session()).mockResolvedValueOnce(response)
    const error = await createApiClient()
      .request('/api/v1/resources')
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'REQUEST_FAILED', status: 500, requestId: undefined })
    expect(JSON.stringify(error)).not.toContain('private')
    expect(String(error)).not.toContain(token)
  })

  it('keeps the controlled error code and safe request identifier', async () => {
    fetchMock.mockResolvedValueOnce(denied('HOST_FORBIDDEN'))
    await expect(createApiClient().connect()).rejects.toMatchObject({
      code: 'HOST_FORBIDDEN',
      requestId: 'req_' + 'a'.repeat(32),
    })
  })

  it.each([
    new Response('not json'),
    Response.json({ wrong: 'envelope' }),
    new Response('{', { headers: { 'content-type': 'application/json' } }),
  ])('rejects malformed successful responses', async (response) => {
    fetchMock.mockResolvedValueOnce(session()).mockResolvedValueOnce(response)
    await expect(createApiClient().request('/api/v1/resources')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
})
