/**
 * 心得里的图片（TASK-063）：粘贴/拖入的图片**直接内嵌进 Markdown 正文**（用户 2026-09-15
 * 选定），不走任何图片接口。为了让「一条心得几张截图」落在正文上限之内，浏览器里先把图
 * 缩到最长边 1600px、转成 WebP，再编成 `![图片](data:image/webp;base64,…)`。
 *
 * - GIF 不重编码（重编码会丢动画），只按大小放行。
 * - 压缩后仍超过 `MAX_IMAGE_BYTES` 的拒绝插入——那不是「截图」量级的东西，内嵌进正文
 *   会把列表页、搜索和数据库一起拖慢。
 * - 只认 PNG/JPEG/GIF/WebP（与渲染器 `INLINE_IMAGE` 一致）；SVG 可带脚本，不收。
 */

/** 最长边像素。截图缩到这个尺寸阅读无损，体积通常降一个量级。 */
export const MAX_EDGE = 1600
/** 压缩后单张上限（字节）。base64 后约 ×1.37，正文上限 2,000,000 字符可放 2–3 张这样的极限图。 */
export const MAX_IMAGE_BYTES = 600 * 1024
const WEBP_QUALITY = 0.82
const JPEG_QUALITY = 0.85
const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export class NoteImageError extends Error {
  constructor(
    readonly code: 'UNSUPPORTED_TYPE' | 'IMAGE_TOO_LARGE' | 'DECODE_FAILED',
    message: string,
  ) {
    super(message)
    this.name = 'NoteImageError'
  }
}

/** 从粘贴/拖放事件里挑出图片文件；没有就是空数组（普通文本粘贴不受影响）。 */
export function imageFiles(transfer: DataTransfer | null): File[] {
  if (!transfer) return []
  const files: File[] = []
  for (const item of Array.from(transfer.items ?? [])) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file && file.type.startsWith('image/')) files.push(file)
  }
  if (files.length === 0) {
    for (const file of Array.from(transfer.files ?? [])) {
      if (file.type.startsWith('image/')) files.push(file)
    }
  }
  return files
}

/** 一张图片 → 一行 Markdown（含 data URI）。失败抛 `NoteImageError`。 */
export async function imageToMarkdown(file: Blob, alt = '图片'): Promise<string> {
  if (!ACCEPTED.has(file.type)) {
    throw new NoteImageError('UNSUPPORTED_TYPE', '只支持 PNG、JPEG、GIF 或 WebP 图片。')
  }
  const blob = file.type === 'image/gif' ? file : await compress(file)
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new NoteImageError(
      'IMAGE_TOO_LARGE',
      `这张图压缩后仍有 ${(blob.size / 1024 / 1024).toFixed(1)} MB，超过单张 ${Math.round(MAX_IMAGE_BYTES / 1024)} KB 的上限，没有插入。`,
    )
  }
  const url = await toDataUrl(blob)
  return `![${alt.replace(/[[\]\n]/g, ' ').trim() || '图片'}](${url})`
}

/** 解码 → 缩放 → 重编码。WebP 编不出来（老浏览器）就退到 JPEG。 */
async function compress(file: Blob): Promise<Blob> {
  const bitmap = await decode(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new NoteImageError('DECODE_FAILED', '这张图无法处理。')
    context.drawImage(bitmap, 0, 0, width, height)
    const webp = await encode(canvas, 'image/webp', WEBP_QUALITY)
    if (webp && webp.type === 'image/webp') return webp
    const jpeg = await encode(canvas, 'image/jpeg', JPEG_QUALITY)
    if (jpeg) return jpeg
    throw new NoteImageError('DECODE_FAILED', '这张图无法处理。')
  } finally {
    if ('close' in bitmap) bitmap.close()
  }
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // 走下面的 <img> 路径再试一次。
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new NoteImageError('DECODE_FAILED', '这张图无法解码。'))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new NoteImageError('DECODE_FAILED', '这张图无法读取。'))
    reader.readAsDataURL(blob)
  })
}

/** 正文里内嵌图片的估算大小（字节）：base64 长度 × 3/4。给「正文过大」提示用。 */
export function inlineImageBytes(content: string): number {
  let total = 0
  for (const match of content.matchAll(/\(data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)\)/g)) {
    total += Math.floor(((match[1] ?? '').length * 3) / 4)
  }
  return total
}
