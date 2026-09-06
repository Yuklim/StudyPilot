// Shared controlled transports; feature modules validate consumed response fields.
// Tokens remain private to this page's closure and are never returned to callers.
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
interface JsonRequest {
  method?: Method
  body?: Json
  ifMatchVersion?: number
  deletionToken?: string
}

export interface DeletionImpact {
  original_file_count: number
  note_count: number
  study_record_count: number
  active_review_plan_count: number
  review_record_count: number
  resource_tag_count: number
}
export interface DeletionCurrentImpact {
  resource_id: string
  resource_version: number
  impact_revision: string
  impact: DeletionImpact
}

export const MAX_FILE_BYTES = 26_214_400
export const fileMediaTypes: readonly string[] = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown; charset=utf-8',
  'text/plain; charset=utf-8',
]
export interface FileDownload {
  blob: Blob
  fileName: string
}
const fileIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function versionedDeleteTarget(target: string): boolean {
  const parts = target.split('/')
  return (
    (parts.length === 5 && ['topics', 'tags'].includes(parts[3]) && fileIdPattern.test(parts[4])) ||
    (parts.length === 5 &&
      parts[3] === 'notes' &&
      fileIdPattern.test(parts[4]) &&
      parts[2] === 'v1') ||
    (parts.length === 7 &&
      parts[3] === 'resources' &&
      fileIdPattern.test(parts[4]) &&
      parts[5] === 'notes' &&
      fileIdPattern.test(parts[6])) ||
    // A resource has at most one snapshot, so the path ends at the collection name.
    (parts.length === 6 &&
      parts[3] === 'resources' &&
      fileIdPattern.test(parts[4]) &&
      parts[5] === 'snapshot')
  )
}

