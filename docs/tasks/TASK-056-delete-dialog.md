# TASK-056：删除资料改为弹窗、文案精简、资料库内单个与多选删除

```toml
schema_version = 2
id = "TASK-056"
status = "IN_REVIEW"
risk = "L3"
risk_reason = "重做「删除资料」这条**销毁性**用户路径的前端交互：入口从详情页 ⋯ 菜单扩展到资料库列表（单个 + 多选），确认由页面内嵌面板改为模态弹窗，确认文案由 7 格影响摘要精简为「不可恢复 + 心得会一起删除」。后端契约（预览取一次性令牌 → 持令牌删除 → 影响变化 409 须重新确认）**一字不改**，但前端要在多份资料上串行走这条契约、并把令牌过期/重放/影响变化的受控恢复都做进弹窗；命中 risk-policy 的 `deletion` 高风险标记，且改错了会静默多删或少删用户数据。因此 L3：独立只读 Review + 独立 Integration/Acceptance。"
risk_flags = ["deletion", "business"]
owner = "coordinator"
base = "23c9dc5b17bc8de24e7c10ef28b06f609069e1c8"
allowed_paths = [
  "frontend/src/features/resources/ResourceDeleteDialog.tsx",
  "frontend/src/features/resources/ResourceDeleteDialog.test.tsx",
  "frontend/src/features/resources/ResourceDeletion.tsx",
  "frontend/src/features/resources/ResourceDeletion.test.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourceToolbar.tsx",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/features/resources/ResourceLibrary.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/shell/Icon.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/resource-pages.spec.ts",
  "docs/tasks/TASK-056-delete-dialog.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权（2026-09-12 原话与选项）

> 删除资料不是弹窗，而是下拉框，要改为弹窗。而且现在资料库中不能删除资料，只能点开资料才能删除。同时删除资料操作太麻烦了，删除的时候提示的内容不用显示，只用告知心得会随同资料一起删除即可。

主 Agent 检查后就资料库入口提问，用户选定：**「资料库就能删除，支持单个删除，也支持多选操作」**。

### 现状（main `23c9dc5`，已实测）

- 详情页：⋯ →「删除资料…」→ 页面内展开 `ResourceDeletion` 面板 →「删除这份资料」→ 预览 → 7 格影响摘要 + 有效期 →「确认删除」。3 次点击，面板嵌在正文之上。
- 资料库：卡片/列表均无删除入口。
- 契约（`docs/contracts/API与数据契约基线.md` §9）：`POST /resources/{id}/deletion-preview` 返回 5 分钟一次性 `confirmation_token` 与 `impact`；`DELETE /resources/{id}` 须携带令牌；资料或关联内容变化 → `409 DELETION_IMPACT_CHANGED`（带 `current_impact`）；令牌过期/重放/无效 → 410/409/403。**本任务不改契约、不改后端。**

### 目标

1. **弹窗**：新组件 `ResourceDeleteDialog`（`createPortal` 到 `document.body`，`role="dialog" aria-modal="true"`，打开期间应用根节点 `inert`，Esc/遮罩/取消关闭，关闭后焦点还给触发元素；删除进行中不可关闭）。
2. **两次点击**：点删除入口即打开弹窗并**后台静默预览**取令牌；弹窗只显示：标题「删除“{标题}”？」（多选：「删除 {N} 份资料？」）、一句「删除后不可恢复。」、心得数 >0 时再一句「这份资料的 {M} 条心得会一起删除。」（多选：「这些资料的 {M} 条心得会一起删除。」）、「取消」「删除」两个按钮。**不再显示**原件/图片/学习历史/复习/标签关联计数与令牌有效期。
3. **契约恢复路径进弹窗**：`DELETION_IMPACT_CHANGED` → 自动重新预览、更新心得数并提示「内容有变化，请再确认一次」，需再点一次「删除」；令牌过期/重放/无效或网络错误 → 弹窗内显示受控错误文案 +「重试」（重新预览）；不泄露令牌。
4. **详情页**：⋯ 菜单「删除资料…」直接开弹窗；删除成功后回资料库（现状）。旧 `ResourceDeletion` 面板与 `'delete'` panel 移除。
5. **资料库**：每份资料（卡片与列表两种视图）有 ① 一个复选框（可访问名称「选择 {标题}」）② 一个删除图标按钮（可访问名称「删除 {标题}」，开单份弹窗）；已选 ≥1 时列表上方出现选择条：「已选 {N} 份」「全选本页」「清除选择」「删除所选」（开多份弹窗）。删除成功后刷新列表、清空选择；翻页/筛选变化清空选择。
6. **多选删除**：对每份串行预览 → 汇总心得数 → 用户确认 → 串行删除；任一份失败则弹窗内列出「已删除 x 份，{标题…} 未删除：{原因}」并可「重试未删除的」；已删除的不重放。
7. 测试：单测覆盖目标 2/3/5/6 的每条分支（含多选部分失败）；e2e 真实后端走一遍「资料库多选两份 → 弹窗 → 删除 → 列表少两份 → 后端 404」与「详情页删除 → 回资料库」；既有 `ResourceDeletion.test.tsx` 四类场景（未命名占位、确认后回库、影响变化、三种令牌错误）**按新交互重写、逐条保留其契约断言**（令牌不出现在页面、DELETE 携带令牌等）。

### 非目标

- 不改后端、契约、`api.ts` 的请求/校验、门禁。
- 不做「不再提示直接删」；不做回收站/撤销。
- 不改「删除正文」「删除心得」「删除标签/主题」的既有流程。
- 不做跨页全选。

### 已知取舍

- 多选删除是**前端串行**走单份契约（N 次预览 + N 次删除），不新增批量接口；本机单用户、每页 ≤20 份，代价可接受。
- 弹窗不显示原件/图片等影响，是用户明示的决定；契约层面的影响校验（409）仍在。

## 完成条件

1. 目标 1–6 逐条有单测或 e2e 直证（见目标 7）。
2. 新单测对旧交互（若仍保留 `ResourceDeletion`）或对去掉关键分支后的实现变红（至少：静默预览、影响变化再确认、多选部分失败、焦点归还）。
3. 全部既有单测/e2e 通过（可按新交互重写的仅限 `ResourceDeletion.test.tsx` 与 `ResourceToolbar.test.tsx` 中「删除资料…」开面板的一处断言）；`check_task.py` frontend profile PASS；`git diff --check` exit 0。
4. L3：独立只读 Review PASS；独立 Integration/Acceptance PASS（核对完成条件与 e2e 运行证据）。

## 上下文包

- 契约 §9（删除资料）；`ResourceDeletion.tsx`（旧流程与错误分支）；`ResourceToolbar.tsx:36,281-300,331-333`；`ResourceLibrary.tsx:372-448`（两种视图）；`App.tsx`（应用根节点，用于 `inert`）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-056-delete-dialog.md --worktree`；`cd frontend && npm run test -- --run && npm run test:e2e`。

