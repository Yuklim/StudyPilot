# DoCube 实现调研：全文搜索、定位链接、动态筛选与引用

## 1. 文档状态与结论

- 文档性质：`调研`，不是提案，也不是已生效的架构决定。
- 对应任务：TASK-100（只登记本文入库，不授权任何实现）。
- 触发来源：2026-10-25 用户提出「DoCube 跟我们挺像，看看异同」，随后要求「调研一下他们的全文搜索、定位链接、筛选、引用等功能具体是怎么实现的，我要学习一下」。
- 调研日期：2026-10-25。对象版本：DoCube for Mac **1.8.1（build 102）**，Mac App Store 安装，免费版。
- 生效条件：本文任何建议进入开发前，需另行登记任务、评估风险等级，并由用户确认产品范围。

### 1.1 一句话结论

DoCube 在这四块上的**设计思路**大多能直接借鉴，**实现方式**大多不必照搬：它是 Swift 原生 App，搜索引擎、向量库都是自研的；我们是 Python + SQLite，SQLite 自带的 FTS5（全文检索扩展）就能覆盖同样的需求。最值得学的四条设计在第 8 节：

1. 按标题把正文切成"文章"来建索引，命中能落到具体章节或页；
2. 每个块打一个稳定编号，链接、阅读位置、搜索高亮共用这一套编号；
3. 筛选视图只存条件，打开时重算；
4. 标注颜色存槽位号，不存色值。

### 1.2 证据等级

文中每条结论标注来源，区分三类：

| 标记 | 含义 |
| --- | --- |
| **【观察】** | 直接看到的：随包 JS 源码、本机索引文件与表结构、Info.plist、二进制里的字符串 |
| **【帮助】** | App 内置帮助文档的原文（`zh-Hans.lproj/Localizable.strings`）——是厂商对行为的自述，不是代码 |
| **【推断】** | 由以上证据推出、但没有直接看到代码执行的结论 |

## 2. 方法与边界

**做了什么（全部只读）：**

- 查看 `.app` 包结构、`Info.plist`、各模块资源包和动态库依赖（`otool -L`）；
- 读随包的网页层 JS。`DoHTML_DoHTML.bundle/Contents/Resources/html-doc.js` 由 esbuild 打包、**未压缩混淆**，第一方源码模块名都还保留着；
- 用 REA 的 SQLite 检查器读搜索索引库的表结构和抽样行；数据是先复制到临时目录再读的，没有打开 App 正在用的原文件；
- 在用户导入两份资料（一份 PDF、一份网页快照）并做了高亮之后，查看本机生成的索引文件和"文章"文件的**结构**；
- 从主程序二进制提取字符串，查找类型名、字段名和日志文本。

**没做什么：**

- **没有反编译 Swift 代码**。BM25 参数、加权数值这类只在代码里的细节不清楚（见第 10 节）。
- **没有解密任何文件**。DoCube 的 `.yd` 文件（标注、元数据、同步记录）信息熵约 7.94 bit/字节、不是 zlib 格式，【推断】是加密存储（随包有 swift-crypto）。绕过它的保护不在本调研范围内，标注的实际存储内容因此未知。
- **不搬代码**。DoCube 是闭源商业软件，本文只记录设计思路；StudyPilot 是 MIT 公开仓库，任何实现都应按我们自己的技术栈重写。
- 用户资料的**内容**不写进本文，只描述结构。

## 3. 整体架构速览

