# TASK-005：建立数据库模型与初始迁移

```toml
schema_version = 2
id = "TASK-005"
status = "ACCEPTED"
risk = "L3"
risk_reason = "初始共享数据模型、跨模块外键和数据库迁移会影响数据完整性，保留独立 Review 与独立验收。"
risk_flags = ["migration", "critical-data", "sensitive-storage"]
owner = "repo_maintainer"
base = "8d8a3b0c3c03e5227bf0f78bb081e9b1bdd4cc43"
allowed_paths = ["backend/AGENTS.md", "backend/pyproject.toml", "backend/uv.lock", "backend/alembic.ini", "backend/migrations/**", "backend/src/studypilot/infrastructure/database/**", "backend/src/studypilot/infrastructure/config.py", "backend/tests/test_database.py", "backend/tests/test_migrations.py", "README.md", ".env.example", "docs/tasks/TASK-005-database-baseline.md", "docs/tasks/TASK-003-api-data-contract-baseline.md", "docs/tasks/TASK-004-governance-v2.md", "docs/tasks/任务索引.md"]
checks = ["backend", "governance"]
```

## 需求与范围

- 用户授权：按已说明的开发顺序，在用户确认 TASK-003 已合并后继续数据库基础；沿用用户要求的 V2 效率与实际风险原则。
- 依据：TASK-003 已批准契约第 2～4、6、8～9 节；架构第 5.3、6、12 节明确允许独立建立初始 SQLAlchemy 模型与 Alembic 迁移。
- 唯一写入者：主 Agent兼任 repo_maintainer，作为本任务唯一共享迁移维护者；只把已批准的数据含义落实为基础设施，不取得业务含义决定权。resources/taxonomy/learning/notes/reviews 的对象所有权不变。
- 目标：SQLAlchemy 2.x 模型、显式连接/事务入口、Alembic 初始迁移与临时数据库测试；仅新增已批准 SQLAlchemy/Alembic 依赖和锁文件。
- 11 个对象：LearningResource、OriginalFile、DeletionConfirmation、LearningProgress、Topic、Tag、ResourceTag、Note、StudyRecord、ActiveReviewPlan、ReviewRecord。
- 数据库负责静态字段/枚举/范围/唯一/外键约束；ORM 层负责 UTC 转换、名称规范化、版本及普通模型写入防护。跨对象业务状态机、来源 URL 完整输入校验、文件提升/删除确认操作由后续应用服务任务按契约实现，本任务不伪称已提供业务闭环。
- 非目标：不改契约、架构决定、前端、HTTP 行为、访问安全中间件；不实现业务路由/仓储用例、文件操作、AI、公开部署或 PostgreSQL 实际支持；不读写用户真实数据库。
- 附带控制面：仅同步 TASK-003/004 已合并的状态/决定日志及索引；不改其历史报告、授权、实现或测试。backend/AGENTS.md 只同步契约已批准事实和本任务边界。
- 并行：否。所有验证使用独立临时库；不提前开放 /api/v1，应用启动和导入不自动创建或迁移数据库。

## 完成条件

1. 11 个模型与契约字段、所有权和关键约束对应；不存原始删除令牌，不对 DeletionConfirmation 建资料级联外键。
2. 每个 SQLite 连接实际启用外键；每事务独立 Session，成功提交、异常回滚并关闭；配置通过基础设施进入，无全局运行会话。
3. 时间点保存为 UTC、读取为带时区时间，拒绝不明确的无时区输入；日历日期不转换；名称规范化唯一、版本并发冲突有测试。
4. 空的临时库能升级到唯一初始迁移，重复升级无破坏；模型与迁移无结构漂移；已有数据在重复升级后保留。降级不自动执行，初始降级拒绝删除非空业务表。
5. 外键/唯一/范围/来源互斥、学习/复习静态状态、确认记录保留、历史普通 ORM 修改拒绝、事务回滚均有真实正反测试；跨对象业务不变量明确留给后续用例，不靠推测新增规则。
6. 原健康检查、业务默认拒绝行为保持；全部后端检查、治理检查和独立 Review/Acceptance 通过。README 说明安装、显式迁移、路径、备份及当前不可直接使用业务功能。

## 上下文包