## 实现与测试

- **实现 SHA**：`2e40f49`（实现 + 测试同一提交；`git diff --numstat 23c9dc5..2e40f49` 11 个前端文件 +720/−405）。
- **变更摘要**：
  - 新 `ResourceDeleteDialog.tsx`（+319）：`createPortal` 到 `document.body`；打开时把 body 其余直接子节点设 `inert`、焦点落「取消」、关闭时还给打开时的活动元素；Esc/遮罩/取消关闭（删除进行中禁止）；Tab 在弹窗内首尾相接（其余子树 inert 后 Tab 会掉进浏览器界面，沙盒 Shift+Tab 实测）。打开即对每份 `previewResourceDeletion` 串行取令牌（`started` ref 挡 StrictMode 双跑：**并发预览同一份资料后端回 500**，沙盒实测，见遗留）。确认后串行 `deleteResource`；`DELETION_IMPACT_CHANGED` → 该份回到 previewing、重新预览、`reconfirm` 提示「内容有变化，请再确认一次」、不自动再删；其他错误 → 该份 `failed` 带 `failureText`，弹窗留着列出「已删除 x 份 / “标题”未删除：原因」+「重试」/「重试未删除的」只重预览失败的；全部删完才自动关闭。令牌只在内存 Row 里。
  - `ResourceToolbar.tsx`：`deleted` prop 改为 `onDeleteResource`；「删除资料…」→ `runFromMenu(onDeleteResource)`（**先把焦点还给 ⋯ 再开弹窗**，否则弹窗记到的开启者是 body）；`'delete'` panel 与 `panelLabels.delete` 移除。
  - `ResourceDetail.tsx`：`deleting` 状态 + 弹窗挂在 `section` 末尾；`onDeleted` → `navigate('/resources')`。
  - `ResourceLibrary.tsx`（+131/−3）：选择集合与查询键绑定（`{key, ids}`，`key` 变即视为空，不用 effect 清）；列表行/卡片各加复选框「选择 {标题}」与删除按钮「删除 {标题}」（`trash` 图标新增于 `Icon.tsx`）；列表上方选择条「全选本页 / 已选 N 份 / 清除选择 / 删除所选」；弹窗 `onDeleted` → 从选择里移除并 `retry()`。
  - `ResourceDeletion.tsx` 与其测试删除（页面内面板下线）。
  - `styles.css`（+98/−32）：删影响摘要网格样式；加 `.modal-backdrop/.modal-dialog`、选择条、复选框、删除按钮、选中态；≤760px 列表行改 `flex-wrap`（320px 实测右侧元信息本就到 340px，加了复选框与按钮后溢出，e2e「fit 320/390」抓到）。
