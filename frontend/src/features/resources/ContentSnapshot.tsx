import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import {
  deleteResourceSnapshot,
  failureText,
  frozenImageUrl,
  getResourceSnapshot,
  listSnapshotAssets,
  putResourceSnapshot,
  type Source,
} from './api'
import { renderSnapshot } from './snapshotMarkdown'
import { useResourceQuery } from './useResourceQuery'

/**
 * 取回这份资料已冻结的图片，返回「原站地址 → blob URL」的映射，以及一个回收函数。
 *
 * 逐张取、失败一张不影响其余：取不到的那张会落回原址加载（未冻结图片的同一条路），
 * 而不是让整篇正文渲染不出来。
 */
async function loadFrozenImages(resourceId: string): Promise<{
  frozen: Map<string, string>
  failed: number
  release: () => void
}> {
  const frozen = new Map<string, string>()
  const assets = await listSnapshotAssets(resourceId)
  let failed = 0
  for (const asset of assets) {
    try {
      frozen.set(asset.source_url, await frozenImageUrl(resourceId, asset.id))
    } catch {
      // 这一张的本机字节取不到，渲染时会退回原址。**必须让用户看见**：他对
      // 「向图床发请求」的知情同意是针对「这张没冻上」给的；本机副本坏掉时
      // 静默改走原站，等于在用户以为看的是本机那一份时发了外部请求。
      failed += 1
    }
  }
  return {
    frozen,
    failed,
    release: () => {
      for (const url of frozen.values()) URL.revokeObjectURL(url)
    },
  }
}

// The wording depends on what else the detail page shows below this block, so the
// component has to know the source type: a WEB resource has an "open the original
// page" link, a PASTE resource has its pasted text, a FILE resource has its file.
// Writing WEB-only wording for all three told PASTE and FILE users something untrue.
const snapshotHints: Record<Source, string> = {
  WEB: '这是保存当时的副本，不随原文更新；需要最新内容请用下方的「打开原网页」。',
  PASTE: '这是另存的一份正文副本，与下方的「粘贴原文」各自独立保存。',
  FILE: '这是另存的一份纯文本正文，不随下方的原件变化。',
}

const emptyHints: Record<Source, string> = {
  WEB: '还没有保存正文。只存链接的话，原文改版或消失后这份资料就找不回来了；可以把正文粘贴进来存一份。',
  PASTE: '还没有另存正文。粘贴的原文见下方；如果想再留一份整理过的正文，可以粘贴进来。',
  FILE: '还没有保存正文。原件见下方；如果想留一份可检索的纯文本正文，可以粘贴进来。',
}

