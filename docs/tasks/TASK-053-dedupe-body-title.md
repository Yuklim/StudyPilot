# TASK-053：正文开头与资料标题相同的一级标题不再重复渲染

```toml
schema_version = 2
id = "TASK-053"
status = "IN_REVIEW"
risk = "L2"
risk_reason = "改的是快照渲染管线 `snapshotMarkdown.ts`——本项目唯一 `dangerouslySetInnerHTML` 的内容来源，其安全性质（`html:false`、链接/图片仅收 validateLink 放行地址）由配置与测试钉住。本任务只在 markdown-it 的 core 阶段加一条**删 token** 的规则（首个块若是 h1 且文本与资料标题相同则移除三枚 token），不触碰 `RENDERER_OPTIONS`、image/link 规则与转义路径；正文数据一字不动，只影响显示。仍判 L2 而非 L1：进了安全敏感文件，且「删掉一个标题」若判断写错会静默吞掉用户内容，需独立 Reviewer 核对判据与测试。不到 L3：无契约/接口/数据变更。"
risk_flags = ["business"]
owner = "coordinator"
base = "5c6cd9be6b01bc5d7511f68abde2da402e64b615"
allowed_paths = [
  "frontend/src/features/resources/snapshotMarkdown.ts",
  "frontend/src/features/resources/snapshotMarkdown.test.ts",
  "frontend/src/features/resources/ContentSnapshot.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/e2e/reader-layout.spec.ts",
  "docs/images/03-reader.png",
  "docs/tasks/TASK-052-reader-toolbar-slim.md",
  "docs/tasks/TASK-053-dedupe-body-title.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

TASK-052 把资料标题移入正文列后，它与正文 Markdown 自带的 `# 一级标题` 上下相邻、同名重复（TASK-046 遗留 B）。主 Agent 给出两种修法（渲染层去重 / 改降级策略把正文 `#` 一律降为 h2），用户 2026-09-12 回复：

> 标题在页面最上面已经有了，在正文里就不用再出现了吧

即选渲染层去重：页面顶部已有资料标题时，正文开头那个**同名**的一级标题不再渲染。

### 判据（主 Agent 按用户原话取最保守解释，记录为假设）

- 只看正文的**第一个块**：它是 `h1` 且其纯文本与资料标题**相同**（比较前两边都做 NFC、去首尾空白、连续空白折叠为一个、大小写折叠）→ 不渲染该标题；其余全部照旧。
- **不相同就保留**（包括「资料标题 = 正文标题 + 站点后缀」这类形态）：一条会静默吞掉内容的规则，宁可漏删也不误删；后缀形态若日后确认常见，另立任务放宽。
- 首个块不是 h1（前面有段落/图片）→ 不动：那时它不是「重复的标题」而是文章里的一个标题。
- 源码视图（看 Markdown 源码）不受影响：那是原文，一字不动。
- 正文数据不回写，只影响渲染。

### 目标

1. `renderSnapshot` 增加可选 `pageTitle`；给出时按上述判据在 markdown-it core 阶段移除首个重复 h1 的三枚 token（`heading_open`/`inline`/`heading_close`）。不传时输出与现状逐字节相同。
2. `ContentSnapshot` 新增可选 prop `pageTitle`（由 `ResourceDetail` 传 `resourceTitle(toolbarItem)`），透传给 `renderSnapshot`；经 memo 的 `ReaderContent` 同步加 prop。
3. 单测钉住判据的每一边：相同→删；不同→留；带站点后缀→留；不是首块→留；h1 内含行内格式（`**粗**`）按纯文本比较；不传 `pageTitle` 输出不变；`RENDERER_OPTIONS` 与既有安全断言零改动。
4. 页面级用例：资料标题与正文 `# 冻结的标题` 相同时，页面上「冻结的标题」一级标题恰好一个且不在 `.snapshot-rendered` 内，正文段落照常；源码视图仍含 `# 冻结的标题`。
5. 既有单测/e2e 只增不减（e2e 种子里资料标题与正文 h1 均不相同，行为不变；本任务在 `reader-layout.spec.ts` 加一条相同标题的真浏览器用例）。
6. 重截 `03-reader.png`（示例文章标题与资料标题相同，重复会消失）。

### 非目标

- 不改 `snapshotMarkdown.ts` 的安全配置与 image/link 规则；不改后端、契约、门禁、扩展；不引入依赖。
- 不处理站点后缀、不做模糊匹配、不删除正文中间的标题。
- 不把正文 `#` 一律降为 `h2`（用户未选）。

### 依赖

与 TASK-052（PR #60，登记时尚未合并）**代码上无依赖**——去重逻辑与标题位置无关；视觉动机来自 TASK-052。本分支从 main `5c6cd9b` 拉出；若 PR #60 先合并，索引冲突按既定方式处置。

### 顺带完成的状态登记

`docs/tasks/TASK-052-reader-toolbar-slim.md` 在 `allowed_paths` 内，仅用于在用户合并 PR #60 后把 `status` 登记为 `MERGED`（登记前核实 `gh pr view 60`）；未合并则不动。

## 完成条件

1. 目标 3 的 6 条单测全部存在且通过，并记录「去掉 core 规则后哪些变红」。
2. 目标 4 的页面级用例通过，且对旧渲染变红。
3. 目标 5 的 e2e 用例通过。
4. `snapshotMarkdown.test.ts` 既有断言（含 `RENDERER_OPTIONS` 三值）零改动。
5. `check_task.py` frontend profile PASS；`npm run test:e2e` 全部通过；`git diff --check` exit 0。
6. L2 独立只读 Reviewer PASS。

