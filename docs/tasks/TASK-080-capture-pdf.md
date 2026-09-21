# TASK-080：采集文献时直接抓 PDF，在站内阅读器里读

```toml
schema_version = 2
id = "TASK-080"
status = "IN_ACCEPTANCE"
risk = "L3"
risk_reason = "要给契约第 14 节的 CapturePayload 增加携带 PDF 的字段（两份平行实现 + 逐字比对守卫），并可能动第 14.4 节的 manifest 权限集合（`unlimitedStorage`）。改动落在 docs/contracts/**，命中 risk-policy.json 的 high_risk_paths；同时改变「采集一篇文献」这个核心动作的产物形态（WEB+快照 → FILE+原件），属跨模块的产品语义变化。取最高定 L3：1 Worker → 自动检查 → 独立只读 Reviewer → 独立只读 Integration/Acceptance。"
risk_flags = ["public-api", "architecture"]
owner = "coordinator"
base = "9bd2b41398fb01946d6a3e46411c0a0440aa6fcd"
allowed_paths = [
  "extension/src/injected/extract.ts",
  "extension/src/injected/extract.test.ts",
  "extension/src/injected/relay.ts",
  "extension/src/injected/relay.test.ts",
  "extension/src/shared/protocol.ts",
  "extension/src/shared/protocol.test.ts",
  "extension/src/popup/bridge.ts",
  "extension/src/popup/capture.ts",
  "extension/src/popup/capture.test.ts",
  "extension/src/popup/popup.ts",
  "extension/src/popup/popup.test.ts",
  "extension/src/manifest.ts",
  "extension/src/manifest.test.ts",
  "frontend/src/features/capture/protocol.ts",
  "frontend/src/features/capture/protocol.test.ts",
  "frontend/src/features/capture/CapturePage.tsx",
  "frontend/src/features/capture/CapturePage.test.tsx",
  "frontend/src/styles.css",
  "docs/contracts/API与数据契约基线.md",
  "docs/开发与运行.md",
  "docs/tasks/TASK-079-citation-recall.md",
  "docs/tasks/TASK-080-capture-pdf.md",
  "docs/tasks/任务索引.md",
  # 范围修订 1（2026-09-21，写入前登记）——见「范围修订」一节
  "extension/src/boundaries.test.ts",
  "extension/README.md",
  "extension/AGENTS.md",
  "README.md",
  # 范围修订 2（2026-09-21，首轮 Review F1 之后、写入前登记）
  "extension/src/popup/main.ts",
]
checks = ["frontend", "contracts"]
```

## 需求与范围

### 用户授权

2026-09-21 用户：「抓取文献 pdf 的时候不需要抓取原文页了，原文页一般都是对文献的描述，没用，只需要把 pdf 抓下来就行了。而且现在好像做的是点击链接跳转文献预览，zotero 做的是直接抓下来 pdf 在自己的阅读器里阅读。我们想要达到的也是这个效果。」

主 Agent 反问三点后，用户逐条定案：

1. **抓成 PDF 资料后来源地址会丢**（契约不允许 FILE 资料带 `source_url`）→ 用户：「**有了 pdf 就不用再要拔下来 pdf 那个网页了**」。
2. **PDF 拿不到时**（付费墙／403／超 25 MiB／下载到的是 HTML）→ 用户选「**退回存正文快照**」。
3. **摘要要不要单独保留** → 用户：「**不要，PDF 里就有**」。

随后用户补充：「关于权限授权，最好是能够点击一下就直接爬下来内容，**不需要做过多的点击授权，以体验为主**，如果违背了契约就尝试改契约。」

### 登记前已核实的事实（决定了方案形状）

- **arXiv 的 PDF 与摘要页同域**：实测 `citation_pdf_url = https://arxiv.org/pdf/1706.03762`，`sameOrigin: true`，在页面上下文里 `fetch` 得到 `200 / application/pdf / 2,215,244 字节 / %PDF- 开头`（真实 Edge，2026-09-21）。**注入脚本（点图标那一下已由 `activeTab` 授权）可以直接取到它，一次权限都不用要**——用户要的「点一下」在 arXiv 这条主路上不需要改权限姿态。
- 跨域的 PDF（出版社常把 PDF 放 CDN）受 CORS 管，注入脚本取不到；那条路要么走既有的可选 `<all_urls>` 权限（弹一次），要么按用户定的退回快照。
- **契约禁止 FILE 资料带 `source_url`**（第 502 行）；**FILE 资料恰好一个原件、且不可替换**（第 372 行）；单文件上限 **25 MiB**（第 583 行）。
- **文献信息对 FILE 资料可用**：`citation_store.require_resource` 允许 `source_type != 'FILE'` 或原件 READY，故 PDF 资料能带作者/年份/DOI。
- **暂存走 `chrome.storage.local`**（`bridge.ts`），MV3 默认配额 **10 MB**；base64 膨胀 4/3，故约 7 MB 以上的 PDF 会撑爆——见「待定的实现风险」。

### 目标

1. **认出文献且拿得到 PDF 时，采集产物是 FILE 资料**：原件就是那份 PDF，打开资料直接进站内 PDF 阅读器（TASK-073 交付的那个）。**不存页面正文、不存摘要、不留原页地址**——按用户定案。
2. **文献信息照常存**（作者/年份/DOI 等，TASK-079 的识别结果原样交给 `PUT /citation`）。
3. **一次点击、零额外授权**（同域 PDF 这条主路）：注入脚本在页面上下文直接取字节。
4. **拿不到 PDF 就退回现在的行为**（WEB 资料 + 正文快照 + 图片冻结），并在确认页上**说清这次为什么没拿到 PDF**（付费墙/太大/不是 PDF/跨域没授权）。
5. 确认页要让用户**看得出这次会存成什么**：是「PDF 原件」还是「网页正文」，并能改主意（至少能选择不抓 PDF 而存正文）。
6. 顺带把 **TASK-079 登记为 MERGED**（用户 2026-09-21 合并 PR #87，merge `9bd2b41`）。

### 非目标 / 禁止范围

