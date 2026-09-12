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

// **空状态**的引导语依来源而异：WEB 丢了链接就找不回来，PASTE 与 FILE 手里还留着自己的
// 原件，说辞不能一样（TASK-036 栽的就是「三种来源共用 WEB 文案」这一跤）。句子里的
// 「上方工具条」是一句关于版面的**陈述**，不是文案——原件入口确实在上面那条工具条里，
// `ResourcePages.test.tsx` 有一条把方位词与 DOM 顺序绑在一起的守卫盯着它。
//
// TASK-046 删掉了**有快照时**的那三句 `snapshotHints`（「这是保存当时的副本…」）与它们
// 上面的元信息行：用户两次指出那段没有用。空状态这三句留着——它们是引导而不是元信息，
// 是一页空白上唯一告诉你能做什么的东西。
const emptyHints: Record<Source, string> = {
  WEB: '还没有保存正文。只存链接的话，原文改版或消失后这份资料就找不回来了；可以把正文粘贴进来存一份。',
  PASTE: '还没有另存正文。粘贴的原文在上方工具条里；如果想再留一份整理过的正文，可以粘贴进来。',
  FILE: '还没有保存正文。原件在上方工具条里；如果想留一份可检索的纯文本正文，可以粘贴进来。',
}

// 资料正文的冻结副本。TASK-042 起这里**渲染**它，而不再只显示 Markdown 源码。
//
// 安全形态说清楚：渲染器以 `html: false` 运行，正文里的原始 HTML 一律转义成字面
// 文本，**不引入消毒器**（用户 2026-09-07 在两条路线中选甲）。已冻结的图片显示本机
// 那一份；没冻上的按原址自动加载（用户在知情三条隐私代价后决定），只加
// `referrerpolicy="no-referrer"` 作缓解。详见 docs/tasks/TASK-042。
/**
 * 回给菜单的「正文现在是什么状态」。TASK-051 起**读不出来也要报**：此前失败态什么都不
 * 回传，父级停在「还没读到」，菜单照样给出「粘贴正文」这个入口。
 */
export type SnapshotState = { unreadable: true } | { unreadable: false; exists: boolean }

