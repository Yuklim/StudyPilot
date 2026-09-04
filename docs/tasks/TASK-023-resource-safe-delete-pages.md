# TASK-023：资料安全删除页面

```toml
schema_version = 2
id = "TASK-023"
status = "READY"
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

- 实现 SHA/变更摘要：待实现。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：待实现。
- 已知限制/未完成项：本任务不提供回收站、撤销、批量删除或离线删除；文件 trash 回收仍由后端既有对账负责。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待实现。
- Review：待 L3 独立实际只读 Review。
- Acceptance：待 L3 独立实际只读 Acceptance。
- 最终状态/风险/用户操作：READY；实现与审查完成后仍由用户决定合并。
- 非阻断遗留项：暂无。
- 日期与决定日志：2026-09-04，用户授权开始 TASK-023 页面接入计划。

<!-- EVIDENCE:END -->