- **测试**：
  - 单测新文件 `ResourceDeleteDialog.test.tsx`（15 条）：详情页三种来源静默预览/只报心得数/取消不发 DELETE/令牌不进 DOM；无心得不出该行；未命名占位；两次点击删除并回库、DELETE 携带令牌；模态（inert/焦点落取消/外点不关/Esc 关/焦点还给 ⋯）；影响变化重预览+再确认+不自动再删（预览 2 次、DELETE 恰 1 次后再 1 次）；三种令牌错误受控恢复 + 重试按钮 + 不离开页面；资料库单个删除刷新列表；多选合并确认（心得数求和、预览 2 次、DELETE 0 次直到确认）；部分失败列出并只重试失败份；查询变化清空选择。
  - 既有 `ResourceDeletion.test.tsx` 9 条按新交互重写进上述文件，契约断言逐条保留；`ResourceToolbar.test.tsx`「runs the deletion flow outside the popup」改为断言弹窗在菜单外、外点不关。
  - e2e `resource-pages.spec.ts` 新增 2 条（真实后端）：库内单个 + 多选删除（心得数求和、模态 Shift+Tab 不出弹窗、后端三份 404）；详情页两次点击回库、旧「删除这份资料」步骤不存在。既有 4 处 `getByLabel('标题')` 改 `{ exact: true }`：库内新控件的可访问名称含资料标题，子串匹配在页面切换瞬间会撞到（断言未减）。
  - 判别性：本任务把旧组件整个删了，新用例对旧实现天然红；另按完成条件 2 定向验证四处（见 EVIDENCE）。
- **检查**：`check_task.py --candidate 2e40f49` → `STATIC PASS`，`files=12`，`product_fingerprint=ca632966…`，frontend 五项 exit 0，**568 passed**（基线 562 − 9 + 15）→ **CHECKS PASS**；`npm run test:e2e` **59 passed**（基线 57 + 2）；`git diff --check` exit 0。
- **发现的既有问题（不在本任务范围，上报）**：
  1. **后端并发预览同一份资料回 500**：两个 `POST /deletion-preview` 同时到达，一个 `UNKNOWN_ERROR/500`（串行两次则都 200）。本任务用 `started` ref 与串行预览避开；根因在后端（疑似确认记录唯一约束/事务），应另立任务修成 409 或幂等。
  2. **≤760px 顶栏两组导航重叠**（「我的学习」四项与「后续能力」三项文字互相盖住）：`main` 上即存在，与本任务无关。
- **已知限制**：多选是前端串行 N 次预览 + N 次删除；每页 ≤20 份。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：本提交之后的 HEAD 即候选（`2e40f49` + 本证据写回），精确 SHA 在 Review 写回时补记。
- 判别性定向验证（完成条件 2，均在 `2e40f49` 上临时改动实现后实跑 `ResourceDeleteDialog.test.tsx`、随后 `git checkout` 恢复）：① 注释掉打开时的静默预览 → **12/15 红**；② 影响变化 (409) 后自动再预览并继续删、不要求再确认 → 「re-previews and asks to confirm again…」红；③ 删除失败也计入 `done` → 三条令牌错误用例红（弹窗关掉、页面离开）；④ 关闭时不归还焦点 → 「is modal…」红。
- Review / Integration：待派。
- 最终状态：status=**IN_REVIEW**。
<!-- EVIDENCE:END -->