function resourceDeleteTarget(target: string): boolean {
  const parts = target.split('/')
  return parts.length === 5 && parts[3] === 'resources' && fileIdPattern.test(parts[4])
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
  TAXONOMY_USAGE_CHANGED: '使用这个分类的资料份数已经变化，本次操作未执行。请重新读取后再决定。',
  RESOURCE_NOT_FOUND: '这份资料已不存在，请重新打开资料库。',
  SNAPSHOT_NOT_FOUND: '这份资料还没有保存正文，或正文已被删除。请重新读取后再操作。',
  NOTE_NOT_FOUND: '这条心得已不存在，请重新读取心得列表。',
  VERSION_CONFLICT: '内容已被修改，本次操作未执行。请载入最新版本后重新确认。',
  VERSION_REQUIRED: '缺少有效版本，请重新载入后再操作。',
  SOURCE_TYPE_MISMATCH: '资料来源类型不匹配，请重新读取资料；不能更换资料类型或文件原件。',
  STATE_CONFLICT: '当前进度或复习计划不满足要求，请读取最新资料后重新确认。',
  INVALID_STATE_TRANSITION: '无法切换到这个学习状态，请检查当前状态。',
  TAXONOMY_IN_USE: '这个分类仍被资料使用，不能删除；资料不会被连带删除。',
  VALIDATION_ERROR: '输入未通过检查，请检查格式和长度。',
  FILE_NOT_FOUND: '原始文件已不存在，请刷新资料后再试。',
  FILE_TOO_LARGE: '文件超过 25 MiB 上限，请选择较小的文件。',
  FILE_TYPE_UNSUPPORTED: '文件格式不受支持，或内容与扩展名不一致。请检查原件。',
  FILE_STATE_UNAVAILABLE: '原件尚未保存完成或已经失效，请稍后检查资料库。',
  FILE_CORRUPTED: '原件缺失或校验不符，已停止下载。请重新添加原件。',
  STORAGE_PATH_UNAVAILABLE: '原件存储暂不可用，请检查本地存储目录与权限。',
  DELETION_TOKEN_REQUIRED: '请先完成删除预览，再确认删除。',
  DELETION_TOKEN_INVALID: '删除确认已失效，请重新预览。',
  DELETION_TOKEN_REPLAYED: '这次删除确认已经使用，请重新预览。',
  DELETION_IMPACT_CHANGED: '删除影响已经变化，请重新预览并确认。',
  DELETION_TOKEN_EXPIRED: '删除确认已过期，请重新预览。',
} as const
type ErrorCode = keyof typeof messages

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly requestId?: string
  readonly details: Readonly<{
    current_version?: number
    resource_count?: number
    current_impact?: DeletionCurrentImpact
  }>

  constructor(
    code: ErrorCode,
    status = 0,
    requestId?: string,
    details: {
      current_version?: number
      resource_count?: number
      current_impact?: DeletionCurrentImpact
    } = {},
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

function deletionImpact(value: unknown): DeletionImpact | undefined {
  if (!object(value)) return undefined
  const keys = [
    'original_file_count',
    'note_count',
    'study_record_count',
    'active_review_plan_count',
    'review_record_count',
    'resource_tag_count',
  ] as const
  const result = {} as DeletionImpact
  for (const key of keys) {
    const count = value[key]
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return undefined
    result[key] = count
  }
  if (result.original_file_count > 1 || result.active_review_plan_count > 1) return undefined
  return result
}

function currentImpact(value: unknown): DeletionCurrentImpact | undefined {
  if (!object(value)) return undefined
  const resourceId = value.resource_id
  const resourceVersion = value.resource_version
  const revision = value.impact_revision
  const impact = deletionImpact(value.impact)
  if (
    typeof resourceId !== 'string' ||
    !fileIdPattern.test(resourceId) ||
    typeof resourceVersion !== 'number' ||
    !Number.isSafeInteger(resourceVersion) ||
    resourceVersion < 1 ||
    typeof revision !== 'string' ||
    !/^[a-f0-9]{64}$/.test(revision) ||
    !impact
  )
    return undefined
  return {
    resource_id: resourceId,
    resource_version: resourceVersion,
    impact_revision: revision,
    impact,
  }
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
  body?: string | FormData,
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
    'SNAPSHOT_NOT_FOUND',
    'NOTE_NOT_FOUND',
    'VERSION_CONFLICT',
    'VERSION_REQUIRED',
    'STATE_CONFLICT',
    'INVALID_STATE_TRANSITION',
    'TAXONOMY_IN_USE',
    'TAXONOMY_USAGE_CHANGED',
    'VALIDATION_ERROR',
    'FILE_NOT_FOUND',
    'FILE_TOO_LARGE',
    'FILE_TYPE_UNSUPPORTED',
    'FILE_STATE_UNAVAILABLE',
    'FILE_CORRUPTED',
    'STORAGE_PATH_UNAVAILABLE',
    'DELETION_TOKEN_REQUIRED',
    'DELETION_TOKEN_INVALID',
    'DELETION_TOKEN_REPLAYED',
    'DELETION_IMPACT_CHANGED',
    'DELETION_TOKEN_EXPIRED',
  ]
  const code =
    typeof error?.code === 'string' && serverCodes.includes(error.code)
      ? (error.code as ErrorCode)
      : 'REQUEST_FAILED'
  const requestId =
    typeof error?.request_id === 'string' && /^req_[a-f0-9]{16,64}$/.test(error.request_id)
      ? error.request_id
      : undefined
  const details: {
    current_version?: number
    resource_count?: number
    current_impact?: DeletionCurrentImpact
  } = {}
  const key =
    code === 'VERSION_CONFLICT'
      ? 'current_version'
      : code === 'TAXONOMY_IN_USE' || code === 'TAXONOMY_USAGE_CHANGED'
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
  if (code === 'DELETION_IMPACT_CHANGED' && object(error?.details)) {
    const impact = currentImpact(error.details.current_impact)
    if (impact) details.current_impact = impact
  }
  return new ApiError(code, response.status, requestId, details)
}

function uploadSnapshot(form: FormData): FormData {
  if (!(form instanceof FormData)) throw new ApiError('INVALID_REQUEST')
  const copy = new FormData()
  const allowed = [
    'source_type',
    'title',
    'source_name',
    'save_reason',
    'topic_id',
    'tag_ids',
    'file',
  ]
  for (const [name, value] of form) {
    if (
      !allowed.includes(name) ||
      (name !== 'tag_ids' && copy.has(name)) ||
      (name === 'file' ? !(value instanceof File) : typeof value !== 'string')
    )
      throw new ApiError('INVALID_REQUEST')
    copy.append(name, value)
  }
  const file = copy.get('file')
  if (
    copy.get('source_type') !== 'FILE' ||
    copy.getAll('tag_ids').length > 20 ||
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > MAX_FILE_BYTES
  )
    throw new ApiError('INVALID_REQUEST')
  return copy // Do not let the caller mutate the form while bootstrap is pending.
}

function attachmentName(disposition: string): string {
  const encoded = /(?:^|;)\s*filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  const fallback = /(?:^|;)\s*filename="([^"]+)"/i.exec(disposition)?.[1]
  let name: string
  try {
    name = encoded ? decodeURIComponent(encoded) : (fallback ?? '')
  } catch {
    throw new ApiError('INVALID_RESPONSE')
  }
  if (
    !name ||
    [...name].length > 255 ||
    name === '.' ||
    name === '..' ||
    /[/\\]/.test(name) ||
    /\p{C}/u.test(name)
  )
    throw new ApiError('INVALID_RESPONSE')
  return name
}

