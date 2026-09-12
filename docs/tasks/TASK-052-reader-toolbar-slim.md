# TASK-052：阅读页顶栏瘦身——标题移出顶栏（全宽统一）+ 窄屏 ⋯ 菜单浮动

```toml
schema_version = 2
id = "TASK-052"
status = "ACCEPTED"
risk = "L2"
risk_reason = "阅读页（/resources/:id）一处布局重排：资料标题与来源徽章从 sticky 顶栏移入正文列顶部（所有宽度统一），窄屏 ⋯ 菜单由「塞进顶栏的普通块」改回浮动。不改后端、契约、数据含义、门禁；不新增依赖。判 L2：页面 `h1` 是路由焦点落点（TASK-044 契约：各态恰好一个 h1、导航到达时聚焦它），本任务**保持该契约不变**但改变了它在 DOM 里的位置，改错了屏幕上看不出来，需独立 Reviewer 核对最终 diff 与测试是否真守住。不到 L3：无架构/公共 API/迁移/认证变更，单页面单模块。"
risk_flags = ["business"]
owner = "coordinator"
base = "5c6cd9be6b01bc5d7511f68abde2da402e64b615"
allowed_paths = [
  "frontend/src/features/resources/ResourceToolbar.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/styles.css",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/e2e/reader-immersive.spec.ts",
  "frontend/e2e/reader-layout.spec.ts",
  "docs/images/03-reader.png",
  "docs/tasks/TASK-051-reader-edge-fixes.md",
  "docs/tasks/TASK-052-reader-toolbar-slim.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-12 用户合并 PR #59 后指示做「② 窄屏顶栏瘦身」并要求「列形态选项的时候尽量清晰一些」。主 Agent 用 390×844 真机尺寸实测并截图后给出两个独立决定，用户选定：

- **决定 1（常态顶栏）：A3 标题移出顶栏**——顶栏只装动作（← 返回 + 学习状态 / 心得 / 原网页 / ⋯），标题成为正文列第一行随文章滚走；学习状态文字完整保留。
- **决定 1 补充：全部宽度统一**（而非仅窄屏）——宽屏顶栏也只装动作；页面始终只有一个 `h1`、一套结构。
- **决定 2（⋯ 菜单展开）：B1 浮在顶栏下方**——与宽屏一致，顶栏高度不变、正文不动。

未选的形态（A1 一行截断标题 / A2 只压缩 / A4 状态收进菜单 / B2 底部抽屉）**不做**。

### 登记前实测（390×844，main `5c6cd9b`）

- 常态顶栏 **123px**（两行：「← 返回资料库 · 网页 · 标题」+ 四个按钮）；
- ⋯ 菜单展开时顶栏 **472px**（`styles.css` ≤640px 档 `.reader-menu { position: static; width: 100% }`，菜单在 sticky 盒子内把顶栏撑高，正文被整体推下）；
- 心得浮层紧贴顶栏下沿（TASK-049 已修，靠实测 `--reader-toolbar-h`）。
- 出处：TASK-046 遗留 A（顶栏两排约 120px）与验收 F7（菜单撑高顶栏至 `min(70vh,560px)`）；TASK-049 遗留 1/5（菜单变高盖住浮层头部、极矮横屏浮层越界）随 F7 修复自然消解。

### 目标

1. 顶栏在所有宽度只装动作：`.reader-toolbar` 内不再有 `h1` 与来源徽章；390px/320px 常态顶栏高度 **≤ 64px**（单行；按钮 38px + 上下 9px 留白 + 1px 边），1440px 不高于现状。
2. 资料标题（页面 `h1`）与来源徽章移到正文列顶部（`.reader-main` 内、上下文层之上），与 740px 正文列对齐、随正文滚走；**各态恰好一个 h1、路由到达时焦点落在它上**（既有 App.test 三条返回路径与 e2e「title takes focus」不改且通过）。
3. ≤640px 的 `⋯` 菜单改为浮动（与宽屏同一套 `position: absolute`），展开时顶栏高度不变、`.reader-body` 顶边不动，菜单整块在视口内。
4. 窄屏「返回资料库」文字视觉隐藏只留 ←（`.sr-only` 保留可访问名称「返回资料库」）；≥641px 文字照旧。
5. 既有 TASK-043～049 的全部断言只增不减（顶栏 sticky、心得浮层让开实测顶栏高度、inert、Esc、四档不横向溢出等）。
6. 顺带重截 `docs/images/03-reader.png`（README 阅读器截图会因标题位置变化而失真；沿用 TASK-050 方式）。

### 非目标

- 不改菜单内容、顺序、删除区形态；不做底部抽屉。
- 不改学习状态徽章文案（A4 未选）；不改心得浮层的宽/高/内滚。
- 不改 `ContentSnapshot.tsx`/`NotesPanel.tsx`/`snapshotMarkdown.ts`；不改后端、契约、门禁、扩展；不引入依赖。
- 不处理 TASK-046 遗留 B（正文 Markdown 自带 `# 一级标题` 也渲染为 h1）——本任务不改 snapshotMarkdown。

