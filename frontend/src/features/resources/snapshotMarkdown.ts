import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

// 把冻结的正文渲染成文档。**这一步把一条结构性安全性质换成了配置性的**：
// TASK-036 起的保证是「抓自开放网络的不可信内容压根不进 DOM」，从这里开始，
// 保证变成「渲染器被配置成会转义它」。被攻破的落点是本机 UI 源——后端门禁唯一
// 信任的源，页面内存里握着本次会话的访问令牌。所以下面每一条配置都不是偏好。

/**
 * 渲染器配置。**导出它是为了让测试能直接断言这几个值**，而不是只断言「某个样例
 * 没被渲染成 HTML」——后者是本项目已被咬过的形态：断言了现象，没断言配置。
 *
 * - `html: false`：正文里的 `<script>`/`<iframe>`/`<img onerror>` 一律当字面文本转义。
 *   这是 markdown-it 的**默认值**，选它正是因为「安全是默认，要出事得主动去改」。
 * - `linkify: false`：不把裸地址自动变成链接。少一条把正文文本变成可点击目标的路径。
 * - `breaks: false`：与 CommonMark 一致，不改变已存正文的语义。
 */
export const RENDERER_OPTIONS = { html: false, linkify: false, breaks: false } as const

/** 正文里一张图片的去向。 */
export type ImageSource =
  | { kind: 'frozen'; url: string } // 本机那一份，blob URL
  | { kind: 'origin'; url: string } // 没冻上，按原址加载（用户 2026-09-07 决定）

/**
 * 构造渲染器。`resolve` 决定每张图片的去向：已冻结的走本机，其余按原址。
 *
 * **图片与链接是本模块仅有的两处「把正文里的字符串放进属性」的地方**，因此两处
 * 都只接受 markdown-it 自己的 `validateLink` 放行过的地址（它默认拒 `javascript:`、
 * `vbscript:`、`file:` 与非图片的 `data:`），再各自加上必要的属性。
 */
export function createRenderer(resolve: (src: string) => ImageSource | null): MarkdownIt {
  const md = new MarkdownIt(RENDERER_OPTIONS)

  md.renderer.rules.image = (tokens, index, _options, _env, self) => {
    const token = tokens[index]
    if (!token) return ''
    const src = token.attrGet('src') ?? ''
    const target = resolve(src)
    if (!target) {
      // 地址没通过校验（伪协议等）：**不产生 img 元素**，只留可读的替代文本。
      return `<span class="snapshot-image-refused">${md.utils.escapeHtml(token.content || src)}</span>`
    }
    token.attrSet('src', target.url)
    token.attrSet('loading', 'lazy')
    // 默认的 image 规则唯一多做的一件事就是把 alt 填上（renderer.mjs 里
    // `renderInlineAsText`）。自定义规则取代了它，若不补这一行，**正文里每一张图的
    // alt 都是空的**：读屏会把它们当装饰性图片跳过，而原址加载失败时连替代文字都没有。
    token.attrSet('alt', self.renderInlineAsText(token.children ?? [], _options, _env))
    if (target.kind === 'origin') {
      // 唯一的缓解措施：默认策略会把 `http://127.0.0.1:5173/` 这个本机源发出去，
      // 图床的防盗链本就不认它，**去掉零功能代价**，少泄露一位信息。
      // 它挡不住代价一（原站知道你何时读了这篇）与代价二（SameSite=None cookie），
      // 那两条是用户在知情后接受的，见任务记录设计决定 ③。
      token.attrSet('referrerpolicy', 'no-referrer')
      token.attrSet('data-origin-image', 'true')
    }
    return self.renderToken(tokens, index, _options)
  }

  const defaultLink = md.renderer.rules.link_open
  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    // 正文里的链接指向外部站点：新标签页打开，且不把本机地址带过去。
    tokens[index]?.attrSet('target', '_blank')
    tokens[index]?.attrSet('rel', 'noreferrer noopener')
    return defaultLink
      ? defaultLink(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options)
  }

  return md
}

/**
 * 渲染一份快照。`frozen` 是「原站地址 → 本机 blob URL」的映射，来自已冻结的资产。
 *
 * **正文一字不动**：替换只发生在渲染管线里，不回写数据库——原站地址是溯源信息
 * （TASK-039 设计决定 ②）。
 */