| 层 | DoCube 的做法 | 证据 |
| --- | --- | --- |
| 外壳 | Swift 原生 App，Mac / iPhone / iPad 共用代码（Info.plist 里同时有 UIKit 场景配置和 macOS 键） | 【观察】Info.plist |
| 主库 | Realm（移动端对象数据库），`persistence-realm/v1/persistence.realm` | 【观察】动态库 `RealmSwift.framework`、容器文件 |
| 每份文档的数据 | 一个目录放原件、封面、`.articles`，`assets/` 下按类型放 `pdf-annotations.yd`、`html-annotations.yd`、`read-progress.yd`、`review-cards.yd` 等 | 【观察】容器目录；字符串里的路径正则 |
| 多端同步 | Yjs（CRDT，可以自动合并多端修改的数据结构）。`.yd` 是 Yjs 文档，模块名 `DoYjs`；另有局域网直传（Bonjour 服务 `_do-llsync._tcp`）和 iCloud 容器 | 【观察】资源包 `DoYjs_DoYjs.bundle/doY.js`、Info.plist |
| 阅读器 | PDF【推断】是原生实现（`DoPDF` 模块，资源包里没有网页产物）；网页快照、EPUB、Markdown、MinerU、卡片、聊天都是**内嵌网页**（各自一个 Vite 产物），Swift 通过 `window.__docubeCallHandler[...]` 调 JS | 【观察】`DoCubeInternal/*/dist`、`html-doc.js` |
| 全文搜索 | 自研分段倒排索引（`DoSearch` 模块，`SearchEngineV2`） | 【观察】见第 4 节 |
| 语义搜索 | 自研向量库 `DoVectorDB`；本地模型通过 MLX 跑 Nomic Embedding，也可接云端（Gemini / 通义千问 / SiliconFlow） | 【观察】类型名与日志字符串 |
| 正文抽取 | `@mozilla/readability` + `@extractus/article-extractor`，HTML 解析用 cheerio / parse5 | 【观察】`html-doc.js` 模块注释 |

## 4. 全文搜索

### 4.1 索引的物理结构

【观察】索引目录是 `DoCubeInternal/search/v2/`：

```
search/v2/
├── global_terms.sqlite          全库词典 + 段登记
└── segments/
    └── seg_<文档ID>/            每份文档一个"段"
        ├── meta.json            {"version":3, "docHash":…, "articleCount":48, "termCount":6356}
        ├── terms.idx / terms.bin        该段的词表
        ├── postings.bin                 倒排表（词 → 出现在哪些文章）
        ├── positions.bin                词在文章里的位置（用于短语和邻近度）
        ├── articles.idx / articles.bin  文章正文
        ├── fields.bin
        └── docmap.json          文章 ID ↔ 段内序号
```

`global_terms.sqlite` 的四张表（REA Evidence `ev_503bef97…`、`ev_63febf83…`）：

| 表 | 字段 | 作用 |
| --- | --- | --- |
| `terms` | `token, cf, df, synonyms` | 全库词频统计：`cf` 是词在全库出现的总次数，`df` 是包含它的文档数，BM25 计算 IDF 要用 |
| `term_segments` | `token, docHash, cf, df, synonyms, postingsOffset/Length, positionsOffset/Length` | 某个词落在哪份文档的段里，去 `postings.bin` / `positions.bin` 的哪个偏移读多长 |
| `segment_fingerprints` | `docHash` + 各段文件的大小和修改时间 | 判断哪份文档的段已过期、需要重建 |
| `manifest` | `formatVersion=3, engineVersion=2, termCount, generatedAt` | 索引格式版本 |

**这个设计的要点**：每份文档的段是独立文件，增删、重建一份文档不碰其他文档；全库统计单独存在一个小 SQLite 里，查询时先查词典，再按偏移量直接读二进制段。思路和 Lucene 的分段索引一致。

### 4.2 检索单位是"文章"，不是整份文档

【观察】`docmap.json` 里的文章 ID 长这样：

```
type=html&docHash=<文档ID>&doIndex=432
type=pdf&docHash=<文档ID>&pageIndex=22
```

- **PDF：一页一篇文章**。实测 86 页的 PDF，`articleCount` 正好是 86。
- **网页快照：按标题切节**。`doIndex` 是该节标题所在块的编号，见第 5 节。实测一份网页切出 48 节。
- 这个 ID 本身就是一个位置描述（类型 + 文档 + 页或块），后面跳转用的就是它。

网页的切节逻辑在 `html-doc.js:35174`（`src/ArticleParser.ts`）【观察】：

1. 遍历正文，遇到 `h1`～`h6` 就开一节；按标题层级维护一棵树，每节记下 `titlePath`（如"第 2 章 > 2.3"）。
2. 每节保存 `content`（压平空白的纯文本）和 `domContent`（这段文本来自原 DOM 的哪个块、第几个文本节点）。
3. 结果以 JSON 存进文档目录下的 `<文档ID>.articles`，【推断】建索引和搜索结果上色都从这份文件读。