- **不把 `<all_urls>` 改成安装时授予的永久权限**。用户说「违背契约就尝试改契约」，但那一条改的是**安全姿态**而不是体验细节：永久的全站读写权限换来的只是「跨域 PDF 不用弹一次授权」，而主路（arXiv 同域）本来就不需要授权。若将来确有需要，单独开任务、单独向用户说明代价。
- 不做 PDF 的文本抽取、不给 PDF 生成正文快照、不做 PDF 内的高亮（TASK-073 的非目标仍然有效）。
- 不改 PDF 阅读器本身、不改文献信息的字段集与上限、不改后端与迁移。
- 不做「直接在浏览器里打开一个 PDF 地址然后点采集」这条路（页面本身就是 PDF 时，注入脚本拿不到 DOM）——记为后续。
- 所有未列入 `allowed_paths` 的路径。

### 待定的实现风险（登记时写明，实现时必须实测并回写）

1. **暂存配额**：`chrome.storage.local` 默认 10 MB，base64 后约 7 MB 以上的 PDF 存不下。三条路——① 加 `unlimitedStorage` 权限（改 manifest 权限集合与契约 14.4；它**不授予任何站点访问权**，只是允许本机多存）；② 分块传输，不落存储；③ 限制只抓 ≤ 7 MB 的 PDF，超了退回快照。**倾向 ①**：它最简单，且不扩大对站点的任何权力；但必须在记录里说清它是一次权限集合变更。实现时先量真实论文的体积分布再定。
2. **跨窗口传输体积**：payload 经 `chrome.runtime` → `storage` → `postMessage` → 确认页，25 MiB 的 base64 约 33 MB。需实测这条链路扛不扛得住，扛不住则与上一条一并改为分块。
3. **上传路径**：确认页现在建的是 WEB 资料 + 快照；PDF 这条要改走 multipart 的 `uploadResource`。两条路在同一个页面里共存，失败处置（资料已建、原件没传上）要按该页既有的 partial 口径写清。

### 主 Agent 登记的实现决定（非用户决定，Review 可挑战）

- **PDF 在注入脚本里取，不经 service worker**：同域 fetch 不需要任何 host 权限，这是「点一下就好」的落点。SW 那条路只在跨域时才有意义，而跨域本就要授权。
- **只在「已识别为文献且有 `citation_pdf_url`」时才抓 PDF**：普通网页不该因为页面上有个 PDF 链接就被存成 PDF 资料。
- **抓到的字节必须自己校验是不是 PDF**（`%PDF-` 开头 + 媒体类型），不信服务器的 `Content-Type`——付费墙常常回 200 + 一页 HTML。
- **退回快照时也要把文献信息存下**：拿不到 PDF 不影响作者/年份/DOI 的价值。

### 范围修订 1（2026-09-21，实现中途、写入前登记）

实现到一半，`extension/src/boundaries.test.ts` 的两道门闩报警，二者都**报得对**：

1. **「扩展只有一个地方会主动发请求」**（门闩：`/background/` 之外不得出现 `fetch(`）。本任务
   的 `capturePdf` 有意把 fetch 放进注入脚本——那正是「点一下就好、零额外授权」的落点
   （同域 PDF 在页面上下文里不需要任何 host 权限）。**这不是绕开门闩，是这句承诺的口径
   真的变了**，必须同时改断言、改三处宣称，并在契约里写清新口径。
2. **「三处宣称必须点名 manifest 申请的每一项 reach」**。本任务给 `permissions` 加了
   `unlimitedStorage`（暂存 base64 后的 PDF，10 MB 默认配额不够），三处宣称还停在旧的三项。

因此把这四个路径加入 `allowed_paths`：门闩本身，以及它守着的三处宣称。

**改断言的边界（自缚）**：新口径不是「随便哪里都能发请求」，而是
**「注入脚本只能同域取这一页自己声明的 PDF、且不带凭证」**。门闩要比原来查得更细而不是更松——
除 `/background/` 外只放行 `injected/extract.ts` 这一个文件，且该文件必须同时满足：
只有一个 fetch 调用点、带同域判断、带 `credentials: 'omit'`。少任何一条都要红。
把门闩删掉或改成恒真，属 AGENTS.md §2 的「降低断言来通过检查」，不做。

**仍然不做的**：`<all_urls>` 依旧留在 `optional_host_permissions`，不变成安装时授予的永久权限
（见上面的「非目标」）。`unlimitedStorage` 与站点访问权无关，它只允许本机多存。

### 范围修订 2（2026-09-21，首轮 Review F1 之后、写入前登记）

Reviewer 指出一条真缺陷：popup 仍按 `payload.images.length > 0` 弹图片授权框，而确认页走 PDF 分支时
**在冻图之前就 return**，图片一张不碰。于是「既抓得到 PDF、正文里又有图」的页面会被要求授出
`<all_urls>`——**零收益**，还被告知「图片会在保存正文之后逐张下载」这件不会发生的事。

这直接违背本任务的完成条件「一次点击、无额外授权」与用户「不要过多点击授权、以体验为主」的定案。
实测确认不是理论问题：PLOS ONE 那一页 `images: 5` 且 PDF 抓取成功，正好踩中；
arXiv 图片数为 0，所以首轮端到端实测没暴露它。

修在哪：判断逻辑放进 `popup.ts`（可测的纯函数 `shouldAskAboutImages`），`main.ts` 只改一行接线——
因此需要把 `extension/src/popup/main.ts` 纳入 `allowed_paths`（它是 popup 的 DOM 接线入口，原本不在范围内）。

**取舍写明**：抓到 PDF 时不再问图片，于是用户若在确认页取消勾选、改存网页正文，那一次的图片会保留
原网站地址（与「拒绝授权」是同一条既有降级路径，不产生新形态）。确认页据此加一句说明。
反过来的做法——照问不误——要用户为几乎总是用不上的权限多点一次，与用户定案相反。

## 完成条件

