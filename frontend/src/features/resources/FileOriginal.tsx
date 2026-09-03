import { useEffect, useRef, useState } from 'react'

import { failureText } from './api'
import { displayBytes, downloadOriginal, type OriginalFile } from './files'

export function FileOriginal({ file }: { file: OriginalFile }) {
  const alive = useRef(true)
  const busy = useRef(false)
  const urls = useRef(new Map<string, number>())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  useEffect(() => {
    const activeUrls = urls.current
    alive.current = true
    return () => {
      alive.current = false
      for (const [url, timer] of activeUrls) {
        window.clearTimeout(timer)
        URL.revokeObjectURL(url)
      }
      activeUrls.clear()
    }
  }, [])

  async function download() {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    setSent(false)
    try {
      const result = await downloadOriginal(file)
      if (!alive.current) return
      // An ephemeral blob URL, never an authenticated URL or inline document.
      const url = URL.createObjectURL(result.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.fileName
      try {
        document.body.append(anchor)
        anchor.click()
      } finally {
        anchor.remove()
        const timer = window.setTimeout(() => {
          URL.revokeObjectURL(url)
          urls.current.delete(url)
        }, 1000)
        urls.current.set(url, timer)
      }
      setSent(true)
    } catch (cause) {
      if (alive.current) setError(failureText(cause))
    } finally {
      busy.current = false
      if (alive.current) setPending(false)
    }
  }

  return (
    <section className="resource-original file-original" aria-label="原始文件">
      <span className="note-tab">保留原来的样子</span>
      <h3>原始文件</h3>
      <p className="original-file-name">{file.original_name}</p>
      <p className="resource-hint">
        {displayBytes(file.size_bytes)} · {file.media_type}
      </p>
      <button className="journal-button primary" disabled={pending} onClick={download}>
        {pending ? '正在校验并下载…' : '下载原件'}
      </button>
      {pending && (
        <p className="resource-hint" role="status">
          正在读取并校验原件，请稍候。
        </p>
      )}
      {sent && (
        <p className="resource-hint" role="status">
          已交给浏览器下载，请在浏览器下载列表中确认保存结果。
        </p>
      )}
      {error && (
        <p className="resource-error" role="alert">
          {error}
        </p>
      )}
      <p className="resource-hint">
        原件已保存，正文尚未解析；文件不会在此页面内运行。未提供病毒扫描，请只打开可信文件。
      </p>
    </section>
  )
}