### 4.3 一个值得学的技巧：用哨兵字符在正文抽取中保住位置

【观察】正文抽取库（Readability / article-extractor）只输出干净的 HTML，**会丢掉原 DOM 的属性**，抽出来的文字就对不回原页面的哪个元素。DoCube 的办法：

1. 抽取前，在每个文本节点开头塞一段怪字符组成的哨兵：`√ç≈åœ∑®{块编号}_{文本序号}®∑œå≈ç√`。正常文章几乎不可能出现这种字符组合；
2. 抽取库会删属性、删元素，但不会改文字，哨兵跟着文字一起留下来；
3. 抽取完再用正则把哨兵读出来、去掉，就知道每段文字来自哪个块的第几个文本节点。

### 4.4 分词与词形

【观察】基于本机实际生成的词典（4295 个词，其中含汉字的 2479 个）：

- **中文按词切**，不是按单字或二元组切：含汉字的词里，2 字占 70%（1734 个），1 字 592 个，3 字 133 个，4 字 20 个。"模型""数据"这类常见词是一个词条。【推断】用的是系统 NaturalLanguage 框架的分词器（主程序链接了 `NaturalLanguage.framework`）。
- **停用词没有去掉**："的""与""从"都在词典里，而且是 df 最高的一批。
- **英文做了词形还原**：词条存原形，`synonyms` 列记下实际出现过的写法，例如 `adapt` → `["Adapting"]`、`algorithm` → `["Algorithms"]`、`apply` → `["applied"]`。所以 `synonyms` 不是同义词表，【推断】是用来在原文里找回实际写法、做命中高亮的。

### 4.5 排序：BM25 + 邻近度，与语义搜索做 RRF 融合

【观察】二进制字符串：`searchByBm25(searchText:maxArticleCount:config:)`、`bm25Score+proximity=`、`rrfScore`、`[SearchListView] embedding search fallback to BM25:`、类型 `BM25SearchResult`。

【推断】

- 关键词搜索用 BM25，再给"多个查询词在文中靠得近"的结果加分；
- 开了语义搜索时，向量检索和 BM25 两路结果用 **RRF**（Reciprocal Rank Fusion，按名次倒数相加来合并多路排序，不需要两路分数可比）融合；
- 向量那路失败（模型没下载、内存不够、云端凭证失效）时退回纯 BM25。

【帮助】标注参与排序，且按类型分档：

> 引用会出现在标注列表和全库搜索结果中。在各类标注中，引用属于搜索优先级最高的一组；相同关键词同时出现在普通正文和引用里时，DoCube 通常会优先展示你主动引用过的原句。

### 4.6 命中后怎么在原文上色

【观察】`html-doc.js:35741`（`mark-search-summary.ts`）：

1. 搜索结果带回该文章的 `domContent`（块编号 + 文本序号 + 文本）和命中字符区间；
2. 阅读器用 `[data-docube-index="块编号"]` 找到块，再数到第几个文本节点；
3. 已经有高亮包装的地方要拼回原文本节点（`virtualTextNodes`），才能数对；
4. 上色后滚到第一处命中。文档内搜索（`mark-in-document-search.ts`）复用同一套定位。

【帮助】PDF 结果显示页码；EPUB、HTML、Markdown 和 MinerU 结果显示匹配片段。选择结果后会跳到对应页面、章节或内容块，并临时高亮命中文字。

## 5. 定位链接

### 5.1 链接格式

【观察】Info.plist 注册了 URL scheme `docube`。二进制字符串和帮助里出现的形式：

```
docube://pdf/research-notes#12        PDF，# 后是页码（帮助示例）
docube://epub/...
docube://markdown/...
docube://mineru/...  （另见片段 #chunk=）
docube://search?text=...
docube://settings/annotation
```

【帮助】

> DoCube 文档地址可以只指向一份资料，也可以保留复制时的具体位置。PDF 会记录页面位置，EPUB 会记录阅读位置，Markdown 会记录段落，MinerU 会记录内容块，视频会记录播放时间。

因为是系统级 URL scheme，地址可以贴进 Obsidian 等外部笔记，点击后回到 DoCube。App Store 有用户评价专门夸这一点。

