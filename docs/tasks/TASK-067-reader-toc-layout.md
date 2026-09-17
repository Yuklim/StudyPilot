# TASK-067：阅读器三栏——左侧目录栏 + 阅读进度线 + 右栏「心得 / 信息」Tab（Pencil 草图第一批）

```toml
schema_version = 2
id = "TASK-067"
status = "ACCEPTED"
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
  "frontend/src/features/resources/outline.ts",
  "frontend/src/features/resources/readerPosition.ts",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/features/taxonomy/ClassificationPages.test.tsx",
  "frontend/src/shell/Icon.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/reader-layout.spec.ts",
  "frontend/e2e/reader-notes-sidebar.spec.ts",
  "frontend/e2e/notes-pages.spec.ts",
  "frontend/e2e/taxonomy.spec.ts",
  "frontend/e2e/taxonomy-pages.spec.ts",
  "frontend/e2e/file-pages.spec.ts",
  "frontend/e2e/resource-edit-pages.spec.ts",
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

草图中的「记下这段」浮动胶囊（引文写心得）**不在本任务**，作为 TASK-068 紧随其后（用户已确认方向，串行）；`?` 快捷键面板按用户 2026-09-17「快捷键先不做」取消。

### 目标

1. **左侧目录栏**（新组件 `ReaderOutline`）：正文渲染完成后从 `.snapshot-rendered` 的 `h2`/`h3` 生成目录（无标题时整栏不渲染）；点击平滑滚动到对应标题（标题无 id 时用元素引用滚动，不改渲染器）；随滚动高亮当前节（IntersectionObserver 或 scroll 计算，±1 节容差）；顶栏常驻「目录」图标按钮（`aria-expanded`）切换显隐，目录栏内有「隐藏」；**不做快捷键**（用户 2026-09-17 实测反馈后修订：原「⋯ 菜单里的显示目录 + ⌘\」隐藏后找不回来，且用户「快捷键先不做」）；显隐状态存 `localStorage`（与导航折叠同一做法）。仅 `min-width: 1280px` 显示为左栏；以下不渲染（不做浮层，留给后续）。
2. **阅读进度线**：`.reader-toolbar` 底部 3px 线，绿色宽度 = `progress.progress_percent`%；`aria-hidden`，进度按钮文字不变（仍显示状态 · 百分比）。
3. **右栏 Tab**：既有「记录与理解」侧栏头部改为两个 Tab「心得」「信息」（`role="tablist"`）；「心得」= 现 `NotesPanel`；「信息」= 来源、标签、保存原因、进度、收藏时间（内容来自现 `ReaderContext` + `ReaderHeader` 的元信息）；`ReaderContext` 从正文列移除（标签/保存原因不再占正文顶部）。**推翻 TASK-046 的「上下文层留在正文顶部」决定**：主 Agent 2026-09-17 指出冲突后，用户选定「按草图移入信息 Tab」。心得角标（已有 `notesCount`）显示在「心得」Tab 上。默认 Tab = 心得；`⌘J` 行为不变。
4. **记住阅读位置**：滚动时（节流）把 `scrollY` 相对正文高度的百分比与位置写入 `localStorage`（键含资料 id 与快照 sha256，快照变化即失效）；再次打开同一资料且正文渲染完成后恢复到该位置（图片未加载导致的偏差可接受，取整节容差）；顶部 `?` 之外新增小字「上次读到 62%」不在本任务，位置恢复本身不需要 UI。进度线仍显示学习进度 `progress_percent`；**不自动写学习进度**（用户 2026-09-17 选定「一键写入」，在 TASK-068 做「记为学习进度」按钮，走既有 study-records 接口）。
5. 三栏尺寸：`.reader-body` 在 ≥1280px 为 `240px minmax(0,1fr) [320px]` 网格（右栏仅 notes-open 时占列，沿用 TASK-045 挤压逻辑）；正文列内 `.resource-snapshot` 仍 `--reader-measure` 居中。

### 非目标

不改 `snapshotMarkdown.ts`、不改契约与后端、不做移动端目录浮层、不做引文写心得、`?` 面板、「记为学习进度」按钮（均 TASK-068）；不自动写学习进度（契约语义：进度只由学习记录推进）、不改心得整页编辑器 `/notes/*`、不动资料库页。

### allowed_paths 修订（登记后、冻结前）

实现中发现：标签行移入「信息」Tab 后，5 个既有 e2e（notes-pages / taxonomy / taxonomy-pages / file-pages / resource-edit-pages）与 1 个单测（taxonomy/ClassificationPages）按「标签行常驻可见」断言，必须改为先开右栏、切「信息」（不降低断言：仍验标签真的写进去了）；目录逻辑拆出 `outline.ts`（react-refresh 规则要求组件文件只导出组件；`readerOutline.ts` 与 `ReaderOutline.tsx` 在 macOS 上只差大小写会撞）。`readerPosition.test.ts` 未单独建，位置记忆用例并入 `ReaderOutline.test.tsx`。

### 禁止范围

所有未列入 allowed_paths 的路径。

### 顺带登记

TASK-066 登记为 MERGED（用户 2026-09-16 已合并 PR #74，merge `d1fa5e5`）。

## 完成条件

1. RTL：含 h2/h3 的快照 → 目录项按文档顺序生成且层级正确；无标题 → 不渲染目录栏；点击目录项调用滚动到对应元素；顶栏「目录」按钮切换显隐；「信息」Tab 展示来源/标签/保存原因；`ReaderContext` 不再出现在正文列。
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

- **实现 SHA**：`af5ef2f`（登记 `df170e1`）。
  - `outline.ts`：`collectOutline`（`.snapshot-rendered` 内 h2/h3 → 项）、`useOutline`（MutationObserver 盯正文列，rAF 合并）、`currentIndex`（视口顶 80px 线之上最后一个标题）。
  - `ReaderOutline.tsx`：`<nav aria-label="目录">`，标题行「目录 · N 节 · 隐藏」、`<ol>` 项按钮（`aria-current="location"`）、底部提示；点击 `scrollIntoView({smooth,start})`。
  - `readerPosition.ts`：`localStorage` 键 `studypilot.reader.position.<id>`，值 `{top, percent, fingerprint(渲染文本长度), savedAt}`，读时校验形状；`percentOf` 供 TASK-068 显示「上次读到 N%」。
  - `ResourceDetail.tsx`：`readerMain` 进 state（callback ref）→ `useOutline`；`outlineOpen`（`studypilot.reader.outline`，默认显示）+ ⌘\/Ctrl+\；`.reader-body.outline-open` 第一列渲染目录（仅 ≥1280px 且有标题）；位置恢复（正文出现后一次，指纹相符才 `scrollTo`）与按帧节流写回；右栏 `role=tablist` 两 Tab「心得（角标）」「信息」，两个 `tabpanel` 用 `hidden` 切换、NotesPanel 保持挂载；`ReaderContext` 从正文列移除。
  - `ResourceToolbar.tsx`：`.reader-progress` 进度线（`aria-hidden`，宽 = progress_percent%）；⋯ 菜单「显示/隐藏目录」（有目录时）；新 `ReaderInfo`（ReaderContext + 来源/学习进度/收藏时间）。
  - `styles.css`：进度线、`.reader-side-tabs`、`.reader-outline*`、`h2/h3 { scroll-margin-top: 72px }`、≥1280px 网格 `240px 1fr [340px]` 四种组合；`.reader-context` 改为侧栏内的纵向布局 + `.reader-info-list`。
- **测试**：新增 `ReaderOutline.test.tsx` 10 例（目录顺序/层级、无标题不渲染且菜单无开关、点击滚动、滚动高亮切换、隐藏按钮/⌘\/Ctrl+\/Shift 不算/菜单文案与 localStorage、上次隐藏则启动隐藏、源码容器不收集、位置保存+指纹+重开恢复、指纹不符不恢复、坏存储忽略）；`ResourceToolbar.test.tsx` 改 3 例 + 新增进度线 1 例；`ResourcePages.test.tsx`、`ClassificationPages.test.tsx` 各改 1 例；e2e 新增 2 条（`reader-layout.spec.ts`：目录在正文左、宽 ≈240、开心得三栏并存且正文 ≥740、点目录项当前项切换且标题在顶栏下、⌘\ 隐藏正文变宽、刷新后仍隐藏、菜单显示；位置记忆：滚到 1200 → 存储 1200 → 重开 scrollY≈1200 → 替换正文后 0）；既有 e2e 6 处按「信息 Tab」改定位（`getByText('未开始 · 0%')` 因信息 Tab 也显示一次而双命中 → 改顶栏按钮）。
- 本地（`frontend/`，2026-09-17）：`format:check` / `lint` / `typecheck` exit 0；`vitest run` **647 passed**（28 文件）；`playwright test` 全套 **65 passed**（原 63 + 2）。
- 真实浏览器：Pencil 内置浏览器视口 1046px（<1280）按设计不显示目录列；三栏与位置记忆由 1440×900 的 e2e 实测覆盖。
- **修订 `2b`（用户实测反馈）**：去掉 ⌘\ 与 ⋯ 菜单项，改为顶栏「目录」图标按钮（`Icon` 新增 `outline`）；`ReaderOutline.test.tsx` 隐藏/显示用例改为按钮 + 断言 ⌘\ 无效 + 菜单无目录项；e2e 同步改为点按钮。重跑：lint/format/typecheck 0、vitest 647、e2e 65。
- 已知限制：目录当前节按几何位置判定（最后一个滚过 80px 线的标题），不用 IntersectionObserver；窄屏（<1280px）无目录（非目标）；位置指纹用渲染文本长度，同长度不同内容的替换（极少）会恢复到旧位置。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：**`80b4d87`**（范围 `d1fa5e5..80b4d87`，18 个文件，均在 allowed_paths 内；前一候选 `af5ef2f`）；本次写回仅 docs，Review 结论直接继承。
- Review（独立只读 `.claude/agents/reviewer.md`，声明仅持 Read/Grep/Glob）：**PASS**。原文摘录：「安全边界：snapshotMarkdown.ts、ContentSnapshot.tsx 无改动；目录只 textContent → React 文本节点，无 XSS 面。位置记忆：仅存 top/percent/fingerprint/savedAt，readPosition 形状校验完整；restoredFor 在 cleanup 按 resource 重置，同资料重进可恢复；observer/scroll/rAF 均卸掉；恢复前不写 0 成立。⌘\ 判定与 App.tsx 同套；CSS 四种组合特异性正确，<1280 由 squeeze 守卫。右栏：NotesPanel 常驻挂载；Esc closest('.reader-notes') 仍成立；两处角标均 aria-hidden。测试：既有 e2e/单测改后仍断言标签写入/读回；新用例判别性足够。」
- 增量复审（同一 Reviewer，`af5ef2f..80b4d87`，覆盖新候选并继承前次范围）：**PASS**。原文摘录：「图标按钮符合约定：无文字节点、aria-label=目录、title 随态；aria-expanded 与心得按钮同款。ResourceDetail 已无 \\ keydown 监听。隐藏目录只改 outlineOpen，outlineAvailable 不变，顶栏按钮常驻，不会丢焦点。」F5（可选）：目录栏「隐藏」后 nav 卸载、键盘焦点掉到 body，建议归还给顶栏「目录」按钮——并入 TASK-068。
- 非阻断遗留项（Review F1–F4，均「可选」）：F1 `ResourceDetail.tsx:197-205` 目录显隐的 localStorage 写在 setState 更新函数内（StrictMode 双调用幂等，无后果）；F2 `outline.ts:43` container 变 null 时不清空 items（元素已脱离 DOM，无功能影响）；F3 `clearPosition` 未被调用，删除资料后键残留（只有数字）；F4 来源链接 `rel=noreferrer` 已足够、未加 `referrerPolicy`。F1/F3 并入 TASK-068（同文件）；F2/F4 记录。Reviewer 另记：Tab 无方向键导航；指纹同长度误恢复（已在已知限制）。
- Acceptance：L2 N/A。
- 最终状态：**ACCEPTED**，待用户合并。
- 日期与决定日志：2026-09-17 用户确认三栏草图「可以」；主 Agent 拆为 067（布局/导航/位置记忆）+ 068（引文写心得 / ? 面板 / 记为学习进度）；用户追加「记住位置 + 同步学习进度」，同步方式选「一键写入」。
<!-- EVIDENCE:END -->
