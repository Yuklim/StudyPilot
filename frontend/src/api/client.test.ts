import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, createApiClient, MAX_FILE_BYTES } from './client'

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

function fileForm() {
  const form = new FormData()
  form.append('source_type', 'FILE')
  form.append('title', '合成原件')
  form.append('file', new File(['original'], 'note.txt', { type: 'text/plain' }))
  return form
}
function originalResponse(headers: Partial<Record<string, string>> = {}, body = 'original') {
  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-length': String(new TextEncoder().encode(body).byteLength),
      'content-disposition':
        'attachment; filename="original-file"; filename*=UTF-8\'\'%E5%8E%9F%E4%BB%B6.txt',
      'x-content-type-options': 'nosniff',
      ...Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined)),
    },
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('controlled original-file transports', () => {
  const fileId = '00000000-0000-4000-8000-000000000002'
  it('sends a snapshot of multipart only to the fixed upload endpoint without setting boundary', async () => {
    let finish!: (response: Response) => void
    fetchMock
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
      )
      .mockResolvedValueOnce(Response.json({ data: { id: 'synthetic' } }, { status: 201 }))
    const form = fileForm()
    const upload = createApiClient().uploadResource(form)
    form.set('title', 'mutated while connecting')
    finish(session())
    await expect(upload).resolves.toEqual({ data: { id: 'synthetic' } })
    const [path, init] = fetchMock.mock.calls[1]
    expect(path).toBe('/api/v1/resources')
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      mode: 'cors',
      referrerPolicy: 'no-referrer',
    })
    expect(new Headers(init?.headers).get('X-StudyPilot-Token')).toBe(token)
    expect(new Headers(init?.headers).has('content-type')).toBe(false)
    expect((init?.body as FormData).get('title')).toBe('合成原件')
    expect((init?.body as FormData).get('file')).toBeInstanceOf(File)
  })
  it.each(['duplicate', 'unknown', 'wrong-source', 'missing-file', 'text-file', 'empty', 'large'])(
    'rejects invalid multipart %s before network',
    async (kind) => {
      const form = fileForm()
      if (kind === 'duplicate') form.append('title', 'again')
      if (kind === 'unknown') form.append('X-StudyPilot-Token', 'override')
      if (kind === 'wrong-source') form.set('source_type', 'WEB')
      if (kind === 'missing-file') form.delete('file')
      if (kind === 'text-file') form.set('file', 'not file')
      if (kind === 'empty') form.set('file', new File([], 'empty.txt'))
      if (kind === 'large')
        form.set('file', new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'large.txt'))
      await expect(createApiClient().uploadResource(form)).rejects.toMatchObject({
        code: 'INVALID_REQUEST',
      })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )
  it('downloads only verified attachment bytes and a safe unicode filename', async () => {
    fetchMock.mockResolvedValueOnce(session()).mockResolvedValueOnce(originalResponse())
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    const client = createApiClient()
    const result = await client.downloadOriginal(fileId)
    expect(result.fileName).toBe('原件.txt')
    expect(result.blob.size).toBe(8)
    expect(result.blob.type).toBe('text/plain; charset=utf-8')
    expect(Object.keys(result)).toEqual(['blob', 'fileName'])
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/files/' + fileId + '/download')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      body: undefined,
    })
    expect(storage).not.toHaveBeenCalled()
    expect(JSON.stringify(client)).not.toContain(token)
  })
  it.each(['../escape', 'https://evil.test/', fileId + '?token=bad', '%2f', 'local-session'])(
    'rejects non-ID download targets %s before network',
    async (id) => {
      await expect(createApiClient().downloadOriginal(id)).rejects.toMatchObject({
        code: 'INVALID_REQUEST',
      })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )
  it.each([
    { 'content-type': 'text/html' },
    { 'content-disposition': 'inline; filename="note.txt"' },
    { 'content-disposition': "attachment; filename*=UTF-8''..%2Fescape.txt" },
    { 'content-disposition': "attachment; filename*=UTF-8''bad%0Aname.txt" },
    { 'content-disposition': "attachment; filename*=UTF-8''bad%" },
    { 'content-length': '' },
    { 'content-length': '0' },
    { 'content-length': String(MAX_FILE_BYTES + 1) },
    { 'content-length': '9' },
    { 'content-length': '7' },
    { 'x-content-type-options': '' },
  ])('rejects unsafe, oversized or inconsistent download responses', async (headers) => {
    fetchMock.mockResolvedValueOnce(session()).mockResolvedValueOnce(originalResponse(headers))
    await expect(createApiClient().downloadOriginal(fileId)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it.each([
    'FILE_NOT_FOUND',
    'FILE_TOO_LARGE',
    'FILE_TYPE_UNSUPPORTED',
    'FILE_STATE_UNAVAILABLE',
    'FILE_CORRUPTED',
    'STORAGE_PATH_UNAVAILABLE',
  ])('keeps only safe file error %s', async (code) => {
    fetchMock.mockResolvedValueOnce(session()).mockResolvedValueOnce(
      Response.json(
        {
          error: { code, message: '/private/original secret', details: { path: 'private' } },
        },
        { status: 503 },
      ),
    )
    const error = await createApiClient()
      .uploadResource(fileForm())
      .catch((cause: unknown) => cause)
    expect(error).toMatchObject({ code, details: {} })
    expect(JSON.stringify(error)).not.toContain('private')
    expect(String(error)).not.toContain('secret')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('invalidates file-request credentials and reconnects only for an explicit next action', async () => {
    fetchMock
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(denied())
      .mockResolvedValueOnce(session(restartedToken))
      .mockResolvedValueOnce(originalResponse())
    const client = createApiClient()
    await expect(client.uploadResource(fileForm())).rejects.toMatchObject({
      code: 'LOCAL_TOKEN_INVALID',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await client.downloadOriginal(fileId)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(new Headers(fetchMock.mock.calls[3][1]?.headers).get('X-StudyPilot-Token')).toBe(
      restartedToken,
    )
  })
  it('requires upload 201 and does not replay malformed successful responses', async () => {
    fetchMock.mockResolvedValueOnce(session()).mockResolvedValueOnce(Response.json({ data: {} }))
    await expect(createApiClient().uploadResource(fileForm())).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
describe('memory-only local API client', () => {
  const tagPath = '/api/v1/tags/00000000-0000-4000-8000-000000000001'
  it('sends only a strong integer version for taxonomy deletion, keeping token controls private', async () => {
    fetchMock
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(
      createApiClient().request(tagPath, { method: 'DELETE', ifMatchVersion: 3 }),
    ).resolves.toBeUndefined()
    const [path, init] = fetchMock.mock.calls[1]
    expect(path).toBe(tagPath)
    expect(new Headers(init?.headers).get('If-Match')).toBe('"3"')
    expect(new Headers(init?.headers).get('X-StudyPilot-Token')).toBe(token)
    expect(init).toMatchObject({
      method: 'DELETE',
      credentials: 'omit',
      redirect: 'error',
      body: undefined,
    })
  })
  it.each([0, -1, 1.2, Infinity, Number.MAX_SAFE_INTEGER + 1, '2', '*', 'W/"2"', null])(
    'rejects invalid version %s before even bootstrapping',
    async (version) => {
      await expect(
        createApiClient().request(tagPath, { method: 'DELETE', ifMatchVersion: version } as never),
      ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )
  it.each([
    [tagPath, { method: 'PATCH', ifMatchVersion: 1 }],
    [tagPath, { method: 'DELETE', ifMatchVersion: 1, body: {} }],
    [tagPath + '?extra=1', { method: 'DELETE', ifMatchVersion: 1 }],
    [
      '/api/v1/resources/00000000-0000-4000-8000-000000000001',
      { method: 'DELETE', ifMatchVersion: 1 },
    ],
    [tagPath, { method: 'DELETE', headers: { 'X-StudyPilot-Token': 'override' } }],
  ])('rejects unsupported version/header use before network', async (path, options) => {
    await expect(createApiClient().request(path as string, options as never)).rejects.toMatchObject(
      { code: 'INVALID_REQUEST' },
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each([
    ['VERSION_CONFLICT', { current_version: 4, secret: 'private' }, { current_version: 4 }],
    ['TAXONOMY_IN_USE', { resource_count: 2, secret: 'private' }, { resource_count: 2 }],
    ['TAXONOMY_IN_USE', { resource_count: 'private' }, {}],
    ['VERSION_CONFLICT', { current_version: -1 }, {}],
    ['DUPLICATE_TOPIC', { current_version: 2 }, {}],
  ])(
    'projects only safe numeric details for %s and never retries',
    async (code, details, expected) => {
      fetchMock
        .mockResolvedValueOnce(session())
        .mockResolvedValueOnce(
          Response.json({ error: { code, details, message: 'private payload' } }, { status: 409 }),
        )
      const error = await createApiClient()
        .request(tagPath, { method: 'DELETE', ifMatchVersion: 1 })
        .catch((value: unknown) => value)
      expect(error).toMatchObject({ code, status: 409, details: expected })
      expect(JSON.stringify(error)).not.toContain('private')
      expect(String(error)).not.toContain('private')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
  )
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