根 AGENTS.md V2、backend/AGENTS.md、本任务、契约第 2～4/6/8～9 节、架构第 5.3/6/12 节。无需重新读取旧任务全部报告。
检查入口：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-005-database-baseline.md --worktree`。
新增测试使用 Alembic 在 pytest 临时目录建库，不触碰默认运行库；迁移版本是冻结的建表定义，不导入未来可变模型来重建历史。

## 实现与测试

- 实现 SHA：`894cb30d08711bcef7f54f6448097168c77a53a5`。增加 11 个模型、SQLite 连接/事务/UTC 边界、冻结的 `0001_initial` 迁移和测试；既有 HTTP/安全实现及契约未改。README 已说明显式迁移、路径、备份和业务非目标。
- Worker 自检：范围匹配，表归属与关键外键对应契约；不存原始删除令牌，确认记录不随资料删除；不含真实数据，不自动运行迁移。跨表状态机和直接 SQL 绕过 ORM 防护的边界已明确，留给后续已授权业务服务，不声称当前业务可用。
- 环境：macOS / Python 3.13.9；SQLAlchemy 2.0.52、Alembic 1.19.1、pytest 8.4.2、Ruff 0.16.5。依赖和 uv.lock 同步；只安装已批准 SQLAlchemy/Alembic 及传递依赖。
- 2026-09-03 完整入口：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-005-database-baseline.md --worktree`；基线 `8d8a3b0c3c03e5227bf0f78bb081e9b1bdd4cc43`，20 文件，`product_fingerprint=f1a832790692c82e36f8112646502ac8d5d98dfc2dcd6824427aab0b75e9d746`。
- 本次格式检查、lint、mypy（16 文件）、pytest（45 项，其中新增数据库/迁移 39 项）、治理校验、治理格式/lint、治理单测（23 项）均 exit=0；路径/敏感模式/Git diff 静态检查 PASS。未改前端，未重复运行其测试。新行为在临时数据库中实际验证，未触碰默认运行库。
- 完整入口最初 exit=1：仅 `uv build --offline` 因沙箱不能读取本机 uv 缓存而 exit=2，其他组全通过。获得权限后在同一内容、同一环境定向重跑 `cd backend; uv build --offline`，exit=0，wheel 与源码包构建成功；复用未变的其他检查，不把最初总入口冒记为 PASS。现所有必要检查均已通过。
- 开发中发现的失败均已修正：枚举隐式约束导致 Alembic 比较误报，改显式表约束并通过完整结构比对及非法枚举测试；中间生成遗漏约束被同一测试拦截；长行/有意全角测试字符/联合类型标注检查修正。未降低断言或跳过失败测试。
- 完成条件证据：1/5 对应 `test_cascade_preserves_taxonomy_and_deletion_confirmation`、非法状态/原件/关联与摘要重复测试及冻结迁移；2 对应每连接外键、独立会话与回滚测试；3 对应 UTC/日历日期、名称唯一、版本冲突/无变化测试；4 对应重复升级保留数据/结构一致/空库降级/非空拒绝测试；6 对应启动无副作用 CLI 测试、原 6 项健康/安全回归、上述全部工具结果及后续独立报告。

### 首轮审查后修订与测试

- 修正 `OriginalFile.media_type` 模型及初始迁移为契约规定的 `text/markdown; charset=utf-8`、`text/plain; charset=utf-8`；新增两项合法值持久化测试、两项缺失 charset 的拒绝测试。仅修复契约漂移，不扩大范围，首版实现 SHA 保留为历史，新修订由下方最终候选 SHA 绑定。
- 同环境定向复验：后端 `.venv/bin/ruff format --check .`、`.venv/bin/ruff check .`、`.venv/bin/mypy src tests`（16 文件）、`.venv/bin/pytest`（49 项；新增数据库/迁移 43 项）和获准读取 uv 缓存的 `uv build --offline` 均 exit=0。
- `check_task.py --task docs/tasks/TASK-005-database-baseline.md --worktree --static-only`：STATIC PASS，20 文件；新 `product_fingerprint=41bcf1d38279615c7f23fd1a72ce261b47826af2cf171bd047380a51f36e3e3e`。`validate_governance.py` exit=0。治理脚本/依赖未变，复用原 23 项治理单测及其格式/lint；不把 static-only 当全套测试。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03：IN_PROGRESS。基线已核实为用户合并 TASK-003 的 main；L3，无独立验收豁免。
- 当前 IN_REVIEW，候选 SHA 将在冻结后由独立报告引用；Review / Acceptance 待完成。
- 最终合并：仅用户执行；当前未合并本任务。
### 首次独立 Review 原文

运行器：Codex CLI 0.145.0，GPT-5.4/medium，session `01a064fa-2a88-7b70-a847-485041a59554`；启动头实证 `approval: never`、`sandbox: read-only`，不是只凭项目 TOML。仅本次运行临时模型选择，不改默认配置。

CHANGES_REQUIRED

base `8d8a3b0c3c03e5227bf0f78bb081e9b1bdd4cc43` → candidate `d41b213ee92819bfa7843ea9793f9c540d754be0`。实际只读权限证据：本会话环境声明 `filesystem sandbox: read-only`，且只执行读取命令；`git status` 过程中对 `/tmp/xcrun_db-*` 的写入也收到 `Operation not permitted`，符合只读运行。

