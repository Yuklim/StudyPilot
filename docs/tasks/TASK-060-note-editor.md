# TASK-060：整页心得编辑器（Markdown 源码/预览、自动保存）+ 全局「写心得」入口与快捷键

```toml
schema_version = 2
id = "TASK-060"
status = "IN_REVIEW"
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

- **实现 SHA**：首版 `1ccbfa3`（9 个前端文件 +971/−3）；独立 Review 后修订 `a032f02`（F1/F2/F4/F5/F6/F8）与 **`7d7de7b`**（F9）。**检查绑定最终实现提交 `7d7de7b`**（下文与 EVIDENCE 区）。
- **变更**：
  - `notes/noteTitle.ts`：第一个非空行当标题（去掉行首 `#` + 空格、60 字截断），空→`null`。
  - `notes/NoteEditorPage.tsx`（416 行）：路由 `/notes/new` 与 `/notes/:noteId`（`?resource=` 表示绑定资料；**路径参数由 `Screen` 用 `useMatch` 以 prop 传入**——应用没有 `<Routes>`，`useParams` 拿不到，首次实跑即撞到）。沉浸式顶栏（← 返回 / 保存状态 `role=status` / 预览·编辑 / ⋯ 删除）+ 740px 正文列；`h1` 各态恰好一个（读取中「正在打开心得」、失败「这条心得打不开」、新建「新心得」、其余取第一行）；编辑态整页 `textarea`，预览用 `renderSnapshot(draft, new Map(), null, { pageTitle })`（同 `html:false`，且 TASK-053 的去重让预览里不再重复第一行标题）；自动保存：`schedule()` 停笔 1s、失焦、切换预览时 `flush()`，首次非空 POST → 地址 `navigate(replace)` 到 `/notes/:id`（**不按 noteId 给 key**，否则地址一换就重挂、丢掉保存期间继续敲的字并重读一遍——实跑抓到）、之后 PATCH 带 `expected_version`、内容未变不发、空内容不创建；409 → `conflict` 态停止自动保存 + 「重新读取」/「覆盖为我的版本」（先取最新版本号再以我的内容 PATCH）；其他错误 → 「保存失败：…」且再改动即重排程；卸载与 `beforeunload` 前有未保存改动先 `flush()`；`latest` ref 在 effect 里同步（lint 禁止渲染期写 ref）；新建时把焦点从 h1 交给写作框（既有心得维持 h1 落点）；删除走 ⋯ → 模态确认（复用 TASK-056 样式）→ 回到来处。
  - `shell/pages.ts`：两条 `immersive + ownHeading` 页面；`navigation` 过滤掉 `/notes/*`。`shell/Screen.tsx`：分派。
  - `App.tsx`：侧栏「写心得」链接（`Link`，左栏「恰好一个按钮」守卫不受影响）；全局 `keydown`：`⌘J`/`Ctrl+J`（两种修饰键都认，标签按平台显示），阅读器里带 `?resource=当前资料`，编辑页自身按下无动作。
  - `styles.css`：编辑页样式；≤760px 顶栏网格改三列（品牌 | 添加资料 | 写心得）——首版两个入口叠在同一格，scaffold e2e 的「点添加资料」超时抓到。
- **测试**：`noteTitle.test.ts` 4 条；`NoteEditorPage.test.tsx` 9 条（假定时器）：创建/PATCH/不变不发 + 标题跟第一行 + 写作框不被保存结果盖掉；独立与绑定两条路径与返回处；409 停止自动保存 + 覆盖（先取版本再 PATCH）；重新读取丢弃本地；离开前保底（不等 1s 直接点返回 → POST 已发）；预览转义 + 不重复标题 + 切回编辑源码不变；删除一次确认回「我的心得」；侧栏链接 + Ctrl+J/⌘J + 编辑页内无动作；阅读器内快捷键绑定资料。e2e `notes-pages.spec.ts` +2（真实后端）：⌘J → 焦点在写作框 → 沉浸式无左栏 → 自动保存换地址 → 标题 → 预览（strong/无 script/无重复 h1）→ 刷新仍在 → 列表可见 → 删除回列表；阅读器内 ⌘J 绑定资料并出现在该资料心得列表。
- **判别性**（临时破坏后实跑 `NoteEditorPage.test.tsx`、随后恢复）：A 不排程自动保存 → 3 红；B 409 当普通失败 → 2 红；C 卸载不保底 → 1 红；D 快捷键不导航 → 2 红；（Review 后）E 去掉外壳的「可编辑控件里不接管焦点」→ 首条用例红；F 去掉保存完成后的补排程 → 「re-schedules…」红。
- **独立 Review 处置（首轮 CHANGES_REQUIRED）**：F1 首次保存后地址切换、外壳把焦点搬到 h1 → **改在 `App.tsx` 路由焦点 effect**：活动元素是 `TEXTAREA/INPUT/contentEditable` 时不接管（点链接/按键导航时活动元素不是可编辑控件，契约照旧），用例 `editor().focus()` 后首次保存断言焦点仍在写作框；F2 保存进行中又敲字 → `.finally` 里若草稿≠已保存内容则 `schedule()`，并把保存结果**同步写进 `latest` ref**（不等下一次 commit 的 effect），用例改为既有心得 + 慢 PATCH 复现；F4 超长文案改「删减到上限内才会保存」；F5 补读取失败态用例（h1「这条心得打不开」+ 返回链接 + 无写作框）；F6「内容未变不发」改用失焦 + 切换预览触发 `flush` 断言；F8 注释改为如实说明 Ctrl+J 在 Windows/Linux 浏览器是下载页、由 `preventDefault` 覆盖。F3/F7/F8 其余登记遗留。**第二轮 F9**：F2 的补排程在保存失败时也会触发 → 每秒一次的无限重试；改为**只在这次保存成功后**补排（失败由下一次键入重排、冲突等用户选），用例「does not retry a failed save on its own…」（失败后两个周期无重试、再键入才重试；还原为 `!== 'conflict'` 即红）。
- **检查**：首版 `--candidate 1ccbfa3` CHECKS PASS（584）；最终见 EVIDENCE（`--candidate 7d7de7b`，587 = 基线 571 + 16；e2e 62 = 60 + 2）。
- **已知限制**：预览与编辑不同时显示（B 的定义）；无标题字段，列表里的标题由 TASK-061 按同一规则推导；快捷键在浏览器地址栏聚焦时不生效（属浏览器）。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：本提交之后的 HEAD 即候选（`1ccbfa3` + 本证据写回 + 状态登记），精确 SHA 在 Review 写回时补记。
- Review：待派。Acceptance：L2，N/A。
- 最终状态：status=**IN_REVIEW**。
<!-- EVIDENCE:END -->
