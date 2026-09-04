# TASK-023：资料安全删除页面

```toml
schema_version = 2
id = "TASK-023"
status = "IN_ACCEPTANCE"
risk = "L3"
risk_reason = "接入不可逆资料删除的用户确认流程，涉及删除令牌在前端的短时内存保管、专用请求头、安全错误处理和用户可见的数据删除边界。"
risk_flags = ["business", "critical-data", "security", "public-api", "deletion", "tests"]
owner = "frontend_worker"
base = "51b427f5722427246b4ebc460f3aa6f2e0585338"
allowed_paths = [
  "frontend/src/api/client.ts",
  "frontend/src/api/client.test.ts",
  "frontend/src/features/resources/api.ts",
  "frontend/src/features/resources/api.test.ts",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourceDeletion.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/features/resources/ResourceDeletion.test.tsx",
  "frontend/src/features/resources/ResourceState.tsx",
  "frontend/src/styles.css",
  "docs/tasks/TASK-022-resource-safe-delete-backend.md",
  "docs/tasks/TASK-023-resource-safe-delete-pages.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

- 用户授权：TASK-022 已合并后开始下一步计划；本任务只把已冻结的 `previewResourceDeletion` / `deleteResource` 接入资料详情页。
- 相关需求：`项目需求说明.md` 第 5.3、7 节及产品底线；资料删除前必须明确说明并再次确认，不能未经确认自动删除用户数据。
- 相关契约：`docs/contracts/API与数据契约基线.md` 第 2.2、7、9、10 节及 OpenAPI `previewResourceDeletion` / `deleteResource`。
- 目标：在资料详情中提供删除入口；先调用删除预览并展示安全影响计数、不可逆警告和有效期，再由用户明确确认；成功后回到资料库并刷新状态。
- 非目标：不修改后端删除逻辑、数据库或公共契约；不做回收站/撤销、批量删除、文件替换、复习、统计、解析或 AI；不操作真实用户资料。
- 禁止范围：所有未列入 `allowed_paths` 的路径；不得把删除令牌写入 URL、请求体、Cookie、localStorage、sessionStorage、IndexedDB、日志或错误提示；不得使用假数据伪装成功。
- 依赖/前置条件：TASK-022 合并到 `main`；后端 `/api/v1/resources/{id}/deletion-preview` 与 `DELETE /api/v1/resources/{id}` 已可用；前端继续只调用同源 `/api`。
- 并行：否；共享目录由 `frontend_worker` 唯一写入。

## 完成条件

1. 资料详情加载成功后显示删除入口；首次操作只发送 deletion-preview，不发送 DELETE，并展示安全影响计数、不可逆说明和令牌有效期。
2. 用户取消预览或确认对话时不删除；确认按钮单次执行并在请求期间禁用，令牌只保留在当前组件内存。
3. 确认请求只通过 `X-StudyPilot-Deletion-Token` 专用头发送原令牌；令牌不出现在 URL、JSON、持久化存储、日志或错误文本中。
4. 删除成功收到 204 后清理页面状态并回到资料库；详情读取、列表和下载的既有错误边界不被破坏。
5. `DELETION_IMPACT_CHANGED` 展示安全的当前影响摘要并要求重新预览；`DELETION_TOKEN_REPLAYED`、`DELETION_TOKEN_EXPIRED`、缺失/无效令牌、资料不存在、服务/存储失败均显示受控中文提示，不重放旧令牌。
6. 覆盖 WEB/PASTE/FILE、有关联计数、取消、重复点击、成功、影响变化、重放/过期和受控错误的前端测试；令牌安全与专用头有客户端测试。
7. 前端格式检查、lint、typecheck、测试和构建全部通过；不宣称回收站、撤销或批量删除已实现。

## 上下文包

- 规则：根 `AGENTS.md`、`frontend/AGENTS.md`、`studypilot-task-intake`；实现阶段按需读取 `studypilot-implement-task`，L3 再执行独立只读 Review 与 Acceptance。
- 需求/契约：`项目需求说明.md` 第 5.3、7 节；`docs/contracts/API与数据契约基线.md` 第 2.2、7、9、10 节；`docs/contracts/openapi-v1.json` 的 `previewResourceDeletion`、`deleteResource`、`DeletionPreview`、`DeletionImpactChangedErrorResponse`。
- 相关代码：`frontend/src/api/client.ts`、`frontend/src/features/resources/api.ts`、`ResourceDetail.tsx`、现有资源页面测试与样式。
- 检查命令：`cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test -- --run && npm run build`；最终使用统一 `check_task.py` 记录真实结果。

## 实现与测试

- 实现 SHA：`213604b`（完整提交：`213604ba582cc98db98b94a4b91b8142154f8df3`）及修正 `e7576b4`。新增资料详情删除入口、删除影响预览、内存令牌状态、专用删除头客户端能力、影响变化/令牌错误处理、严格 204 响应校验及前端测试；不改后端或公共契约。
- 2026-09-04 统一命令 `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-023-resource-safe-delete-pages.md --worktree` 退出 0，`CHECKS PASS`；product_fingerprint `1fe1c67703bf3fa52d35e487de67b19240d5c458c5e203ec9fa016f780e8d47e`。前端 format:check、lint、typecheck、pytest/vitest **315/315 PASS**、build 均成功。
- 使用 Vitest/jsdom 隔离合成资料与令牌；未触碰真实用户资料、运行数据库或后端存储。
- 已知限制/未完成项：本任务不提供回收站、撤销、批量删除或离线删除；文件 trash 回收仍由后端既有对账负责。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`e7576b4`（完整实现候选；本任务证据提交后仍需重新冻结最终候选）。
- Review：独立只读 Review，候选 `e7576b4416ea5b0520d6a3c986d502310bcb7b35`，基线 `51b427f5722427246b4ebc460f3aa6f2e0585338`；验证 `frontend/src`、`backend/src` 均不可写，完整 diff/删除 API 调用链/令牌传递/错误处理/路由与测试均核对；`git diff --check` 通过；Findings: No findings；结论 `PASS`。Reviewer 未修改、提交、推送、合并或委派。
- Acceptance：独立只读 Codex CLI Acceptance 已核对候选 `e7576b4416ea5b0520d6a3c986d502310bcb7b35` 与全部完成条件；通过 `read_thread` 核实其运行时 `frontend/src`、`backend/src` 均不可写，候选与 Review 一致，完成条件均有对应实现/测试证据；结论待写回。
- 最终状态/风险/用户操作：IN_ACCEPTANCE；Acceptance 结论写回后仍由用户决定是否推送、创建 PR 和合并。
- 非阻断遗留项：暂无。
- 日期与决定日志：2026-09-04，用户授权开始 TASK-023 页面接入计划。

<!-- EVIDENCE:END -->