### 5.2 块编号：`data-docube-index`

【观察】导入网页时，DoCube 给**每个块级元素**盖上 `data-docube-index` 编号，并**写进保存下来的快照 HTML**。实测一份网页快照文件里有 2425 处。之后有三件事共用这一套编号：

| 用途 | 做法 | 位置 |
| --- | --- | --- |
| 链接跳转 | `location.hash = #编号`，再 `scrollIntoView({block:"center"})` | `html-doc.js:34116` `gotoDoIndex` |
| 记阅读位置 / 章节进度 | 滚动时（节流 500ms）取视口中心点的元素（`elementFromPoint`），找最内层带编号的块，再往前找它所属的标题 | 同上 `findLocation` |
| 搜索命中上色 | 见 4.6 | `html-doc.js:35741` |

### 5.3 跳转后的校正

【观察】`gotoDoIndex` / `gotoAnnotation` 滚完不是一次了事：每隔 30ms 检查"视口中心的元素是不是目标"，不是就再滚一次，最多 30 次；期间暂停记录阅读位置，免得把中途经过的位置记下来。**原因**：图片加载、公式和图表渲染会在滚动后撑高版面，第一次滚完的位置常常偏掉。

### 5.4 厂商自认的局限

【帮助】

> 目标资料被重新解析或大幅编辑后，原来的具体位置可能不再准确。Markdown 标题链接会随标题文字变化；自定义锚点只要名称和所在内容仍然保留，通常更适合作为长期入口。

## 6. 动态项目（筛选视图）

这一节**全部来自【帮助】**。Realm 里的规则数据没能读出，字符串里也没找到明显的规则类型名。

- **结构**：一个"项目"是一棵**集合树**，每个集合挂若干行条件。条件类型有：文档类型（可多选）、名称、标签、导入日期（如"导入日期 晚于 2026-01-01"）、阅读进度，以及排除条件。
- **组合语义**：

  > 同一集合中的多行条件需要同时满足；父集合与子集合的条件也需要同时满足。只有单个文档类型条件里选择的多个类型按"任意一种"处理。排除条件会在其他条件命中的结果中继续移除不需要的文档。

  标签多选时是"包含任意一个"。
- **只存条件，不存结果**：

  > 项目结果不是一次性保存的清单。给文档添加或移除标签、修改标题、导入新文档，或者继续阅读产生新的进度后，再次打开侧栏时，集合会按最新条件重新生成。

- **可调试性**：文档只列在最末一级集合下；每层集合都显示自己的命中数。没有结果时，可以从父集合往下逐层看是哪个条件卡得太严。
- 示例用法：父集合设"导入日期晚于本月 1 日"，下面分别建 PDF、EPUB、网页三个子集合。

## 7. 标注、引用与颜色

### 7.1 网页标注的锚点：EPUB CFI

【观察】`html-doc.js:32110`（`epub-cfi`）与 `:32695`（`html-annotation`）。网页快照上的标注位置用 **EPUB CFI** 表示，形如 `epubcfi(/6/4!/4/2,/1:10,/3:5)`，本质是"从根到节点的子元素序号路径 + 文本内字符偏移"。`rangeToCfi` 负责编码，`cfiToRange` 负责解码，`AnnotationManager.addAnnotation(record)` 用 `record.cfi` 还原选区并上色。

【观察】上色方式是**往 DOM 里插包装元素**（`<domark>`，带 `data-annotation-id`）。这会改变后面兄弟节点的序号，后加的标注地址就算错了。所以计算 CFI 路径时会：

- **跳过自己插入的标注元素**，不计入子元素序号；
- 用标注元素上的 `data-origin-text-index`、`data-origin-text-content` 把被切开的文本节点**换算回原始的那一个**；
- 带 `data-cfi-ignore` 的元素（App 自己加的界面元素）也跳过。

【观察】高亮、下划线、引用、带图标的标注（链接 / Markdown 笔记 / 卡片）分别是 `MarkAnnotation`、`UnderlineAnnotation`、`QuoteAnnotation`、`IconAnnotation` 四个类，共用一个基类。

