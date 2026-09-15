# TASK-060：整页心得编辑器（Markdown 源码/预览、自动保存）+ 全局「写心得」入口与快捷键

```toml
schema_version = 2
id = "TASK-060"
status = "ACCEPTED"
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

- 候选 SHA：首轮候选 **`c741725`**（实现 `1ccbfa3`）→ 处置 F1/F2/F4/F5/F6/F8 后 **`a032f02`** → 处置 F9/F10 后最终候选 **`b5a35cc`**（产品代码 = 实现提交 **`7d7de7b`**）。
- 检查绑定最终候选：`check_task.py --candidate b5a35cc` → `STATIC PASS`，`files=13`，`product_fingerprint=de8f8ff0…`，frontend 五项 exit 0，**587 passed**（= 基线 571 + 16）→ **CHECKS PASS**；`npm run test:e2e`（在 `7d7de7b` 上）**62 passed**（= 60 + 2）；`git diff --check` exit 0。
- 判别性：A 不排程自动保存 → 3 红；B 409 当普通失败 → 2 红；C 卸载不保底 → 1 红；D 快捷键不导航 → 2 红；E 去掉外壳「可编辑控件里不接管焦点」→ 1 红；F 去掉保存成功后的补排程 → 1 红；G 补排条件还原为 `!== 'conflict'` → 1 红。
- **Review**（L2，独立只读 Reviewer，仅 Read/Grep/Glob，三轮）：首轮 **CHANGES_REQUIRED**（F1 必须修复 + F2–F8）→ 第二轮 **CHANGES_REQUIRED**（F9：我修 F2 引入的失败无限重试；F10 记录 SHA 口径）→ 第三轮 **PASS**（F11 写回时更正候选 SHA，本区已按此写）。报告原文：

> **首轮**（`1a5d3fb..c741725`）：审查全部 9 个前端文件 diff、`notes/api.ts`、`snapshotMarkdown.ts`、`App.tsx` 焦点契约、`heading.tsx`、`pages.ts`、`ShellPages.test`/`App.test` 守卫、`NotesPanel.tsx` 草稿保护。diff 全在 allowed_paths；三项假设如实登记。核对通过：`latest` ref 由 effect 同步且 `onBlur→flush` 读到最新草稿；`new→/notes/:id` 的 replace 与 setNote 同批处理、load effect 守卫可靠；卸载 flush 在 `alive=false` 后请求仍发出；删除后置空 `latest` 覆盖 Esc/后退；预览只吃 `renderSnapshot`（`html:false`）；`?resource=` 经 `isResourceId`；侧栏为 Link；各态一个 h1、返回链接常驻。
> - **F1（必须修复）** 新建 → POST 成功 → `navigate(replace)` → App 焦点 effect 无条件把焦点从正在书写的 textarea 抢到 h1，接着敲的字落在标题上（e2e 用 `fill()` 自带聚焦、单测未断言，未抓到）。
> - F2（可记录，建议顺手修）保存进行中继续输入并停笔 → flush 命中 inflight 直接返回，完成后不再排程，状态「已保存」而草稿未保存。
> - F3（可记录）`NotesPanel` 有未保存草稿时按 ⌘J 绕过其「草稿尚未保存」确认。F4（可记录）超长文案与行为不符。F5（可记录）读取失败态无用例。F6（可选）「内容未变不发」用同值 change 空过。F7（可选）切换 noteId 不先 flush（当前无入口）。F8（可选）「重新读取」无二次确认；Ctrl+J 在 Windows/Linux 浏览器是下载页。
> - **结论：CHANGES_REQUIRED。**
>
> **第二轮**（`c741725..a032f02`）：F1 焦点守卫只在可编辑控件跨路由仍挂载时生效，点链接/⌘J 场景旧输入框已卸载、契约照旧；`latest` 手动写入与 effect 同步无双向覆盖窗口；F2 用例（既有心得 + 慢 PATCH）判别性成立。
> - **F9（必须修复，一行）** `.finally` 补排只排除 conflict，保存失败也会补排 → 1s 后再失败再排程：无限重试循环，状态栏每秒闪烁。建议只在成功保存后补排，并补失败用例。
> - **F10（可记录，写回时必须改）** 「实现 SHA `1ccbfa3`」与「586 passed」不再对应。
> - **结论：CHANGES_REQUIRED（仅 F9 + F10）。**
>
> **第三轮**（`a032f02..b5a35cc`，产品代码 `7d7de7b`）：F9 修复条件 `state.kind === 'saved'`；`.catch` 已同步写入 `failed/conflict`，失败/冲突不再自动重试；`saved` 分支保留 F2 补排；卸载保底不受影响。新用例判别性成立。F10 实现 SHA 链已如实登记。
> - F11（可记录，写回时改）EVIDENCE 区候选 SHA 更正为 `b5a35cc`。
> - **结论：PASS（覆盖 `b5a35cc`）。**

- findings 处置：

| # | 处置 | 依据 |
| --- | --- | --- |
| F1 | **已改**（`App.tsx` 路由焦点 effect：活动元素为可编辑控件时不接管）+ 用例。 | 核心路径丢字 |
| F2 | **已改**（保存成功后若草稿≠已保存则补排；保存结果同步写入 ref）+ 用例。 | 时序丢字 |
| F9 | **已改**（补排只在 `saved` 态）+ 用例。 | 我修 F2 时引入的回归 |
| F4/F5/F6/F8（注释）/F10/F11 | **已改**。 | 叙述与覆盖精度 |
| F3 | **记录 → TASK-062**：阅读器侧栏/「我的心得」`NotesPanel` 有脏草稿时按 ⌘J 会丢草稿；衔接时跳过脏文本域或把草稿带进编辑页。 | 假设范围内 |
| F7 | **记录 → TASK-061**：编辑页内直接切换到另一条心得时不先 flush；加链接前补 flush 或按 noteId 给 key（保留 new→id 例外）。 | 当前无入口 |
| F8 其余 | **记录**：「重新读取」一键丢弃本地改动无二次确认；冲突态点返回不提示。 | 目标未要求 |

- Acceptance：L2，N/A。
- 最终状态/风险/用户操作：status=**ACCEPTED**（L2：1 Worker → 自动检查 → 1 名独立只读 Reviewer（三轮）→ 主 Agent 汇总）。**未 MERGED**——是否合并由用户本人决定。
- 非阻断遗留项：1. F3（→062）；2. F7（→061）；3. F8 其余；4. 主 Agent 假设（⌘J / 自动保存 / 侧栏保留）待用户实际使用后确认或推翻。
- 日期与决定日志：
  - 2026-09-14 用户「先做到 B」；主 Agent 拆三步、登记假设。
  - 2026-09-14 实现 `1ccbfa3`（实跑抓到：应用无 `<Routes>` 参数由 Screen 传入；按 noteId 给 key 会在地址切换时重挂丢字；移动端两个入口叠格）；Review 三轮：F1 → `a032f02`，F9 → `7d7de7b`/`b5a35cc` → PASS；主 Agent 写回并置 `ACCEPTED`；待用户合并。
<!-- EVIDENCE:END -->
