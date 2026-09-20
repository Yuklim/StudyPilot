# TASK-073：站内读本地 PDF（阅读器 v1，只读）

```toml
schema_version = 2
id = "TASK-073"
status = "IN_REVIEW"
risk = "L2"
risk_reason = "在既有契约之下做前端实现：FILE 资料的原件读取、上传、校验与下载都已交付（TASK-013/014），本任务只是把已经能下载的字节在站内渲染出来。不改后端、不改契约、不做迁移、不新增接口。新增一个第三方前端依赖（pdf.js）并在本机打包，不引入运行时外网依赖。按第 4 节属「已批准契约下的普通业务实现」，定 L2：1 Worker → 自动检查 → 1 独立只读 Reviewer；独立验收 N/A。若发现必须改契约或后端，停止并重新定级。"
risk_flags = ["business"]
owner = "coordinator"
base = "92a476404eced01d2c2957946227f7c07a620dce"
allowed_paths = [
  "frontend/package.json",
  "frontend/package-lock.json",
  "frontend/src/features/resources/PdfReader.tsx",
  "frontend/src/features/resources/PdfReader.test.tsx",
  "frontend/src/features/resources/pdfPosition.ts",
  "frontend/src/features/resources/pdfPosition.test.ts",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourceToolbar.tsx",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/features/resources/FileOriginal.tsx",
  "frontend/src/features/resources/FilePages.test.tsx",
  "frontend/src/features/resources/files.ts",
  "frontend/src/features/resources/files.test.ts",
  "frontend/src/styles.css",
  "frontend/e2e/pdf-reader.spec.ts",
  "frontend/e2e/fixtures/**",
  "docs/开发与运行.md",
  "docs/tasks/TASK-073-pdf-reader.md",
  "docs/tasks/TASK-072-highlight-reader.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-20 用户提出「可以尝试开始做一下本地 pdf 文件的阅读器了」。主 Agent 给出技术方案（pdf.js、必须 `fetch` + 令牌取字节、v1 不做 PDF 高亮），用户确认「A可以」；随后主 Agent 按既定规矩先在 Pencil 出草图（`阅读器｜PDF（TASK-073 草图）` 与 `PDF｜三个状态（TASK-073 草图）`），用户看过后答「可以」。

### 目标

1. **FILE 且原件是 PDF 的资料，在资料详情页内直接读**：顶栏 返回/文件名/「本地文件」标签 ‖ 页码（可输入跳页）、缩放、「适合宽度」、「下载原件」、「心得」；主体**连续滚动**逐页渲染。
2. **取字节走 `fetch` + 令牌再转 Blob**：本机门禁要求 `sec-fetch-dest: empty`，`<iframe src>`/`<embed>` 指向下载接口必然被拒（与快照图片同一条既有结论）。复用 `files.ts` 既有的受控下载，拿到 `Blob` 后交给 pdf.js。
3. **pdf.js 作为 npm 依赖打包**，worker 一并打包；**运行时不依赖任何外网**（本机应用的前提）。
4. **记住读到哪里**：页码 + 页内比例，离开再回到原处（与 TASK-067 的阅读位置记忆同一形态，但锚点不同，单独一份 `pdfPosition.ts`）。
5. **三个状态**（按草图）：正在打开（首屏先出第一页，其余随滚动逐页渲染）；不是 PDF 的文件资料（.doc/.docx/.md/.txt）保持现状（下载原件 + 既有空态）；这份 PDF 打不开（加密/损坏/无文字层）给出原因 + 「下载原件」兜底，不把页面卡在空白上。
6. **PDF 上不显示「高亮」Tab**（用户 2026-09-20 看草图后确认）：高亮锚点是快照正文的字符偏移，PDF 是另一套坐标；不显示胜过显示一个点不动的空 Tab。
7. 顺带把 **TASK-072 登记为 MERGED**（用户 2026-09-20 合并 PR #80，merge `92a4764`）。

### 非目标 / 禁止范围

- 不做 PDF 上的选中、高亮、标注、文本层搜索（v1 只读；PDF 锚点是后续任务，要动契约）。
- 不做 PDF 文本抽取、不生成快照正文、不改 `content_snapshots` 的任何语义。
- 不改后端、契约、openapi、迁移；不碰扩展（`extension/**` 由并行的 TASK-074/075 负责，路径互不相交）。
- 不做打印、导出、页面旋转、缩略图侧栏。
- 所有未列入 `allowed_paths` 的路径。

### 依赖与并行

依赖：无，基线为已合并 main `92a4764`。
**并行**：与 **TASK-074（文献元数据后端）并行**，由用户 2026-09-20「AB能不能并行做，提高一点效率」授权。路径完全不相交——本任务只写 `frontend/**` 与两份文档；TASK-074 只写 `backend/**` 与 `docs/contracts/**`。共享的只有 `docs/tasks/任务索引.md`（控制面由主 Agent 串行维护，合并时按既往办法解表头相邻行冲突）。各自独立分支、独立工作目录、独立 Reviewer、独立 PR。

### 主 Agent 登记的实现决定（非用户决定，Review 可挑战）

- **连续滚动而不是单页翻页**（草图已确认）：与 Zotero/Preview 的形态一致，也便于「记住读到哪里」。
- **逐页渲染 + 可见页优先**：一份几十页的 PDF 不应等全渲染完才给看；离开视口较远的页释放 canvas，避免大文档吃满内存。
- **pdf.js 的 worker 用打包产物而非 CDN**：`workerSrc` 指向打进 bundle 的文件。
- **失败要分因**：加密（需要口令）、结构损坏、渲染异常三类给不同文案，都配「下载原件」。
- **e2e 用一份自造的最小 PDF**（仓库内固定字节，不引入真实文献），放 `frontend/e2e/fixtures/`。

## 完成条件

- FILE + PDF 资料打开即渲染首页；滚动到第 N 页时顶栏页码跟到 N；输入页码可跳转；缩放与「适合宽度」生效。
- 取字节确实走受控下载（用例断言请求带令牌路径、不出现 `<iframe>`/`<embed>` 直连）。
- 离开再回到该资料，落在离开时的页与页内位置（有用例）。
- 三个状态各有用例：正在打开、不是 PDF、打不开（加密/损坏各一）。
- PDF 资料的右栏**没有**「高亮」Tab，非 PDF 资料的既有行为不变（既有用例保持绿）。
- e2e：真实浏览器里打开一份 PDF 资料，第一页渲染出来（断言 canvas 有非空像素或 pdf.js 报告的页数），跳页与记忆位置各验一次。
- `check_task.py` 必要检查 PASS。
- L2 独立只读 Reviewer 对 `base..candidate` 最终 diff 给出结论。

## 上下文包

- 设计：Pencil `阅读器｜PDF（TASK-073 草图）`、`PDF｜三个状态（TASK-073 草图）`（2026-09-20 用户确认）。
- 既有实现：`files.ts`/`FileOriginal.tsx`（受控下载与校验）、`ResourceDetail.tsx`（阅读器骨架与右栏 Tab）、`readerPosition.ts`（网页正文的阅读位置记忆，形态参照）、`ContentSnapshot.tsx`（正文区的空态与失败态文案口径）。
- 契约：`docs/contracts/API与数据契约基线.md` 第 8 节（原件与下载）、第 7 节（本机门禁与 `sec-fetch-dest`）。
- 检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-073-pdf-reader.md --worktree`。

## 实现与测试

- 实现 SHA：`2162a40`（控制面登记 `de99d27`）。变更摘要：
  - **依赖**：`pdfjs-dist@5.4.149`（`--save-exact`），打包进 bundle；worker 用 `pdfjs-dist/build/pdf.worker.min.mjs?url` 的打包产物，**运行时不依赖外网**。pdf.js 按需 `import()`，没有 PDF 的资料不为它买单。
  - **`pdfPosition.ts`（新，纯函数）**：`locatePage`/`scrollTopFor`/`read|write|clearPdfPosition`。位置是「第几页 + 页内比例」而不是像素——PDF 的页高随缩放变化，像素换个缩放就没意义。指纹用原件行 id（契约里 FILE 原件不可更换，id 稳定）。
  - **`PdfReader.tsx`（新）**：走既有受控下载拿 `Blob` → `arrayBuffer` → pdf.js；先量出每页尺寸占好位（滚动条不随渲染跳动），只渲染视口上下各 2 页、远处只占位；页码输入跳页、`−/＋` 缩放（0.5–3）、「适合宽度」；失败分三类（打开口令 / 结构损坏 / 读取失败），都配「用工具条里的『原件』下载」的兜底。
  - **`files.ts`**：新增 `isPdfOriginal`（只认 `application/pdf` 且 READY）。
  - **`ResourceDetail.tsx`**：FILE + PDF 原件时正文区放 `PdfReader`（按 `file.id` 给 key，换文件即重挂），其余格式保持现状走快照；**PDF 资料不渲染「高亮」Tab 与其面板**。
  - **`styles.css`**：阅读器工具条、页面滚动容器（自身滚动，顶栏不动）、占位页、失败卡片。
- 新测试（11 条）与判别性：
  - `pdfPosition.test.ts` 4 例：按滚动位置定位页与页内比例（含滚过末页夹在 1）、缩放变化后回到同一处、按资料分别记忆且换文件不恢复、坏记录一律忽略。
  - `PdfReader.test.tsx` 4 例（pdf.js 用 `vi.mock` 替身，jsdom 无 canvas/worker）：字节确实走受控下载且页面里没有 `iframe/embed/object` 直连接口；三页都占位而只渲染近处；三类失败各自的文案与「原件」兜底；回到离开时的页、且另一份文件存的位置不恢复。
  - `e2e/pdf-reader.spec.ts` 3 例（真实 Chromium + 真实后端，夹具是仓库内自造的两页最小 PDF）：第一页**真的画出来了**（读 canvas 像素，非白即渲染成功）、`/ 2 页`、无 iframe 直连、PDF 资料无「高亮」Tab；跳到第 2 页 → 刷新后仍在第 2 页；非 PDF 的 FILE 资料保持既有形态。
  - **e2e 抓到一个真缺陷并已修**：原本按「视口顶边」判当前页，短文档滚到底时末页顶部仍在视口顶之下（容器滚不了那么多），于是「跳到第 2 页」后页码显示的还是第 1 页。改为**按视口中线判**——中线落在哪一页，人就在读哪一页，任何文档长度都成立；跳页仍把该页顶部带到视口顶（符合预期），随后的 scroll 事件按中线重算。
- 命令与结果（本机 macOS 25.5.0，工作区在 `2162a40`）：
  - `npm run lint` / `npm run typecheck`（`tsc -b`）/ format 均 0；`vitest run` **695 passed**（TASK-072 时 687，+8）；`playwright test` **73 passed**（+3）。
  - `python3 scripts/governance/check_task.py --task docs/tasks/TASK-073-pdf-reader.md --worktree` → **CHECKS PASS**。
  - 过程记录：并行任务留下的 `.claude/worktrees/` 未被 `.gitignore` 忽略，会被治理检查判为「越界改动」；该 worktree 用完移除后检查即 PASS。**仓库应当忽略它**，见非阻断遗留项。
- 已知限制/未完成项：
  - **只读**：不做选中、标注、文本层搜索、打印、旋转、缩略图侧栏。PDF 上的高亮需要另一套锚点（页 + 页内位置），要动契约，属后续任务。
  - **扫描版 PDF 没有文字层**：能看，但将来做搜索/标注时抽不出文字；本任务不涉及。
  - 大文档只做了「远离视口的页释放 canvas」这一层优化，没有做渲染队列与优先级；几百页的文档表现未实测（夹具两页、真实文献量级未验）。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：L2，N/A。
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-20 用户「可以尝试开始做一下本地 pdf 文件的阅读器了」→ 方案沟通（v1 只读）→「A可以」→ Pencil 草图确认「可以」→ 登记 TASK-073；同日用户授权与 TASK-074 并行。
<!-- EVIDENCE:END -->