## 上下文包

- 规则：`AGENTS.md` §4/§5/§6。
- 代码：`snapshotMarkdown.ts:79-103`（`renderSnapshot`）、`ContentSnapshot.tsx:170-175`（memo 渲染）、`ResourceDetail.tsx`（`ReaderContent` props）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-053-dedupe-body-title.md --worktree`。

## 实现与测试

- **实现 SHA**：`aa7f65d`（实现 + 测试同一提交；6 个前端文件 +179/−2）。
- **变更摘要**：
  - `snapshotMarkdown.ts`（+38/−0；F1 修复后 +54/−0）：`renderSnapshot` 加第 4 个可选参数 `options: RenderOptions = {}`（`{ pageTitle?: string | null }`）；给出非空 `pageTitle` 时向 `md.core.ruler` 追加规则 `omit_duplicate_title`：`state.tokens` 前三枚为 `heading_open(h1)`/`inline`/`heading_close` 且 自写 `plainText(inline.children)`（`text`/`code_inline` 取 content、换行折空格、递归子节点；不用 markdown-it 的 `renderInlineAsText`，它跳过行内代码——Review F1）经 `comparable()`（NFC → 连续空白折叠 → trim → 小写）后与标题相同 → `splice(0, 3)`。**未触碰** `RENDERER_OPTIONS`、image/link 规则、`createRenderer` 签名。
  - `ContentSnapshot.tsx`（+11/−2）：新增可选 prop `pageTitle`，进 `useMemo` 依赖并传给 `renderSnapshot`；源码视图（`<pre>{snapshot.content}</pre>`）不经渲染器，原文不变。
  - `ResourceDetail.tsx`（+6/−0）：`ReaderContent`（memo）加 `pageTitle: string`，由 `resourceTitle(toolbarItem)` 提供——与页面 `h1` 显示的是同一个字符串。
- **新增用例（9 条）与判别性验证**（把 `if (options.pageTitle) omitDuplicateTitle(...)` 注释掉后实跑，标 ★ 者变红；随后恢复）：
  - `snapshotMarkdown.test.ts`（6 条 + F1 修复后 1 条「行内代码计入标题文本」，换回 `renderInlineAsText` 即红）：★ 相同→删且其余段落/h2 照旧；★ 规范化比较（多空白、大小写、`**粗**` 行内格式）；不同/带站点后缀/更短→保留；★ 非首块保留 + 后面的同名 h1 保留（该条含「两处同名只删首个」）；`##` 永不删；不传/空 `pageTitle` 输出与不传逐字节相同且含 `<h1>`。
  - `ResourcePages.test.tsx`（2 条）：★ 资料标题 = 「冻结的标题」时页面上该一级标题恰好一个、不在 `.snapshot-rendered` 内、段落照常、源码视图仍含 `# 冻结的标题`；对照：标题「冻结的标题 - 某站」时正文 h1 保留。
  - `reader-layout.spec.ts`（1 条，真实浏览器）：种子标题 = 正文首行 `# …` → 页面级 h1 恰好一个、`.snapshot-rendered h1` 为 0、`h2` 照常、源码视图含原文。既有四条种子标题「阅读器改版 · 数组基础 X」≠ 正文 h1「数组基础」，行为不变，继续以 `getByRole('heading',{name:'数组基础'})` 取正文标题。
  - 保留边的用例在旧代码上本就绿，它们钉的是「不误删」，不是判别性。
- **既有用例改动**：无。`snapshotMarkdown.test.ts` 既有 31 条（含 `RENDERER_OPTIONS` 三值）零改动。
- **检查（候选 `aa7f65d`，干净工作区）**：`check_task.py --candidate aa7f65d` → `STATIC PASS`，`files=7`，`product_fingerprint=7470c467…`，`profiles=frontend`：format/lint/typecheck/build exit 0，`test --run` **560 passed / 23 files**（基线 552 + 8）→ **CHECKS PASS**；`npm run test:e2e` → **56 passed (35.4s)**（基线 55 + 1）；`git diff --check` exit 0。
- **`03-reader.png`**：尚未重截——本分支从 main `5c6cd9b` 拉出，main 上的截图仍是顶栏带标题的旧形态，此刻重截会与 PR #60 的截图冲突。**待 PR #60 合并后把 main 并回本分支再截**，届时形成新候选、同一 Reviewer 增量确认。
- **已知限制**：
  1. 只认「完全相同」（规范化后）。资料标题带站点后缀（「xxx - 知乎」）而正文 h1 是「xxx」时不去重。扩展抓取的标题来自 Defuddle `parsed.title`（一般已是干净的文章标题），手工粘贴时用户通常把两者写成一样，故常见形态已覆盖；后缀形态待用户确认后另立任务放宽。
  2. 首块之前若有任何块（哪怕一张图；`html:false` 下 HTML 注释也会成为一个段落块），h1 就不是首块、不删——刻意如此。
  3. 资料标题为空时页面显示占位「未命名资料」并以它比较：正文首行恰为 `# 未命名资料` 会被去重——页面顶部仍显示同名，语义一致（独立 Review F3）。
  4. 行内代码计入标题文本（独立 Review F1 修复）：`# React Hooks \`v18\`` 与标题「React Hooks」不同、保留；与「React Hooks v18」相同、去重。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：本提交之后的 HEAD 即代码候选（`aa7f65d` + 本证据写回）；`03-reader.png` 重截后另出候选并增量确认。
- Review：待派独立只读 Reviewer。Acceptance：L2，N/A。
- 最终状态：status=**IN_REVIEW**。
<!-- EVIDENCE:END -->
