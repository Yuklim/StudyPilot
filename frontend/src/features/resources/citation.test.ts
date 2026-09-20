import { describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import {
  containerLine,
  deleteCitation,
  doiUrl,
  draftProblems,
  EMPTY_DRAFT,
  getCitation,
  normalizeDraft,
  putCitation,
  type Citation,
  type CitationDraft,
} from './citation'

/** 文献信息的受控客户端（TASK-078）：请求形状、404 的含义、以及契约里不许含糊的边界。 */

const resourceId = '018f1f58-4eb2-4a0d-a716-fb81b1960001'
const base = `/api/v1/resources/${resourceId}/citation`

function row(overrides: Partial<Citation> = {}): Citation {
  return {
    resource_id: resourceId,
    item_type: 'JOURNAL_ARTICLE',
    authors: ['Anna Karpathy', '李维'],
    issued_year: 2024,
    issued_date: null,
    container_title: 'Nature Machine Intelligence',
    volume: '6',
    issue: '3',
    pages: '245–259',
    publisher: 'Springer Nature',
    doi: '10.1038/s42256-024-00812-x',
    isbn: null,
    abstract: null,
    version: 2,
    created_at: '2026-09-20T02:00:00Z',
    updated_at: '2026-09-20T03:00:00Z',
    ...overrides,
  }
}
function draft(overrides: Partial<CitationDraft> = {}): CitationDraft {
  return { ...EMPTY_DRAFT, item_type: 'BOOK', ...overrides }
}

describe('citation client', () => {
  it('reads a citation, and treats the 404 as "not filled in yet" rather than a failure', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ data: row() })
    expect(await getCitation(resourceId)).toMatchObject({ item_type: 'JOURNAL_ARTICLE' })
    expect(request).toHaveBeenCalledWith(base)

    // 没填过文献信息是**正常状态**，不是错误：服务端的 404 在这里折成 null。
    request.mockRejectedValue(new ApiError('CITATION_NOT_FOUND', 404))
    expect(await getCitation(resourceId)).toBeNull()
    // 别的失败不吞。
    request.mockRejectedValue(new ApiError('RESOURCE_NOT_FOUND', 404))
    await expect(getCitation(resourceId)).rejects.toThrow(ApiError)
  })

  it('sends the whole citation and omits the empty fields instead of blanking them with ""', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ data: row() })
    await putCitation(resourceId, draft({ authors: ['李维'], issued_year: 2024 }), null)
    const [, first] = request.mock.calls[0]!
    // 首次写入没有 expected_version（还没有东西可替换），空字段整个不出现。
    expect(first).toEqual({
      method: 'PUT',
      body: { item_type: 'BOOK', authors: ['李维'], issued_year: 2024 },
    })
    expect(Object.keys(first!.body as object)).not.toContain('doi')

    await putCitation(resourceId, draft({ doi: '10.1/x' }), 2)
    const [, second] = request.mock.calls[1]!
    expect(second!.body).toMatchObject({ doi: '10.1/x', expected_version: 2 })
  })

  it('deletes with the version and refuses a nonsense one', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue(undefined)
    await deleteCitation(resourceId, 3)
    expect(request).toHaveBeenCalledWith(base, { method: 'DELETE', ifMatchVersion: 3 })
    await expect(deleteCitation(resourceId, 0)).rejects.toThrow(ApiError)
  })

  it('refuses a response that is not the citation it asked for', async () => {
    const request = vi.spyOn(api, 'request')
    for (const bad of [
      { data: row({ resource_id: '018f1f58-4eb2-4a0d-a716-fb81b1960999' }) },
      { data: { ...row(), item_type: 'PAPER' } },
      { data: { ...row(), issued_year: 3000 } },
      { data: { ...row(), version: 0 } },
      { data: { ...row(), authors: ['ok', 42] } },
      // 契约第 533 节要求时间戳以 Z 返回；`+00:00` 是同一时刻的另一种拼法，但不是契约
      // 承诺的那一种。文献接口曾经真的这么返回过（TASK-078 的 e2e 抓到），所以钉住它。
      { data: { ...row(), created_at: '2026-09-20T02:00:00+00:00' } },
      { data: { ...row(), updated_at: '2026-09-20T03:00:00+00:00' } },
      { data: null },
    ]) {
      request.mockResolvedValue(bad)
      await expect(getCitation(resourceId)).rejects.toThrow(ApiError)
    }
  })

  it('judges the same boundaries the server does, field by field', () => {
    expect(draftProblems(draft())).toEqual([])
    const year = draftProblems(draft({ issued_year: 999 }))
    expect(year).toHaveLength(1)
    expect(year[0]!.field).toBe('issued_year')
    expect(draftProblems(draft({ issued_year: 2201 }))).toHaveLength(1)
    expect(draftProblems(draft({ issued_year: 1000 }))).toEqual([])

    const many = draftProblems(draft({ authors: Array.from({ length: 101 }, () => '李维') }))
    expect(many.map((problem) => problem.field)).toContain('authors')
    const long = draftProblems(draft({ authors: ['李'.repeat(201)] }))
    expect(long.map((problem) => problem.field)).toContain('authors')
    const locator = draftProblems(draft({ volume: '1'.repeat(51) }))
    expect(locator[0]).toMatchObject({ field: 'volume' })
    // ISBN 在后端是 Stamp（32），不是 Name（200）——这里曾经写成 200（Review F1）。
    expect(draftProblems(draft({ isbn: '9'.repeat(33) }))[0]).toMatchObject({ field: 'isbn' })
    expect(draftProblems(draft({ isbn: '9'.repeat(32) }))).toEqual([])
    expect(draftProblems(draft({ abstract: 'a'.repeat(20_001) }))[0]).toMatchObject({
      field: 'abstract',
    })
  })

  it('folds blank boxes into null so that "unknown" has exactly one spelling', () => {
    const cleaned = normalizeDraft(
      draft({ authors: ['  李维 ', '   ', ''], doi: '  ', container_title: ' Nature ' }),
    )
    expect(cleaned.authors).toEqual(['李维'])
    expect(cleaned.doi).toBeNull()
    expect(cleaned.container_title).toBe('Nature')
    // 一位作者都没剩下时是 null，不是空数组——空数组在契约里也会被归一成 NULL。
    expect(normalizeDraft(draft({ authors: ['  '] })).authors).toBeNull()
  })

  it('keeps the slash in a DOI link and still escapes what would break the address', () => {
    // `10.1038/s42256-…` 的 `/` 是 DOI 的一部分；编成 %2F 解析出来就是另一个 DOI。
    expect(doiUrl('10.1038/s42256-024-00812-x')).toBe('https://doi.org/10.1038/s42256-024-00812-x')
    expect(doiUrl('10.1/a b')).toBe('https://doi.org/10.1/a%20b')
    // `#` 与 `?` 在 DOI 里合法，但留在地址里会把后面的内容变成片段或查询串。
    expect(doiUrl('10.1/a#b?c')).toBe('https://doi.org/10.1/a%23b%3Fc')
  })

  it('builds the "出处 · 卷(期), 页" line without leaving stray punctuation', () => {
    expect(containerLine(row())).toBe('Nature Machine Intelligence · 6(3), 245–259')
    expect(containerLine(row({ issue: null }))).toBe('Nature Machine Intelligence · 6, 245–259')
    expect(containerLine(row({ volume: null, pages: null }))).toBe(
      'Nature Machine Intelligence · 第 3 期',
    )
    expect(containerLine(row({ container_title: null, volume: null, issue: null }))).toBe('245–259')
    expect(
      containerLine(row({ container_title: null, volume: null, issue: null, pages: null })),
    ).toBe('')
  })
})
