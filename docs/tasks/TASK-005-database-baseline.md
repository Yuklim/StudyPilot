# TASK-005：建立数据库模型与初始迁移

```toml
schema_version = 2
id = "TASK-005"
status = "IN_REVIEW"
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

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03：IN_PROGRESS。基线已核实为用户合并 TASK-003 的 main；L3，无独立验收豁免。
- 当前 IN_REVIEW，候选 SHA 将在冻结后由独立报告引用；Review / Acceptance 待完成。
- 最终合并：仅用户执行；当前未合并本任务。
<!-- EVIDENCE:END -->
