# TASK-067：阅读器三栏——左侧目录栏 + 阅读进度线 + 右栏「心得 / 信息」Tab（Pencil 草图第一批）

```toml
schema_version = 2
id = "TASK-067"
status = "READY"
risk = "L2"
risk_reason = "阅读器页面布局与导航的普通业务实现：目录从已渲染 DOM 的 h2/h3 生成（不改 snapshotMarkdown.ts 的安全渲染配置、不改契约、不改后端）；进度线只读已有 progress_percent；右栏 Tab 只是把既有 ReaderContext 元信息挪进侧栏。用户可见行为变化多、涉及既有 e2e（TASK-045/049/052 的阅读器布局断言），按 business 归 L2：独立只读 Review；验收 N/A。"
risk_flags = ["business", "small-ui"]
owner = "coordinator"
base = "d1fa5e52bb568819bed7a5d6787072ab91fc99fb"
allowed_paths = [
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourceToolbar.tsx",
  "frontend/src/features/resources/ReaderOutline.tsx",
  "frontend/src/features/resources/ReaderOutline.test.tsx",
  "frontend/src/features/resources/readerPosition.ts",
  "frontend/src/features/resources/readerPosition.test.ts",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/reader-layout.spec.ts",
  "frontend/e2e/reader-notes-sidebar.spec.ts",
  "docs/tasks/TASK-067-reader-toc-layout.md",
  "docs/tasks/TASK-066-collapsed-rail-width.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-16/17 用户：「我想借助 pen 优化一下我们的阅读器和心得录入页面」→ 参考 Readwise Reader（资料库内文章 `87d7d4b7…`：「文档的结构大纲：自动生成每个文档的大纲，在屏幕一侧显示所有标题和子标题目录」「优秀的热键支持」）→ 主 Agent 在 Pencil 文档 `~/.pencil/documents/65214afd-…/pencil-new.pen` 顶层 Frame「阅读器 /resources/:id」画草图 → 用户「现在阅读器还是没有目录啊，阅读器里也要加上目录，可以放在页面左边」→ 改为三栏 → 用户「可以」。

草图（设计依据，不入库）：`[左栏｜目录 240] [正文 740 居中] [右栏｜心得 320]`；工具条下 3px 进度线；右栏 Tab 行「心得 ②· 信息 ｜ 收起 ⎋」；左栏标题行「目录 · N 节 ｜ ⌘\ 隐藏」，一级加粗、二级缩进，当前节高亮 + 左侧绿条，底部小字「随正文滚动高亮当前节；点击跳转」。

草图中的「记下这段」浮动胶囊（引文写心得）与 `?` 快捷键面板**不在本任务**，作为 TASK-068 紧随其后（用户已确认方向，串行）。

### 目标

1. **左侧目录栏**（新组件 `ReaderOutline`）：正文渲染完成后从 `.snapshot-rendered` 的 `h2`/`h3` 生成目录（无标题时整栏不渲染）；点击平滑滚动到对应标题（标题无 id 时用元素引用滚动，不改渲染器）；随滚动高亮当前节（IntersectionObserver 或 scroll 计算，±1 节容差）；`⌘\`（Ctrl+\）切换显隐，工具条「⋯」菜单里也有「目录」开关；显隐状态存 `localStorage`（与导航折叠同一做法）。仅 `min-width: 1280px` 显示为左栏；以下不渲染（不做浮层，留给后续）。
2. **阅读进度线**：`.reader-toolbar` 底部 3px 线，绿色宽度 = `progress.progress_percent`%；`aria-hidden`，进度按钮文字不变（仍显示状态 · 百分比）。
3. **右栏 Tab**：既有「记录与理解」侧栏头部改为两个 Tab「心得」「信息」（`role="tablist"`）；「心得」= 现 `NotesPanel`；「信息」= 来源、标签、保存原因、进度、收藏时间（内容来自现 `ReaderContext` + `ReaderHeader` 的元信息）；`ReaderContext` 从正文列移除（标签/保存原因不再占正文顶部）。心得角标（已有 `notesCount`）显示在「心得」Tab 上。默认 Tab = 心得；`⌘J` 行为不变。
4. **记住阅读位置**：滚动时（节流）把 `scrollY` 相对正文高度的百分比与位置写入 `localStorage`（键含资料 id 与快照 sha256，快照变化即失效）；再次打开同一资料且正文渲染完成后恢复到该位置（图片未加载导致的偏差可接受，取整节容差）；顶部 `?` 之外新增小字「上次读到 62%」不在本任务，位置恢复本身不需要 UI。进度线仍显示学习进度 `progress_percent`；**不自动写学习进度**（用户 2026-09-17 选定「一键写入」，在 TASK-068 做「记为学习进度」按钮，走既有 study-records 接口）。
5. 三栏尺寸：`.reader-body` 在 ≥1280px 为 `240px minmax(0,1fr) [320px]` 网格（右栏仅 notes-open 时占列，沿用 TASK-045 挤压逻辑）；正文列内 `.resource-snapshot` 仍 `--reader-measure` 居中。

### 非目标

不改 `snapshotMarkdown.ts`、不改契约与后端、不做移动端目录浮层、不做引文写心得、`?` 面板、「记为学习进度」按钮（均 TASK-068）；不自动写学习进度（契约语义：进度只由学习记录推进）、不改心得整页编辑器 `/notes/*`、不动资料库页。

### 禁止范围

所有未列入 allowed_paths 的路径。

### 顺带登记

TASK-066 登记为 MERGED（用户 2026-09-16 已合并 PR #74，merge `d1fa5e5`）。

## 完成条件

1. RTL：含 h2/h3 的快照 → 目录项按文档顺序生成且层级正确；无标题 → 不渲染目录栏；点击目录项调用滚动到对应元素；`⌘\` 切换 `aria-hidden`/显隐；「信息」Tab 展示来源/标签/保存原因；`ReaderContext` 不再出现在正文列。
2. e2e（1440×900）：`.reader-outline` 位于 `.reader-main` 左侧且宽 ≈240；打开心得后三栏并存、正文列 ≥ `--reader-measure`；滚动到第 2 个 h2 后目录当前项切换；进度线宽度 ≈ 百分比。
3. 既有 e2e（reader-layout / reader-notes-sidebar 的挤压、浮层、焦点断言）保持通过，必要时按新布局调整断言但不降低保障。
4. RTL/e2e：滚到正文中段离开再回来，恢复到同一位置（±1 屏）；快照 sha 变化后不恢复。
5. `check_task` frontend PASS；全套 e2e 通过；`git diff --check` exit 0。
6. L2：独立只读 Reviewer 审最终 diff → PASS。

## 上下文包

- 规则：AGENTS.md V2、frontend/AGENTS.md。
- 源：`ResourceDetail.tsx`（reader-body 两栏容器、notesOpen/⌘J 快捷键 :140-200、ReaderContent memo :30）；`ResourceToolbar.tsx`（`ReaderHeader` :349、`ReaderContext` :374、进度按钮 :149-175、⋯ 菜单）；`ContentSnapshot.tsx:372-386`（`.snapshot-rendered` 渲染点，dangerouslySetInnerHTML 由 renderSnapshot 保证安全）；`styles.css` `.reader-body/.reader-main/.reader-notes` :2848-2935、:2986-3030；`App.tsx:70-90`（⌘J 全局快捷键写法）。
- 设计：Pencil 草图（见用户授权）。
- 检查：`frontend/` 内 lint / typecheck / vitest / playwright 全套；`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-067-reader-toc-layout.md --candidate <sha>`。

## 实现与测试

- 实现 SHA/变更摘要：（待填）
- 命令、真实退出结果：（待填）

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：
- Review：
- Acceptance：L2 N/A。
- 最终状态/风险/用户操作：
- 日期与决定日志：2026-09-17 用户确认三栏草图「可以」；主 Agent 拆为 067（布局/导航/位置记忆）+ 068（引文写心得 / ? 面板 / 记为学习进度）；用户追加「记住位置 + 同步学习进度」，同步方式选「一键写入」。
<!-- EVIDENCE:END -->