### 顺带完成的状态登记

`docs/tasks/TASK-051-reader-edge-fixes.md` 在 `allowed_paths` 内，仅用于把 `status` 由 `ACCEPTED` 登记为 `MERGED`（2026-09-12 用户合并 PR #59，merge `5c6cd9b`，已用 `gh pr view 59` 与 `git log origin/main` 双向核实），并同步索引该行。

## 完成条件

1. 单测（`ResourceToolbar.test.tsx`）：`h1` 不在 `.reader-toolbar` 内、在 `.reader-main` 内且位于正文之前；来源徽章不在顶栏；页面仍恰好一个 `h1`；「返回资料库」链接可访问名称不变。
2. e2e（`reader-immersive.spec.ts`）：390/320 两档常态顶栏高度 ≤ 64px；打开 ⋯ 菜单后顶栏高度不变、`.reader-body` 顶边不变、菜单 boundingBox 在视口内；1440px 顶栏高度 ≤ 现状（实测记录）。
3. e2e（`reader-layout.spec.ts`）既有「正文第一屏」「标题聚焦」用例不改且通过。
4. 全部既有单测与 e2e 通过；新增断言对旧布局变红（记录验证方式）。
5. `check_task.py --candidate <SHA>` frontend profile PASS；`git diff --check` exit 0。
6. `03-reader.png` 重截并目视核验记录。
7. L2 独立只读 Reviewer 对 `base..candidate` 出 PASS。

## 上下文包

