# TASK-027：独立心得（不绑资料也能记录与回看）

```toml
schema_version = 2
id = "TASK-027"
status = "IN_REVIEW"
risk = "L3"
risk_reason = "放宽 Note 关键数据模型 resource_id 为非空到可空，新增 0002 数据库迁移，新增公共顶层笔记接口并改动标准 openapi Note schema/paths 与操作清单，跨后端、前端与契约文档；属架构/契约、迁移、重大跨模块。"
risk_flags = ["migration", "public-api", "major-cross-module", "business", "tests"]
owner = "coordinator"
base = "a5af2059f9e7b0e20a2ff948b1a92ec5e32caf4f"
allowed_paths = ["backend/src/studypilot/modules/notes/**", "backend/src/studypilot/application/notes.py", "backend/src/studypilot/infrastructure/database/note_store.py", "backend/src/studypilot/infrastructure/database/models.py", "backend/src/studypilot/api/notes.py", "backend/src/studypilot/main.py", "backend/migrations/versions/0002_note_optional_resource.py", "backend/tests/test_notes.py", "backend/tests/test_migrations.py", "backend/tests/test_database.py", "backend/tests/test_resource_deletion.py", "backend/tests/test_taxonomy.py", "frontend/src/features/notes/**", "frontend/src/api/client.ts", "frontend/src/api/client.test.ts", "frontend/src/shell/pages.ts", "frontend/src/shell/Screen.tsx", "frontend/src/App.tsx", "frontend/src/App.test.tsx", "frontend/src/features/resources/ResourceDetail.tsx", "frontend/src/features/learning/RecordHistory.tsx", "frontend/src/styles.css", "frontend/e2e/notes-pages.spec.ts", "README.md", "docs/contracts/API与数据契约基线.md", "docs/contracts/openapi-v1.json", "docs/tasks/TASK-027-independent-notes.md", "docs/tasks/任务索引.md"]
checks = ["backend", "frontend", "contracts", "governance"]
```

## 需求与范围

- 用户 2026-09-05 明确指令「做阶段二独立心得」；已确认三项范围决策：只做独立心得核心；资源删除仍级联删其绑定心得、独立心得不受影响；全局入口只列独立心得。
- 依据《项目需求说明》5.6/5.7/5.10；契约 4.8 Note、第 9 节删除、第 10 操作清单。现状：心得(Note)必须绑定某资料(`Note.resource_id` 非空外键)，只能在资料详情记录。
- 目标：`notes.resource_id` 变可空 + 新迁移 0002；顶层集合 `/api/v1/notes` 与 `/api/v1/notes/{note_id}` 只作用于 `resource_id IS NULL` 的独立心得（新增/回看/分页/编辑/删除，沿用版本号保护、单事务、不回放、错误收敛、无资源 READY 前置）；既有 `/resources/{resource_id}/notes` 资源绑定接口不变仍要求资源存在。
- 契约：openapi Note `resource_id` nullable、顶层 5 路径/操作入清单；中文契约 4.8/第 9 节删除关系/第 10 操作清单/10.1 错误/1.3 delivery/三向追踪同步。真实标准契约变更走完整检查，不走 evidence-only。
- 前端：新增顶层「我的心得」导航页只列并管理独立心得；`NotesPanel` 泛化 `resourceId` 可空复用；资料详情既有心得不回归；client 删除白名单扩顶层笔记路径。
- 安全/删除：资源删除仍级联删其绑定心得；独立心得不入任何资源删除影响清单、不被误删。删除独立心得走单独入口与版本确认。
- 禁止未列路径；不做「后贴资料」、心得打标签、跨资料汇总全部心得、全文搜索、富文本/AI、回收站、复习/统计。

## 完成条件

1. 0001→0002 迁移对已有库无损；`notes.resource_id` 可空；顶层接口可存取独立心得，绑定接口仍要求资源存在、产出非空 resource_id。
2. 顶层列表只返回 `resource_id IS NULL` 独立心得；分页/排序/空态/错误严格校验；编辑/删除带版本号，冲突/旧版本/不回放/敏感错误收敛与资源心得一致。
3. 资源删除仍级联删绑定心得、独立心得不受影响（删除预览 note_count 只计绑定）。
4. openapi Note `resource_id` nullable、顶层 5 路径/操作入清单；中文契约同步；`test_notes.py` schema 三件套、`test_taxonomy.py` 计数断言随契约更新。
5. 前端：资料详情既有心得不回归；「我的心得」顶层页只列独立心得并可新增/回看/编辑/删除/版本恢复/分页；client 删除白名单扩顶层。
6. 真实 Chromium e2e 覆盖独立心得生命周期与资源删除隔离；前端单测/e2e、后端 pytest、契约/治理检查全绿，开发期失败如实记录。

