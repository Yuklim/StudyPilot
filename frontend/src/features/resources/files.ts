import { api, ApiError, MAX_FILE_BYTES, type FileDownload } from '../../api/client'

export interface OriginalFile {
  id: string
  original_name: string
  size_bytes: number
  media_type: string
  status: 'READY'
}
export const fileAccept = '.pdf,.doc,.docx,.md,.markdown,.txt'

/**
 * 这份原件能不能在站内读（TASK-073）。只认 PDF：其他格式没有站内阅读器，假装能读只会
 * 让人以为坏了。`status` 只有 READY 一种取值，但显式判一次，将来加了别的状态不会漏。
 */
export function isPdfOriginal(file: OriginalFile | null | undefined): boolean {
  return !!file && file.status === 'READY' && file.media_type === 'application/pdf'
}

export function fileIssue(file: File | null): string {
  if (!file) return '请选择一个原始文件。'
  if (!file.size) return '不能上传空文件，请重新选择。'
  if (file.size > MAX_FILE_BYTES) return '文件超过 25 MiB 上限，请选择较小的文件。'
  if (!/\.(pdf|docx?|md|markdown|txt)$/i.test(file.name))
    return '请选择 PDF、Word、Markdown 或 TXT 文件。'
  if ([...file.name].length > 255) return '文件名最多 255 字，请先重命名原件。'
  return ''
}

export function displayBytes(size: number): string {
  if (size < 1024) return size + ' 字节'
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KiB'
  return (size / (1024 * 1024)).toFixed(1) + ' MiB'
}

export async function downloadOriginal(file: OriginalFile): Promise<FileDownload> {
  const download = await api.downloadOriginal(file.id)
  if (download.blob.size !== file.size_bytes || download.blob.type !== file.media_type)
    throw new ApiError('INVALID_RESPONSE')
  return download
}