export function renderSnapshot(
  markdown: string,
  frozen: ReadonlyMap<string, string>,
  base?: string | null,
  options: RenderOptions = {},
): string {
  const md = createRenderer((src) => {
    if (!src) return null
    // **先解析成绝对地址再查表。** 资产表里的 `source_url` 是扩展用
    // `new URL(raw, pageUrl).href` 解析过的**绝对**地址，而正文一字不动地保留了原写法。
    // 不解析就直接比较的话，`![图](/img/a.png)` 这种相对写法既匹配不上本机那一份、
    // 又不满足下面的 http(s) 判定，于是**连 img 都不产生** —— 一张确实冻下来、
    // 用户为它付过权限代价的图，页面上什么都看不到。
    const absolute = toAbsolute(src, base)
    if (!absolute) return null
    const local = frozen.get(absolute)
    if (local) return { kind: 'frozen', url: local }
    // markdown-it 已经用 validateLink 过滤过 src；到这里的都是它放行的地址。
    // 再挡一次协议：只有 http(s) 才值得去请求。
    return /^https?:\/\//i.test(absolute) ? { kind: 'origin', url: absolute } : null
  })
  if (options.pageTitle) omitDuplicateTitle(md, options.pageTitle)
  return md.render(markdown)
}

export type RenderOptions = {
  /**
   * 页面上已经显示的资料标题（TASK-053）。给出时，正文**第一个块**若是 `h1` 且纯文本与它
   * 相同，就不再渲染那个标题——用户原话：「标题在页面最上面已经有了，在正文里就不用
   * 再出现了吧」。不给或为空则输出与以往逐字节相同。
   */
  pageTitle?: string | null
}

/** 比较用的规范形式：NFC、去首尾空白、连续空白折叠、大小写折叠。 */
function comparable(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * 在 core 阶段删掉与页面标题重复的开头 `h1`（三枚 token：`heading_open`/`inline`/
 * `heading_close`）。**判据取最保守的一种**：只看第一个块、只认 h1、纯文本相同才删。
 * 一条会静默吞掉内容的规则，宁可漏删也不误删——「标题 + 站点后缀」这类形态因此
 * 保留，不做前缀或模糊匹配。正文数据一字不动，只影响这一次渲染。
 *
 * 只删 token、不碰任何渲染规则：`html:false`、image/link 的地址校验与转义路径全部照旧。
 */
function omitDuplicateTitle(md: MarkdownIt, pageTitle: string): void {
  const wanted = comparable(pageTitle)
  if (!wanted) return
  md.core.ruler.push('omit_duplicate_title', (state) => {
    const [open, inline, close] = state.tokens
    if (!open || open.type !== 'heading_open' || open.tag !== 'h1') return
    if (!inline || inline.type !== 'inline' || !close || close.type !== 'heading_close') return
    // 按**纯文本**比较：`# **冻结的**标题` 的标题仍是「冻结的标题」。
    if (comparable(plainText(inline.children ?? [])) !== wanted) return
    state.tokens.splice(0, 3)
  })
}

/**
 * 行内 token 的纯文本。**不用 markdown-it 自带的 `renderInlineAsText`**：它跳过
 * `code_inline`，于是 `# React Hooks \`v18\`` 会被读成「React Hooks 」，与标题「React Hooks」
 * 撞上而误删（独立 Review F1）。这里把行内代码的内容也算进去，换行折成空格。
 */
function plainText(children: Token[]): string {
  let out = ''
  for (const token of children) {
    if (token.type === 'text' || token.type === 'code_inline') out += token.content
    else if (token.type === 'softbreak' || token.type === 'hardbreak') out += ' '
    else if (token.children) out += plainText(token.children)
  }
  return out
}

/**
 * 把正文里的图片地址解析成绝对地址；解析不了就原样返回，由调用方按协议判定。
 *
 * **绝对地址也要过一遍 `new URL`，不能因为「已经是 http(s) 开头」就早退。**
 * 冻结表的键是采集时 `new URL(...).href` 算出来的**规范形式**（小写协议与主机、
 * 去掉默认端口、点段已折叠），而正文里完全可能写成 `HTTPS://CDN.Example.com/a.png`、
 * `https://cdn.example.com:443/a.png` 或 `https://cdn.example.com/img/../a.png`。
 * 早退意味着这些写法查表落空，那张图**静默走原站**——`failed` 计数不增、界面不提示，
 * 而用户为那份本机副本付过一次授权代价。规范化对已经规范的地址是幂等的。
 */
function toAbsolute(src: string, base?: string | null): string {
  try {
    return new URL(src, base ?? undefined).href
  } catch {
    return src
  }
}