- 规则：`AGENTS.md` §4/§5/§6；`docs/governance/风险分级与检查规则.md`。
- 代码：`ResourceToolbar.tsx:155-225`（顶栏结构）、`:354-374`（`ReaderContext`）；`ResourceDetail.tsx:196-210`（读取中/失败态的 h1）、`:243`（`ReaderContext` 挂载点）；`styles.css:2187-2275`（顶栏/菜单）、`:2327-2341`（≤640px 档）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-052-reader-toolbar-slim.md --worktree`；`cd frontend && npm run test -- --run && npm run test:e2e`。

## 实现与测试

- **实现 SHA**：`917e6c1`（实现 + 测试 + 截图同一提交）。
- **变更摘要**（`git diff --numstat 5c6cd9b..917e6c1`，5 个前端文件 +190/−38，另 1 张 PNG）：
  - `ResourceToolbar.tsx`（+32/−14）：顶栏 `.reader-toolbar-actions` 只剩返回链接 + `.reader-toolbar-buttons`；`h1` 与来源徽章移入新导出的 `ReaderHeader({resource, headingSlot})`（`<header class="reader-header">`）；`ResourceToolbar` 去掉 `headingSlot` prop；返回链接文字包进 `.reader-back-text`（箭头 span 内容 `'← '` 未动，既有「箭头不进可访问名称」断言原样通过）。
  - `ResourceDetail.tsx`（+4/−2）：`.reader-main` 内在 `ReaderContext` 之前挂 `ReaderHeader`，`headingSlot` 改传给它；读取中/失败态的占位 `h1` 不变。
  - `styles.css`（+39/−22；F1 修复后 +42/−22）：新增 `.reader-header`（`max-width: var(--reader-measure)`、居中、标题 1.7rem/1.3、可换行；≤640px 1.45rem）；`.reader-toolbar .reader-back` 覆盖 `.text-link` 的 `min-height:44px; margin-top:12px`（首轮候选写成 `.reader-back`，连读取中/失败态的占位返回链接一起命中，独立 Review F1 指出后收窄到顶栏内；**这一项单独把顶栏撑到 75px**，改前宽屏顶栏实际就是 75px，不是登记时估的 56px）；删除 ≤640px 档的三条旧规则（按钮整行换行、标题放开换行、`.reader-menu { position: static }`），改为 `.reader-back-text` 视觉隐藏（等价 `.sr-only`）；宽屏心得列 `top: 74px → 56px`、`max-height: calc(100vh - 88px) → calc(100vh - 70px)`；浮层兜底 `--reader-toolbar-h` 默认 `74px → 56px`。
  - 测试见下。
- **实测（真实浏览器，e2e 输出）**：常态顶栏 **320px / 390px / 1440px 均 57px**（改前 123px / 123px / 75px）；⋯ 菜单展开后顶栏仍 57px、`.reader-body` 顶边不动（改前 472px、正文整体被推下）；心得浮层 `top` 跟随实测 57px。
- **新增用例（2 条）与判别性验证**：
  1. `ResourceToolbar.test.tsx`「keeps the title and source chip in the article column, not in the sticky toolbar」：页面级 `h1` 恰好一个（`pageHeadings()` 排除正文 Markdown 自带的 h1）、不在 `.reader-toolbar` 内、在 `.reader-main` 内且在标签导航与正文快照之前；顶栏无 `.source-chip`、无任何 heading；文章头里徽章文案「网页」。**判别性**：`git stash` 三个实现文件只留测试 → 红（`closest('.reader-toolbar')` 非 null）。
  2. `reader-immersive.spec.ts`「the toolbar is one row of actions on a phone, and the more menu floats instead of growing it」：320/390 两档常态顶栏 ≤64px、页面 h1 唯一且在 `.reader-main`、返回链接可见且宽 <48px（图标态）且可访问名称仍为「返回资料库」；展开 ⋯ 后顶栏高度不变（±1）、`.reader-body` 顶边不变、菜单 boundingBox 左右在视口内、在动作行之下、不横向溢出、菜单项中心 `elementFromPoint` 命中 `.reader-menu`；1440px 顶栏 ≤64px、标题在 `.reader-main` 且与正文列左对齐（±2px）。**判别性**：同样 stash 实现 → 首档即红（`320px 下顶栏只有一行动作`，实测 123px）。
- **既有用例改动**：无。既有 e2e 里 TASK-049 的「浮层让开实测顶栏高度」用例自行适应（输出由 75px 变 57px）。
- **检查**：
  - `check_task.py --candidate 917e6c1` → `FAIL: binary file needs explicit manual validation: docs/images/03-reader.png`（对 PNG 按设计返回，与 TASK-047/050 相同）；
  - 把 PNG 临时恢复为改前版本后 `check_task.py --worktree` → `STATIC PASS`，`files=6`，`product_fingerprint=bd5a4359…`，`profiles=frontend`：format/lint/typecheck/build exit 0，`test --run` **553 passed / 23 files**（基线 552 + 新增 1）→ **CHECKS PASS**；随后 `git checkout HEAD -- png` 复原。
  - `npm run test:e2e` → **56 passed (36.1s)**（基线 55 + 新增 1）。`git diff --check` exit 0。
- **03-reader.png 重截**：沿用 TASK-050 的一次性 spec（同一篇合成文章、同标签/心得），1440×900，截完删除 spec。
- **已知限制**：
  1. **页面 `h1` 与正文 Markdown 自带的 `# 一级标题` 现在上下相邻**（TASK-046 遗留 B）：标题移入正文列后两者视觉上连在一起（截图里可见「React 状态管理的取舍」出现两次）。改前也是两个 h1，只是一个在顶栏里不显眼。修法在 `snapshotMarkdown.ts`（禁止范围）或渲染层「首个 h1 与资料标题相同则不重复渲染」，属新决定，**本任务不做、上报用户**。
  2. ⋯ 菜单的静态位置在动作行下 6px，落在顶栏 9px 底部留白里（与宽屏一致的既有形态）；e2e 断言按此写（`≥ 顶栏底边 − 9`）。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：首轮候选 **`ff583b3`**（base `5c6cd9b`；实现 `917e6c1` + 证据写回）；处置 F1/F2 后最终候选 **`eba3527`**（`ff583b3..eba3527` 3 文件 48 行：`styles.css` 选择器收窄、e2e 注释、记录一行）。全部在 `allowed_paths` 内。
