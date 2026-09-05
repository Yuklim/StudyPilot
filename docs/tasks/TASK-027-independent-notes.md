# TASK-027：独立心得（不绑资料也能记录与回看）

```toml
schema_version = 2
id = "TASK-027"
status = "IN_PROGRESS"
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

（实施后填写：实现 SHA/摘要、命令/退出/指纹、已知限制）

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：实施后冻结。
- Review：L3 需实际独立只读 Reviewer（.claude/agents/reviewer.md），核 base..candidate 完整 diff + 迁移/契约/删除去留；findings/No findings。
- Acceptance：L3 需另一独立只读 Acceptance，核对完成条件与证据。
- 最终状态/风险/用户操作：ACCEPTED 后由用户最终合并，Agent 不合并 main。
- 非阻断遗留项：后贴资料、心得打标签、跨资料汇总留待后续独立任务。

此区仅允许写回状态/EVIDENCE/候选与报告原文；目标、风险、路径、检查、实现与测试记录在标记区外。
<!-- EVIDENCE:END -->
