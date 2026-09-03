# TASK-017：个人笔记后端

```toml
schema_version = 2
id = "TASK-017"
status = "MERGED"
risk = "L3"
risk_reason = "实现既定个人笔记写入、版本修改和直接删除，涉及用户文本保护与删除竞争；标准契约和数据库模型不变，保留独立只读 Review/Acceptance。"
risk_flags = ["business", "critical-data", "tests"]
owner = "learning_worker"
base = "aaa1b5abfe929117f87d59b70d60040499a1d50f"
allowed_paths = ["backend/src/studypilot/modules/notes/**", "backend/src/studypilot/application/notes.py", "backend/src/studypilot/infrastructure/database/note_store.py", "backend/src/studypilot/api/notes.py", "backend/src/studypilot/main.py", "backend/tests/test_notes.py", "backend/tests/test_taxonomy.py", "README.md", "docs/contracts/API与数据契约基线.md", "docs/contracts/openapi-v1.json", "docs/tasks/TASK-016-learning-pages.md", "docs/tasks/TASK-017-notes-backend.md", "docs/tasks/任务索引.md"]
checks = ["backend", "contracts", "governance"]
```

## 需求与范围

- 用户“已合并”承接上一轮明确的个人笔记后端；PR #21 已核实 MERGED（2026-09-03T08:35:56Z），合并 SHA 为 base。工作区干净，从 origin/main 创建专用分支；TASK-016 仅补真实合并事实。
- 依据：项目需求说明 5.6/5.10；冻结契约 2.1～2.4、4.8、7、10，以及两个 notes 路径与 NoteCreate/NotePatch/Note/NoteEnvelope/NotePage。沿用已有 Note 模型，不增加表或字段。
- 主 Agent 为唯一 learning_worker；coordinator 串行维护任务/索引和交付清单。使用 intake/implement/review/acceptance Skills；不另启机械 Worker，最后独立 Reviewer 和另一只读 Acceptance，修订只做必要增量复核。
- 开放五个既定操作：资料下笔记新增、分页列表、详情、修改和删除。只写 Note，正文去首尾空白后 1～50000 字符，保留内部换行/文本，不解析、不执行、不混入 AI。不可修改笔记 ID/所属资料/创建时间等只读字段。
- GET 默认 -created_at,id，允许 created_at/updated_at 双向排序及 page/page_size，拒绝未知/重复/非法查询；不存在笔记或错误资料归属不泄露内容。FILE 仅 READY 可访问，归档资料仍可看笔记，不改变资源、学习进度、计划、历史、原件及其时间/版本。
- PATCH 用 expected_version；缺失 428、非法 422、旧版本 409，仅实际文本变化递增版本/更新时间。同内容（含首尾标准化后相同）保持原时间/版本。DELETE 使用单个强 If-Match 版本头，非法/缺失 428、旧版本 409；仅删该条笔记，直接删除不提供回收站，不执行资料整体删除协议。
- 所有写入单事务提交后才成功；失败回滚，不自动重放；ORM 版本比较防并发覆盖/误删，SQLite 锁竞争可受控失败，不能隐藏失败。复用本机安全中间件，错误只输出固定文案、请求编号及允许的当前版本，不输出正文/SQL/路径/密钥。
- 只在中文契约 1.3 与 OpenAPI x-delivery-profile 同步实际候选交付五个操作，标准 paths/schema/security/操作语义不变。README 说明当前后端可用、界面后续接入以及笔记直接删除的含义。
- 禁止所有未列路径，特别是前端、模型/迁移、配置/依赖/锁、安全协议和真实数据；不开全文搜索、修订历史、回收站、资料删除、复习/统计、解析/AI/RAG/公网。原有行为测试仅精确更新已开放操作集合，不降低断言。

## 完成条件

1. 五个笔记接口在隔离 SQLite 下完整存取；多条笔记与资料归属正确，分页/排序/空页/归档可读/不可见 FILE 拒绝；原资料、进度、计划及原件未被改变，笔记不进入资料搜索。
2. 严格正文与版本/查询/媒体校验，统一错误和安全前置检查；旧版本修改/删除不覆盖新数据，无变化不刷新时间。提交/flush 故障回滚、实际竞争写/删及 StaleDataError 分类覆盖，无敏感文本泄露或自动重放。
3. 成功响应绑定冻结 Note schema；标准契约深比较仅交付注释变化；后端/契约/治理检查全部通过，开发期失败如实记录。前端未变，复用已合并 TASK-016 的 215 前端/22 Chromium 证据，不重复跑未改页面。
4. 冻结含实现与证据的候选，实际独立只读 Review 和另一 Acceptance 通过；之后仅合法证据写回，由用户最终合并。