Findings
1. `OriginalFile.media_type` 的冻结模型和初始迁移与已批准契约不一致。[docs/contracts/API与数据契约基线.md:417](/Users/yuklimching/Desktop/StudyPilot/docs/contracts/API与数据契约基线.md:417) 与 [docs/contracts/API与数据契约基线.md:418](/Users/yuklimching/Desktop/StudyPilot/docs/contracts/API与数据契约基线.md:418) 明确 Markdown/TXT 的规范媒体类型分别是 `text/markdown; charset=utf-8`、`text/plain; charset=utf-8`，但候选只允许无 charset 的值，见 [backend/src/studypilot/infrastructure/database/models.py:139](/Users/yuklimching/Desktop/StudyPilot/backend/src/studypilot/infrastructure/database/models.py:139) 和 [backend/migrations/versions/0001_initial.py:288](/Users/yuklimching/Desktop/StudyPilot/backend/migrations/versions/0001_initial.py:288)。触发条件：后续服务按契约写入 Markdown/TXT 原件时。影响：合法契约值会被数据库约束拒绝，形成已批准契约与存储基线漂移。安全修正：把模型与 `0001_initial` 的允许值改成契约规定的规范值，并补正反测试覆盖这两个文本媒体类型；当前测试仅覆盖 `application/pdf` 和一个非法值，未覆盖该契约点，见 [backend/tests/test_database.py:191](/Users/yuklimching/Desktop/StudyPilot/backend/tests/test_database.py:191)。

覆盖与风险
- 已按首次 Review 要求检查完整 `base..candidate` diff，并核对了 root `AGENTS.md`、[backend/AGENTS.md](/Users/yuklimching/Desktop/StudyPilot/backend/AGENTS.md:1)、[docs/tasks/TASK-005-database-baseline.md](/Users/yuklimching/Desktop/StudyPilot/docs/tasks/TASK-005-database-baseline.md:1)、风险规则实际风险章节、契约第 2-4/6/8-9 节、架构第 5.3/6/12 节。
- 复用任务内可信机械检查证据：后端 45 项、治理 23 项已通过；未见需要额外重跑的其他具体证据缺口。
- 除上述契约漂移外，模型/迁移一致性、外键与级联方向、事务入口、UTC/日期边界、版本并发、防普通 ORM 改写历史、初始迁移重复升级与非空降级保护均已覆盖到位。

- 主 Agent处置：接受该阻断结论，修正允许值并补契约正反测试；不修改已批准契约。修订重新冻结，同一 Reviewer 增量复核。
### 最终独立 Review 原文

同一 Reviewer session `01a064fa-2a88-7b70-a847-485041a59554`，运行头再次验证 `sandbox: read-only`、`approval: never`。最终候选静态指纹与修订测试一致，`41bcf1d38279615c7f23fd1a72ce261b47826af2cf171bd047380a51f36e3e3e`。

PASS

最终候选 `6dee1d061b84fa4b0dc63ef9f6d331d1fb46dec2`。继承范围：继续有效的是我上轮对 `8d8a3b0c3c03e5227bf0f78bb081e9b1bdd4cc43..d41b213ee92819bfa7843ea9793f9c540d754be0` 其余未改部分的完整审查结论；本轮仅增量检查 `d41b213ee92819bfa7843ea9793f9c540d754be0..6dee1d061b84fa4b0dc63ef9f6d331d1fb46dec2` 及其必要影响。

实际只读权限证据：本会话仍处于 `read-only` 沙箱；且 `git status` 运行时对 `/tmp/xcrun_db-*` 的写入继续收到 `Operation not permitted`，符合独立只读运行。

上轮唯一 finding 已关闭。`OriginalFile.media_type` 模型与冻结迁移现已改为契约要求的 `text/markdown; charset=utf-8` / `text/plain; charset=utf-8`，见 [models.py](/Users/yuklimching/Desktop/StudyPilot/backend/src/studypilot/infrastructure/database/models.py:139) 和 [0001_initial.py](/Users/yuklimching/Desktop/StudyPilot/backend/migrations/versions/0001_initial.py:288)；并补了两个合法值持久化正例与两个裸类型反例，见 [test_database.py](/Users/yuklimching/Desktop/StudyPilot/backend/tests/test_database.py:191)。

新 findings：No findings。

覆盖与风险：已核对本轮仅涉及的模型、初始迁移、数据库测试、任务证据更新；后端 49 项、Ruff format/lint、mypy、离线构建和静态治理检查的复用/更新证据与本次修订一致，未见新的契约漂移或未覆盖影响。