- 检查绑定最终候选：PNG 临时恢复为改前版本后 `check_task.py --worktree`（工作区 = `eba3527`）→ `STATIC PASS`，`files=8`，`product_fingerprint=84a19faf…`，frontend 五项 exit 0，`553 passed` → **CHECKS PASS**；`reader-immersive` + `reader-layout` e2e 11 passed（F1 只改 CSS 特异度，其余 e2e 沿用 `917e6c1` 上的 56 passed，未受影响的证据不重复执行）。
- 二进制人工核验（`03-reader.png`，主 Agent 目视）：`PNG image data, 1440 x 900, 8-bit/color RGB`，sha256 `56a02515…`；图中顶栏单行「← 返回资料库 ……… 未开始 · 0% / 心得(1) / 原网页 / ⋯」，正文列顶部「网页」徽章 + 标题 h1 + 标签「待复习 / 精读」+ 保存原因 + 分隔线，其下正文；无左栏/面包屑/页脚/元信息。无个人真实数据、令牌或本机路径。390px 三态（常态 / 菜单展开 / 心得浮层）另行目视：顶栏单行、菜单浮动不推正文、浮层紧贴顶栏。
- Review（L2，独立只读 Reviewer，`.claude/agents/reviewer.md`，仅 Read/Grep/Glob）：首轮对 `5c6cd9b..ff583b3` **PASS**（F1 可记录后继续、F2–F4 可选）；同一 Reviewer 增量复审 `ff583b3..eba3527` **PASS，No findings**，声明继承首轮六项核对。报告原文：

> **首轮**
> - 基线 `5c6cd9b` → 候选 `ff583b3`（工作区 HEAD，clean）。本 Agent 仅有 Read/Grep/Glob，无写工具、无 Bash，未改任何文件。审了导出的两份 diff 全文，并核对了 `ResourceDetail.tsx`、`ResourceToolbar.tsx`、`styles.css`、`heading.tsx`、`App.tsx` 的 `registerHeading`、既有单测/e2e、TASK-051 状态与索引两行。
> 1. 焦点契约保持：`headingSlot` 只挂两处且互斥——读取中/失败态占位 `h1`（`ResourceDetail.tsx:205`）与 `ReaderHeader` 的 `h1`（`ResourceToolbar.tsx:359`），`toolbarItem` 真假各渲染一个；`App.tsx:31-50` 的 `registerHeading` 只依赖 ref 回调，不依赖 DOM 位置。`pageHeadings()` 与 e2e `h1:not(.snapshot-rendered h1)` 均排除正文 h1，恰好一个的断言仍真。
> 2. 箭头 span 仍 `aria-hidden` 且内容 `'← '`；既有「back arrow」用例断言的是同一结构，未削弱。可访问名称由 320/390 真浏览器 `getByRole('link',{name:'返回资料库'})` + 宽度 <48 双向证明。
> 3. `.reader-menu` 是 `.reader-toolbar` 直接子元素，sticky 是定位元素、建立包含块；`right:0` 相对通栏顶栏，320px 宽 288px → x=32 ≥ 0；`--reader-toolbar-h` 仍取 `closest('.reader-toolbar')`，绝对定位菜单不影响其高度。
> 4. 顶栏 57px；宽屏 `top:56px`、`max-height: calc(100vh-70px)`、兜底 56px 三处自洽。`.reader-back` 选择器不只命中顶栏链接，见 F1。
> 5. 两条新用例断言的是 DOM 归属与真实布局数值，stash 实现即红的说明可信；≤64/<48/±1/±2/≥底边−9 都比实测紧或恰好守住「不盖动作行」；1440 断言 ≤64 比完成条件的「≤ 现状 75」更严。既有用例零改动。
> 6. 全部改动在 `allowed_paths` 内；+190/−38、553/552、56/55、57/123/75/472 与 diff 及记录一致；已知限制 1 如实上报。
> - F1（可记录后继续）`styles.css:2201-2207` `.reader-back { min-height:38px; margin-top:0 }` 同时命中读取中/失败态的占位返回链接：最小高由 44 降为 38。影响仅过渡态。可改为 `.reader-toolbar .reader-back`。
> - F2（可选）`reader-immersive.spec.ts:357` 注释「改前单行 ≈56px」与记录已更正的「改前 75px」不一致，仅注释。
> - F3（可选，记录即可）页面 `h1` 现位于 `.reader-main`，窄屏心得浮层展开时随之 `inert`；展开必经心得按钮，焦点已在按钮/写作框，无实际焦点丢失路径。
> - F4（可选）记录称 TASK-049 遗留 1「自然消解」：准确的是「顶栏不再撑高压住浮层头部」；两者同开时浮动菜单仍会盖在浮层头部之上（z6 > z5，与宽屏一致，可 Esc 关闭）。建议措辞上区分。
> - **结论：PASS**（F1 记录后继续，F2-F4 可选）。
>
> **增量复审（`ff583b3` → `eba3527`）**
> - 只读证明同前。增量范围：3 文件 48 行，全部在 `allowed_paths` 内，只处置 F1/F2，无产品行为新增。
> 1. `styles.css:2207` `.reader-toolbar .reader-back` 特异度 (0,2,0) > `.text-link` (0,1,0)，顶栏内链接仍 38px、顶栏仍 57px；占位态链接不在 `.reader-toolbar` 内，恢复 44px；`margin-top` 由 `:2604` 的 20px 决定，与基线相同。F1 关闭。
> 2. e2e 注释改为「改前实测 75px」，断言未动。F2 关闭。
> 3. 记录 `styles.css` 一行补记位于标记区外的实现段，属对已审实现的如实修订。
> - **继承范围声明**：首次审查六项核对全部继承；增量未触及 TSX、测试断言或 ≤640px 档规则。
> - **Findings**：No findings（增量）。**结论：PASS**（覆盖最终候选 `eba3527`）。