【观察】PDF 标注相关的字段名有 `pageIndex`、`startIndex`、`endIndex`、`colorIndex`、`excerptText`，【推断】PDF 标注按"页 + 页内文本起止序号"定位。实际内容在加密的 `pdf-annotations.yd` 里，未读到。

### 7.2 颜色存的是槽位号

【观察】字段名是 `colorIndex`、`colorSlots`。【帮助】

> 标注保存的是颜色槽编号，而不是创建时的固定 RGB 颜色。因此，把第三个槽位从青色改成紫色后，所有使用第三个槽位的现有标注都会显示成紫色……标注类型、原文范围、笔记和链接不会改变。

### 7.3 引用

- 【帮助】引用"用于保留原作者的原句和准确位置，不会另外创建一份可编辑的附属文档。需要表达自己的理解时，应使用 Markdown 标注"。也就是说，"引用"和"写心得"是两种不同意图，分开建模。
- 【观察】有独立的 Realm 类型 `DocumentQuoteObj`。
- 【帮助】首页"贴士"取自你保存的引用，点击回到来源文档的准确位置；搜索时引用排在最前（见 4.5）。

### 7.4 标注进复习

【帮助】高亮、引用等普通标注按"类型 + 颜色"规则自动进入回顾。回顾页显示原文和标注上下文，不会凭空生成问答；规则开启"选区遮挡"时，先盖住原文，点开后才能评难 / 中 / 易。

## 8. 对照 StudyPilot：可借鉴什么

| 方面 | DoCube | StudyPilot 现状 | 借鉴建议 |
| --- | --- | --- | --- |
| 全文搜索 | 自研分段倒排索引，正文、标注、笔记、卡片全覆盖 | 只搜标题、来源名称、保存原因（README「已知边界」） | **用 SQLite FTS5，不自研**。见 8.1 |
| 检索单位 | 网页按标题切节，PDF 按页 | 无 | 照做：快照按标题切节，PDF 按页 |
| 块编号 | 每个块盖 `data-docube-index`，写进快照 | 无；高亮用"原文 + 前后文 + 偏移"分层锚点 | 渲染快照时按块序号生成编号，**不必写回快照**，见 8.2 |
| 高亮锚点 | EPUB CFI（DOM 路径 + 偏移），单层 | `exact` + `prefix`/`suffix` + 偏移，分层重定位（契约 §4.15） | **我们的更稳**，不改。DOM 一变 CFI 就失效，这是 DoCube 帮助里自认的局限 |
| 高亮上色 | 往 DOM 插 `<domark>`，算路径时要补偿 | CSS Custom Highlight API，不动 DOM | 我们不需要它那套补偿逻辑 |
| 颜色 | 存槽位号 | `color` 是四色枚举（TASK-093） | 把枚举当槽位用，渲染时查表；以后若允许自定义颜色，只改表不改数据 |
| 筛选 | 集合树，只存条件 | 筛选条件写进 URL | "保存视图"就是存一条查询串，见 8.3 |
| 引用回显 | 首页贴士随机展示引用 | 无 | 概览页随机回显一条高亮，成本很低，见 8.4 |
| 链接 | `docube://` 系统 URL scheme | 无 | 站内地址即可（我们是本机网页应用），见 8.2 |

### 8.1 全文搜索：用 FTS5 实现同样的设计

DoCube 自研引擎是因为要跑在 iPhone 上、要配合 iCloud 增量同步。我们在桌面本机跑 SQLite，FTS5 已经提供 BM25（`bm25()` 函数）、短语查询和 `highlight()` / `snippet()`，没有理由自研。可借鉴的是建模方式：

- **索引单位**：一行一节（快照按标题切）或一页（PDF），带上资料 ID、节标题路径（`titlePath`）、块编号或页码；
- **标注和心得另建一张索引**，查询时与正文结果合并，标注、心得的权重更高（对应 DoCube 引用优先的策略）；
- **中文分词**是主要难点：FTS5 自带的 `unicode61` 不切中文。可选方案：`trigram` 分词器（零依赖，但查询词少于 3 个字时搜不到）；或在 Python 侧先用 jieba 之类切好词，再交给 FTS5。需要单独做一次小验证再定；
- **结果要能定位回原文**：返回块编号或页码加命中片段，阅读器据此跳转并临时上色。