// 资料正文的冻结副本。TASK-042 起这里**渲染**它，而不再只显示 Markdown 源码。
//
// 安全形态说清楚：渲染器以 `html: false` 运行，正文里的原始 HTML 一律转义成字面
// 文本，**不引入消毒器**（用户 2026-09-07 在两条路线中选甲）。已冻结的图片显示本机
// 那一份；没冻上的按原址自动加载（用户在知情三条隐私代价后决定），只加
// `referrerpolicy="no-referrer"` 作缓解。详见 docs/tasks/TASK-042。
export function ContentSnapshot({
  resourceId,
  sourceType,
}: {
  resourceId: string
  sourceType: Source
}) {
  const [revision, setRevision] = useState(0)
  const load = useCallback(() => getResourceSnapshot(resourceId), [resourceId])
  const { result, retry } = useResourceQuery(`${resourceId}:snapshot:${revision}`, load)
  const [editing, setEditing] = useState(false)
  // 键里带上 resourceId 与 revision：换资料或重读快照时，旧的映射不该被沿用，
  // 而在新映射取回来之前要显示「正在取回」而不是拿旧的去渲染新正文。
  const [frozen, setFrozen] = useState<{
    key: string
    images: ReadonlyMap<string, string>
    failed: number
    listFailed: boolean
  } | null>(null)
  const [showSource, setShowSource] = useState(false)

  // 图片随快照一起取。**回收放在 effect 的清理里**：切换资料或离开页面时，
  // 每个创建过的 blob URL 都要 revoke，否则看得越多留在内存里的字节越多。
  useEffect(() => {
    let alive = true
    let release: (() => void) | undefined
    void loadFrozenImages(resourceId)
      .then((loaded) => {
        release = loaded.release
        if (alive)
          setFrozen({
            key: `${resourceId}:${revision}`,
            images: loaded.frozen,
            failed: loaded.failed,
            listFailed: false,
          })
        else loaded.release()
      })
      .catch(() => {
        // 资产列表取不到（没有快照、后端错误、连接失效）。**必须给出空映射而不是
        // 停在等待态**：否则正文永远显示「正在取回已冻结的图片…」，而正文本身
        // 明明已经在手上了。降级的结果是所有图片走原址那条路。
        //
        // **`listFailed` 必须与「一张都没冻」区分开。** 这一支下所有已冻结的图片
        // 都会静默改走原站，而用户对「向图床发请求」的知情同意只针对「这张没冻上」。
        // 此前这里记 `failed: 0`，于是缺口从一张扩大到全部，界面却一个字都不说。
        if (alive)
          setFrozen({
            key: `${resourceId}:${revision}`,
            images: new Map(),
            failed: 0,
            listFailed: true,
          })
      })
    return () => {
      alive = false
      release?.()
    }
  }, [resourceId, revision])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const snapshot = result?.data ?? null

  // 相对图片地址（`![](/img/a.png)`）要先解析成绝对地址才能和冻结表对上 —— 表里的
  // 键是采集时算好的绝对地址。基准用快照自己记的采集地址；它为空时（手工粘贴的正文
  // 没有采集地址）相对地址不渲染成 img，而不是渲染一个指向本机 UI 自己的 src。
  //
  // **没有退回资料 `source_url` 那一层**：那要给本组件加一个属性、改
  // `ResourceDetail.tsx`，而那个文件不在本任务的 `allowed_paths` 里。已记入已知限制。
  const base = snapshot?.captured_from_url ?? null

  // **必须 memo**：`renderSnapshot` 每次都新建渲染器并全文解析，而正文上限是
  // 100 万字。不 memo 的话，在快照旁边的编辑框里每敲一个字都会重解析整篇。
  const rendered = useMemo(
    () => (snapshot && frozen ? renderSnapshot(snapshot.content ?? '', frozen.images, base) : ''),
    [snapshot, frozen, base],
  )

  async function run(work: () => Promise<unknown>) {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    try {
      await work()
      setEditing(false)
      setDraft('')
      setRevision((value) => value + 1)
    } catch (cause) {
      // No automatic retry: a failed write may or may not have landed.
      setError(failureText(cause))
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft.trim()) {
      setError('正文不能为空。')
      return
    }
    void run(() => putResourceSnapshot(resourceId, draft, snapshot?.version))
  }

  // The section itself never disappears: a reload after saving must not make the whole
  // block flash away, only the part that is actually being re-read.
  const unreadable = result?.error !== undefined
  return (
    <section className="resource-snapshot" aria-label="正文快照">
      <h3>正文快照</h3>
      {!result ? (
        <p role="status">正在读取正文…</p>
      ) : unreadable ? (
        // A failed read of an optional section is reported politely: the loud
        // role="alert" is reserved for writes the user just asked for.
        <div className="resource-error">
          <p role="status">{failureText(result.error)} 正文没有读到，资料本身不受影响。</p>
          <button type="button" className="journal-button" onClick={retry}>
            重新读取正文
          </button>
        </div>
      ) : snapshot ? (
        <>
          <p className="resource-hint">
            保存于 {snapshot.captured_at.slice(0, 10)} · 共 {snapshot.char_count} 字 · 来源标识{' '}
            {snapshot.extractor} · 第 {snapshot.version} 版
          </p>
          <p className="resource-hint">{snapshotHints[sourceType]}</p>
          <button
            type="button"
            className="text-link"
            onClick={() => setShowSource((shown) => !shown)}
          >
            {showSource ? '看渲染后的正文' : '看 Markdown 源码'}
          </button>
          {showSource ? (
            // 源码视图保留：TASK-042 之前用户只能看到源码，不该因为加了渲染就失去它。
            <pre className="snapshot-body" tabIndex={0}>
              {snapshot.content}
            </pre>
          ) : frozen?.key === `${resourceId}:${revision}` ? (
            <>
              {frozen.listFailed ? (
                <p className="resource-hint" role="alert">
                  已冻结图片的清单没有读出来，因此这一次正文里的图片<strong>全部</strong>
                  改用原网站的地址显示 —— 也就是说会向原网站发请求。重新读取这份资料可以再试一次。
                </p>
              ) : (
                frozen.failed > 0 && (
                  <p className="resource-hint" role="alert">
                    有 {frozen.failed} 张图片的本机副本读不出来，这几张改用了原网站的地址显示——
                    也就是说这几张会向原网站发请求。原网站删图或改版后它们会失效。
                  </p>
                )
              )}
              <div
                className="snapshot-body snapshot-rendered"
                tabIndex={0}
                // 内容来自 `renderSnapshot`，它以 `html: false` 渲染：正文里的原始 HTML
                // 已被转义成字面文本，进不了 DOM。这一处是本项目唯一的
                // dangerouslySetInnerHTML，其安全性完全依赖那个配置，
                // 而那个配置由 `snapshotMarkdown.test.ts` 直接断言。
                dangerouslySetInnerHTML={{ __html: rendered }}
              />
            </>
          ) : (
            <p className="resource-hint" role="status">
              正在取回已冻结的图片…
            </p>
          )}
        </>
      ) : (
        <p className="resource-hint">{emptyHints[sourceType]}</p>
      )}
      {result &&
        !unreadable &&
        (editing ? (
          <form onSubmit={save} aria-label="正文快照编辑" noValidate>
            <fieldset disabled={pending}>
              <legend className="sr-only">粘贴正文</legend>
              <label className="resource-field">
                正文（Markdown）
                <textarea
                  autoFocus
                  rows={12}
                  className="paste-input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="把文章正文粘贴到这里，最多 100 万字"
                />
              </label>
              <div className="resource-actions">
                <button type="submit" className="journal-button primary" disabled={!draft.trim()}>
                  {pending ? '正在保存…' : snapshot ? '替换正文' : '保存正文'}
                </button>
                <button
                  type="button"
                  className="journal-button"
                  onClick={() => {
                    setEditing(false)
                    setDraft('')
                    setError('')
                  }}
                >
                  取消
                </button>
              </div>
            </fieldset>
          </form>
        ) : (
          <div className="resource-actions">
            <button
              type="button"
              className="journal-button"
              disabled={pending}
              onClick={() => {
                setError('')
                setDraft(snapshot?.content ?? '')
                setEditing(true)
              }}
            >
              {snapshot ? '替换正文' : '粘贴正文'}
            </button>
            {snapshot && (
              <button
                type="button"
                className="journal-button danger"
                disabled={pending}
                onClick={() => void run(() => deleteResourceSnapshot(resourceId, snapshot.version))}
              >
                删除正文
              </button>
            )}
          </div>
        ))}
      {error && (
        <div role="alert" className="resource-error">
          <p>{error}</p>
          <p>没有自动重试。请重新读取这份资料后再决定。</p>
        </div>
      )}
    </section>
  )
}