## 上下文包

根/后端/前端规则、本任务与上述需求/契约章节；既有 notes 后端(modules/notes、application/notes、api/notes、note_store)、learning 全局端点双集合先例(api/learning.py `list_operation`、learning_store.page resource_id:UUID|None)、NotesPanel/RecordHistory、client.ts、迁移机制(test_migrations.py compare_metadata)。按需读，不全仓扫描。

准确命令：
- `cd backend && .venv/bin/pytest tests/test_notes.py tests/test_migrations.py tests/test_database.py tests/test_resource_deletion.py tests/test_taxonomy.py`
- `cd frontend && npm run test`
- `cd frontend && npm run test:e2e`（Playwright 临时 SQLite，18000/15173 端口）
- `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-027-independent-notes.md --worktree`

## 实现与测试

- 实现提交：`2fd040dcf7355a56e057f76603ab3b00ad0f38ff`（= 当前候选 HEAD）；分支 `agent/coordinator/TASK-027-independent-notes`，自 `main@a5af205` 派生。主 Agent 亲自实施，串行维护任务/索引。
- 后端：`Note.resource_id` 放宽可空 + 0002 迁移(batch alter)；顶层 `/api/v1/notes` 集合只作用于 `resource_id IS NULL`(新增/回看/分页/编辑/删除，版本号保护/单事务/不回放/无资源前置)；既有 `/resources/{id}/notes` 绑定语义不变；资源删除仍级联绑定心得、独立心得不受影响(删除预览 note_count 只计绑定)。契约 openapi Note nullable、顶层 5 路径/操作；中文契约 4.8/删除关系/操作/错误/delivery/三向同步。
- 前端：`notes/api.ts` 支持 resource_id null 走顶层路径；client 删除白名单扩 `/api/v1/notes/{id}`；`NotesPanel` 泛化 resourceId 可空 + 独立文案；新增顶层 `/notes`「我的心得」页(NotesPage)；pages/Screen/App 接线；README 说明。
- 检查命令与结果：
  - `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-027-independent-notes.md --worktree` → `CHECKS PASS`、exit 0；STATIC PASS，risk=L3，files=25，product_fingerprint=`138fec800ee367038931df260408b932ed5a36b3988056bc1a7fccc3af263a6d`；profiles backend/contracts/frontend/governance。后端 ruff/mypy/478 pytest/uv build、契约 OpenAPI 结构、前端 format/lint/typecheck/vitest(323)/build、治理 validate + 23 unittest 全过。
  - `cd frontend && npx playwright test e2e/notes-pages.spec.ts` → 6 passed（真实 Chromium + 后端临时 SQLite 18000/15173），含新增独立心得生命周期与资源删除隔离两 e2e。
- 新增/变更测试：test_migrations 0001→head 升级保绑定可存独立 + heads 断言；test_database 独立 Note 持久化；test_notes 独立 CRUD/隔离/校验 4 项；test_resource_deletion 删除资源保留独立心得；test_taxonomy 契约 33 计数 + 独立操作 subset。
- 已知限制：仅后端+页面独立心得；「后贴资料」、心得打标签、跨资料汇总全部心得留待后续独立任务；SQLite 写竞争可能受控失败、需读后核对(沿用既有笔记语义)。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-05：IN_REVIEW。实现+检查证据齐备，最终产品候选 `2fd040dcf7355a56e057f76603ab3b00ad0f38ff`，product_fingerprint=`138fec800ee367038931df260408b932ed5a36b3988056bc1a7fccc3af263a6d`，base=`a5af2059f9e7b0e20a2ff948b1a92ec5e32caf4f`。CHECKS PASS 与 e2e 6/6 通过记录见「实现与测试」。待独立只读 Review 与 Acceptance；用户独占最终合并。
- Review：L3 需实际独立只读 Reviewer（.claude/agents/reviewer.md），核 base..candidate 完整 diff + 迁移/契约/删除去留；findings/No findings。
- Acceptance：L3 需另一独立只读 Acceptance，核对完成条件与证据。
- 最终状态/风险/用户操作：ACCEPTED 后由用户最终合并，Agent 不合并 main。
- 非阻断遗留项：后贴资料、心得打标签、跨资料汇总留待后续独立任务。

此区仅允许写回状态/EVIDENCE/候选与报告原文；目标、风险、路径、检查、实现与测试记录在标记区外。
<!-- EVIDENCE:END -->