- 当前 IN_ACCEPTANCE；主 Agent只核对边界、测试指纹、Review 结论和剩余风险，未重复完整代码审查；首轮阻断已关闭。等待与实现者/Reviewer 分离的只读验收。
### 独立验收原文

独立验收 session `01a06500-8551-7c43-adbe-f18af48c14ed`，与实现者及 Reviewer 分离；Codex CLI 启动头实证 `sandbox: read-only`、`approval: never`。仅复用已绑定的测试及 Review 并核对完成条件，未再次做整份代码 Review。

**PASS**

已按独立 `Integration/Acceptance` 只读验收执行。实际 runtime 为只读且 `approval: never`，不是只看任务描述：当前会话里 `git status`/`git rev-parse` 都触发了对 `/tmp/xcrun_db-*` 的写入失败并返回 `Operation not permitted`，可作为实际只读证明。当前证据头是 `b7a01170d4f7b51a271860276d0a75c0781fc33c`，已 Review 的最终候选是 `6dee1d061b84fa4b0dc63ef9f6d331d1fb46dec2`；我核对了 `6dee1d0..b7a0117`，只有 [docs/tasks/TASK-005-database-baseline.md](/Users/yuklimching/Desktop/StudyPilot/docs/tasks/TASK-005-database-baseline.md:1) 和 [docs/tasks/任务索引.md](/Users/yuklimching/Desktop/StudyPilot/docs/tasks/任务索引.md:1) 的证据/状态写回，没有实现代码变化，与“后续只写证据”一致。独立 Reviewer `01a064fa-2a88-7b70-a847-485041a59554` 的最终结论是 PASS，且覆盖到最终候选。

六条完成条件未见证据缺口：
1. 11 个模型都在候选中，`DeletionConfirmation.resource_id` 仅为逻辑绑定索引、非资料级联外键；`OriginalFile.media_type` 契约漂移已修复，Review 增量 PASS。
2. 连接与事务入口由 `connection.py` 明确提供；`test_foreign_keys_enabled_on_every_new_connection`、`test_transaction_commit_rollback_and_separate_sessions` 对应外键、独立 Session、提交/回滚/关闭路径。
3. `test_utc_roundtrip_naive_rejection_and_calendar_dates`、`test_normalized_names_are_unique`、`test_version_conflict_and_noop_preserve_timestamps` 覆盖 UTC、无时区拒绝、日期不转换、名称规范化唯一、版本冲突。
4. `test_upgrade_is_repeatable_and_matches_models`、`test_empty_downgrade_and_reupgrade`、`test_nonempty_downgrade_refuses_before_dropping_any_table` 覆盖唯一初始迁移、重复升级保留数据、无结构漂移、非空降级拒绝。
5. 非法状态/范围/互斥、确认记录保留、普通 ORM 修改拒绝、事务回滚均有正反测试；跨对象业务不变量仍明确留给后续任务，未伪称已实现。
6. `/health` 与 `/api/v1` 默认拒绝边界未改；README 已写明显式迁移、路径、备份和当前不能直接使用业务功能。测试指纹为 `41bcf1d38279615c7f23fd1a72ce261b47826af2cf171bd047380a51f36e3e3e`，与最终 Review 绑定一致。49 项后端测试、23 项治理测试的有效性在任务证据中闭合；最初完整入口因 `uv build --offline` 受缓存读取限制失败，这一点被如实记录，随后在同内容同环境定向补跑构建成功，没有把首次失败冒记为 PASS。

剩余风险是已声明且非阻断的范围边界：当前仅支持 SQLite，不包含 HTTP 业务、跨表状态机、文件操作、PostgreSQL 实际支持；ORM 级保护不覆盖绕过 ORM 的直接 SQL。这些都已在任务与 README 中明确，不构成本次验收退回理由。

最终结论：`PASS`。是否合并仅由你本人决定并执行；我不会提交、修复或合并。

- 2026-09-03 最终状态：ACCEPTED，候选 `6dee1d061b84fa4b0dc63ef9f6d331d1fb46dec2` 已通过独立 Review 与独立验收；首轮唯一阻断已修正，无未处置阻断。
- 主 Agent完成证据门禁：测试指纹、授权范围、六项条件与独立结论一致；后续只有本任务 EVIDENCE/status 和索引行写回。交付仅数据库基础，不触碰用户真实数据库、不开放业务接口。未实现的后续服务/PG 属于既定非目标，不作为已完成能力。
- 等待用户决定并执行最终合并，Agent 不合并或推送 main。下一任务计划为共享测试基础（统一临时数据库/文件/API 客户端等测试入口），为真实业务模块和前端开发提供可复用验证；须在本任务合并后登记实施。
<!-- EVIDENCE:END -->