async function fileBody(response: Response): Promise<FileDownload> {
  const mediaType = response.headers.get('content-type')?.toLowerCase().trim() ?? ''
  const disposition = response.headers.get('content-disposition') ?? ''
  const length = response.headers.get('content-length') ?? ''
  const expected = Number(length)
  if (
    response.status !== 200 ||
    !fileMediaTypes.includes(mediaType) ||
    !/^attachment\s*;/i.test(disposition) ||
    !/^[1-9]\d*$/.test(length) ||
    !Number.isSafeInteger(expected) ||
    expected > MAX_FILE_BYTES ||
    response.headers.get('x-content-type-options') !== 'nosniff' ||
    !response.body
  )
    throw new ApiError('INVALID_RESPONSE', response.status)
  const fileName = attachmentName(disposition)
  const reader = response.body.getReader()
  const chunks: ArrayBuffer[] = []
  let received = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > expected || received > MAX_FILE_BYTES) {
        throw new ApiError('INVALID_RESPONSE', response.status)
      }
      chunks.push(new Uint8Array(value).buffer)
    }
    if (received !== expected) throw new ApiError('INVALID_RESPONSE', response.status)
    return { blob: new Blob(chunks, { type: mediaType }), fileName }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error instanceof ApiError ? error : new ApiError('NETWORK_ERROR')
  } finally {
    reader.releaseLock()
  }
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

  async function checked(response: Response, usedToken: string): Promise<void> {
    if (response.ok) return
    const error = await failure(response)
    if (
      response.status === 403 &&
      ['LOCAL_TOKEN_REQUIRED', 'LOCAL_TOKEN_INVALID'].includes(error.code) &&
      token === usedToken
    )
      token = undefined
    throw error // An explicit later action may reconnect; never replay automatically.
  }

  return {
    async connect(): Promise<void> {
      await acquire()
    },
    async uploadResource(form: FormData): Promise<unknown> {
      const body = uploadSnapshot(form)
      const usedToken = await acquire()
      const response = await transport(
        '/api/v1/resources',
        'POST',
        new Headers({ 'X-StudyPilot-Token': usedToken }),
        body,
      )
      // Do not set Content-Type: the browser must generate the multipart boundary.
      await checked(response, usedToken)
      if (response.status !== 201) throw new ApiError('INVALID_RESPONSE', response.status)
      const payload = await json(response)
      if (!object(payload) || !Object.hasOwn(payload, 'data'))
        throw new ApiError('INVALID_RESPONSE', response.status)
      return payload
    },
    async downloadOriginal(fileId: string): Promise<FileDownload> {
      if (!fileIdPattern.test(fileId)) throw new ApiError('INVALID_REQUEST')
      const usedToken = await acquire()
      const response = await transport(
        '/api/v1/files/' + fileId + '/download',
        'GET',
        new Headers({ 'X-StudyPilot-Token': usedToken }),
      )
      await checked(response, usedToken)
      return fileBody(response)
    },
    async request(path: string, options: JsonRequest = {}): Promise<unknown> {
      const target = localPath(path)
      const method = options.method ?? 'GET'
      if (
        Object.keys(options).some(
          (key) => !['method', 'body', 'ifMatchVersion', 'deletionToken'].includes(key),
        ) ||
        !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ||
        (method === 'GET' && options.body !== undefined)
      ) {
        throw new ApiError('INVALID_REQUEST')
      }
      if (
        options.deletionToken !== undefined &&
        (method !== 'DELETE' ||
          options.body !== undefined ||
          !resourceDeleteTarget(target) ||
          !/^[A-Za-z0-9_-]{43,256}$/.test(options.deletionToken))
      )
        throw new ApiError('INVALID_REQUEST')
      if (
        options.ifMatchVersion !== undefined &&
        (method !== 'DELETE' ||
          options.body !== undefined ||
          !Number.isSafeInteger(options.ifMatchVersion) ||
          options.ifMatchVersion < 1 ||
          !versionedDeleteTarget(target))
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
      if (options.deletionToken !== undefined)
        headers.set('X-StudyPilot-Deletion-Token', options.deletionToken)
      if (body !== undefined) headers.set('Content-Type', 'application/json')
      const response = await transport(target, method, headers, body)
      await checked(response, usedToken)
      if (response.status === 204) return undefined
      const payload = await json(response)
      if (!object(payload) || !Object.hasOwn(payload, 'data'))
        throw new ApiError('INVALID_RESPONSE', response.status)
      return payload // Preserve pagination metadata; feature modules validate the envelope.
    },
  }
}

export const api = createApiClient()
