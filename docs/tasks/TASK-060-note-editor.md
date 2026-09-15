# TASK-060：整页心得编辑器（Markdown 源码/预览、自动保存）+ 全局「写心得」入口与快捷键

```toml
schema_version = 2
id = "TASK-060"
status = "IN_PROGRESS"
risk = "L2"
risk_reason = "新增前端路由与页面（`/notes/new`、`/notes/:noteId`），全局键盘快捷键与侧栏入口，心得改为自动保存（防抖 + 离开前保底）。不改后端与契约：心得仍是纯文本 `content`（≤50,000 字），Markdown 只是文本；预览复用阅读器正文渲染器（`html:false`）。判 L2：触及「随手记录」这条核心路径与版本冲突保护（自动保存下冲突/离线的处理改错会静默丢字或覆盖），需独立 Reviewer 看最终 diff；不到 L3：无契约/后端/数据变更。"
risk_flags = ["business"]
owner = "coordinator"
base = "1a5d3fb230b5d450683371cc2c909505ea4e2975"
allowed_paths = [
  "frontend/src/features/notes/NoteEditorPage.tsx",
  "frontend/src/features/notes/NoteEditorPage.test.tsx",
  "frontend/src/features/notes/noteTitle.ts",
  "frontend/src/features/notes/noteTitle.test.ts",
  "frontend/src/shell/pages.ts",
  "frontend/src/shell/Screen.tsx",
  "frontend/src/shell/Icon.tsx",
  "frontend/src/App.tsx",
  "frontend/src/App.test.tsx",
  "frontend/src/shell/ShellPages.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/notes-pages.spec.ts",
  "frontend/e2e/scaffold.spec.ts",
  "docs/tasks/TASK-058-sqlite-begin-immediate.md",
  "docs/tasks/TASK-059-mobile-topbar.md",
  "docs/tasks/TASK-060-note-editor.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权（2026-09-14 原话）

> 关于心得部分，我觉得现在要想记录心得必须先打开"我的心得"，才能记录，没有快捷键。想让"我的心得"部分变成心得的管理和预览，添加心得部分增加一个快捷键，就像iphone的备忘录一样。而且添加心得的时候不能只出现一个输入框，我想要一个类似于备忘录或者typora那种编辑页面，可以实现吗

主 Agent 给出三件事 + 四个决定点；用户回复「可以，先做到 B 吧」——**Markdown 选 B（源码 + 预览切换，复用现有渲染器，零新依赖）**。其余三点用户未另作选择，按主 Agent 建议的默认执行并在此登记为**假设**（用户可随时推翻）：
- 快捷键 `⌘/Ctrl + J`；
- **自动保存**（停笔 1 秒 + 离开页面前保底），保留版本号冲突保护；
- 阅读器右侧心得侧栏保留现状，**衔接（「整页编辑」入口）放到 TASK-062**；「我的心得」两栏管理放到 TASK-061。本任务只做编辑页 + 入口。

### 现状

- 心得没有标题字段；`content` 纯文本 ≤50,000 字；显示为纯文本段落。「我的心得」页 = 单独放一页的 `NotesPanel`（写作框 + 列表 + 编辑 + 删除同一组件）；新建只能在该页或阅读器侧栏的小输入框。无任何全局快捷键。

### 目标

1. **路由与页面**：`/notes/new`（新建独立心得；`?resource=<id>` 则新建并绑定该资料）、`/notes/:noteId`（编辑独立心得；`?resource=<id>` 则为该资料下的心得）。页面为**沉浸式**（`immersive`，与阅读器同类）：顶栏「← 返回」（回来处：独立→我的心得，绑定→该资料阅读页）+ 保存状态 + 「预览 / 编辑」切换 + ⋯（删除心得）；正文区整页、740px 行宽、18px、等宽或衬线由样式定；页面 `h1` = 心得标题（**取第一个非空行**，去掉行首 `#`，最长 60 字；空则「新心得」/「无标题心得」），路由焦点契约照旧（各态恰好一个 h1、含读取中/失败）。
2. **Markdown B**：编辑态是一个整页 `textarea`（源码）；「预览」用 `renderSnapshot(content, new Map(), null)` 渲染（与正文快照同一配置 `html:false`、无图片冻结表）。切换不丢草稿。
3. **自动保存**：停笔 1000ms 或失焦/切换预览时保存：首次非空 → `POST`（创建），之后 `PATCH` 带 `expected_version`；内容与已保存相同则不发；状态文案「正在保存…」「已保存 HH:MM」「保存失败，稍后重试」；`409 VERSION_CONFLICT` → 停止自动保存、提示「这条心得已在别处修改」+「重新读取」（放弃本地改动）与「覆盖为我的版本」；离开路由/关闭页面前若有未保存改动，先发一次保存（`beforeunload` 提示仅在保存尚未完成时）。空内容不创建、不保存。
4. **入口**：侧栏「添加资料」旁新增「写心得」（图标 note）→ `/notes/new`；全局快捷键 `⌘/Ctrl + J` → 同上（在阅读器页则带 `?resource=当前资料`）；快捷键在输入框/文本域中也生效（它是"新建"，不与输入冲突），在编辑页自身按下无动作。
5. **管理动作**：编辑页 ⋯ 菜单里「删除心得…」复用现有 `deleteNote` 与一次确认（弹窗风格同 TASK-056 的模态）；删除后回到返回处。
6. **测试**：单测覆盖标题推导、自动保存三态（创建/更新/不变不发）、冲突分支、离开前保底、快捷键、绑定 vs 独立、预览渲染安全（`<script>` 转义）；e2e 真实后端：快捷键 → 编辑 → 自动保存 → 刷新仍在 → 预览 → 删除。

### 非目标

- 不改后端/契约（无标题字段、无 Markdown 标记）。
- 不做所见即所得（C）；不引入编辑器依赖。
- 不重做「我的心得」列表页（TASK-061）；不改阅读器侧栏（TASK-062）。
- 不做图片粘贴上传。

### 顺带完成的状态登记

`TASK-058`（PR #66，merge `5f58545`）与 `TASK-059`（PR #67，merge `1a5d3fb`）登记 MERGED，索引同步。

## 完成条件

1. 目标 1–5 各有单测或 e2e 直证；新用例对「去掉自动保存 / 去掉冲突处理 / 去掉快捷键」变红（记录）。
2. `ShellPages.test`/`App.test` 的「各态恰好一个 h1、路由焦点落点、沉浸页必有返回链接」契约对新页面成立。
3. 全部既有单测/e2e 通过；`check_task` frontend PASS；`git diff --check` exit 0。
4. L2 独立只读 Review PASS。

## 上下文包

- `NotesPanel.tsx`（现有保存/删除/草稿逻辑与文案）、`notes/api.ts`（`saveNote/getNote/deleteNote` 的版本语义）、`resources/snapshotMarkdown.ts`（`renderSnapshot`）、`ResourceDeleteDialog.tsx`（模态样式）、`App.tsx`（焦点契约、导航）、`pages.ts`（`immersive/ownHeading`）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-060-note-editor.md --worktree`。

## 实现与测试

（实施后填写）

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

（实施后填写）
<!-- EVIDENCE:END -->
