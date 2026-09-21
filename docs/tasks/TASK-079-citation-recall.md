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

TASK-075 的 Reviewer 与独立验收都把这条列成了剩余风险（原话：「arXiv abs 页若实际不发 `citation_doi`/JSON-LD，PREPRINT 分支在真实站点可能从不触发，仅用例内成立」），主 Agent 也写进了非阻断遗留——**但没有人去验证一个真实页面**。用户第一次实测就撞上了。教训记在这里：把「可能在真实站点不成立」写进遗留，不等于处置了它；当一个功能的价值完全取决于真实页面的形态时，用真实页面的标签集做夹具是**完成条件**，不是可选项。

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

### 主 Agent 登记的实现决定（非用户决定，Review 可挑战）

- **弱信号页面的类型判 `OTHER` 而不是像 Zotero 那样猜 `journalArticle`**：Zotero 猜错了用户在自己的库里改；我们这里类型会直接显示在确认页的卡片上，猜错比留空更刺眼。有明确信号时才给明确类型。
- **DOI 链接的识别规则**：`href` 指向 `doi.org`（含 `dx.doi.org`）且路径以 `10.` 开头时取其路径为 DOI。页面上多个时取第一个。
- **「往回拉」只压制弱信号**：与 Zotero 的优先级一致；否则一个用 WordPress 搭的期刊站会被误伤。

## 完成条件

- **`https://arxiv.org/abs/1706.03762` 的真实标签集**（仓库内夹具）被认成：类型 `PREPRINT`、8 位作者、年份 2017、DOI `10.48550/arXiv.1706.03762`（来自页面链接）。这条是本任务的验收锚点。
- 有期刊名的页面仍判 `JOURNAL_ARTICLE`；会议名→`CONFERENCE_PAPER`；`citation_inbook_title`/`citation_book_title`→`BOOK_CHAPTER`；`citation_dissertation_institution`→`THESIS`；`citation_technical_report_institution`→`REPORT`。各有用例。
- **假阳性反例**：WordPress/Blogger 特征 + 只有 `citation_title` → 不认（返回 `null`）；同样的平台特征 + 有 `citation_journal_title` → **照常认**（不被平台特征误伤）。两条都有用例。
- 普通网页（无任何 `citation_*`、无 DOI 链接、无 JSON-LD）仍返回 `null`。
- DOI 从 `doi.org` 链接读到，且 `dx.doi.org`、大小写、带查询串的形式都能认；非 `10.` 开头的不认。
- 契约第 14 节的门槛段落改写为实际实现（含「往回拉」规则与 DOI 来源）；第 14.4 节登记新增的 `version_name` 键。
- `version_name` 在构建产物里形如 `0.2.0+<短 SHA>`；取不到 git 时退化为 `0.2.0+dev`。manifest 顶层键白名单用例同步为十个键（这正是它存在的意义）。
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

- 实现 SHA：`730cc5f`（控制面登记 `76831a4`）。变更摘要：
  - **`doiFromLinks(doc)`（新）**：页面上任何指向 `doi.org`／`dx.doi.org`、路径以 `10.` 开头的链接即为该页声明的 DOI。arXiv 正是这一种（`<a id="arxiv-doi-link" href="https://doi.org/10.48550/arXiv.…">`）。坏地址跳过不中断。
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
- 新测试 7 条（extension 161 → **167**）与判别性：
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

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-21 用户实测 arXiv 未识别 → 要求调研 Zotero 并「保证效果」→ 主 Agent 实查 Zotero 三处源码与真实 arXiv 页面，确认 DOI 就在页面上、不联网不损失可存字段 → 用户确认要效果 → 登记 TASK-079。
<!-- EVIDENCE:END -->
