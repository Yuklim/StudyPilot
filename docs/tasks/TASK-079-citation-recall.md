# TASK-079：文献识别照 Zotero 的口径重做（arXiv 认不出的修复）＋ 扩展版本可判断

```toml
schema_version = 2
id = "TASK-079"
status = "IN_REVIEW"
risk = "L3"
risk_reason = "改的是写进契约第 14 节的识别门槛（TASK-075 定的那一条），以及第 14.4 节描述的 manifest 顶层键集合（新增 version_name）。两处都落在 docs/contracts/**，命中 risk-policy.json 的 high_risk_paths，属公共契约改动，取最高定 L3：1 Worker → 自动检查 → 独立只读 Reviewer → 独立只读 Integration/Acceptance。门槛放宽会直接改变「哪些页面被当成文献」，误判的代价由用户承担（每篇博客都弹卡片），因此假阳性的反例用例是硬完成条件。"
risk_flags = ["public-api", "architecture"]
owner = "coordinator"
base = "327d2d68df130c2ff281141f0c1c8425ca7601f9"
allowed_paths = [
  "extension/src/injected/extract.ts",
  "extension/src/injected/extract.test.ts",
  "extension/src/manifest.ts",
  "extension/src/manifest.test.ts",
  "extension/vite.config.ts",
  "docs/contracts/API与数据契约基线.md",
  "docs/开发与运行.md",
  "docs/tasks/TASK-075-extension-citation.md",
  "docs/tasks/TASK-079-citation-recall.md",
  "docs/tasks/任务索引.md",
]
checks = ["contracts"]
```

## 需求与范围

### 用户授权

2026-09-21 用户合并 PR #86 后按主 Agent 的请求做了人工验证：打开 `https://arxiv.org/abs/1706.03762` 点扩展图标，**没有出现文献信息那一块**。用户随后要求「搜集一下 zotero 的插件是怎么识别的，要保证效果」，并在看过调研结果后对「不调 arXiv API 有什么影响」追问，明确「**我只要保证效果的做法**」。

### 这次事故的根因（如实登记）

TASK-075 把识别门槛定成「有 DOI／有期刊会议名／schema.org 明说是论文」。而 arXiv 的 abs 页（实测 `1706.03762`）只发这些 meta：`citation_title`、`citation_author`×8、`citation_date`、`citation_online_date`、`citation_arxiv_id`、`citation_abstract`、`citation_pdf_url`——**没有 `citation_doi`，没有 `citation_journal_title`，没有 JSON-LD，没有 DC**。三条门槛一条不满足，于是返回 `null`。

TASK-075 的记录把这条列为**主 Agent 自己的非阻断遗留第 5 条**（`TASK-075-extension-citation.md:161`：「arXiv 的 PREPRINT 分支可能在真实站点从不触发……合并后人工试一次即可确认」），**没有人去验证一个真实页面**。用户第一次实测就撞上了。教训记在这里：把「可能在真实站点不成立」写进遗留，不等于处置了它；当一个功能的价值完全取决于真实页面的形态时，用真实页面的标签集做夹具是**完成条件**，不是可选项。

**更正（本任务独立验收 F-A1）**：本段原先写的是「TASK-075 的 Reviewer 与独立验收**都把这条列成了剩余风险**」并加了引号「原话」。**核实不实**——验收去 TASK-075 里查过：那句「原话」在该文件中不存在（grep 命中 0），该风险只出现在主 Agent 的遗留第 5 条且无归属标记；两轮 Review 与验收的原文要点从未提及「PREPRINT 在真实站点可能从不触发」，只提过**另一件事**（arXiv 域名正则不被 `evil-arxiv.org` 绕过）。这等于把旧审查的覆盖面说宽了，**而这句话恰好写在我批评自己「说得比证据宽」的那一段里**。归属已改正。

### 调研依据（Zotero，2026-09-21 实查）

Zotero 分层：站点专用翻译器 `100` → unAPI `300` → COinS `310` → DOI `320` → Embedded Metadata `400`（数字小的先用）。与本功能可比的是最后那层通用兜底：

- **门槛**：只要有 `citation_title` 就认（源码里 `hwTypeGuess = "journalArticle"`），**不要求** DOI 或期刊名。
- **类型信号**：`citation_journal_title`→journalArticle、`citation_conference_title`/`citation_conference`→conferencePaper、`citation_inbook_title`/`citation_book_title`→bookSection、`citation_dissertation_institution`→thesis、`citation_technical_report_institution`→report。
- **防误判不靠抬高门槛，靠往回拉**：检测到 `#wp-block-library-css`、`#wp-block-library-inline-css`、`.yoast-schema-graph`、或 `generator` 含 wordpress/blogger/wooframework 时判为 blogPost；优先级 `明确的 hwType > RDF > 光有 citation_title 的猜测 > 平台特征`——所以「只有 `citation_title` 的 WordPress 页」落回博客，而「有 `citation_journal_title` 的页」不受平台特征影响。
- **arXiv 它另有站点专用翻译器**，且**走网络**调 `export.arxiv.org/api/query`，并在无正式 DOI 时自行拼出 `10.48550/arXiv.<id>`。

