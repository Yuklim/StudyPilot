# TASK-053：正文开头与资料标题相同的一级标题不再重复渲染

```toml
schema_version = 2
id = "TASK-053"
status = "IN_PROGRESS"
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
2. `ContentSnapshot` 新增可选 prop `title`（由 `ResourceDetail` 传 `resourceTitle(toolbarItem)`），透传给 `renderSnapshot`；经 memo 的 `ReaderContent` 同步加 prop。
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

（实施后填写）

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

（实施后填写）
<!-- EVIDENCE:END -->
