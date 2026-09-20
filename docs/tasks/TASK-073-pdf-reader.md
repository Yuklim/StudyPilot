# TASK-073：站内读本地 PDF（阅读器 v1，只读）

```toml
schema_version = 2
id = "TASK-073"
status = "MERGED"
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
  ".gitattributes",
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

### 登记后的路径修订（实施中，写入前记录）

新增 `.gitattributes`（仓库原本没有这个文件）并追加进 `allowed_paths`：e2e 夹具是一份真实的小 PDF，而 PDF 的 xref 表每项固定 20 字节、**必须**以空格结尾；git 会把这种小体积 PDF 当文本，于是 `check_task.py` 里的 `git diff --check` 把格式要求的空格报成「行尾空格」并整体 FAIL。声明 `*.pdf binary` 是这件事的标准解法，也让将来任何 PDF 夹具不再踩同一个坑。内容仅此一行规则 + 注释。

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

### Review F1–F5 的修正（第二候选）

- **F1（建议修→已修，真缺陷）** 打开文档的 effect 原来依赖 `file` **对象引用**。改标签、存学习记录、编辑资料都会让父级重读资料、给出一个内容相同的新对象 → 整份 PDF 重新下载重解析，而 cleanup 又会 `destroy()` 掉此刻 state 仍在用的文档，那个窗口里一滚动就是空白页（还会抛未捕获的 rejection）。改为依赖 `file` 拆出来的基本类型（id / size / media_type）。新增用例「父级换一个内容相同的新对象时不重新下载」，**判别性已验**（改回按对象依赖即红）。
- **F2（可记录→已修）** 滚动写回改为按帧节流（`requestAnimationFrame`，卸载时取消），与正文阅读位置那边同一套做法；原本每个 scroll 事件都 `JSON.stringify` + 写 `localStorage`。
- **F3（可记录→已修）** 页码输入框被清空时 `Number('')` 是 0，原实现当成「跳到第 0 页」跳回首页并把首页写进记忆。改为只接受 ≥1 的有效值，空值当「还没输完」。新增用例，**判别性已验**。
- **F4（可记录→已修）** 中线判据在「页高 < 半个视口」（例如 A4 缩到 50% 配高窗口）时，跳页把页顶对齐视口顶之后，中线会落进下一页、页码与记忆偏一页。改为**跳页时钉住意图**：记下这次跳到哪一页与目标 `scrollTop`，滚动稳定在该位置时页码按用户点的那页显示；用户真的滚动起来（偏离目标位置）就解钉、回到中线判据。恢复位置时同样钉一次。
- **F5（可记录→已修）** 两处：`pdfPosition.ts` 的注释漂移（说指纹是 `sha256`、说 ratio 是「页顶到视口顶」，与实现不符）已改；删除资料时原本只清网页阅读位置、PDF 位置残留（TASK-067 F3 的同一处置没平移过来），现在 `afterDeletion` 一并 `clearPdfPosition`。
- **F6（索引行 READY）** 随本次写回更正。
- **顺带解决的两个工程问题**（都在实施中才暴露）：
  - 并行任务留下的 `.claude/worktrees/` 未被忽略，会让 `check_task.py` 判为「越界改动」；该 worktree 用完移除后检查即 PASS。仓库应当忽略它——见非阻断遗留项。
  - e2e 夹具是一份真实 PDF，而 PDF 的 xref 表每项固定 20 字节、**必须**以空格结尾；git 把这种小体积 PDF 当文本，`git diff --check` 于是把格式要求的空格报成「行尾空格」。新增 `.gitattributes` 声明 `*.pdf binary` 解决。夹具本身刻意保持**全 ASCII、不压缩**：治理检查要求二进制文件人工核验，而这份夹具应当能被任何人直接读懂。
- 修正后重跑：lint / typecheck / format 0；`vitest run` **697 passed**（+2 回归用例）；`playwright test` **73 passed**；`check_task.py --worktree` **CHECKS PASS**。

### 第二轮 Review F7 的修正（第三候选）

- **F7（必须修→已修，真缺陷）** 跳页钉住分支（`PdfReader.tsx` 的 `onScroll`）写回 `ratio: 0`，
  而 `ratio` 的定义是「**视口中线**落在页内的比例」，`locatePage`/`scrollTopFor` 是互逆的一对。
  两条确定性后果：（一）跳页后离开，回来时 `scrollTopFor` 给出 `tops[p-1] − clientHeight/2`，
  落点比离开处**高半屏**，直接违反完成条件「落在离开时的页与页内位置」；（二）恢复位置时
  赋值 `scrollTop` 触发的那次 scroll 正好命中本分支，把刚读出来的精确比例**覆盖成 0**——
  正常滚到第 p 页 0.6 处离开，下次打开不滚动就走，页内位置即丢失。
  改法：比例的算法抽成 `ratioWithinPage` 一处定义（`locatePage` 也改用它），钉住时**页码按
  用户点的那页、比例按真实位置算**。往返可逆；页比半个视口还矮时比例夹在 1，误差在一页之内。
  新增两条用例（纯函数一条、组件一条），**判别性已验**：把钉住分支改回 `ratio: 0`，
  组件用例报 `expected 516 to be close to 816`——正好差半个视口。
- **F8（索引行）** 索引里 TASK-073 仍是 `READY`，与记录的 `IN_REVIEW` 不一致（上一轮说要改但没改到），
  本次写回一并更正并补上实现/检查摘要。
- **Reviewer 标为「可选」的三条**：`getPage` 未捕获的 rejection、`onPages` 死 prop——都已顺手处理
  （前者加兜底、后者删掉）；`offsets.tops` 未计入容器 16px `padding-top` 的恒定偏差**不改**：
  写位置与读位置用的是同一套模型，往返是自洽的，唯一影响是页码在页边界处早 16px 翻页，
  肉眼不可察；要改就得改成按真实 DOM 量 `offsetTop`，而 jsdom 不排版、单测会一并失去判别性。
  记为非阻断遗留。
- 修正后重跑：lint / typecheck / format 0；`vitest run` **699 passed**（+2 回归用例）；
  `playwright test` **73 passed**；`check_task.py --worktree` **CHECKS PASS**。修正 SHA `4ee7b34`。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：第一候选 `aa8f7cc`；第二候选 `7edcc43`；**最终候选 `eb598f0`**。
- Review：
  - **第一轮（候选 `aa8f7cc`）结论 CHANGES_REQUIRED**，F1–F5，逐条处置见上文「Review F1–F5 的修正」。
    报告原文未留存于本记录（上一会话写回时只留了逐条处置），此处如实标注，不补写、不冒充原文。
  - **第二轮（增量 `aa8f7cc..7edcc43`，结论覆盖 `92a4764..7edcc43`）结论 CHANGES_REQUIRED**，
    独立只读 Reviewer（`.claude/agents/reviewer.md`，仅 Read/Grep/Glob，无写工具）。报告原文：

    > **结论：CHANGES_REQUIRED（1 条必须修，2 条记录/可选）**
    >
    > **审查范围**：无 Bash，我以**整文件通读**代替 diff：`PdfReader.tsx`、`pdfPosition.ts`、`ResourceDetail.tsx`、`PdfReader.test.tsx`、`pdfPosition.test.ts`、`e2e/pdf-reader.spec.ts`、`styles.css`（pdf 段）、`files.ts`、`package.json`、`.gitattributes`、索引行。F1–F5 全部落点已逐条核到实现。结论覆盖 `92a4764..7edcc43`。
    >
    > **F1–F5 复核**：F1 依赖改为 `fileId/fileSize/fileType`，`alive` + 两处 `destroy` 竞态正确，用例 rerender `{...file}` 判别性成立 ✓。F2 rAF 单帧节流为帧内尾沿，最后一次写回不丢，卸载 `cancelAnimationFrame` 无泄漏 ✓。F3 `!Number.isFinite || <1` 覆盖空值/0/负数/NaN，超页夹到末页 ✓。F5 键名 `studypilot.pdf.position.<resourceId>` 与写入端一致，时机在 navigate 前 ✓。
    >
    > **findings**
    >
    > 1. **`frontend/src/features/resources/PdfReader.tsx:182`｜必须修（F4 引入的回归）** 钉住分支写回 `ratio: 0`，但此刻真实位置是「页顶对齐视口顶」，而 `pdfPosition` 的 ratio 定义是**视口中线**在页内的比例（`locatePage`/`scrollTopFor` 互逆）。后果两条：(a) 跳页后离开，再回来 `scrollTopFor` 给出 `tops[p-1] − clientHeight/2`，落点比离开处**高半屏**，直接违反完成条件「落在离开时的页与页内位置」；(b) `PdfReader.tsx:161-163` 恢复时同样钉住，赋值 `scrollTop` 触发的 scroll 事件命中钉住分支，把刚读出的精确 ratio **覆盖成 0**——正常滚动读到 p 页 0.6 处、下次打开后不滚动就离开，页内位置即丢失。两条都是确定性触发。单测抓不到（jsdom `scrollTop` 无布局），e2e 只断言页码，也抓不到。最小修：钉住时写真实比例而非 0 —— `ratio = clamp01((scrollTop + clientHeight/2 − tops[p-1]) / heights[p-1])`，页码仍用 `target.page`。可往返，短页夹在 1，误差有界；建议补一条「跳页→重挂→scrollTop 相同」的回归用例。
    > 2. **`docs/tasks/任务索引.md:24`｜记录**：记录称「F6（索引行 READY）随本次写回更正」，但索引仍是 `READY`，与记录 `status = IN_REVIEW` 不一致，实现/候选/检查摘要也未入行。写回时一并纠正即可。
    > 3. **可选**：`PdfReader.tsx:313` `await doc.getPage()` 无 catch，卸载与 `destroy()` 撞车时会有未捕获 rejection（仅控制台噪音）；`onPages` 是死 prop（`ResourceDetail` 未传）；`offsets.tops` 未计入 `.pdf-reader-pages` 的 16px `padding-top`，恒定 16px 偏差。三条均属第一候选既有，非本轮引入。
    >
    > **路径与证据**：全部改动落在 `allowed_paths`（含追加的 `.gitattributes`），全仓 `TASK-073`/`pdfjs` 命中文件无越界；`pdfjs-dist@5.4.149` 已钉死。新测试均有判别性，未见降低断言或跳过。
    >
    > **继承第一轮范围（本轮未重审）**：`package-lock.json` 内容、e2e 夹具字节、`ResourceToolbar.tsx`/`FileOriginal.tsx`/`files.test.ts`/`FilePages.test.tsx`、`docs/开发与运行.md` 文案、`styles.css` 视觉细节。
    >
    > **剩余风险**：大文档（数百页）渲染队列未实测；PDF 无高亮/文本层为已登记非目标。

    主 Agent 复核：第 1 条经读码核实为真缺陷（两条后果均确定性触发），已按最小修法修正并补判别性用例；
    第 2 条已改；第 3 条三小项两条已顺手处理、一条（16px）记为非阻断遗留，理由见上。
  - **第三轮（增量 `7edcc43..eb598f0`，结论覆盖 `92a4764..eb598f0`）结论 PASS**，同一位独立只读 Reviewer。报告原文：

    > **结论：PASS（覆盖最终候选 `92a4764..eb598f0`）**
    >
    > **本轮实际审（整文件通读，无 Bash 故不跑 diff）**：`pdfPosition.ts`、`PdfReader.tsx`、`pdfPosition.test.ts`、`PdfReader.test.tsx`、`docs/tasks/TASK-073-pdf-reader.md`、`任务索引.md:24`，并重新核了 `ResourceDetail.tsx`/`styles.css` 相关段与全仓 `onPages`/`ratioWithinPage` 引用。
    >
    > **F7 已真修**：`ratioWithinPage` 与 `scrollTopFor` 严格互逆——未夹取时 `scrollTopFor(p, (S+v/2−tops)/h) = max(0,S)`，我手算了跳页（816 → ratio 300/816 → 回 816）与恢复两条路径。边界正确：空数组→0（`locatePage` 更早返回 `{1,0}`）、`height<=0`→0（与旧 `height>0` 等价）、page 越界两处都夹在 `[0,len-1]`、短页夹 1 且误差 < v/2 有界。`locatePage` 改为复用它，行为与旧内联实现一致，ratio 只剩一处定义。
    > **新的相互作用**：钉住分支只换了写回的 ratio，<2px 解钉阈值与 rAF 节流未动；恢复那次写回现在把刚读出的比例原样写回（不再覆盖成 0），`scrollTopFor` 在顶部 `max(0,…)` 夹取时改写为「实际可达位置」，属正确归一。未发现永远钉住/永远解不了钉的路径。
    >
    > **`getPage().catch(() => null)`**：可接受。打开时的量尺循环已对每一页成功 `getPage` 过，之后失败几乎只有「文档已 destroy」；即使真失败，旧写法也是空白页 + 未捕获 rejection，用户可见结果不变，且 `near` 翻转会让该页重试。删 `onPages` 干净，全仓无残留（grep 命中的都是 `ClassificationPages`）。
    >
    > **16px 的拒绝站得住**：偏差对每一页都是恒定 +16（不累积），写与读同模型故往返相消，只把页码翻页点提前 16px（≈2%，且落在页间空隙里）；改为量 `offsetTop` 会让 jsdom 单测失去判别性，成本大于收益。记为非阻断遗留 2 即可。
    >
    > **新用例非假绿**：纯函数那条是独立手算值（300/800、`top−300`、短页夹 1）；组件那条断言的 816 由 `goTo` 真实写入的 `scrollTop` 与存下的 ratio 各自独立支撑，改回 `ratio: 0` 即 516——判别性成立。`defineProperty` 只补 jsdom 缺的 `clientHeight`/`scrollTop` 布局，未替换被测逻辑；真实滚动仍由 e2e 覆盖。索引行已 IN_REVIEW 并补摘要，第二轮报告原文完整写回 EVIDENCE。
    >
    > **继承前两轮、本轮未重审**：`package-lock.json` 内容、e2e 夹具字节与 `pdf-reader.spec.ts`、`ResourceToolbar.tsx`/`FileOriginal.tsx`/`files.test.ts`/`FilePages.test.tsx`、`docs/开发与运行.md`、`styles.css` 视觉细节、`.gitattributes`（本轮仅确认未变）。
    >
    > **剩余风险**：缩放后 `pinned.top` 是旧尺度坐标，仅在缩放导致容器夹取且新旧位置差 <2px 的巧合下会存下偏一页的页码，下一次滚动即自愈；大文档渲染队列未实测；PDF 无高亮/文本层为已登记非目标。
- Acceptance：L2，N/A。
- 最终状态/风险/用户操作：**MERGED**——2026-09-20 用户已合并 PR #82，merge `eeb4399`（状态登记并入 TASK-076 控制面提交）。此前为 ACCEPTED：L2 执行链走完（1 Worker → 自动检查 → 独立只读 Reviewer；独立验收 N/A）。
  三轮审查：第一轮 F1–F5、第二轮 F7（必须修，真缺陷）、第三轮 PASS。最终候选 `eb598f0` 上的检查：
  lint / typecheck / format 0，`vitest run` **699 passed**，`playwright test` **73 passed**，`check_task.py --worktree` **CHECKS PASS**。
  剩余风险都是已登记的非目标或非阻断遗留，没有未决的产品决定。**需要用户操作：合并 PR**（本任务交付站内 PDF 阅读；
  合并后 main 才带上 pdf.js 与阅读器，下一个任务（PDF 上的高亮锚点，要动契约）才有基线可依）。
- 非阻断遗留项：
  1. `.claude/worktrees/` 未被 `.gitignore` 忽略，并行任务留下的工作目录会被 `check_task.py` 判为越界改动（本任务已靠用完即删绕开）。该改动属仓库根配置，不在本任务 `allowed_paths` 内，留给下一个有根配置授权的任务。
  2. `offsets.tops` 未计入 `.pdf-reader-pages` 的 16px `padding-top`：读写用同一套模型，往返自洽，只在页边界处早 16px 翻页；要消除就得改成按真实 DOM 量 `offsetTop`，而 jsdom 不排版会让单测失去判别性。暂不改。
  3. 大文档（数百页）只做了「远离视口释放 canvas」一层，渲染队列与优先级未做、未实测。
  4. 缩放后 `pinned.current.top` 仍是旧尺度下的坐标（第三轮 Reviewer 的剩余风险）：只有「缩放导致容器夹取、且新旧位置差 <2px」的巧合下会存下偏一页的页码，用户下一次滚动即自愈。改它要在缩放时清钉，收益不抵再开一轮候选的成本，留待后续任务顺手处理。
- 日期与决定日志：2026-09-20 用户「可以尝试开始做一下本地 pdf 文件的阅读器了」→ 方案沟通（v1 只读）→「A可以」→ Pencil 草图确认「可以」→ 登记 TASK-073；同日用户授权与 TASK-074 并行。
<!-- EVIDENCE:END -->