### 不调 arXiv API 的影响（实测后的结论，写清楚免得下次再纠结）

把 API 能给的逐项对着真实页面查过：标题/作者/日期/摘要在 meta 里；**DOI 就写在页面上**（`<a id="arxiv-doi-link" href="https://doi.org/10.48550/arXiv.1706.03762">`），只是不在 meta 标签里；期刊出处（预印本后来发表时）在页面的 "Journal ref" 行；API 独有的只剩学科分类、Comments、版本历史——**这三样契约里都没有字段，存不下也用不上**。

结论：**不联网不损失任何我们存得下的东西**，并且 DOI 不需要推导。原先「要效果就得代页面生成数据」的两难是个伪两难，它来自我只看了 meta 标签、没看页面本身。

### 目标

1. **DOI 从页面声明处读**：页面上任何 `doi.org/10.…` 的链接即为该页声明的 DOI（不止 arXiv，很多出版社页面也这么展示）。仍然**不联网、不推导**。
2. **门槛照 Zotero 放宽**：有 `citation_title` 即认。
3. **照 Zotero 加「往回拉」**：认出博客平台特征时，**仅有弱信号**（光有 `citation_title`，没有期刊名/会议名/DOI/书名/学位论文/报告机构/schema 类型）的页面不认。强信号不受影响。
4. **类型映射补全**：会议论文、书章节、学位论文（`citation_dissertation_institution`，兼容已有的 `citation_dissertation_name`）、报告（`citation_technical_report_institution`）；有 `citation_arxiv_id` 且无期刊名 → 预印本。
5. **多读几个页面已声明的字段**：`citation_cover_date` 作为日期来源之一、`citation_book_title` 作为出处、学位论文/报告的机构填进出版方。
6. **夹具用真实页面的标签集**：arXiv `1706.03762` 的实际 meta 与 DOI 链接原样进用例；另造 WordPress 博客的反例。
7. **扩展版本可判断**：manifest 增加 `version_name`，构建时注入 commit 短 SHA（Chrome 扩展详情页直接显示）。起因是用户 2026-09-21 问「还是 0.2.0 版本，为什么重新加载更新不了」——版本号写死不动，导致「我装的是哪一版」根本无法回答。
8. 顺带把 **TASK-075 登记为 MERGED**（用户 2026-09-21 合并 PR #86，merge `327d2d6`）。

### 非目标 / 禁止范围

- **不联网**：不调 arXiv API、不查 Crossref、不做 DOI 解析。理由见上，实测后确认不损失可存字段。
- **不做 unAPI / COinS / 正文里找 DOI**：Zotero 有这三层，本次只做 Embedded Metadata 那一层的对齐。记为后续。
- 不做站点专用识别（Zotero 有 600+ 个翻译器，成本不成比例）。
- 不改后端、`/api/v1`、数据库、前端确认页与资料页（本次只动扩展与契约）。
- 不改 `CapturedCitation` 的字段集与上限（TASK-075 刚定，四处一致性已由独立验收逐字核过）。
- 所有未列入 `allowed_paths` 的路径。

### 依赖与并行

依赖：TASK-075 已合并（merge `327d2d6`）。基线即 `327d2d6`。
并行：否。本任务持有 `docs/tasks/任务索引.md`。

### 范围修订（ACCEPTED 之后、合并之前，用户明确指令，写入前登记）

2026-09-21 用户在 Edge 里更新扩展后反馈「页面上还是显示 0.2.0」，随后给出明确指令：**「采用 以后更新完版本后点击更新就能更新版本的设计」**。

起因与判断：`version_name` 按 Chrome 官方文档是「有则替代 `version` 显示」，但**用户用的是 Edge，其扩展页是 Edge 自己的 UI，是否显示该字段我没有验证过**——我照 Chrome 文档设计却没在用户实际使用的浏览器上确认，这是本次要修正的疏忽。用户要的是**不依赖任何浏览器 UI 细节**的办法：版本号本身每次构建都变。

做法：`version` 字段构建时注入**提交数**作为第四段（`git rev-list --count HEAD`，当前 628 → `0.2.0.628`）。它单调递增、每提交一次必变，且符合 Chrome/Edge 对 `version` 的格式要求（至多四段整数、每段 0–65535）。`version_name` 保留并携带短 SHA 与 `-dirty`，作为更精确的标识。

**本任务已是 ACCEPTED，此修订形成新候选**：状态回到 IN_REVIEW，按 AGENTS.md 第 6 节请同一 Reviewer 做 `previous_candidate..new_candidate` 增量验证，并请独立验收重新确认覆盖最终候选。

**完成条件随之变更**（独立验收 F-A2 裁定必须改）：原第 7 条写的是「`version_name` 形如 `0.2.0+<短 SHA>`」，与本次产物不符。冻结区不等于不可改——**用户明确指令 + 写入前登记的范围修订就是改它的合法途径**，但不得借证据区写回改它。第 7 条已在「完成条件」一节就地改写并标注依据。

**口径说准**（独立验收指出）：决定是在写入前作出的，但**控制面登记提交 `a7a8908` 在实现提交 `4267123` 之前**——两者都在本次修订内，字面上看不出先后的疑虑到此说明。