### 8.2 块编号与站内定位链接

- 渲染 Markdown 快照时，按块的出现顺序给每个块级元素加 `data-block` 编号。快照冻结后，同样的渲染器产出同样的编号；只有换渲染实现时编号才会变，所以长期链接仍应优先指向高亮 ID（锚点是分层的，能重定位）。
- 站内地址可以是 `/resources/{id}#b=37`（块）、`#hl={高亮id}`（高亮）、`#page=12`（PDF 页）。复制出来就能贴进外部笔记，浏览器点开即跳转。
- 跳转后照 5.3 做几次校正：我们的网页阅读器有 KaTeX 公式和图片，同样会在滚动后撑高版面。

### 8.3 保存的筛选视图

资料库筛选已经写进 URL。保存视图 = 存"名称 + 查询串"，打开时原样套用，结果天然是最新的。是否需要 DoCube 那样的集合树、导入日期等新条件，等平铺版用起来再说。

### 8.4 引用回显

概览页随机取一条带原文的高亮，点击跳回资料的对应位置（复用 8.2 的链接）。这不需要复习系统，就能起到"找回"的作用；是否另设"引用"这一种类型，属于产品决定，本文不替用户做。

## 9. 不建议照搬的

- **自研倒排索引和向量库**：维护成本高，FTS5 已经够用；语义搜索按需求说明属于后续 AI 扩展。
- **把 CFI 当唯一锚点**：比我们现有的分层锚点更脆弱。
- **往 DOM 里插标注元素**：我们已经用 CSS Custom Highlight API 绕开了这个问题。
- **视频、EPUB、OCR、多端同步、全文翻译**：都是大块功能，需求说明（§2、§3）明确不能因为别人有就排进开发。

## 10. 未解决问题

| 问题 | 为什么没答案 | 要回答需要什么 |
| --- | --- | --- |
| BM25 的 k1 / b 参数、邻近度加分公式、标注分档的具体权重 | 只在 Swift 代码里 | 反编译主程序（51 MB，arm64） |
| 标注、元数据的实际存储内容 | `.yd` 文件是加密的 | 不做：绕过加密不在调研范围 |
| 动态项目规则的数据结构 | Realm 文件里没找到明文类型名 | 反编译，或 Realm Studio 读库（若未加密） |
| 停用词保留在索引里，是否在查询时另作处理 | 只看到了索引侧 | 反编译查询路径 |
| 向量库的索引结构（是否 HNSW） | 只看到 `GraphBuildService`、`ShardedRuntime` 等类型名 | 反编译 |

## 附：证据位置

| 证据 | 位置 |
| --- | --- |
| 包结构、URL scheme、Bonjour 服务、iCloud 容器 | `/Applications/DoCube.app/Contents/Info.plist` |
| 网页层第一方源码（切节、哨兵、块编号、跳转、搜索上色、CFI、标注类） | `DoHTML_DoHTML.bundle/Contents/Resources/html-doc.js`：`src/const.ts` 34107、`src/ArticleLocatorLocator.ts` 34116、`src/ArticleParser.ts` 35174、`src/mark-search-summary.ts` 35741、`src/mark-in-document-search.ts` 35835、`epub-cfi` 32110、`html-annotation` 32695（行号对应 1.8.1） |
| 搜索索引表结构 | `~/Library/Containers/com.zhaowei.DoCube/Data/Library/DoCubeInternal/search/v2/global_terms.sqlite`；REA Evidence `ev_503bef978e32…`（空库表结构）、`ev_63febf83fbe7…`（有数据后 `terms` 抽样） |
| 段文件、文章 ID 格式 | 同目录 `segments/seg_<文档ID>/meta.json`、`docmap.json` |
| 文章文件 | `~/Library/Containers/com.zhaowei.DoCube/Data/Documents/docube/documents/<前缀>/<文档ID>/<文档ID>.articles` |
| BM25 / RRF / 向量库 / 字段名 | 主程序 `Contents/MacOS/DoCube` 的字符串 |
| 帮助原文 | `Contents/Resources/zh-Hans.lproj/Localizable.strings` |