## 上下文包

根/后端规则、本任务和上述局部需求/契约；现有 taxonomy 的版本/错误处理、learning 的资源可见性/事务模式、Note 模型与测试夹具。只读相关函数，不重复全仓/旧任务历史。准确命令：`cd backend && .venv/bin/pytest tests/test_notes.py`；`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-017-notes-backend.md --worktree`。构建若仅 uv 缓存被沙箱限制，按现有授权机制运行同一构建命令，不安装依赖或改配置。

## 实现与测试

- 实现提交：`2db21a7c8db4dd661300f157e82cd564b73df054`；后续冻结提交仅记录实现 SHA/检查证据及审查状态。
- 已实现五个笔记操作：严格 JSON/查询/版本输入、按资料归属及 READY 可见性读取、稳定分页、版本修改/删除和提交前回滚。业务模块不含 SQLite 逻辑，存储层只写 Note；同内容不改版本/时间，错误不输出正文/SQL/路径。原件、资料、进度、计划、历史和前端未改。
- 完整检查命令：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-017-notes-backend.md --worktree`。最终在允许访问宿主 uv 缓存的环境执行，整体退出 0；14 文件、`product_fingerprint=402335f045321d8eb6080158a3ce8294fe0f49fe4a0f20d5c17fcd50af123745`。范围/敏感模式/JSON/diff、后端格式/lint/mypy、415 项 pytest（含新增 49 项笔记测试，6.59 秒）、离线 sdist/wheel 构建、OpenAPI/FastAPI 结构校验、治理规则/lint/格式及 23 项治理测试全部 PASS；无依赖安装或配置变更。
- 新增测试覆盖真实 SQLite 多笔记生命周期、首尾标准化/内部文本/长度边界、只读字段拒绝、空/错误分页和稳定同时间排序、父资料归属、FILE 可见性及归档、旧版本修改/删除拒绝、同内容不刷新时间、原资料/进度/搜索/历史不受影响。注入 flush 后/commit 前故障验证新增/修改/删除回滚且调用仅一次；真实 ORM 旧实例产生 StaleDataError 后只读分类；两线程实际竞争修改/删除只有一次成功，其余受控失败且不覆盖/误删新内容；未授权先于正文/数据库操作，统一错误不泄露合成敏感文本。
- 契约校验：成功外形与请求必填字段逐项绑定冻结 Note schemas；解析 base 与当前 OpenAPI 后仅移除 x-delivery-profile，再深比较完全相同，退出 0。中文契约 diff 只在 1.3；已有清单测试精确从 20 扩展到 25 个操作并保留旧断言。结构检查不冒称完整业务语义验证，语义由上述 API/数据库测试覆盖。
- 开发期失败如实保留：Ruff 首次因中文逗号规则失败，改为现有文案惯例的句号；测试未先格式化的长行检查失败，运行格式化后消除；mypy 对模型类型列表推断失败，增加准确类型标注。初次笔记测试 48/49、对应全检 pytest 414/415：旧 ORM 更新用例误传与旧内容相同的文本，没有触发 SQL 更新；改用真正不同的新文本以触发实际版本保护，不降低 409/版本/无覆盖断言。该次全检另有 uv 缓存权限阻止构建（退出 2），之后经授权在可用缓存环境完整重跑，最终全过。治理测试中 missing-tool/fake-test 是门禁故障报告夹具，治理测试整体退出 0。
- 前端与浏览器本轮 NOT_RUN：没有前端/代理/安全协议变化，复用已合并 TASK-016 的 215 前端/22 Chromium 证据。测试只用临时数据库和合成数据，不接触真实笔记；生成构建/缓存不入 Git。
- 已知限制：本次仅后端，页面尚无笔记编辑入口；笔记直接删除没有回收站或修订历史，需用户明确删除；SQLite 锁竞争可能受控失败，写结果不确定须先读取核对，不承诺自动重试或恰好一次。未开放全文搜索、AI、复习/统计或公网。下一步为笔记页面接入，具体范围另行登记。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03 用户已合并；GitHub 核实 PR #22 MERGED，mergedAt=2026-09-03T09:31:49Z，mergeCommit=d2fc5acbfc7989ff8bd8b013ae70ac7cace25c5f。原实现及审查证据保留。

- 2026-09-03：IN_PROGRESS，稳定依赖已合并，风险与唯一写入者已确定。
- 2026-09-03：IN_REVIEW，最终检查通过，待独立实际只读 Review；用户独占最终合并。

### 独立只读 Review

- 独立 CLI 会话 `01a06674-ebc3-7380-9873-31191e42980a`，沿用已批准临时 gpt-5.4 / medium，启动头 read-only / never，未子派发，进程退出 0。以下为报告原文。

候选/权限核验：`base=aaa1b5abfe929117f87d59b70d60040499a1d50f`，`candidate=46ea4db0fb7238428c3980e99a124c927072fc25`；当前 `HEAD` 等于 candidate。运行器实际只读，`test -w .` 退出 `1`。`git status --short --branch` 显示分支 `ahead 2`，但无未提交改动，工作区干净。

No findings。已按要求完整读取根/后端规则、review skill、风险规则、TASK-017，并完成 `base..candidate` 的 14 文件首轮完整 diff 审阅，补读了 `Note` 模型、版本映射、安全前置、notes 两个路径与 `Note` 相关 schema。实现与冻结契约一致：五个 notes 操作都复用既有本机安全前置；正文、媒体类型、分页/排序、归属隔离、`expected_version` / `If-Match`、无变化不升版、单事务回滚、`StaleDataError` 分类、敏感错误收敛、标准契约不变，都有对应代码和测试约束；旧测试只精确扩展交付操作清单，没有放宽既有断言。

覆盖与缺口：复用已记录的后端 415、治理 23、格式/lint/类型/离线构建/契约全绿证据，`product_fingerprint=402335f045321d8eb6080158a3ce8294fe0f49fe4a0f20d5c17fcd50af123745`；无前端改动，复用已合并 TASK-016 的前端 215 / Chromium 22。此次未重跑额外测试，也未见需要补做的只读最小验证点。结论：`PASS`。

- 2026-09-03：IN_ACCEPTANCE，Review PASS / No findings。最终产品候选 `46ea4db0fb7238428c3980e99a124c927072fc25`，指纹 `402335f045321d8eb6080158a3ce8294fe0f49fe4a0f20d5c17fcd50af123745`。主 Agent 仅核对边界、测试绑定、审查结果和完成条件，不第三次审代码；后续只写回合法证据，待另一独立实际只读验收。

### 独立只读 Acceptance

- 独立于实现者和 Reviewer 的 CLI 会话 `01a06677-964f-7013-a648-6a10312c3129`，沿用已批准临时 gpt-5.4 / medium，启动头 read-only / never，未子派发，进程退出 0。以下报告原文。

候选与权限：`base=aaa1b5abfe929117f87d59b70d60040499a1d50f`，已 Review PASS 的最终产品候选 `46ea4db0fb7238428c3980e99a124c927072fc25`，当前 `HEAD=b636e3bede8a013774dfbc09bf10d1d5bea42300`。本运行器实际 `read-only / never`，`test -w .` 退出 `1`；未做试写、提交、合并或提权。已按要求各完整读取一次 `AGENTS.md`、`studypilot-stage-acceptance` skill、风险规则、`TASK-017`。

四项完成条件核对：1. 笔记五接口与隔离/分页/归属/归档可读证据，复用任务内已绑定的后端 `415`（含 `49` 新笔记测试）PASS。2. 正文/版本/查询/并发/回滚/敏感错误收敛，复用同批测试与记录的开发期失败后最终重跑 PASS。3. 成功响应与冻结 `Note schema`、契约/治理/格式/lint/类型/离线构建均 PASS，指纹 `402335f045321d8eb6080158a3ce8294fe0f49fe4a0f20d5c17fcd50af123745`；前端未改，复用已合并 `TASK-016` 的 `215/22` 证据。4. 我执行了唯一一次 `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-017-notes-backend.md --candidate HEAD --evidence-from 46ea4db0fb7238428c3980e99a124c927072fc25 --static-only`，结果 `EVIDENCE_ONLY PASS`；`git diff --unified=3 candidate..HEAD` 仅见 `TASK-017` 状态/EVIDENCE 与任务索引写回，无产品改动。缺口：无。

剩余限制：仅验收后端；笔记页面/回收站/资料删除/复习 AI/公网仍未开放，SQLite 竞争失败为已记录非阻断限制。结论：`PASS`，可由用户最终合并。

- 2026-09-03：ACCEPTED，独立 Review 和 Acceptance 均 PASS，No findings / 无未解决阻断。最终产品候选仍为 `46ea4db0fb7238428c3980e99a124c927072fc25`，之后仅合法任务状态/原文/索引写回。保留已披露的无回收站、仅后端和 SQLite 写竞争限制；由用户执行最终合并，不预写 MERGED。
<!-- EVIDENCE:END -->