### 主 Agent 登记的实现决定（非用户决定，Review 可挑战）

- **弱信号页面的类型判 `OTHER` 而不是像 Zotero 那样猜 `journalArticle`**：Zotero 猜错了用户在自己的库里改；我们这里类型会直接显示在确认页的卡片上，猜错比留空更刺眼。有明确信号时才给明确类型。
- **DOI 链接的识别规则**：`href` 指向 `doi.org`（含 `dx.doi.org`）且路径以 `10.` 开头时取其路径为 DOI。页面上多个时取第一个。
- **「往回拉」只压制弱信号**：与 Zotero 的优先级一致；否则一个用 WordPress 搭的期刊站会被误伤。
- **用提交数而不是时间戳或自增文件做第四段**：提交数由仓库历史唯一决定，不依赖构建时钟、不需要维护额外的计数文件，且天然单调。代价是**同一提交重复构建时版本不变**（此时靠 `version_name` 的 `-dirty` 与 SHA 区分），以及**不同分支的提交数可能相同**。

## 完成条件

- **`https://arxiv.org/abs/1706.03762` 的真实标签集**（仓库内夹具）被认成：类型 `PREPRINT`、8 位作者、年份 2017、DOI `10.48550/arXiv.1706.03762`（来自页面链接）。这条是本任务的验收锚点。
- 有期刊名的页面仍判 `JOURNAL_ARTICLE`；会议名→`CONFERENCE_PAPER`；`citation_inbook_title`/`citation_book_title`→`BOOK_CHAPTER`；`citation_dissertation_institution`→`THESIS`；`citation_technical_report_institution`→`REPORT`。各有用例。
- **假阳性反例**：WordPress/Blogger 特征 + 只有 `citation_title` → 不认（返回 `null`）；同样的平台特征 + 有 `citation_journal_title` → **照常认**（不被平台特征误伤）。两条都有用例。
- 普通网页（无任何 `citation_*`、无 DOI 链接、无 JSON-LD）仍返回 `null`。
- DOI 从 `doi.org` 链接读到，且 `dx.doi.org`、大小写、带查询串的形式都能认；非 `10.` 开头的不认。
- 契约第 14 节的门槛段落改写为实际实现（含「往回拉」规则与 DOI 来源）；第 14.4 节登记新增的 `version_name` 键。
- **（本条随 2026-09-21 的范围修订改写；改它的依据是用户明确指令 + 写入前登记，见「范围修订」一节。独立验收裁定：不改就会留下一条与产物不符的验收锚点。）** 构建产物的 `version` 为 `0.2.0.<提交数>`；提交数取不到、非数字、带前导零或越界（>65535）时退回 `0.2.0`。`version_name` 为 `<version>+<短 SHA>`，工作区有未提交改动时带 `-dirty`，取不到 git 时退化为 `<version>+dev`。manifest 顶层键白名单用例同步为十个键（这正是它存在的意义）。
- `docs/开发与运行.md` 写明怎么判断 Chrome 里装的是哪一版。
- `check_task.py` 必要检查 PASS（extension + contracts）。
- L3：独立只读 Reviewer 审最终 diff；独立只读 Integration/Acceptance 核完成条件与跨模块证据，**并重点核「真实页面夹具确实取自真实页面」**。

## 上下文包