- arXiv 这类同域 PDF：**一次点击、无额外授权**，产物是 FILE 资料，原件是那份 PDF，打开即进站内阅读器；文献信息一并存下。有用例。
- 拿不到 PDF 的四种情形（跨域无授权 / 403 或付费墙 / 超 25 MiB / 下载到的不是 PDF）各自退回快照，并在确认页说清原因。各有用例。
- 普通网页（未识别为文献）行为**与今天完全一致**，不因页面上存在 PDF 链接而改变。有用例。
- 确认页在保存前让用户看得出「这次会存成 PDF 原件还是网页正文」，且能选择不抓 PDF。
- 契约第 14 节同步新字段与「同域直取、跨域退回」的规则；若采用 `unlimitedStorage`，第 14.4 节同步权限集合并说明它不扩大站点权力。
- 两份平行实现的逐字比对守卫保持绿。
- `boundaries.test.ts` 的网络门闩改为「只放行注入脚本的同域无凭证取件」后仍能报警：删掉同域判断、
  或多加一个 fetch 调用点、或去掉 `credentials: 'omit'`，任一都要让它变红（实现时逐条验证）。
- 用真实 Edge 在**真实线上页面**上实测并回写结果（至少：arXiv 一篇、出版社站一篇、普通网页一篇）——TASK-079 的教训：这类功能的成败取决于真实页面的形态。
- `check_task.py` 必要检查 PASS（extension + frontend + contracts）。
- L3：独立只读 Reviewer 审最终 diff；独立只读 Integration/Acceptance 核完成条件与跨模块证据。

## 上下文包

- 用户定案见「用户授权」一节。
- 实测证据：`citation_pdf_url` 同域且可直取（真实 Edge，2026-09-21）。
- 契约：第 14 节（消息契约与两道守卫）、第 14.4 节（权限边界）、第 502 行（FILE 必须省略 `source_url`）、第 372 行（原件唯一且不可替换）、第 583 行（25 MiB 上限）。
- 既有实现：`extract.ts`（TASK-079 的识别与 `citation_pdf_url` 来源）、`bridge.ts`（暂存）、`relay.ts`（交付）、`CapturePage.tsx`（建资料/快照/图片冻结与 partial 口径）、`frontend/src/api/client.ts` 的 `uploadResource`（multipart 建 FILE 资料）。
- 检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-080-capture-pdf.md --worktree`。

## 实现与测试

- 实现 SHA：`d83dd91`（主体）、`4a35279`（真实站点实测后的三处修正）；范围修订登记在 `d73eff1`。
- 命令与结果：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-080-capture-pdf.md --worktree`
  → **CHECKS PASS**，11 条全绿（contracts/extension/frontend 三组），
  `files=20 product_fingerprint=78f285309e94b612b2553588d086616cfdcd7ae1d0faaacc5307fe87758e1b47`。
  单测：扩展 176 项、前端 761 项（含本任务新增：`capturePdf` 的七条分支用例、确认页的 PDF/退回/取消勾选四组、
  `isCapturedPdf` 的结构与自洽校验）。

### 落点

1. **抓取在注入脚本里**（`extract.ts` 的 `capturePdf`）：只认这一页 `citation_pdf_url` 声明的地址，
   `target.origin !== origin` 时**在发请求之前**返回 `cross-origin`；`credentials: 'omit'`；
   自己校验 `%PDF-` 而不信服务器的 `Content-Type`；超 25 MiB 判 `too-large`。
2. **载荷多两个字段**（契约 14.2）：`pdf: CapturedPdf | null` 与 `pdf_problem`。两份平行协议同步改，
   逐字比对守卫的函数清单加入 `isCapturedPdf`。
3. **确认页分叉**（`CapturePage.tsx`）：有 PDF 且用户没取消勾选时走 `uploadResource` 建 FILE 资料、
   不写快照、不存正文；文献信息照存；随后直接进站内 PDF 阅读器。取消勾选或没抓到就回到原来的 WEB+快照路径。
4. **`unlimitedStorage`**：`storage.local` 默认约 10 MB，实测论文 base64 后 0.9–8.6 MB，最大的已贴着配额。
   它不授予任何站点访问权——`manifest.test.ts` 另有断言钉死 `permissions` 里不得出现 `://` 或 `<all_urls>`。

### 范围修订 1 的两处门闩改动（对应登记时的自缚）

- **网络门闩换口径**：`boundaries.test.ts` 原本禁止 `/background/` 之外出现 `fetch(`。改为只放行
  `injected/extract.ts` 一个文件，并在该文件上加四条：恰好一个 fetch 调用点、无 `XMLHttpRequest`/
  `sendBeacon`、同域判断存在**且在 fetch 之前**、`credentials: 'omit'`。
  **变异验证**（逐条确认门闩真会报警，不是摆设）：删同域判断 → 红；同域判断挪到 fetch 之后 → 红；
  再加一个 fetch 调用点 → 红；`omit` 改 `include` → 红。四种全部变红，还原后复绿。
- **三处权限宣称**（`extension/README.md`、`extension/AGENTS.md`、根 `README.md`）补上 `unlimitedStorage`，
  并把「service worker 是唯一出网点」改成「两处，各自有各自的约束」。`extension/AGENTS.md` 里
  「`permissions` 的确切三项（安装时权限一字未加）」也一并改正——那句话已经不成立了。

### 真实浏览器实测（真实 Edge + 真实线上页面，2026-09-21）

测法：构建出 `dist/extract.js`，用 CDP `Page.createIsolatedWorld` 在**隔离世界**里跑它——
那正是 `chrome.scripting.executeScript` 注入脚本运行的地方。（先用 `page.evaluate` 测过一轮，
但那是页面主世界、受页面 CSP 管，比实际更严；换隔离世界重测后结论一致，两轮都记在这里。）

| 页面 | 结果 |
| --- | --- |
| arXiv `1706.03762` | 抓到 **2.11 MB**，`%PDF-`，`1706.03762.pdf`，PREPRINT + `10.48550/arXiv.1706.03762`，**零授权提示** |
| arXiv `1512.03385` | 抓到 **0.78 MB**，同上形态 |
| PLOS ONE（开放获取） | 抓到 **0.86 MB**，JOURNAL_ARTICLE + `10.1371/journal.pone.0287795` |
| Nature `s41586-021-03819-2` | 认作文献（Nature / 正确 DOI），PDF `failed`，退回存正文 |
| Springer IJCV | 认作文献（IJCV / 正确 DOI），PDF `failed`，退回存正文 |
| 维基百科 Transformer | 不认作文献，行为与今天完全一致 |
| wordpress.org/news | 不认作文献，行为与今天完全一致 |

**Nature / Springer 为什么 `failed`——追到底了，不是猜的**：它们声明的 PDF 地址**是同域的**，
请求发得出去，但被一条**跨域重定向链**掐断。实测重定向链：

