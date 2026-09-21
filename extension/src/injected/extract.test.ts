// @vitest-environment jsdom
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { MAX_IMAGES, MAX_MARKDOWN, MAX_TITLE } from '../shared/protocol'

import {
  EXTRACT_OPTIONS,
  collectImages,
  extractCitation,
  extractFromDocument,
  normalizeSourceUrl,
} from './extract'

// 一篇典型技术文章的骨架：正文外面裹着导航、页脚、推荐位和广告位。
// 提取的价值全在于「只留中间那块」——所以断言分两半：正文必须活下来，噪声必须消失。
const ARTICLE = `
  <nav><a href="/">首页</a><a href="/tags">标签</a><a href="/login">登录</a></nav>
  <header><h1 class="site">某某技术社区</h1></header>
  <article>
    <h1>如何理解数据库索引</h1>
    <p>索引的本质是<strong>用空间换时间</strong>，它让查询不必扫描整张表。</p>
    <p>下面这条语句会走主键索引：</p>
    <pre><code>SELECT * FROM users WHERE id = 1;</code></pre>
    <p>但如果条件里对列做了函数运算，索引就用不上了。</p>
  </article>
  <aside class="recommend"><h3>推荐阅读</h3><a href="/x">另一篇完全无关的文章</a></aside>
  <div class="ad">限时优惠 立即购买</div>
  <footer>版权所有 2026 某某社区 · 备案号 12345 · 联系我们</footer>
`

function pageWith(body: string, title = '如何理解数据库索引 - 某某技术社区') {
  document.title = title
  document.body.innerHTML = body
  return document
}

