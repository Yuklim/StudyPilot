# TASK-080：采集文献时直接抓 PDF，在站内阅读器里读

```toml
schema_version = 2
id = "TASK-080"
status = "READY"
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

- 实现 SHA：待填。
- 命令与结果：待填。
- 已知限制/未完成项：待填。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-21 用户提出「抓 PDF 而不是抓原文页、要 Zotero 那样在自己的阅读器里读」→ 主 Agent 反问三点、用户逐条定案 → 用户补充「以体验为主、不要过多授权」→ 主 Agent 实测 arXiv 的 PDF 同域可直取 → 登记 TASK-080。
<!-- EVIDENCE:END -->