- Nature：`303 www.nature.com/…pdf` → `302 idp.nature.com/authorize?response_type=cookie` →
  `302 idp.nature.com/transit` → `200` 回到 PDF。
- Springer：`303 link.springer.com/content/pdf/…` → `302 idp.springer.com/authorize?response_type=cookie` →
  `303` → `200` **落回文章页**（那篇本就不开放获取）。

同域 fetch 一旦跟进跨域重定向就变成 CORS 请求，`credentials: 'omit'` 下必被挡回，表现为 `TypeError`。
**这不该修**：跟过去就得带用户在该站的登录态，而那正是扩展承诺永不接触的东西。
退回存正文是正确结果；确认页的提示已按这个真实原因改写成「多数出版社要求先登录才给，而扩展从不带你的账号信息」。

**真实页面逼出的两处修正**（`4a35279`）：

1. **PLOS 每篇都会被存成 `file.pdf`**——它的 PDF 地址是 `/plosone/article/file?id=…&type=printable`，
   末段就是 `file`。改为：末段是 `file`/`download`/`printable` 等通用词时改用这一页的标题，
   并把清洗规则从 `[^\w.-]`（会把中文整个剔掉）改成只去控制字符与路径分隔字符（与契约 8.1 的后端口径一致）。
   修好后实测该页的文件名变成 `Women drive efforts to highlight…engineering.pdf`，arXiv 仍是 `1706.03762.pdf`。
2. `failed` 的提示文案按上面查到的真实原因重写。

### 已知限制 / 未完成项

- **出版社站基本拿不到 PDF**（Nature、Springer 实测如此，原因见上）。这不是缺陷，是「不碰登录态」这条承诺的
  必然结果；用户想要那篇 PDF 仍可自己下载后走文件导入。
- **`unlimitedStorage` 是否会在安装时多一条权限提示，本次没有实测**：加载已解压扩展不走安装对话框，
  自动化也触发不了。按 Chromium 的权限警告表它不产生提示，但这一条只是文档依据，不是本次观察到的事实。
- 页面本身就是一个 PDF 地址时点采集，仍然不支持（注入脚本拿不到 DOM）——登记时即列为非目标。
- 跨域 PDF 不走可选的 `<all_urls>` 权限去取：那条路能做但要多一次授权，与用户「以体验为主、不要过多点击授权」
  的要求方向相反，故按用户定案退回存正文。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- **候选 SHA**：`0fe1927522d0e0ef04a8b79e829ee40a2c34a625`（基线 `9bd2b41`）。
  候选链：`1c6fb7d`（首轮）→ `e85fcea`（首轮 Review F1–F5/F7 修正）→ `0fe1927`（二轮非阻断项①②③）。