- findings 处置：

| # | 处置 | 依据 |
| --- | --- | --- |
| F1 | **已改，出新候选 `eba3527`**：选择器收窄为 `.reader-toolbar .reader-back`；同一 Reviewer 增量确认 PASS。 | 一行修正，避免过渡态触控高退化 |
| F2 | **已改**（同一提交，注释）。 | 同上 |
| F3 | **记录，不改**：浮层展开时页面 h1 随正文 `inert`，属遮罩语义的自然结果，无实际焦点丢失路径。 | §6「不为理论完备阻断」 |
| F4 | **记录，措辞修正**：TASK-049 遗留 1 应表述为「顶栏不再因菜单撑高而压住浮层头部」；菜单与浮层同开时菜单仍在浮层之上（与宽屏一致，Esc 可关）。登记段「自然消解」按此理解。 | 叙述精度 |

- Acceptance：L2，N/A。
- 最终状态/风险/用户操作：status=**ACCEPTED**（L2：1 Worker → 自动检查 → 1 名独立只读 Reviewer（两轮）→ 主 Agent 汇总）。**未 MERGED**——是否合并由用户本人决定，Agent 不合并、不推送 main。
- 非阻断遗留项：
  1. **页面 `h1` 与正文 Markdown 自带 `# 一级标题` 相邻重复**（TASK-046 遗留 B，本任务使其更显眼）。修法二选一：`snapshotMarkdown.ts` 降级策略（禁止范围）或渲染层「正文首个 h1 与资料标题相同则不重复渲染」。**属产品决定，待用户。**
  2. （F3）浮层展开时页面 h1 处于 `inert` 子树内，无实际路径触发路由聚焦。
  3. （F4）菜单与心得浮层同开时菜单盖在浮层头部之上，与宽屏一致。
- 日期与决定日志：
  - 2026-09-12 用户合并 PR #59 后指示做窄屏顶栏瘦身并要求「形态选项清晰」；主 Agent 实测 390px 截图 + 两个独立决定；用户选定 A3 + 全宽统一 + B1。
  - 2026-09-12 实现 `917e6c1`（2 条新用例 stash 实现变红验证；发现宽屏顶栏实为 75px 而非估的 56px，根因 `.text-link` 的 44px/12px）；`ff583b3` 冻结首轮候选并登记 TASK-051 MERGED。
  - 2026-09-12 独立 Review 首轮 PASS（F1–F4）→ 处置 F1/F2 → `eba3527` → 同一 Reviewer 增量 PASS → 主 Agent 写回并置 `ACCEPTED`；待用户合并。
<!-- EVIDENCE:END -->