describe('extractFromDocument', () => {
  it('keeps the article and drops the furniture around it', () => {
    const { markdown } = extractFromDocument(pageWith(ARTICLE), 'https://example.com/db-index')

    expect(markdown).toContain('用空间换时间')
    expect(markdown).toContain('SELECT * FROM users WHERE id = 1;')
    expect(markdown).toContain('索引就用不上了')

    for (const noise of ['首页', '登录', '推荐阅读', '限时优惠', '版权所有', '备案号']) {
      expect(markdown, `噪声「${noise}」不该出现在正文里`).not.toContain(noise)
    }
  })

  it('produces Markdown rather than raw HTML', () => {
    const { markdown } = extractFromDocument(pageWith(ARTICLE), 'https://example.com/db-index')
    expect(markdown).toMatch(/^#{1,3} /m)
    expect(markdown).toContain('```')
    expect(markdown).not.toContain('<p>')
    expect(markdown).not.toContain('</article>')
  })

  it('carries the page title and url through', () => {
    const result = extractFromDocument(pageWith(ARTICLE), 'https://example.com/db-index')
    expect(result.title).toContain('数据库索引')
    expect(result.url).toBe('https://example.com/db-index')
  })

  it('clamps an over-long title to what the backend accepts', () => {
    const result = extractFromDocument(pageWith(ARTICLE, '标'.repeat(400)), 'https://example.com/a')
    expect(result.title.length).toBeLessThanOrEqual(MAX_TITLE)
  })

  it('drops the fragment so the backend will actually accept the url', () => {
    // 后端的 source_url 不接受 `#`（contracts.py 的 parsed_url）。带锚点的地址若原样
    // 传下去，用户会一路预填成功、直到点保存才被 422 拒绝，而确认页没有网址编辑框。
    const result = extractFromDocument(pageWith(ARTICLE), 'https://example.com/a#section-3')
    expect(result.url).toBe('https://example.com/a')
  })

  it.each([
    ['https://example.com/a#anchor', 'https://example.com/a'],
    ['https://example.com/a?q=1#x', 'https://example.com/a?q=1'],
    ['https://example.com/a', 'https://example.com/a'],
    ['https://example.com/#/hash/route', 'https://example.com/'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeSourceUrl(input)).toBe(expected)
  })

  it('leaves an unparseable url alone rather than throwing', () => {
    expect(normalizeSourceUrl('not a url')).toBe('not a url')
  })

  it('pins the option that keeps the extension off the network', () => {
    // 「扩展不发网络请求」是写给用户的承诺。Defuddle 的 useAsync 默认 true，其
    // 异步抽取器会向第三方 API 发请求。**这条值断言是那句承诺真正的看守**：删掉
    // 这个选项、或把它改成 true，都会在这里变红，而不是等到有人发现流量。
    expect(EXTRACT_OPTIONS.useAsync).toBe(false)
    // 同时钉住调用的是同步 parse()：异步路径才是 fetch 的可达入口。
    // 下面这条是**辅助**防线，不是看守：源码扫描挡不住 'parse' + 'Async' 一类有意
    // 规避（`boundaries.test.ts` 对自己的扫描也写了同样的免责）。它的价值在于让
    // 「改用异步方法」这种无意改动当场变红。
    // jsdom 环境下 import.meta.url 不是 file: URL，用相对 vitest 工作目录的路径；
    // 必须先剥注释，因为那份源码的注释里正好在**讨论** parseAsync 与 fetch。
    const source = readFileSync('src/injected/extract.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(source).toContain('.parse()')
  })

  it('returns empty markdown for a page with no article to speak of', () => {
    // 空正文不是崩溃，是一个 runCapture 会拒绝开确认页的正常结果。
    const result = extractFromDocument(pageWith('<nav>只有导航</nav>'), 'https://example.com/nav')
    expect(result.markdown.length).toBeLessThan(20)
  })
})

describe('collectImages', () => {
  const base = 'https://example.com/posts/1'

  it('recognizes the three forms it claims to, and resolves relative addresses', () => {
    const markdown = [
      '![图一](/img/a.png)',
      '![图二](https://cdn.example.com/b.jpg "标题")',
      '![图三](<https://cdn.example.com/c%20d.png>)',
      '<img alt="四" src="https://cdn.example.com/d.webp">',
    ].join('\n\n')
    expect(collectImages(markdown, base)).toEqual([
      'https://example.com/img/a.png',
      'https://cdn.example.com/b.jpg',
      'https://cdn.example.com/c%20d.png',
      'https://cdn.example.com/d.webp',
    ])
  })

  it('drops what it must not fetch, and keeps order while de-duplicating', () => {
    const markdown = [
      '![a](https://cdn.example.com/a.png)',
      '![data](data:image/png;base64,AAAA)',
      '![blob](blob:https://example.com/x)',
      '![file](file:///etc/passwd)',
      '![creds](https://u:p@cdn.example.com/x.png)',
      '![again](https://cdn.example.com/a.png)',
      '![b](https://cdn.example.com/b.png)',
    ].join('\n\n')
    expect(collectImages(markdown, base)).toEqual([
      'https://cdn.example.com/a.png',
      'https://cdn.example.com/b.png',
    ])
  })

  it('is not fooled by an ordinary link that merely looks similar', () => {
    // `[文字](url)` 是链接不是图片：少了 `!` 就不该被当成要下载的东西。
    expect(collectImages('[普通链接](https://example.com/page)', base)).toEqual([])
  })

  it('stops at the per-capture ceiling', () => {
    const many = Array.from(
      { length: MAX_IMAGES + 10 },
      (_value, index) => `![${index}](https://cdn.example.com/${index}.png)`,
    ).join('\n')
    expect(collectImages(many, base)).toHaveLength(MAX_IMAGES)
  })

  it('leaves reference-style images alone, as documented', () => {
    // 认下去要连带解析链接定义，而定义里大多是普通链接。这类页面的图片保留
    // 原站地址 —— 与「取不到」同一条降级路径，不产生新形态。
    const markdown = '![图][ref]\n\n[ref]: https://cdn.example.com/ref.png'
    expect(collectImages(markdown, base)).toEqual([])
  })
})

describe('extractFromDocument with images', () => {
  it('collects from the truncated body, not from what was thrown away', () => {
    // 被 MAX_MARKDOWN 砍掉的部分不会进快照，为那部分的图片申请权限、发请求、
    // 占本机空间都是白费。
    const tail = '![尾图](https://cdn.example.com/tail.png)'
    const markdown = `${'x'.repeat(MAX_MARKDOWN)}\n\n${tail}`
    expect(collectImages(markdown.slice(0, MAX_MARKDOWN), 'https://example.com/a')).toEqual([])
  })
})

describe('extractCitation', () => {
  /** 一篇真实形态的期刊论文页：Highwire 那套 citation_* 标签，学术站点几乎都有。 */
  const HIGHWIRE = `
    <meta name="citation_journal_title" content="Nature Machine Intelligence">
    <meta name="citation_author" content="Karpathy, Anna">
    <meta name="citation_author" content="李维">
    <meta name="citation_publication_date" content="2024/03/01">
    <meta name="citation_volume" content="6">
    <meta name="citation_issue" content="3">
    <meta name="citation_firstpage" content="245">
    <meta name="citation_lastpage" content="259">
    <meta name="citation_doi" content="10.1038/s42256-024-00812-x">
    <meta name="citation_publisher" content="Springer Nature">
    <article><p>正文</p></article>`

  it('reads a journal article out of the Highwire tags the page already declares', () => {
    const found = extractCitation(pageWith(HIGHWIRE), 'https://www.nature.com/articles/s42256')
    expect(found).toEqual({
      item_type: 'JOURNAL_ARTICLE',
      authors: ['Karpathy, Anna', '李维'],
      issued_year: 2024,
      issued_date: '2024/03/01',
      container_title: 'Nature Machine Intelligence',
      volume: '6',
      issue: '3',
      pages: '245-259',
      publisher: 'Springer Nature',
      doi: '10.1038/s42256-024-00812-x',
      isbn: null,
    })
  })

  /**
   * **`arxiv.org/abs/1706.03762` 的真实标签集**（2026-09-21 从真实页面取样，逐字照抄）。
   *
   * 这份夹具是本任务的验收锚点：TASK-075 的门槛要求 DOI 或期刊名，而这一页两样都不发——
   * 功能在测试里全绿、在真实站点一次都不触发，用户第一次实测就撞上了。真实页面的形态
   * 决定功能成败时，真实页面的标签集就是完成条件，不是可选项。
   */
  const ARXIV_REAL = `
    <meta name="citation_title" content="Attention Is All You Need"/>
    <meta name="citation_author" content="Vaswani, Ashish"/>
    <meta name="citation_author" content="Shazeer, Noam"/>
    <meta name="citation_author" content="Parmar, Niki"/>
    <meta name="citation_author" content="Uszkoreit, Jakob"/>
    <meta name="citation_author" content="Jones, Llion"/>
    <meta name="citation_author" content="Gomez, Aidan N."/>
    <meta name="citation_author" content="Kaiser, Lukasz"/>
    <meta name="citation_author" content="Polosukhin, Illia"/>
    <meta name="citation_date" content="2017/06/12"/>
    <meta name="citation_online_date" content="2023/08/02"/>
    <meta name="citation_pdf_url" content="https://arxiv.org/pdf/1706.03762"/>
    <meta name="citation_arxiv_id" content="1706.03762"/>
    <meta name="citation_abstract" content="The dominant sequence transduction models…"/>
    <table><tr><td class="tablecell arxivdoi">
      <a href="https://doi.org/10.48550/arXiv.1706.03762" id="arxiv-doi-link">https://doi.org/10.48550/arXiv.1706.03762</a>
    </td></tr></table>
    <blockquote class="abstract"><p>正文</p></blockquote>`

  it('recognises the real arXiv abs page the user tried, DOI and all', () => {
    const found = extractCitation(pageWith(ARXIV_REAL), 'https://arxiv.org/abs/1706.03762')
    expect(found).toMatchObject({
      item_type: 'PREPRINT',
      issued_year: 2017,
      issued_date: '2017/06/12',
      // DOI 不是推出来的，是这一页自己在链接里写着的。
      doi: '10.48550/arXiv.1706.03762',
      container_title: null,
    })
    expect(found?.authors).toHaveLength(8)
    expect(found?.authors[0]).toBe('Vaswani, Ashish')
  })

  it('reads a DOI the page declares in a link, in the shapes publishers actually use', () => {
    const shapes: [string, string | null][] = [
      ['https://doi.org/10.1038/s42256-024-00812-x', '10.1038/s42256-024-00812-x'],
      ['http://dx.doi.org/10.1000/182', '10.1000/182'],
      ['https://DOI.org/10.1/UPPER', '10.1/UPPER'],
      ['https://doi.org/not-a-doi', null],
      ['https://example.com/10.1/x', null],
    ]
    for (const [href, expected] of shapes) {
      // 链接里的 DOI 只在页面**已凭强信号被认定为文献**时才取（见下一条用例），
      // 所以这里给一个期刊名。
      const page = `<a href="${href}">链接</a><meta name="citation_title" content="标题"/><meta name="citation_journal_title" content="某刊"/><p>x</p>`
      expect(extractCitation(pageWith(page), 'https://example.com/a')?.doi ?? null).toBe(expected)
    }
  })

  it('still calls an arXiv page a preprint when its DOI cannot be adopted', () => {
    // 第二轮 Review F6：上一版把预印本那一支挂在 `… || doi` 里面，于是没有可采纳 DOI 的
    // arXiv 页会掉到「其他」。最实际的例子就是**带 "Related DOI" 的 abs 页**——作者填了
    // 已发表的 DOI，页面上就有两条不同的 doi.org 链接，唯一性不成立、doi 取不到。
    const relatedDoi = `
      <meta name="citation_title" content="Attention Is All You Need"/>
      <meta name="citation_arxiv_id" content="1706.03762"/>
      <a href="https://doi.org/10.48550/arXiv.1706.03762">arXiv DOI</a>
      <a href="https://doi.org/10.5555/3295222.3295349">Related DOI</a>
      <p>正文</p>`
    const found = extractCitation(pageWith(relatedDoi), 'https://arxiv.org/abs/1706.03762')
    expect(found).toMatchObject({ item_type: 'PREPRINT', doi: null })

    // 连 DOI 链接都没有的 arXiv 页同样是预印本，不该落到「其他」。
    const noDoi = `
      <meta name="citation_title" content="某预印本"/>
      <meta name="citation_arxiv_id" content="2401.00001"/><p>x</p>`
    expect(extractCitation(pageWith(noDoi), 'https://arxiv.org/abs/2401.00001')?.item_type).toBe(
      'PREPRINT',
    )
  })

  it('never adopts a DOI that belongs to something else on the page', () => {
    // 第一轮 Review F1：维基条目、论文解读博客、期刊目录页的参考文献区里全是**别人的**
    // DOI。把第一个捡来当本页的 DOI，就是把别人作品的编号静默写进这份资料——而确认页
    // 默认勾选，用户看一串编号根本分辨不出。
    const encyclopedia = `
      <h1>Transformer（机器学习模型）</h1>
      <ol>
        <li><a href="https://doi.org/10.1038/s42256-024-00812-x">参考文献一</a></li>
        <li><a href="https://doi.org/10.48550/arXiv.1706.03762">参考文献二</a></li>
      </ol>
      <p>正文</p>`
    // 没有任何 citation_* / schema：整页根本不算文献。
    expect(
      extractCitation(pageWith(encyclopedia), 'https://wiki.example.org/Transformer'),
    ).toBeNull()

    // 弱信号（光有 citation_title）够格被认成文献，但**不够格**让我们认领一个链接里的 DOI。
    const weakWithLink = `
      <meta name="citation_title" content="我读《Attention Is All You Need》"/>
      <a href="https://doi.org/10.48550/arXiv.1706.03762">原文</a><p>正文</p>`
    const weak = extractCitation(pageWith(weakWithLink), 'https://blog.example.com/a')
    expect(weak).not.toBeNull()
    expect(weak?.doi).toBeNull()

    // 强信号但页面上有多个 DOI：到底哪个是自己的无从判断，一个都不取。
    const manyLinks = `
      <meta name="citation_title" content="某篇论文"/>
      <meta name="citation_journal_title" content="某某学报"/>
      <a href="https://doi.org/10.1/a">参考一</a><a href="https://doi.org/10.2/b">参考二</a>
      <p>正文</p>`
    expect(extractCitation(pageWith(manyLinks), 'https://journal.example.com/a')?.doi).toBeNull()

    // 同一个 DOI 出现多次（arXiv 就是链接文字与 href 各一处）仍算唯一。
    const repeated = `
      <meta name="citation_title" content="某篇论文"/>
      <meta name="citation_journal_title" content="某某学报"/>
      <a href="https://doi.org/10.1/a">10.1/a</a><a href="https://doi.org/10.1/a">再来一次</a>
      <p>正文</p>`
    expect(extractCitation(pageWith(repeated), 'https://journal.example.com/b')?.doi).toBe('10.1/a')
  })

  it('takes a bare citation_title as enough, the way Zotero does', () => {
    // Zotero 的 Embedded Metadata 就是这个门槛（`hwTypeGuess = journalArticle`）。我们只在
    // 类型上更保守：没有别的信号时判 OTHER，因为类型会直接显示在确认页的卡片上。
    const bare = `<meta name="citation_title" content="某篇论文"/><meta name="citation_author" content="李维"/><p>x</p>`
    expect(extractCitation(pageWith(bare), 'https://repo.example.edu/1')).toMatchObject({
      item_type: 'OTHER',
      authors: ['李维'],
    })
  })

  it('pulls a blog-platform page back, but never one with a real journal signal', () => {
    // Zotero 的优先级：平台特征压得住「光有 citation_title 的猜测」，压不住明确的期刊信号。
    // 否则一个用 WordPress 搭的期刊站会被误伤。
    const weakOnBlog = `
      <meta name="generator" content="WordPress 6.5"/>
      <meta name="citation_title" content="我读了一篇论文"/>
      <p>正文</p>`
    expect(extractCitation(pageWith(weakOnBlog), 'https://blog.example.com/a')).toBeNull()

    const strongOnBlog = `
      <meta name="generator" content="WordPress 6.5"/>
      <meta name="citation_title" content="某篇论文"/>
      <meta name="citation_journal_title" content="某某学报"/>
      <p>正文</p>`
    expect(extractCitation(pageWith(strongOnBlog), 'https://journal.example.com/a')).toMatchObject({
      item_type: 'JOURNAL_ARTICLE',
      container_title: '某某学报',
    })

    // Yoast 与 WordPress 的块样式同样算平台特征（照 Zotero 的那三条）。
    const yoast = `<div class="yoast-schema-graph"></div><meta name="citation_title" content="随笔"/><p>x</p>`
    expect(extractCitation(pageWith(yoast), 'https://blog.example.com/b')).toBeNull()
    const wpCss = `<link id="wp-block-library-css"/><meta name="citation_title" content="随笔"/><p>x</p>`
    expect(extractCitation(pageWith(wpCss), 'https://blog.example.com/c')).toBeNull()
  })

  it('maps the rest of the Highwire signals the way Zotero does', () => {
    const cases: [string, string, string | null][] = [
      ['citation_conference_title', '某某会议', 'CONFERENCE_PAPER'],
      ['citation_dissertation_institution', '某某大学', 'THESIS'],
      ['citation_technical_report_institution', '某某研究所', 'REPORT'],
      ['citation_book_title', '某某手册', 'BOOK_CHAPTER'],
    ]
    for (const [tag, value, type] of cases) {
      const page = `<meta name="citation_title" content="标题"/><meta name="${tag}" content="${value}"/><p>x</p>`
      expect(extractCitation(pageWith(page), 'https://example.com/a')?.item_type).toBe(type)
    }
    // 学位论文与报告的机构进「出版方」——契约里没有单独的机构字段。
    const thesis = `<meta name="citation_dissertation_institution" content="某某大学"/><p>x</p>`
    expect(extractCitation(pageWith(thesis), 'https://example.edu/t')?.publisher).toBe('某某大学')
    // 但 `citation_dissertation_name` 是**论文名**不是机构：它只作类型信号，填进出版方
    // 会污染字段（第一轮 Review F4）。
    const named = `<meta name="citation_dissertation_name" content="论某某问题的研究"/><p>x</p>`
    const found = extractCitation(pageWith(named), 'https://example.edu/n')
    expect(found?.item_type).toBe('THESIS')
    expect(found?.publisher).toBeNull()
  })

  it('calls a DOI without a journal on arxiv.org a preprint, and does not guess elsewhere', () => {
    const arxiv = `<meta name="citation_doi" content="10.48550/arXiv.2403.01234"><p>x</p>`
    expect(extractCitation(pageWith(arxiv), 'https://arxiv.org/abs/2403.01234')?.item_type).toBe(
      'PREPRINT',
    )
    // 同样的标签换个域名就不是预印本了——域名是这条推断的唯一依据，别处一律按期刊论文。
    expect(extractCitation(pageWith(arxiv), 'https://example.com/paper')?.item_type).toBe(
      'JOURNAL_ARTICLE',
    )
  })

  it('accepts a page that only says so in JSON-LD, and survives a broken block next to it', () => {
    const jsonld = `
      <script type="application/ld+json">{ 这不是 JSON </script>
      <script type="application/ld+json">{"@graph":[{"@type":"ScholarlyArticle"}]}</script>
      <meta name="dc.creator" content="张三">
      <meta name="dc.date" content="2019-06">
      <p>正文</p>`
    const found = extractCitation(pageWith(jsonld), 'https://example.org/a')
    // schema.org 明说是论文：既然这条声明足以让卡片显示出来，类型上也该信它，
    // 而不是一边用它放行、一边判成「其他」。
    expect(found).toMatchObject({
      item_type: 'JOURNAL_ARTICLE',
      authors: ['张三'],
      issued_year: 2019,
    })
    expect(found?.issued_date).toBe('2019-06')
  })

  it('does not let a DC-declaring CMS page pass as a journal article', () => {
    // `dc.source` 在 DC 规范里常是站点名甚至一段网址。把它当「期刊名」的话，任何声明了
    // DC 的普通页面都会被判成期刊论文、出处显示成一段地址（Review F3）。
    const cms = `
      <meta name="dc.title" content="公司新闻">
      <meta name="dc.source" content="https://news.example.com">
      <meta name="dc.creator" content="编辑部">
      <p>正文</p>`
    expect(extractCitation(pageWith(cms), 'https://news.example.com/a')).toBeNull()
  })

  it('calls a chapter a chapter, since the contract has a type for it', () => {
    const chapter = `
      <meta name="citation_inbook_title" content="深度学习导论">
      <meta name="citation_author" content="李维">
      <p>正文</p>`
    const found = extractCitation(pageWith(chapter), 'https://books.example.com/c/3')
    expect(found).toMatchObject({ item_type: 'BOOK_CHAPTER', container_title: '深度学习导论' })
  })

  it('leaves an ordinary blog alone, even when it has an author and a date', () => {
    // 门槛就在这里：没有 DOI、没有期刊名、schema.org 也没说它是论文。多数网页是这样，
    // 给它们摆一块空卡片只会让用户学会无视这一块。
    const blog = `
      <meta name="author" content="某人">
      <meta name="dc.creator" content="某人">
      <meta name="dc.date" content="2026-01-02">
      <script type="application/ld+json">{"@type":"BlogPosting"}</script>
      <article><p>今天读了一篇论文。</p></article>`
    expect(extractCitation(pageWith(blog), 'https://example.com/blog/x')).toBeNull()
  })

  it('cuts oversized values down to the contract limits instead of shipping them', () => {
    const huge = `
      <meta name="citation_journal_title" content="${'期'.repeat(600)}">
      <meta name="citation_doi" content="10.1/x">
      <meta name="citation_volume" content="${'1'.repeat(80)}">
      <meta name="citation_isbn" content="${'9'.repeat(40)}">
      <meta name="citation_publication_date" content="0999">
      ${Array.from({ length: 105 }, (_, at) => `<meta name="citation_author" content="作者${at}">`).join('')}
      <p>x</p>`
    const found = extractCitation(pageWith(huge), 'https://example.com/a')!
    expect([...found.container_title!]).toHaveLength(500)
    expect([...found.volume!]).toHaveLength(50)
    expect([...found.isbn!]).toHaveLength(32)
    expect(found.authors).toHaveLength(100)
    // 年份越界就是 null，而不是硬塞一个 999 让后端 422。
    expect(found.issued_year).toBeNull()
    expect(found.issued_date).toBe('0999')
  })

  it('rides along in the capture payload, and is null when the page is not a paper', () => {
    const paper = extractFromDocument(pageWith(HIGHWIRE), 'https://www.nature.com/articles/s42256')
    expect(paper.citation).toMatchObject({ doi: '10.1038/s42256-024-00812-x' })
    const plain = extractFromDocument(
      pageWith('<article><p>普通文章正文。</p></article>'),
      'https://example.com/a',
    )
    expect(plain.citation).toBeNull()
  })
})