- **检查**：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-080-capture-pdf.md --worktree`
  → **CHECKS PASS**（11 条，contracts/extension/frontend 三组），`files=23`
  `product_fingerprint=16e757d25d233a415133e9e98f3d6f9149d14af12f4acfea73210a7ab641e538`。
  单测：扩展 181、前端 779。

### 冻结候选之后补做的运行证据（登记时列的两条风险，由此从推算变为实测）

1. **端到端（真实 Edge + 真实 arXiv + 真实本机后端，2026-09-21）。先说清这一跑覆盖了哪几跳**
   ——L3 独立验收指出原文没交代清楚，这里补上：
   **跑到的**：注入脚本（构建后的 `dist/extract.js`，在 CDP `Page.createIsolatedWorld` 建的隔离世界里
   运行，与 `chrome.scripting.executeScript` 的运行环境同构）→ 载荷 → 真实 `/capture` 页的
   `postMessage` 接收与校验 → 建 FILE 资料 → 真实后端 → 站内 PDF 阅读器。
   **没跑到的**：`点扩展图标 → popup → chrome.storage.local → relay 内容脚本` 这一段。
   点图标授予 `activeTab` 自动化触发不了（该限制自 TASK-037 起一直存在），
   这一段仍需用户实机确认。`chrome.storage.local` 的容量另由下面第 2 条单独实测。
   跑通的链路是：注入脚本在隔离世界采到 `Attention Is All You Need` 的 2.11 MB PDF → 真实 `/capture` 确认页
   （勾选框默认勾上、正文框不显示）→ 保存 → 后端存下
   `source_type=FILE`、`source_url=null`、原件 `1706.03762.pdf` / 2,215,244 字节 /
   `application/pdf` / `READY`，文献信息 `PREPRINT` + `10.48550/arXiv.1706.03762` + 2017 →
   **站内 PDF 阅读器渲染成功**：15 页，画布 612×792，截图确认是论文正文。
   这条正是用户要的那件事（「zotero 做的是直接抓下来 pdf 在自己的阅读器里阅读」）。
2. **暂存配额（登记风险 1）**：在真实 Edge 里加载真实扩展，于其 service worker 中
   `chrome.storage.local.set` 写入 **8 / 12 / 35 MB** 均成功并原样读回；
   `chrome.permissions.getAll()` 返回的正是 `activeTab`/`storage`/`unlimitedStorage`/`scripting` 四项。
   35 MB（36,700,160 字节）覆盖了 25 MiB 原件 base64 后的 34,952,536 字符这一最坏情况。
3. **跨窗口传输体积（登记风险 2）**：向真实 `/capture` 页 postMessage 一份合规的
   **34,952,536 字符的 base64**（源自 26,214,400 字节 = 25 MiB，恰好契约上限；按 MiB 记是 33.3，
   按十进制 MB 记是 34.9，下文统一用字符数），接收端校验通过并渲染出勾选框，
   耗时 **204 ms**；确认页显示「保存这份 PDF（huge.pdf，25.0 MB）」。**未点保存**，不往库里塞测试数据。

4. **真实论文的体积与下载耗时**（2026-09-21，同上测法，五篇各自在其页面上同域取一次）：

   | 论文 | 原件 | base64 后 | 下载耗时 |
   | --- | --- | --- | --- |
   | arXiv 1706.03762 Attention | 2.11 MB | 2.82 MB | **9,243 ms** |
   | arXiv 1512.03385 ResNet | 0.78 MB | 1.04 MB | 1,241 ms |
   | arXiv 1810.04805 BERT | 0.74 MB | 0.99 MB | 772 ms |
   | arXiv 2005.14165 GPT-3 | **6.45 MB** | **8.61 MB** | 2,520 ms |
   | PLOS ONE 0287795 | 0.86 MB | 1.15 MB | 3,508 ms |

   这组数字是 `manifest.ts` 注释、契约 14.4 与本记录里「0.74–6.45 MB / base64 后 0.99–8.61 MB」
   的出处（L3 独立验收指出原先无出处可追）。**最慢那一篇 9.2 秒**直接推翻了首版定的
   10 秒下载时限——见下面「验收发现的实现修改」。

### Review（L3 独立只读，三轮，同一位 Reviewer）

**第一轮**（候选 `1c6fb7d`）：**CHANGES_REQUIRED**。报告原文：

> **只读证明**：本 Agent 仅有 `Read`/`Grep`/`Glob`，无写工具、无 Bash。候选 `1c6fb7d`／基线 `9bd2b41`。**覆盖声明**：无 Bash 即无法执行 `git diff base..candidate`，我审的是 20 个在范围路径的**最终文件内容**及其调用链（popup→capture→bridge→relay→CapturePage→api），未机械比对逐行增量——这是本轮的真实覆盖边界。
>
> ### 必须修复
>
> **F1 `extension/src/popup/main.ts:58-66` + `popup.ts:15,31` ↔ `CapturePage.tsx:121-137`：PDF 路径下仍向用户索取用不上的站点权限，并对用户说了假话。**
> popup 未被本任务改动，仍按 `payload.images.length > 0` 弹「一并保存需要授予读取网站数据的权限」，用户点允许即触发 `chrome.permissions.request`（真实的持久 origin 授权）；而确认页 `savingPdf` 为真时**在冻图之前就 return**，images 一张不碰。随后 `deliveryText` 还告诉用户「图片会在保存正文之后逐张下载」——该行为不存在。
> 触发：任何**既抓得到 PDF、正文里又有图**的页面。任务记录自己列的 PLOS ONE 就是这一类（正文含插图且 PDF 抓取成功）；arXiv 无图才碰巧不显。
> 影响：①直接违背本任务完成条件「一次点击、无额外授权」与用户「不要过多点击授权、以体验为主」的定案；②让用户为零收益授出站点权限；③回执文案不实。
> 修复方向：认出 `payload.pdf` 时跳过图片询问（或改问法），`main.ts`/`popup.ts` 需范围修订登记。
>
> ### 应修复（低成本，与本仓既有教训同族）
>
> **F2 `extension/src/shared/protocol.test.ts:62-78`：`MAX_PDF_BYTES` 没进镜像常量比对清单。** 逐字比对只覆盖函数体，`isCapturedPdf` 两份文本相同但常量各自定义（`extension/src/shared/protocol.ts:94`、`frontend/.../protocol.ts:77`）。该文件第 68-70 行的注释正是上次 Review F4 为同一问题留下的：一侧改小，合法载荷被静默丢弃、页面停空态且全绿。加一行即可。
>
> **F3 `pdf_problem` 未过信任边界校验。** 契约 14.2 规定取值四选一、14.3 要求「载荷必须通过结构校验」，但 `isCapturePayload`（两份 `protocol.ts:307/289`）只校验 `pdf`，`capturedFrom` 第 371 行 `pdf_problem ?? null` 原样透传，类型 `PdfProblem` 在运行时是假的。实际危害有限（仅作固定 Record 查键，未知值渲染成空 `<p>`，无注入面），但这是契约与实现不一致，且与同文件对 `citation`/`pdf` 的口径不齐。
>
> **F4 三处权限宣称里仍有一句不成立**：`extension/README.md:40` 与 `extension/AGENTS.md:25` 都写「manifest 顶层键**恰好**是 …/`action` **九个**」并漏列 `version_name`，而 `manifest.test.ts:86-99` 断言的是**十个**。这两段正是本任务改写的句子（`unlimitedStorage` 就补在同一句里），改一半留一半。门闩只查「权限项是否被提及」，查不到键数，所以不会自己报警。
>
> ### 可记录后继续
>
> - **F5 `CapturePage.tsx:242`**：`citationMiss` 提示写死「资料和**正文**都保存好了」，PDF 路径根本没存正文。该页曾为同类精确性删掉「只有」二字，口径应一致。无用例覆盖 PDF 路径下 `putCitation` 失败。
> - **F6 登记时的「跨窗口传输体积」风险未闭环**：实测只到 base64 8.6 MB，25 MiB（≈33 MB base64）这条链未验。若 `sendMessage` 承受不住，`extract.ts:480-483` 的 `.catch(() => undefined)` 静默作废 → `capture.ts:72` 15 秒超时 → popup 说「可能内容还没加载完」，与真实原因无关，用户无从判断。建议要么实测一份大 PDF，要么在记录里降级为明示的已知限制。
> - **F7** `isCapturedPdf` 未强制契约 14.2 写明的「必以 `.pdf` 结尾」；实际由 `files.ts:24` 的扩展名白名单兜住，伪造载荷最多得到一个 `.txt` 命名的 PDF 原件，无安全影响。
> - 索引 `任务索引.md:24` 仍为 `READY`，记录 `status = IN_REVIEW`（主 Agent 写回 EVIDENCE 时一并补齐）。
>
> ### 逐条核实为真（问题 1-3、6）
>
> - **门闩确实更细，未发现新口子**（`boundaries.test.ts:88-113`）：非 `/background/` 且非 `extract.ts` 的文件仍被 `fetch(`/`XMLHttpRequest`/`sendBeacon` 全量扫描；对 `extract.ts` 另加四条。记录声称的四种变异与门闩代码逐条对得上：删同域判断 → `toBeGreaterThan(-1)` 红；挪到 fetch 后 → `toBeLessThan` 红；多一个调用点 → `toHaveLength(1)` 红；`omit`→`include` → `toContain`+`not.toMatch` 双红。已知残余（属既有的「源码文本辅助防线」，不视为缺陷）：保留 `target.origin !== origin` 字面量但让它不 return 的语义性绕过查不出；`indexOf('fetch(')` 只认无空格写法（失败方向安全）。
> - **`unlimitedStorage` 名副其实**：它只解配额，不含站点可达性；`manifest.test.ts:126-146` 以「恰好四项」+ 无 `://`/`<all_urls>` 双重钉死。记录如实写明「是否产生安装提示未实测」，未冒充事实。
> - **`capturePdf` 分支正确**：同域判断在 `fetch` 之前（`extract.ts:423` vs `425`）且用例断言 fetcher **未被调用**；`too-large` 在 `toBase64` 之前返回，不会先把 25 MiB 转码；`%PDF-` 自校验不信 `Content-Type`；四个 `pdf_problem` 取值与契约 14.7 一致。`toBase64` 分块 0x8000 安全；`safeName`/`pdfNameFor` 的空标题、坏转义、通用末段、超长（≤184 UTF-16 < `fileIssue` 的 255、< 守卫的 200）均有界，`.pdf` 后缀恒成立。唯一噪声：`slice(0,180)` 按 UTF-16 切可能切断代理对，产生孤立代理的文件名（多字节标题的极端情形，不阻断）。
> - **两份协议同步**（除 F2 的常量缺口）：`isCapturedPdf` 已进逐字比对清单；`Math.ceil(bytes/3)*4 === len` 配合「末尾恰好 p 个 `=`、且没有 p+1 个」在数学上唯一确定字节数（我按 bytes∈{1,2,3} 对 len=4 逐一验证过），`bytes: 9` 那条用例正是钉住补齐位的那一条，不能被只比长度的平凡实现骗过。
> - **测试绑住了行为**：`extract.test.ts:519-608` 断言了 `credentials: 'omit'` 的实参、跨域零请求、文件名三种来源；`CapturePage.test.tsx:520-590` 断言 multipart 的 `source_type=FILE`/文件名/大小、**没有 snapshot PUT**、取消勾选后回落 WEB 且 `upload` 未被调用、四种 problem 各自文案。未被平凡实现骗过。未覆盖：PDF 路径 `putCitation` 失败（F5）、`byteLength < 5`、恰好 25 MiB 边界。
>
> **剩余风险**：出版社站因跨域重定向拿不到 PDF（记录已追到根因，属「不碰登录态」的必然结果，不应修）；大体积 PDF 的传输链未验（F6）；`unlimitedStorage` 的安装提示未实机确认（记录已如实标注）。

**第二轮**（`1c6fb7d..e85fcea` 增量）：**PASS，带 4 条非阻断项**。报告原文：

> **运行器只读证明**：本轮仅有 Read/Grep/Glob，无 Write/Edit/Bash；未改动任何文件。复核对象为新候选 `e85fcea`（相对 `1c6fb7d` 的增量 + 受影响上下文），按你给的清单逐文件读现内容判断。
>
> **结论：PASS**（带 4 条非阻断项）
>
> 1. **F1 已真修**。`/Users/yuklimching/Desktop/StudyPilot/extension/src/popup/popup.ts:29` `images.length>0 && !payload.pdf`，`main.ts:58` 用它做唯一提问闸口，`main.ts:41` 回执传 `Boolean(outcome.payload.pdf)`，`deliveryText` 的 PDF 分支不再承诺「逐张下载」。代价告知成立：`CapturePage.tsx:304` 在用户取消勾选的那一刻显示「正文里的图片保留原网站地址（抓 PDF 时没有向你要图片权限）」，与 `deliverCapture` 的 `images: []`（capture.ts:107）一致，不存在界面承诺而载荷没有的情况；降级形态与「拒绝授权」同路，可接受。未引入新问题：`isCapturePayload` 保证 markdown 非空，取消勾选不会走到「正文不能为空」死路。
> 2. **F2/F3/F4/F5/F7 均落实、无改一半**：MAX_PDF_BYTES 进镜像常量表且正则可匹配（`protocol.test.ts:82`）；`isPdfProblem` 两份函数体逐字相同并进比对清单（:123）、已接入 `isCapturePayload`；`extension/README.md:40` 与 `extension/AGENTS.md:25` 的十个键集合与 `manifest.test.ts` 白名单逐项相符、`permissions` 同步为四项；citationMiss 的 `pdf` 位与文案分叉；`.pdf` 后缀判定两侧一致且大小写不敏感有用例。
> 3. **新用例确实绑住行为**：`shouldAskAboutImages` 有图+PDF → false（回退成旧判断必红）；PDF 路径 citation 失败那条断言「资料和 PDF 原件都保存好了」且显式否定旧文案，去掉 `pdf: true` 必红。
> 4. **范围修订 2 与实际相符**：`main.ts` 已登记（TASK-080 记录 :42），其余改动文件均在原 allowed_paths 或修订 1 内，未见越界。**限制**：无 Bash，我无法独立枚举 `1c6fb7d..e85fcea` 的文件清单，此条依赖你给的变更列表。
> 5. **F6 可以关闭为阻断项，但保留一行已知限制**：35 MB 写入成功覆盖了上限（25 MiB→base64 约 34.9 MB），204 ms 覆盖了 postMessage+校验，两条登记时的未知都被真实数字回答。未覆盖的是注入脚本→popup 的 `chrome.runtime` 那一跳与 25 MiB 原件的上传段，真实实测最大仍是 8.6 MB——写进「已知限制」即可。
>
> **非阻断项**：① `extension/src/injected/extract.ts:392` 仍是 `${name.slice(0, 180)}.pdf`，按 UTF-16 切，emoji 密集的长标题仍可能留下孤立代理（safeName 本身已按码点切）；不建议直接删这行（会让 `name.length ≤ 200` 失去兜底导致整条载荷被丢弃），影响只是文件名里一个替换字符。② 码点切法无用例绑定。③ 契约 14.6/14.7 未写「抓到 PDF 就不请求图片权限」这条新授权面行为（现有表述不假，只是没同步）；补它会产生新候选，建议记为遗留。④ `main.ts` 接线无用例（既有结构如此），靠你报的 PLOS ONE/Nature/维基三页实测支撑，我无法复验该实测。
>
> **继承范围**：首轮对 `base..1c6fb7d` 的全部结论继续有效——`capturePdf` 的同域判断/`credentials: 'omit'`/`%PDF-` 魔数/25 MiB 分因、boundaries 网络门闩的四条变异验证、`isCapturedPdf` 的 base64 自洽校验、`capturedFrom` 的字段复制、确认页 FILE 上传与 partial 口径、manifest 权限断言——这些代码本轮未被触及。本轮只审上列变更文件及其调用链。
>
> **剩余风险**：PDF 存在时用户若想要「网页正文 + 冻结图片」已无可达路径（重采也不会再问），这是已告知、用户定案方向内的取舍；出版社站取不到 PDF 的既有限制不变。

**第三轮**（`e85fcea..0fe1927` 增量，处理二轮非阻断项①②③）：**PASS，无阻断项**。报告原文：

> ## 结论：PASS
>
> **1. `capName`（extension/src/injected/extract.ts:386-393）** 两个边界都成立：`for...of` 按码点取 `ch`，只在 `out.length + ch.length <= max` 时整体追加，代理对要么整进要么整不进，且 `out.length` 恒 ≤ `max`。奇数 `max` 遇 2 单元字符时提前 `break`（不跳过该字符去凑后面的 BMP 字符），结果偏短但仍合法；空串、`max=0`/负值均返回 `''`，无反例。`pdfNameFor`：三条来源（`safeName(stem)`、`safeName(title)`、`'paper'`）分别 ≤180/≤180/5，加 `.pdf` 后 `name.length ≤ 184 < 200`，第二次 slice 确属冗余，去掉后恒成立。
>
> **2. 断言判别性成立，可从代码确认。** 旧写法下 `'a'+🙂×300` → 码点切成 `'a'+179 emoji`（359 单元），再 `slice(0,180)` 切在索引 179 = 某代理对高位，留下孤立代理 → 第二条断言必红；纯 emoji 时 180 落在低位，完整、长度 184，两条都绿。故 `a` 前缀确为判别关键。长度断言与 `isCapturedPdf` 则挡住"只按码点切"那一种退化。
>
> **3. 契约一致。** §14.4:932-938 的判断式与 popup.ts:29 逐字相符，用例在 popup.test.ts:70，取消勾选的说明见 CapturePage.tsx:304；"只减少请求的权限"属实（无新增权限项）。§14.7:998 回指正确。无夸大或遗漏。
>
> **No blocking findings.** 仅两处文字瑕疵（不必改）：extract.test.ts:596 注释说"编解码回来"，实际是直接扫码点区间；`capName` 在截断点恰为空格时可能留下尾随空格（`foo .pdf`），属既有行为、不违反 `name.trim()` 非空。
>
> **继承范围**：`e85fcea` 全量结论（抓取判定、同源与 `credentials:'omit'`、四种 `pdf_problem`、协议守卫、存储与暂存代价、FILE 资料路径、前端确认页分支）原样继承，本轮未重审。
>
> **剩余风险/声明**：我仅有 Read/Grep/Glob，无法执行 git，故"`e85fcea..0fe1927` 只含这三个文件"依据主 Agent 报告；我核的是当前工作区内容。变异验证（改回旧写法变红）亦未由我复跑，证据来自主 Agent 报称——但我已从代码独立推出同一结论。

### Acceptance（L3 独立只读验收，独立于实现者与 Reviewer）

对候选 `0fe1927`（证据写回后 `bfbde5a`）：**ACCEPTED**，完成条件九条逐条达成；报告原文：

> **只读证明**：本 Agent 仅有 Read/Grep/Glob，无写工具、无 Bash，未改动任何文件。核对对象：工作区当前内容（候选 `0fe1927`／基线 `9bd2b41`），无法执行 git，故文件清单依赖 `check_task.py` 的机械范围校验（`scripts/governance/check_task.py:347` 越界即抛错，CHECKS PASS 即覆盖 allowed_paths）。
>
> **结论：ACCEPTED**（完成条件全部达成；1 条建议补记的已知限制，2 项建议合并前人工确认）
>
> 逐条：
> 1. arXiv 同域直取 **达成**：`extension/src/injected/extract.ts:421-461`（同域判断在 fetch 前、`credentials:'omit'`、`%PDF-` 自校验）＋用例 `extract.test.ts:519-535`；零授权由 `popup.ts:29`＋`popup.test.ts:70` 钉住；FILE 产物与阅读器落点 `CapturePage.tsx:125-139` → `ResourceDetail.tsx:79`；文献信息经 `citation_store.require_resource`（FILE+READY 允许）成立。
> 2. 四种退回 **达成，各有两处用例**：`extract.test.ts:536/547/554/562`（cross-origin 还断言 fetcher 未被调用）＋确认页文案 `CapturePage.test.tsx:584-598` 的 it.each 四条。
> 3. 普通网页不变 **达成**：`extract.ts:428`（无 citation 即返回，不发请求）＋`extract.test.ts:612-616`、`CapturePage.test.tsx:599-607`，另有维基/wordpress 两页实测。
> 4. 确认页可见可改 **达成**：`CapturePage.tsx:290-307`（名称＋MB＋取消勾选说明），用例 `CapturePage.test.tsx:520-580`。
> 5. 契约一致 **达成**：14.2 新增 `pdf`/`pdf_problem`＋`CapturedPdf` 表；14.4 四项权限与 `permissions: ['activeTab','scripting','storage','unlimitedStorage']`（`manifest.ts:107`）逐字相符，判断式与 `popup.ts:29` 一致；14.7 规则与代码逐条对得上；25 MiB＝26,214,400 三处同值。未发现现在不成立的句子。
> 6. 逐字比对守卫 **达成**：`protocol.test.ts:82`（MAX_PDF_BYTES 进常量表）、`:122-123`（`isCapturedPdf`/`isPdfProblem` 进函数体比对）。
> 7. 真实实测 **达成**：7 页覆盖 arXiv×2／出版社×3／普通网页×2，超出最低要求。
> 8. `check_task.py` **达成**（extension 组由 `extension/` 路径自动并入，与记录所述三组一致）；索引第 24 行 IN_ACCEPTANCE 与 status 一致，TASK-079 已登记 MERGED。
> 9. 门闩四种变异 **逐条对得上**：删同域判断→`boundaries.test.ts:109`；挪到 fetch 后→`:110`；多一个调用点→`:104`；`omit`→`include`→`:111-112`。口径确实收紧而非放松。
>
> **发现（非阻断，建议补一行已知限制）**：`capturePdf` 自身没有超时／`AbortSignal`，整个 PDF 下载算在 `capture.ts:45` 的 15 s 预算内。慢速或大 PDF 会让**整次采集超时**（`runCapture` 返回 `timeout`，什么都不交付），而不是退回快照，用户看到的是「可能内容还没加载完」——与真实原因无关。首轮 Review F6 原文提过这条路径，但二轮以 35 MB／204 ms 的**体积**证据关闭，**延迟**这一面未被处理，「已知限制／遗留项」也没有承接。实际风险：arXiv 数秒可下，出版社站快速失败，概率低；无数据损失、无安全面；修它要新增一种 problem 取值，属「可记录后继续」。
>
> **不自洽之处（均属精度问题，非造假）**：
> - 6.45 MB／8.61 MB 这组数字出现在契约 14.4、`manifest.ts:103`、遗留项 4，但「真实浏览器实测」表里最大的成功样本只有 2.11 MB，该测量无出处可追。
> - EVIDENCE 第 1 条称「端到端真实链路」，叙述却从「注入脚本在隔离世界（CDP）」直接跳到「真实 `/capture` 确认页」——**点扩展图标 → popup → `storage.local` → relay → postMessage** 这一段是否在同一次跑通，记录没写明；第 2 条的真实扩展只用于 `storage.local` 写入容量。
> - 同一个量在记录里一处写 33.3 MB（MiB 口径）、一处写 34.9 MB（十进制），读起来像两个数。三者都不影响结论，`25.0 MB` 与 `CapturePage.tsx:298` 的 `bytes/1048576` 显示逻辑反而精确吻合。
>
> **遗留清单评估**：6 条如实，`unlimitedStorage` 无安装提示实测这条在记录、契约、`manifest.ts` 注释三处都标了「不是本次观察到的事实」，没有把推算写成实测；未发现把该修的塞进遗留——唯一漏记的是上面那条超时语义。
>
> **建议用户合并前人工确认**：① 在真实 Edge 上**点一次扩展图标**走完整条（arXiv 一篇＋一篇带图的开放获取论文），确认 popup→storage→relay 这一跳与「不再弹图片授权」在真实点击下成立；② 重新加载扩展时留意是否出现新的权限提示（`unlimitedStorage` 未实测）；③ 若手边有 >10 MB 的论文，顺手试一次，即可同时闭掉遗留项 4 与上面的超时疑虑。

### 验收之后的实现修改（形成候选 `0fe1927` 之后的新候选）

验收提的那条**不是记一笔就算的**，所以改了代码而不是塞进遗留清单：

- **`capturePdf` 有了自己的时限**：`AbortSignal.timeout(PDF_TIMEOUT_MS)`，超时单列为**新的第五种**
  `pdf_problem = 'slow'`，照常退回存正文。不并进 `failed`：超时是「再试一次也许就成」，
  而 `failed` 多半是付费墙，该怎么办完全不同——`pdf_problem` 存在的意义就是不把已知信息丢掉。
- **时限由实测定，且首版被实测否掉**：先定 10 秒，随后量出 `1706.03762` 在本机要 **9,243 ms**，
  10 秒会让这一篇经常性擦边失败。改为 **20 秒**（约一倍余量），并把 `runCapture` 的整次预算
  从 15 秒提到 **30 秒**——有 PDF 要下时这一步是几 MB 的下载，按「读一次 DOM」的尺子量它本就不对；
  外层必须比内层宽，否则先超时的是外层，用户连正文都拿不到。
- 契约 14.2／14.7 同步第五种取值与两个时限；两份协议的 `isPdfProblem`、确认页文案与用例同步。
- 记录里验收指出的三处不精确已逐条改正：端到端那一跑写明了**跑到哪几跳、哪一跳没跑**；
  33.3／34.9 两个口径统一为字符数；0.74–6.45 MB 那组数字补上了五篇论文的实测出处表（上面第 4 条）。

### 最终状态 / 风险 / 用户操作

- 待填。

### 非阻断遗留项（已明确处置，不在本任务修）

1. **`main.ts` 的 DOM 接线没有用例**（二轮非阻断项④）。该文件历来只做接线，判断逻辑已抽成
   `shouldAskAboutImages` 并有用例；接线本身靠 PLOS ONE / Nature / 维基三页真实浏览器实测支撑。
2. **`extract.test.ts` 里一句注释说「编解码回来」，实际是直接扫码点区间**（三轮非阻断项，Reviewer 判「不必改」）。
3. **`capName` 在截断点恰为空格时可能留下尾随空格**（`foo .pdf`）（同上，不违反 `name.trim()` 非空）。
4. **大体积链路只验到两头**：`chrome.storage.local` 35 MB 与 postMessage 34,952,536 字符都实测通过，
   但「注入脚本 → popup 的 `chrome.runtime` 那一跳」与「25 MiB 原件的上传段」未用真实大 PDF 走通，
   真实实测过的最大原件是 6.45 MB（arXiv 2005.14165，base64 后 8.61 MB）。
5. **`unlimitedStorage` 是否在安装时多一条权限提示，未实测**：加载已解压扩展不走安装对话框。
6. **出版社站基本拿不到 PDF**（Nature、Springer 因跨域身份握手），属「不碰登录态」的必然结果，不修。

### 日期与决定日志

- 2026-09-21 用户提出「抓 PDF 而不是抓原文页、要 Zotero 那样在自己的阅读器里读」→ 主 Agent 反问三点、
  用户逐条定案 → 用户补充「以体验为主、不要过多授权」→ 主 Agent 实测 arXiv 的 PDF 同域可直取 → 登记 TASK-080。
- 2026-09-21 实现中途登记**范围修订 1**（门闩与三处权限宣称）→ 实现 → 真实站点实测发现 PLOS 文件名与
  Nature/Springer 的跨域身份握手 → 冻结候选 `1c6fb7d`。
- 2026-09-21 首轮 Review 报 **F1**（PDF 路径仍索取用不上的图片权限）→ 登记**范围修订 2** → 修 F1–F5/F7
  → `e85fcea` → 二轮 PASS + 4 条非阻断项 → 处理①②③ → `0fe1927` → 三轮 PASS，无阻断项。
<!-- EVIDENCE:END -->