- 调研：Zotero `Embedded Metadata.js`（门槛、HIGHWIRE_MAPPINGS、blogPost 启发式、优先级）、`arXiv.org.js`（走 API、拼 DOI）、[翻译器优先级](https://www.zotero.org/support/dev/translators/priority)。
- 实测：`https://arxiv.org/abs/1706.03762` 的 meta 标签集与 `#arxiv-doi-link`（2026-09-21 取样）。
- 既有实现：`extension/src/injected/extract.ts` 的 `extractCitation`（TASK-075）、`extension/src/manifest.ts` 与 `vite.config.ts` 的 manifest 生成、`extension/src/manifest.test.ts` 的键白名单。
- 契约：第 14 节（`CapturedCitation` 与识别门槛）、第 14.4 节（扩展权限与 manifest 键）。
- 检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-079-citation-recall.md --worktree`。

## 实现与测试

> **读本节前先看这句**：下面「实现 SHA `730cc5f`」那一段记的是**第一候选**，其中 DOI 来源与测试条数已被后面两轮修正推翻/取代。**现行规则以契约第 14 节、以及本节末尾两轮修正为准。**

- 实现 SHA：`730cc5f`（控制面登记 `76831a4`）。变更摘要：
  - **`doiFromLinks(doc)`（新）**：页面上任何指向 `doi.org`／`dx.doi.org`、路径以 `10.` 开头的链接即为该页声明的 DOI。**⚠️ 这一条已被下文「第一轮 Review F1 的修正」推翻**，现行规则是「强信号前提 + 全页唯一」，读到这里请直接看下文。arXiv 正是这一种（`<a id="arxiv-doi-link" href="https://doi.org/10.48550/arXiv.…">`）。坏地址跳过不中断。
  - **`looksLikeBlog(doc)`（新）**：照搬 Zotero 的三条启发式（`#wp-block-library-css`、`#wp-block-library-inline-css`、`.yoast-schema-graph`）加 `generator` 含 wordpress/blogger/wooframework。
  - **门槛重写**：强信号（DOI／期刊会议书名／学位论文或报告机构／`citation_arxiv_id`／schema 类型）任一命中即认；弱信号（光有 `citation_title`）也认，但遇博客特征时被压制。**只压弱信号**——用 WordPress 搭的期刊站不受影响。
  - **类型映射补全**：会议论文、书章节（`citation_inbook_title`/`citation_book_title` 且无期刊名）、学位论文（机构或名称）、报告（机构）；有 `citation_arxiv_id` 或 arxiv 域名且无期刊名 → 预印本。学位论文/报告的机构填进出版方（契约里没有单独的机构字段）。
  - **`version_name`**：`manifest.ts` 新增字段与纯函数 `buildVersionName(commit?)`，`vite.config.ts` 构建时用 `git rev-parse --short HEAD` 注入；拿不到 git 退化为 `+dev`。实测构建产物为 `"version_name": "0.2.0+76831a4"`，与当时 HEAD 一致。
  - **契约**：第 14 节门槛段整段重写（强/弱信号、往回拉、DOI 来源、为什么不是更严的门槛）；第 14.4 节登记第十个键。`docs/开发与运行.md` 写明怎么判断装的是哪一版、以及 `relay.js` 需要刷新页面。
- **真实页面实跑验证**（本任务的验收锚点）：把 `https://arxiv.org/abs/1706.03762` 的**未经改动的原始 HTML**（43 KB，2026-09-21 取样）喂给 `extractCitation`，输出：
  ```json
  {"item_type":"PREPRINT","authors":["Vaswani, Ashish","Shazeer, Noam","Parmar, Niki","Uszkoreit, Jakob","Jones, Llion","Gomez, Aidan N.","Kaiser, Lukasz","Polosukhin, Illia"],"issued_year":2017,"issued_date":"2017/06/12","container_title":null,"volume":null,"issue":null,"pages":null,"publisher":null,"doi":"10.48550/arXiv.1706.03762","isbn":null}
  ```
  用例里的夹具是照这份真实页面**逐字抄的标签集**，并用上述实跑核对过一致（实跑脚本是临时的，跑完即删，未提交——真实页面是第三方内容，不进仓库）。

  **这条证据的口径，如实降级（第一轮 Review 的明确判断）**：实跑脚本已删、真实 HTML 不在仓库里，**Reviewer 与独立验收都无法复核它**，它是主 Agent 的证词而非可复核证据。仓库内的夹具只能支撑「给定这组标签 → PREPRINT/8 作者/2017/页面 DOI」，**不能独立支撑「arXiv 一定会被认出」**。因此「用户在 `arxiv.org` 上实测一次」是**合并后必须做的验证**，不是可选项——TASK-075 正是在同一环上翻的车。`version_name` 这次正好让「装的是哪一版」可确认。
- 新测试 7 条（extension 161 → **167**）与判别性（**条数已被后续两轮修正取代，最终为 169**，见下文各轮）：
  - 真实 arXiv 标签集 → PREPRINT/8 位作者/2017/DOI；
  - DOI 链接的五种形态（`doi.org`、`dx.doi.org`、大小写、非 `10.` 开头、非 doi.org 域名）；
  - 光有 `citation_title` 即认（类型 `OTHER`）；
  - 博客平台特征压制弱信号、但**有期刊名时照常认**（含 yoast 与 wp-block-library 两种特征）；
  - 会议/学位论文/报告/书章节四种信号的类型映射，以及机构填进出版方；
  - `buildVersionName` 的正常与退化（空、空白、`HEAD`、非 SHA 一律 `+dev`），并断言前缀与 `manifest.version` 同源。
  - **变异实测（4 个变异全被抓）**：把门槛改回 TASK-075 的写法 → 「光有 citation_title 即认」与类型映射两条红（**即 arXiv 会再次认不出**）；去掉页面 DOI 链接的读取 → 真实 arXiv 与 DOI 形态两条红；去掉博客往回拉 → 假阳性那条红；`buildVersionName` 不拼 SHA → 版本那条红。**更正（第一轮 Review F2）**：原先写成「`version_name` 不注入 SHA」不成立——变异点在 `manifest.ts` 的纯函数里，而 `vite.config.ts` 那行注入**没有任何用例覆盖**，删掉它全绿。构建产物是人工核对的。
- 命令与结果（本机 macOS 25.5.0，工作区在 `730cc5f`）：
  - `python3 scripts/governance/check_task.py --task docs/tasks/TASK-079-citation-recall.md --worktree` → **CHECKS PASS**（profiles=contracts,extension；`product_fingerprint=32dd2281…`；extension **167 passed**、lint/typecheck/format/build 全过；OpenAPI 模型校验通过）。
  - `npm run build`（extension）→ 产物 manifest 含 `"version_name": "0.2.0+76831a4"`。
  - **前端与 e2e 未重跑，理由如实说明**：本任务一行 `frontend/**` 都没改（`check_task` 的自动选组也只选了 contracts 与 extension），`CapturedCitation` 的字段集与上限一字未动，前端那份平行实现与确认页不受影响。
- 已知限制/未完成项：
  - **不做 unAPI / COinS / 正文里找 DOI**：Zotero 另有这三层（优先级 300/310/320），本次只对齐了 Embedded Metadata 那一层。
  - **不做站点专用识别**：Zotero 有 600+ 个站点翻译器，arXiv 的那个还走网络调 API；我们不出网也不做这层。后果是某些站点（尤其只在 HTML 表格里写元数据、既无 `citation_*` 也无 DOI 链接的老期刊站）仍认不出。
  - **类型判断比 Zotero 保守**：光有 `citation_title` 时它猜 journalArticle，我们判 `OTHER`（类型直接显示在确认页卡片上，猜错比留空刺眼）。
  - **`citation_arxiv_id` 本身没有存处**：契约的文献字段里没有 arXiv 编号字段，它只用于判类型。
  - 仍**没有真实扩展的端到端验证**（与 TASK-075 同）；本次的真实页面实跑只覆盖提取器这一层。

### 第一轮 Review F1–F4 的修正（第二候选）

结论 CHANGES_REQUIRED（1 条必须修），逐条核实后全部处置：

- **F1（必须修→已修，真缺陷，而且正是本任务唯一在意的那类）** `doiFromLinks` 把页面上**任何一条** `doi.org` 链接当成「本页自己的 DOI」，且该 DOI 单独就构成强信号。后果比空卡片糟得多：维基条目、论文解读博客、课程贴、期刊目录页的参考文献区里全是**别人的** DOI，页面会被判成 `JOURNAL_ARTICLE`，而确认页默认勾选，于是**一个合法但属于别人的 DOI 被静默写进这份资料**——用户看一串编号根本分辨不出。改为两条同时成立才取：① 页面已凭 meta 里的强信号被认定为文献（**链接不作认定依据**）；② 整页只有唯一一个 DOI（同一个出现多次仍算唯一）。arXiv 仍成立：`citation_arxiv_id` 是强信号，且其 abs 页**实测只有一条** `doi.org` 链接。新增反例用例四组（无 citation_* 的百科页整体不认／弱信号页不认领链接 DOI／强信号但多个 DOI 一个都不取／同一 DOI 重复出现仍算唯一），**变异实测**：去掉「唯一」这一条即红，让链接 DOI 重回强信号也即红。
- **F4（可记录→已修）** `citation_dissertation_name` 是**论文名**不是机构，却被当作 `thesisPlace` 填进了出版方。改为只作类型信号。**这条暴露了一个更值得记的问题**：我先改了代码却没有任何用例守着它，做变异实测时「把论文名重新拿去填出版方」**是绿的**——补了用例之后才变红。修了没用例 = 没修住。
- **F3（建议→已修）** 构建取 SHA 改用 `git describe --always --dirty --abbrev=7` 并丢掉 stderr：① 没有 git 时不再往构建日志里打 `fatal:`；② **脏工作区现在显示 `0.2.0+<sha>-dirty`**——否则「改了代码没提交就构建」会让版本名指向一个不含该改动的 commit，与这个字段的目的正相反。`buildVersionName` 接受 `-dirty` 后缀并补了用例。实测构建产物：`"version_name": "0.2.0+5abb598-dirty"`。
- **F2（可记录→已更正）** 记录里「`version_name` 不注入 SHA → 版本那条红」这句**不成立**：变异点在 `manifest.ts` 的纯函数里，而 `vite.config.ts` 的那行注入**没有任何用例覆盖**，删掉它全绿。已在实现记录里更正，并把「注入本身无自动化守卫、构建产物系人工核对」列入非阻断遗留。
- **契约同步**：DOI 来源段按新规则重写（强信号前提 + 唯一性），并补上 Reviewer 指出的三条实现细则（`www.doi.org`、arxiv 域名判预印本、机构填出版方而论文名不填）。
- **Reviewer 对两个关键问题的判断，如实记录**：
  - 第 1 点（假阳性）：「`citation_title` 作为弱信号**够强**……Ghost/Hugo 默认主题/Medium/知乎/微信公众号都不发 `citation_*`，所以『往回拉只覆盖三类特征』实际没有缺口。**真正的假阳性口子不在弱信号，在 F1。**」
  - 第 4 点（真实页面实跑）：「是**不可独立复核的口头证词**……夹具本身不能独立支撑『arXiv 会被认出』。可接受的口径是把它降级表述，并把『用户在 arxiv.org 实测一次』列为合并后必须做的验证。」——已照此改写实现记录里的那一段。
- 修正后重跑：`check_task.py --worktree` → **CHECKS PASS**（`product_fingerprint=3e632e2d…`；extension **168 passed**）。

### 第二轮 Review F6 的修正（第三候选）

结论 CHANGES_REQUIRED（1 条必须修）。Reviewer 先确认了 F1–F4 四条都真修住、四组反例与论文名那条均非恒真（并逐条给出了变异对照），然后抓到**我修 F1 时引入的回归**：

- **F6（必须修→已修，回归，且正落在本任务的目标页面族上）** 类型链的入口是 `says('scholarlyarticle') || journal || doi`，**`arxivId` 不在其中**。F1 把链接 DOI 收紧成「强信号前提 + 全页唯一」之后，「有 `citation_arxiv_id` 但没有可采纳 DOI」的页面就掉进了 `OTHER`。最实际的触发：**arXiv 上带 "Related DOI" 的 abs 页**——作者填了已发表的 DOI，页面上就有两条不同的 `doi.org` 链接，唯一性不成立、`doi` 为空，于是卡片显示「其他」且无 DOI。而我在同一轮刚写进契约的那句「有 `citation_arxiv_id` 或 arxiv 域名且无期刊名时判预印本」**实现并不成立**——契约说了实现没做，属不可让渡的那一类。已把预印本提成独立于 `doi` 的分支，补两条回归用例（带 Related DOI 的页、完全没有 DOI 链接的 arXiv 页），**变异实测**：挂回 `doi` 之下即红。
- **这条的教训**：`1706.03762` 只有一条 DOI 链接，所以夹具与我那次 `grep | sort -u | wc -l` 都测不到这一族——**用一个真实页面验证过，不等于验证过这一类页面**。
- **顺带处置的非阻断**：契约强信号清单补上 `citation_dissertation_name`（TASK-075 以来的既有行为，之前漏写）；记录里第一候选的两处旧描述（「任何 doi.org 链接即为本页 DOI」、测试条数 167）加了「已被后续修正推翻/取代」的指路，免得日后被当成现行规则读。
- **Reviewer 回答我点名的三个问题**，要点如实记录：
  - 新假阴：「出版社页基本都发 `citation_doi`，而 `declaredDoi` 优先、不受唯一性影响，损失仅限『无 `citation_doi` 又多 DOI』的罕见页，且只丢 DOI 字段、类型仍由 `journal` 决定。**真正的假阴不在那儿，在 arXiv 带 Related DOI 的那一族（F6）**。」
  - `Set` 去重：`http`/`https`、`www.`/`dx.` 差异不影响（只存 `pathname`）；**大小写会算成两个**，但失败方向是 fail-closed（取不到，不会取错）——列入非阻断遗留。
  - 四组反例与论文名那条：均非恒真。
- 修正后重跑：`check_task.py --worktree` → **CHECKS PASS**（`product_fingerprint=538bad82…`；extension **169 passed**）。

### 第三轮 Review 的三条可选建议（第四候选，全部采纳）

结论 PASS、覆盖最终候选；三条均标「可选」，但这个任务里我已经两次栽在「写了规则却没有守卫／说法比实现宽」上，所以全做了：

- **契约措辞**：第 14 节那句「有 `citation_arxiv_id` 或 arxiv 域名且无期刊名时判预印本」补上「**在会议名、书名、学位论文、报告这些更明确的出处信号之后**判」——实现里这几支确实排在预印本之前，原措辞严格读会与实现不符（触发需页面同时发会议名与 arXiv 标识，罕见，且结果更具体、不是降级）。
- **覆盖缺口**：契约写的是「arXiv **标识或**域名」，而两条新用例都同时具备二者，**「非 arxiv 域名 + `citation_arxiv_id`」（聚合站/镜像站形态）没有任何用例守着**。已补，**变异实测**：把判断改成只认域名、不认标识即红。
- **记录可读性**：在「实现与测试」小节开头加了一句总指路——第一候选那一段的 DOI 来源与测试条数已被后两轮推翻/取代，现行规则以契约第 14 节与本节末尾的修正为准。Reviewer 指出单看「强信号（DOI／…）」那一行仍可能被误读成含链接 DOI，这句话一次性封死。
- **Reviewer 对类型链新顺序的复核结论**（我点名请它挑战的）：「arXiv 镜像页带 `citation_journal_title` → `!journal` 为假 → 判期刊论文，**你的意图守住了**」；「`inbook && !journal` 在前、预印本在后**是对的**——会议/书章节/学位论文/报告都是页面明说的具体出处，比『默认算预印本』更具体」。
- 重跑：`check_task.py --worktree` → **CHECKS PASS**（`product_fingerprint=b3615ae7…`；extension **169 passed**）。

### 范围修订的实现（第五候选）

- 实现 SHA：`4267123`（控制面登记 `a7a8908`）。
  - **`buildVersion(commitCount?)`（新，纯函数）**：`0.2.0` + 提交数作为第四段。越界（>65535）、非数字、前导零、空值一律**退回三段**，不生成一个装不上的版本。
  - **`buildVersionName(commit?, commitCount?)`**：改为 `${buildVersion(count)}+${sha}`，于是两者一致（`0.2.0.629+a7a8908-dirty`）。
  - **`vite.config.ts`**：新增 `commitCount()`（`git rev-list --count HEAD`，同样丢 stderr、失败退化），构建时同时注入 `version` 与 `version_name`。
  - **实测构建产物**：`"version": "0.2.0.629"`、`"version_name": "0.2.0.629+a7a8908-dirty"`。
  - 契约第 14.4 节改写（两个字段各自的职责与「为什么两个都要」）、`docs/开发与运行.md` 改写判断办法（**看第四段那个数**，因为 Edge 不一定显示 `version_name`）。
- **实施中的一个自造错误，如实记**：给用例加导入时我用了个粗糙的字符串替换，把 `buildVersion` 插进了 `node:fs` 的导入里（`import { buildVersion, existsSync, readFileSync } from 'node:fs'`），运行时报 `buildVersion is not a function`。用例立刻红、当场改正。**更正（第五轮 Review 与独立验收各自独立指出）**：我原先写的是「typecheck 通过而运行时报错」——**那句是假的**。`extension/tsconfig.tools.json` 把 `src/**/*.test.ts` 纳入了 typecheck，我把坏导入放回去实测，`npm run typecheck` 确实报 `TS2305: Module '"node:fs"' has no exported member 'buildVersion'`。实情是**我当时只跑了 vitest、没跑 typecheck**。照原来的写法会让读者以为「测试文件的导入没有机器守着」，而事实相反。教训本身成立：批量文本替换改导入是危险动作，下次直接定位目标导入块。
- 新测试：`buildVersion` 的正常值、`0` 与 `65535` 两个合法边界、**九种**非法输入（空、空白、`undefined`、`65536`、`70000`、`abc`、`-1`、`1.2`、`0123`）一律退回三段，以及「源码里的 manifest 不带构建号、因此与 package.json 仍对得上」。`buildVersionName` 增加带构建号的组合断言。extension **169 → 170**。
- **前导零的更正（第五轮 Review）**：我原先声称「前导零判为非法」，但当时的正则 `/^[0-9]{1,5}$/` **只拦得住 6 位以上**，`0123` 会产出 `0.2.0.0123`——而 Chrome/Edge 的 `version` 段不接受前导零，那正是这个函数声称要避免的「装不上的版本」。实际不可达（`git rev-list --count` 不产出前导零），但**声称与实现不符、且该规则没有守卫**。已收紧为 `/^(0|[1-9][0-9]{0,4})$/`，用例里的 `012345` 换成 `0123`（原来那条是**因为长度**才退回的，挡不住这条规则）。
- **收紧时我又犯了一个错，如实记**：改正则时把 `Number(count) <= 65535` 的越界检查一并删掉了，`65536` 重新被放行——**用例当场变红**，已补回。两条检查现在各有变异实测：去掉前导零检查 → 红；去掉越界检查 → 红。
- 重跑：`check_task.py --worktree` → **CHECKS PASS**（`product_fingerprint=e6c94992…`；extension **170 passed**）。
- **这次修订的起因值得记在明处**：我照 Chrome 的文档设计了 `version_name`，却**没有在用户实际使用的浏览器（Edge）上验证**，于是用户点了更新仍看到 `0.2.0`。与本任务的主线缺陷（把「可能在真实站点不成立」写进遗留就算处置）是同一个毛病的两种形态：**文档说的不等于用户那里发生的**。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`5abb598` → `3b5cd8e` → `d102dc8` → `d270693` → **最终候选见本次写回的父提交**（本次写回只改文档，仅更正 F-A1 与填写本证据区）。
- 最终候选上的机械检查：`check_task.py --task … --worktree` → **CHECKS PASS**（profiles=contracts,extension；`product_fingerprint=b3615ae7…`；extension **169 passed**、lint/typecheck/format/build 全过、OpenAPI 校验通过）。四个候选的指纹互异，未拿旧 SHA 充数。**前端与 e2e 未重跑**：本任务一行 `frontend/**` 都没改；独立验收另行核过「前端侧确无识别门槛的实现」（grep `frontend/src/features/capture` 无 `citation_title`/门槛）与「产出的 8 种 item_type 均在前端枚举内」，并判定该口径可信。
- Review：独立只读 Reviewer（仅 Read/Grep/Glob、无 Bash），**四轮**：
  - 第一轮（`327d2d6..5abb598`）**CHANGES_REQUIRED**：F1 必须修——**`doiFromLinks` 把页面上任何一条 `doi.org` 链接当成本页 DOI，且单独构成强信号**，于是维基条目、论文解读博客、期刊目录页会被判成期刊论文并把**别人作品的 DOI** 静默写进资料（确认页默认勾选）。另有 F2（记录里一条变异表述不实）、F3（构建标记 dirty）、F4（论文名污染出版方）。
  - 第二轮（`5abb598..3b5cd8e`）**CHANGES_REQUIRED**：F6——**修 F1 时引入的回归**，预印本判断挂在 `doi` 之下，带 "Related DOI" 的 arXiv 页（两条 DOI 链接 → 唯一性不成立）会掉到 `OTHER`，而同轮写进契约的「有 arXiv 标识即判预印本」因此不成立。
  - 第三轮（`3b5cd8e..d102dc8`）**PASS**，3 条可选（契约措辞、聚合站形态无用例、记录旧描述易被误读），全部采纳。
  - 第四轮（`d102dc8..d270693`，结论覆盖 `327d2d6..d270693`）**PASS，No findings**。原文要点：
    > 「本轮没改产品代码」属实：`extract.ts:155-292` 与我在 `d102dc8` 读到的逐行一致……新断言非恒真……它也是**唯一**隔离「非 arxiv 域名 + 标识」这条路径的用例，缺口确实补上了。
- Acceptance：独立只读 Integration/Acceptance（**全新实例**，权限自述：仅 Read/Grep/Glob，无 Write/Edit/Bash）。首轮 **CHANGES_REQUIRED（仅 1 条，文字级；9 条完成条件本身全部满足）**：
  - **F-A1**：本记录「这次事故的根因」一节把「arXiv 可能不触发」这条风险说成「TASK-075 的 Reviewer 与独立验收都列成了剩余风险」并加了引号原话——**核不实**，该风险只是主 Agent 自己的遗留第 5 条。已更正，见该节末尾的「更正」段。
  - 对**第 1 点（真实页面实跑不可复核）**的判断：**接受降级表述，且不要求把真实页面副本入库**——「副本的出处同样只能靠证词，可验证性并未提高，还把第三方内容塞进公开仓」；但要求把「用户在 arxiv.org 实测一次」写进**需要用户操作**栏作为硬要求（已照办）。并给了旁证（非证明）：夹具的标题、8 位作者及顺序、v1 日期 2017-06-12、`citation_online_date` 2023-08-02、`10.48550/arXiv.` 前缀均与该论文的公开事实吻合。
  - 对**第 3 点（契约与实现逐条对照）**的判断：契约 `:875-895` 与 `extract.ts:206-292` **逐条一致**——强信号七项、弱信号、往回拉四特征仅压弱信号、链接 DOI 两条件、预印本独立于 `doi` 且排在会议/书章节/学位/报告之后、机构填出版方而论文名不填。**未发现实现宽于契约或契约宽于实现。**
  - 文件集 10 个全在 `allowed_paths`，无越界。
- 最终状态/风险/用户操作：**ACCEPTED**。L3 执行链走完（Worker → 自动检查 → 独立只读 Reviewer 四轮 → 独立只读 Integration/Acceptance）。风险：改的是写进契约的识别门槛，放宽方向由四组假阳性反例守着；`version_name` 只是人看的标识，不扩大任何授权面。**需要用户操作**：
  1. **合并 PR**；
  2. **（硬要求，不是可选）合并后在真网页上实测**：一篇普通 arXiv 论文（如 `1706.03762`）、**以及一篇标了 "Related DOI" 的 abs 页**。后者至今**只有推断与用例、没有真实页面证据**，而 F6 正是从这一族冒出来的。**确认装的是哪一版：看版本号的第四段** `0.2.0.<提交数>`（每提交一次必变，且每个浏览器都显示 `version`）。`version_name`（`0.2.0.<提交数>+<短 SHA>`，脏工作区带 `-dirty`）信息更全，但 **Edge 不一定显示它**——用户 2026-09-21 实测如此。
  3. **（硬要求）在 Edge 上点一次「重新加载」确认第四段真的变了**：这次修订的起因正是「照 Chrome 文档设计、没在用户实际使用的浏览器上验证」，所以「它在 Edge 上会不会变」目前**仍只有设计推理、没有实机证据**。
- 非阻断遗留项：
  1. **`version` 与 `version_name` 的构建注入都没有自动化守卫**：`vite.config.ts` 里那两行删掉后 **170 条全绿**，构建产物系人工核对（实测 `"version": "0.2.0.629"`、`"version_name": "0.2.0.629+a7a8908-dirty"`）。两个纯函数本身有用例，缺的是「构建真的调用了它们」这一层。**重评触发**：下次动 `vite.config.ts` 或这两个字段时补一条守卫。
  2. **DOI 去重不归一大小写**：同一 DOI 大小写不同会被算成两个，导致唯一性不成立而**取不到** DOI（fail-closed，不会取错）。**重评触发**：真实站点上出现这种写法。
  3. **`git describe --always` 在仓库打第一个 tag 后会返回 `v…-g<sha>` 形态**，不匹配 `buildVersionName` 的正则而静默退化成 `+dev`（退化可见、不影响构建）。**重评触发**：仓库打第一个 tag 时。
  4. **`www.doi.org` 与 `citation_cover_date` 写进了契约/实现但没有用例**。**重评触发**：下次动提取器时顺手补。（原先并列的「`开发与运行.md` 未说明 `-dirty`」已在本次修订中写明，此项消解。）
  5. **不做 unAPI / COinS / 正文里找 DOI**：Zotero 另有这三层（优先级 300/310/320），本次只对齐了 Embedded Metadata 那一层。
  6. **无真实扩展的端到端自动化**（沿袭 TASK-038/040/075）。
  7. **提交数超过 65535 时** `version` 会静默退回三段、「每提交必变」的性质随之消失（距今约 6 万次提交）。**重评触发**：提交数接近该上限时。
  8. **TASK-079 自己的 MERGED 登记**留给下一个任务（按用户 2026-09-20 的要求，登记类小活不单开 PR）。
- 日期与决定日志：2026-09-21 用户实测 arXiv 未识别 → 要求调研 Zotero 并「保证效果」→ 主 Agent 实查 Zotero 三处源码与真实 arXiv 页面，确认 DOI 就在页面上、不联网不损失可存字段 → 用户确认要效果 → 登记 TASK-079。
<!-- EVIDENCE:END -->
