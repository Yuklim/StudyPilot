# TASK-092：右栏「高亮」Tab 的删除从来没删掉过——共享客户端的版本化删除白名单漏了高亮

```toml
schema_version = 2
id = "TASK-092"
status = "IN_PROGRESS"
risk = "L2"
risk_reason = "改的是共享 API 客户端里「哪些 DELETE 路径允许带 If-Match」的安全白名单（`frontend/src/api/client.ts`），一处放行，不改契约、后端与数据；但白名单是全前端删除动作的守门口，且用户可见行为是删数据，须独立只读 Review 核对放行的路径形状确实只有高亮条目那一种。执行链：1 Worker → 自动检查 → 1 独立只读 Reviewer 检查最终 diff；独立验收 N/A。"
risk_flags = ["business", "local-fix"]
owner = "coordinator"
base = "f319284338444ceb438812c9126147e4abfcae3a"
allowed_paths = [
  "frontend/src/api/client.ts",
  "frontend/src/api/client.test.ts",
  "frontend/e2e/reader-highlights.spec.ts",
  "docs/tasks/TASK-092-highlight-delete-whitelist.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-26 用户：「高亮效果不能删除」；追问后选定「**右栏 Tab 里的删除按了也没消**」。

### 依赖（写在最前面）

本分支叠在 TASK-091 的分支上（base = 091 最终提交 `f319284`，尚未推 PR）：不是文件冲突，而是两个任务都要
在 `任务索引.md` 同一锚点插行（AGENTS.md §3 并行索引规则）。PR 指向 091 的分支，091 合并后再转指向 main。
若 091 被退回，本任务改基到 main 重做登记即可（产品改动互不相关）。

### 现状与根因（复现过，不是猜）

隔离沙盒里真浏览器 + 真后端：标一条高亮 → 右栏「高亮」Tab →「删除」→「确认删除」，结果：

- 页面弹出 `role=alert`「请求参数不受支持。」（= 客户端 `ApiError('INVALID_REQUEST')`）；
- **没有任何 DELETE 请求发出**（`page.on('response')` 未记到）；列表里那条还在、正文上的颜色还在、
  `GET /highlights` 服务端那条也还在。配了心得与没配心得两种情况都一样。

根因在 `frontend/src/api/client.ts` 的 `versionedDeleteTarget()`：`request()` 只允许白名单里的路径带
`ifMatchVersion`，白名单列了 topics/tags、顶层 notes、资料下的 notes、snapshot、citation，**没有
`/resources/{id}/highlights/{hid}`**。TASK-072 加删除按钮时对应的单元测试把 `api.request` 整个替身掉了，
所以 `deleteHighlight` 的 `ifMatchVersion` 从没经过真客户端；e2e 也没有一条删除用例。
与 TASK-078 当时发现并修掉的「citation 漏在白名单外」是同一类错。

### 目标

1. 白名单放行 `/api/v1/resources/{uuid}/highlights/{uuid}` 这一种形状（与资料下的 notes 同型）；
   集合路径与顶层 `/highlights/{id}` 仍拒。
2. 单元测试：真客户端对高亮条目路径发出带 `If-Match: "N"` 的 DELETE；两种错误形状拒于网络之前。
3. e2e：走真后端从 Tab 删除 → 列表空、正文颜色消、服务端为空、刷新不回来、无 alert。

### 非目标 / 禁止范围

- 不改 `ReaderHighlights.tsx`（删除后的本地状态处理本来是对的）、不改后端、不改契约。
- 正文上的橡皮擦入口属后续工具栏任务，不在这里做。

## 完成条件

- `client.test.ts` 新增用例通过；`reader-highlights.spec.ts` 新增删除用例通过；既有用例不动且全绿。
- `check_task.py` 必要检查 PASS（`frontend` 组）。
- 独立只读 Reviewer 对最终 diff 给出结论（L2）。

## 上下文包

- `frontend/src/api/client.ts` `versionedDeleteTarget()`（L55–75）与 `request()` 的 If-Match 前置检查（L636–643）；
  `frontend/src/features/resources/highlights.ts` `deleteHighlight()`（只读，不改）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-092-highlight-delete-whitelist.md --worktree`；
  `cd frontend && npx playwright test e2e/reader-highlights.spec.ts`。

## 实现与测试

- 实现 SHA/变更摘要：实现与登记同一个提交（SHA 在 EVIDENCE 区作候选记录；之后的证据写回是另外的提交）。
  变更：`client.ts` `versionedDeleteTarget()` 里资料下 7 段路径的那一支由 `parts[5] === 'notes'` 改为
  `['notes', 'highlights'].includes(parts[5])`（加 3 行注释）；`client.test.ts` 新增 1 条用例（放行条目路径 +
  拒集合路径与顶层 `/highlights/{id}`）；`reader-highlights.spec.ts` 新增 1 条真后端删除用例。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：
  - `check_task.py --task docs/tasks/TASK-092-highlight-delete-whitelist.md --worktree` → 退出码 0，**CHECKS PASS**，
    `files=5`，`product_fingerprint=e05acb17b45a7aff030a920f23bf96bee2e80ac91094fb5e591f6df9ce6ba363`，
    `profiles=frontend`（vitest 37 文件 **826** 条全过，比 091 多的 1 条即本任务新增）。
    第一次跑 FAIL：`base must be a full commit SHA`（登记时写了短 SHA），改成完整 SHA 后重跑即上面的结果。
  - `npx playwright test e2e/reader-highlights.spec.ts` → **4/4 通过**（含新增的删除用例；隔离沙盒）。
  - 登记前的复现（临时 spec，已移出工作区、未入库）：修复前同一操作 → alert「请求参数不受支持。」、
    无 DELETE 请求、服务端那条仍在；配心得/不配心得两种情况一致。
- 已知限制/未完成项：正文上直接删（橡皮）不在本任务；PDF 上的高亮走同一条 DELETE 路径，随本修复一起好，
  但没有单独的 PDF e2e 删除用例（`pdf-highlights.spec.ts` 未动）。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：
- Review：（L2，待独立只读 Reviewer）
- Acceptance：L2 N/A。
- 最终状态/风险/用户操作：
- 非阻断遗留项：
- 日期与决定日志：2026-09-26 用户「高亮效果不能删除」→ 追问选定「Tab 里删了也没消」→ 沙盒复现 → 登记本任务。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
