import { describe, expect, it, vi } from 'vitest'
import { api } from '../../api/client'
import { createFileResource, getResource } from './api'
import { displayBytes, downloadOriginal, fileIssue } from './files'
import { fileId, resourceId, sampleFile } from './fixtures'

describe('file feature adapter', () => {
  it('constructs only FILE fields, repeating tags and preserving the original File', async () => {
    const send = vi.spyOn(api, 'uploadResource').mockResolvedValue({ data: sampleFile() })
    const file = new File(['original'], 'note.txt')
    await createFileResource(
      {
        title: 'title',
        topic_id: resourceId,
        tag_ids: [resourceId, fileId],
        source_name: 'source',
        save_reason: 'reason',
      },
      file,
    )
    const form = send.mock.calls[0][0]
    expect([...form.keys()]).toEqual([
      'source_type',
      'title',
      'source_name',
      'save_reason',
      'topic_id',
      'tag_ids',
      'tag_ids',
      'file',
    ])
    expect(form.get('source_type')).toBe('FILE')
    expect(form.getAll('tag_ids')).toEqual([resourceId, fileId])
    expect(form.get('file')).toBe(file)
  })
  it('omits the title field from multipart when the metadata title is blank', async () => {
    const send = vi.spyOn(api, 'uploadResource').mockResolvedValue({ data: sampleFile() })
    const file = new File(['original'], 'note.txt')
    await createFileResource({ title: '   ', source_name: 'source' }, file)
    const form = send.mock.calls[0][0]
    expect(form.has('title')).toBe(false)
    expect([...form.keys()]).toEqual(['source_type', 'source_name', 'file'])
  })
  it.each(['PENDING', 'FAILED', 'unknown'])('rejects unavailable file state %s', async (status) => {
    const item = sampleFile()
    vi.spyOn(api, 'request').mockResolvedValue({
      data: { ...item, original_file: { ...item.original_file, status } },
    })
    await expect(getResource(resourceId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it.each([null, { id: '../file', status: 'READY' }])(
    'rejects missing or invalid file metadata',
    async (file) => {
      vi.spyOn(api, 'request').mockResolvedValue({ data: { ...sampleFile(), original_file: file } })
      await expect(getResource(resourceId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    },
  )
  it('checks downloaded size and media type against the detail metadata', async () => {
    const send = vi
      .spyOn(api, 'downloadOriginal')
      .mockResolvedValueOnce({
        blob: new Blob(['short'], { type: 'text/plain; charset=utf-8' }),
        fileName: 'note.txt',
      })
      .mockResolvedValueOnce({
        blob: new Blob(['original'], { type: 'text/html' }),
        fileName: 'note.txt',
      })
    const file = sampleFile().original_file!
    await expect(downloadOriginal(file)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    await expect(downloadOriginal(file)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(send).toHaveBeenCalledWith(fileId)
  })
  it('checks empty/extension/size locally without parsing document content', () => {
    expect(fileIssue(null)).toContain('选择')
    expect(fileIssue(new File([], 'empty.txt'))).toContain('空文件')
    expect(fileIssue(new File(['html'], 'note.html'))).toContain('PDF')
    expect(fileIssue(new File(['synthetic'], 'notes.PDF'))).toBe('')
    expect(displayBytes(8)).toBe('8 字节')
    expect(displayBytes(1024)).toBe('1.0 KiB')
    expect(displayBytes(1048576)).toBe('1.0 MiB')
  })
})