export function ContentSnapshot({
  resourceId,
  sourceType,
  pageTitle,
  showSource = false,
  editRequest,
  deleteRequest,
  onSnapshotState,
}: {
  resourceId: string
  sourceType: Source
  /**
   * 页面上已经显示的资料标题（TASK-053）：正文开头与它相同的 `h1` 不再渲染一遍。
   * 可选；不传时渲染与以往完全一致。源码视图不受影响——那是原文。
   */
  pageTitle?: string | null
  /**
   * 是否显示 Markdown 源码。**受控于父级**（TASK-046）：切换入口搬进了工具条的 `⋯`
   * 菜单，而菜单项的文案要随当前视图变（「看源码」/「看渲染后的正文」），所以状态必须
   * 待在看得见菜单的那一层。
   */
  showSource?: boolean
  /** 打开正文编辑表单的请求：单调递增，同一个值只消费一次。 */
  editRequest?: number
  /** 删除正文的请求（先出确认块，不直接删）：同上。 */
  deleteRequest?: number
  /** 回传「这份资料有没有正文」，供菜单取文案并决定「删除正文…」出不出现。 */
  onSnapshotState?: (state: SnapshotState) => void
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
  // 删除正文的确认块：**渲染在正文位置，不放在 `⋯` 浮层里**。确认 UI 嵌在浮层里时，
  // 点浮层外面一下就会把它连同进行中的请求一起卸载掉（TASK-043 已经付过这份学费）。
  const [confirming, setConfirming] = useState(false)
  const confirmBox = useRef<HTMLDivElement>(null)
  // 请求令牌只消费一次。**不用布尔**：布尔会让父级任何一次重渲染都可能重放这个动作
  // （TASK-045 的 focusRequest 正是在这里翻过车）。
  const [seenEdit, setSeenEdit] = useState(0)
  const [seenDelete, setSeenDelete] = useState(0)

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
    () =>
      snapshot && frozen
        ? renderSnapshot(snapshot.content ?? '', frozen.images, base, { pageTitle })
        : '',
    [snapshot, frozen, base, pageTitle],
  )

  async function run(work: () => Promise<unknown>) {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    try {
      await work()
      setEditing(false)
      setConfirming(false)
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
  const exists = Boolean(snapshot)

  // 「有没有正文」回传给菜单。**读不出来时也回传**：那时我们并不知道有没有，菜单据此把
  // 替换/粘贴、看源码、删除四个入口一并收起——对一个读不到的东西，没有一个动作站得住
  // （TASK-046 遗留 I：此前失败态不回传，父级停在 null，「粘贴正文」照样在，点了没反应）。
  useEffect(() => {
    if (!result) return
    onSnapshotState?.(unreadable ? { unreadable: true } : { unreadable: false, exists })
  }, [result, unreadable, exists, onSnapshotState])

  // 菜单里的两个请求在**渲染期**消化，不放进 effect。这是 React 官方的「props 变了就
  // 顺手调整 state」写法，本文件的邻居 `ResourceDetail` 里那句 `if (item && item !== shown)
  // setShown(item)` 就是同一形态；写成 effect 会多渲染一轮，仓库的 lint
  // （`react-hooks/set-state-in-effect`）也直接判错。
  //
  // **令牌在真正动手之后才记为已消费**：正文还在读取途中就点了「替换正文」的话，请求
  // 留着，等读到了再打开表单。TASK-045 的 focusRequest 是反过来写的（守卫之前就烧掉
  // 令牌），复审记下的那个窄窗口正是这么来的。
  //
  // **但读取失败就作废**（TASK-051）：失败提示与「重新读取正文」已经把情况说清；若把令牌
  // 继续留着，用户重试成功的那一刻编辑表单会自己弹出来——那是几步之前的一次点击迟到重放。
  if (editRequest !== undefined && editRequest !== seenEdit && result) {
    setSeenEdit(editRequest)
    if (!unreadable) {
      setError('')
      setConfirming(false)
      setDraft(snapshot?.content ?? '')
      setEditing(true)
    }
  }
  // 「删除正文…」只开确认块，不删。没有正文时不消费令牌（菜单里本来也不会有这一项）。
  if (deleteRequest !== undefined && deleteRequest !== seenDelete && snapshot) {
    setSeenDelete(deleteRequest)
    setError('')
    setEditing(false)
    setConfirming(true)
  }

  // 确认块拿到焦点。**落在容器上而不是「确认删除」按钮上**：让读屏用户先听见这是什么、
  // 不可撤销，而不是一上来焦点就停在一个按回车即删的按钮上。
  useEffect(() => {
    if (confirming) confirmBox.current?.focus()
  }, [confirming])

  return (
    <section className="resource-snapshot" aria-label="正文快照">
      {/* **错误提示放在最上面。** 沉浸式阅读页里正文可以有几万字，提示留在下面等于
          写给没人看的地方。 */}
      {error && (
        <div role="alert" className="resource-error">
          <p>{error}</p>
          <p>没有自动重试。请重新读取这份资料后再决定。</p>
        </div>
      )}
      {editing ? (
        // 编辑时**顶掉正文**而不是排在正文下面：正文几万字时，「排在下面」意味着表单在
        // 屏幕之外几十屏的地方（`autoFocus` 会把页面猛地拽过去）。
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
        <>
          {confirming && snapshot && (
            <div
              className="snapshot-confirm"
              role="group"
              aria-label="删除正文确认"
              tabIndex={-1}
              ref={confirmBox}
            >
              <p>删除这份正文副本后不能撤销。原网页、原件与这份资料本身都不受影响。</p>
              <div className="resource-actions">
                <button
                  type="button"
                  className="journal-button danger"
                  disabled={pending}
                  onClick={() =>
                    void run(() => deleteResourceSnapshot(resourceId, snapshot.version))
                  }
                >
                  {pending ? '正在删除…' : '确认删除正文'}
                </button>
                <button
                  type="button"
                  className="journal-button"
                  disabled={pending}
                  onClick={() => setConfirming(false)}
                >
                  取消
                </button>
              </div>
            </div>
          )}
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
              {frozen?.key === `${resourceId}:${revision}` ? (
                <>
                  {frozen.listFailed ? (
                    <p className="resource-hint" role="alert">
                      已冻结图片的清单没有读出来。正文里若有图片，这一次会一律按原网站的地址显示 ——
                      也就是说会向原网站发请求。刷新页面可以再试一次。
                    </p>
                  ) : (
                    frozen.failed > 0 && (
                      <p className="resource-hint" role="alert">
                        有 {frozen.failed} 张已冻结的图片，本机那一份读不出来。它们若出现在正文里，
                        会改用原网站的地址显示 —— 也就是会向原网站发请求，且原网站删图或改版后失效。
                      </p>
                    )
                  )}
                  {showSource ? (
                    // 源码视图保留：TASK-042 之前用户只能看到源码，不该因为加了渲染就
                    // 失去它。入口在 `⋯` 菜单里（TASK-046）。它是代码不是文章，所以
                    // 保留自己的框与等宽排版，不跟着正文放大。
                    <pre className="snapshot-body" tabIndex={0}>
                      {snapshot.content}
                    </pre>
                  ) : (
                    <div
                      className="snapshot-rendered"
                      // 内容来自 `renderSnapshot`，它以 `html: false` 渲染：正文里的原始 HTML
                      // 已被转义成字面文本，进不了 DOM。这一处是本项目唯一的
                      // dangerouslySetInnerHTML，其安全性完全依赖那个配置，
                      // 而那个配置由 `snapshotMarkdown.test.ts` 直接断言。
                      //
                      // **没有 `tabIndex`**：TASK-046 之前它是个 420px 高的滚动框，可聚焦是
                      // 为了能用键盘滚动它。现在正文由页面自己滚，一个可聚焦的非交互 div
                      // 只会在 Tab 序里多占一站。
                      dangerouslySetInnerHTML={{ __html: rendered }}
                    />
                  )}
                </>
              ) : (
                <p className="resource-hint" role="status">
                  正在取回已冻结的图片…
                </p>
              )}
            </>
          ) : (
            // 空状态**保留一个就地入口**。有正文时三个动作都收进了 `⋯`；没有正文时页面上
            // 空无一物，再把唯一能做的事也藏进菜单，等于让人自己去猜。
            <>
              <p className="resource-hint">{emptyHints[sourceType]}</p>
              <div className="resource-actions">
                <button
                  type="button"
                  className="journal-button"
                  disabled={pending}
                  onClick={() => {
                    setError('')
                    setDraft('')
                    setEditing(true)
                  }}
                >
                  粘贴正文
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
