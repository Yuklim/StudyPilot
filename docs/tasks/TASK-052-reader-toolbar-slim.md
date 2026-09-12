# TASK-052：阅读页顶栏瘦身——标题移出顶栏（全宽统一）+ 窄屏 ⋯ 菜单浮动

```toml
schema_version = 2
id = "TASK-052"
status = "IN_PROGRESS"
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

（实施后填写）

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

（实施后填写）
<!-- EVIDENCE:END -->
