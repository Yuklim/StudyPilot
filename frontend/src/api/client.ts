// Shared JSON transport only; feature modules validate their own response data.
// Tokens remain private to this page's closure and are never returned to callers.
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
interface JsonRequest {
  method?: Method
  body?: Json
  ifMatchVersion?: number
}

const messages = {
  HOST_FORBIDDEN: '请求地址不受信任，请使用本机页面。',
  REQUEST_ORIGIN_FORBIDDEN: '请求来源不受信任，请使用本机页面。',
  LOCAL_TOKEN_REQUIRED: '请先连接本次本机服务。',
  LOCAL_TOKEN_INVALID: '本机连接已失效，请重新连接后重试；本次操作没有自动重试。',
  UNKNOWN_ERROR: '服务暂时无法完成请求。',
  NETWORK_ERROR: '无法连接本机服务，请确认后端已启动后重试。',
  INVALID_RESPONSE: '服务响应无法识别，请重试。',
  INVALID_REQUEST: '请求参数不受支持。',
  REQUEST_FAILED: '请求未能完成，请检查后重试。',
  DUPLICATE_TOPIC: '已有同名主题，请换一个名称。',
  DUPLICATE_TAG: '已有同名标签，请换一个名称。',
  TOPIC_NOT_FOUND: '这个主题已不存在，请重新选择。',
  TAG_NOT_FOUND: '这个标签已不存在，请重新选择。',
  RESOURCE_NOT_FOUND: '这份资料已不存在，请重新打开资料库。',
  VERSION_CONFLICT: '内容已被修改，本次操作未执行。请载入最新版本后重新确认。',
  VERSION_REQUIRED: '缺少有效版本，请重新载入后再操作。',
  TAXONOMY_IN_USE: '这个分类仍被资料使用，不能删除；资料不会被连带删除。',
  VALIDATION_ERROR: '输入未通过检查，请检查格式和长度。',
} as const
type ErrorCode = keyof typeof messages

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly requestId?: string
  readonly details: Readonly<{ current_version?: number; resource_count?: number }>

  constructor(
    code: ErrorCode,
    status = 0,
    requestId?: string,
    details: { current_version?: number; resource_count?: number } = {},
  ) {
    super(messages[code])
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.requestId = requestId
    this.details = Object.freeze({ ...details })
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function localPath(path: string): string {
  if (
    !path.startsWith('/api/v1/') ||
    path.includes('\\') ||
    path.includes('#') ||
    [...path].some((c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127)
  ) {
    throw new ApiError('INVALID_REQUEST')
  }
  const url = new URL(path, window.location.origin)
  let decoded: string
  try {
    decoded = decodeURIComponent(url.pathname)
  } catch {
    throw new ApiError('INVALID_REQUEST')
  }
  if (
    decoded.includes('\\') ||
    [...decoded].some((c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127)
  )
    throw new ApiError('INVALID_REQUEST')
  const decodedUrl = new URL(decoded, window.location.origin)
  if (
    url.origin !== window.location.origin ||
    !url.pathname.startsWith('/api/v1/') ||
    decodedUrl.origin !== window.location.origin ||
    !decodedUrl.pathname.startsWith('/api/v1/') ||
    decodedUrl.pathname === '/api/v1/local-session'
  ) {
    throw new ApiError('INVALID_REQUEST')
  }
  return url.pathname + url.search
}

async function transport(
  path: string,
  method: Method,
  headers: Headers,
  body?: string,
): Promise<Response> {
  try {
    return await fetch(path, {
      method,
      headers,
      body,
      mode: 'cors', // The approved Fetch Metadata contract explicitly requires cors.
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
  } catch {
    // Do not retain a raw fetch exception, URL, response text or user payload.
    throw new ApiError('NETWORK_ERROR')
  }
}

async function json(response: Response): Promise<unknown> {
  if (response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw new ApiError('INVALID_RESPONSE', response.status)
  }
  try {
    return (await response.json()) as unknown
  } catch {
    throw new ApiError('INVALID_RESPONSE', response.status)
  }
}

async function failure(response: Response): Promise<ApiError> {
  let payload: unknown
  try {
    payload = await json(response)
  } catch {
    return new ApiError('REQUEST_FAILED', response.status)
  }
  const error = object(payload) && object(payload.error) ? payload.error : undefined
  const serverCodes = [
    'HOST_FORBIDDEN',
    'REQUEST_ORIGIN_FORBIDDEN',
    'LOCAL_TOKEN_REQUIRED',
    'LOCAL_TOKEN_INVALID',
    'UNKNOWN_ERROR',
    'DUPLICATE_TOPIC',
    'DUPLICATE_TAG',
    'TOPIC_NOT_FOUND',
    'TAG_NOT_FOUND',
    'RESOURCE_NOT_FOUND',
    'VERSION_CONFLICT',
    'VERSION_REQUIRED',
    'TAXONOMY_IN_USE',
    'VALIDATION_ERROR',
  ]
  const code =
    typeof error?.code === 'string' && serverCodes.includes(error.code)
      ? (error.code as ErrorCode)
      : 'REQUEST_FAILED'
  const requestId =
    typeof error?.request_id === 'string' && /^req_[a-f0-9]{16,64}$/.test(error.request_id)
      ? error.request_id
      : undefined
  const details: { current_version?: number; resource_count?: number } = {}
  const key =
    code === 'VERSION_CONFLICT'
      ? 'current_version'
      : code === 'TAXONOMY_IN_USE'
        ? 'resource_count'
        : undefined
  const value = key && object(error?.details) ? error.details[key] : undefined
  if (
    key &&
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= (key === 'current_version' ? 1 : 0)
  )
    details[key] = value
  return new ApiError(code, response.status, requestId, details)
}

export function createApiClient() {
  let token: string | undefined
  let pending: Promise<string> | undefined

  async function bootstrap(): Promise<string> {
    const response = await transport('/api/v1/local-session', 'GET', new Headers())
    if (!response.ok) throw await failure(response)
    const payload = await json(response)
    const data = object(payload) && object(payload.data) ? payload.data : undefined
    if (
      typeof data?.token !== 'string' ||
      !/^[A-Za-z0-9_-]{43,256}$/.test(data.token) ||
      data.expires_on_restart !== true
    ) {
      throw new ApiError('INVALID_RESPONSE', response.status)
    }
    token = data.token
    return token
  }

  function acquire(): Promise<string> {
    if (token) return Promise.resolve(token)
    if (!pending)
      pending = bootstrap().finally(() => {
        pending = undefined
      })
    return pending
  }

  return {
    async connect(): Promise<void> {
      await acquire()
    },
    async request(path: string, options: JsonRequest = {}): Promise<unknown> {
      const target = localPath(path)
      const method = options.method ?? 'GET'
      if (
        Object.keys(options).some((key) => !['method', 'body', 'ifMatchVersion'].includes(key)) ||
        !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ||
        (method === 'GET' && options.body !== undefined)
      ) {
        throw new ApiError('INVALID_REQUEST')
      }
      if (
        options.ifMatchVersion !== undefined &&
        (method !== 'DELETE' ||
          options.body !== undefined ||
          !Number.isSafeInteger(options.ifMatchVersion) ||
          options.ifMatchVersion < 1 ||
          !/^\/api\/v1\/(topics|tags)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            target,
          ))
      )
        throw new ApiError('INVALID_REQUEST')
      let body: string | undefined
      try {
        body = options.body === undefined ? undefined : JSON.stringify(options.body)
      } catch {
        throw new ApiError('INVALID_REQUEST')
      }
      const usedToken = await acquire()
      const headers = new Headers({ 'X-StudyPilot-Token': usedToken })
      if (options.ifMatchVersion !== undefined)
        headers.set('If-Match', `"${options.ifMatchVersion}"`)
      if (body !== undefined) headers.set('Content-Type', 'application/json')
      const response = await transport(target, method, headers, body)
      if (!response.ok) {
        const error = await failure(response)
        if (
          response.status === 403 &&
          ['LOCAL_TOKEN_REQUIRED', 'LOCAL_TOKEN_INVALID'].includes(error.code) &&
          token === usedToken
        )
          token = undefined
        throw error // Never replay a write whose result might be uncertain.
      }
      if (response.status === 204) return undefined
      const payload = await json(response)
      if (!object(payload) || !Object.hasOwn(payload, 'data'))
        throw new ApiError('INVALID_RESPONSE', response.status)
      return payload // Preserve pagination metadata; feature modules validate the envelope.
    },
  }
}

export const api = createApiClient()
