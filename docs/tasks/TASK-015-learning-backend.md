# TASK-015：学习状态、进度与学习记录后端

```toml
schema_version = 2
id = "TASK-015"
status = "ACCEPTED"
risk = "L3"
risk_reason = "实现既定学习写接口，涉及当前进度与不可变历史的原子保存、版本冲突及状态/时间不变量。标准契约与数据库结构不变，保留独立只读 Review 和 Acceptance。"
risk_flags = ["business", "critical-data", "public-api", "tests"]
owner = "learning_worker"
base = "94a037f5a3cc279546a3869b2bcec472bb96db76"
allowed_paths = ["backend/src/studypilot/modules/learning/**", "backend/src/studypilot/application/learning.py", "backend/src/studypilot/infrastructure/database/learning_store.py", "backend/src/studypilot/api/learning.py", "backend/src/studypilot/main.py", "backend/tests/test_learning.py", "backend/tests/test_taxonomy.py", "README.md", "docs/contracts/API与数据契约基线.md", "docs/contracts/openapi-v1.json", "docs/tasks/TASK-014-file-pages.md", "docs/tasks/TASK-015-learning-backend.md", "docs/tasks/任务索引.md"]
checks = ["backend", "contracts", "governance"]
```

## 需求与范围

- 用户“已合并”承接上一轮明确的下一步学习状态/进度功能；PR #19 已核实 MERGED（2026-09-03T07:25:29Z），合并提交为 base。工作区干净，从 origin/main 创建本任务分支，不修改 main；TASK-014 仅登记真实合并事实。
- 依据：已确认需求 5.5/5.7，架构第 12 节学习后端→页面顺序，冻结契约 2/3/4.4/4.9/6/7/10/11 和三个 study-records 操作及其 schema。嵌套后端 TASK-002 初期说明不阻止此处明确授权的接口接入。
- 主 Agent 兼任 learning_worker，为唯一实现写入者；coordinator 串行登记任务/索引与交付注释。使用 task-intake / implement / review / stage-acceptance Skills；不另派机械 Worker，最终各一次独立实际只读 Review 和 Acceptance。
- 实现 POST/GET `/api/v1/resources/{resource_id}/study-records` 与 GET `/api/v1/study-records`。请求严格字段/类型/时间校验，稳定分页、半开时间范围、排序白名单与 id 决胜；全局支持 resource_id/topic_id，单资源只接受既定局部筛选。语法正确但不存在的筛选 ID 为空页；不存在或尚不可见 FILE 父资料为 404。
- 写入同一事务验证 expected_progress_version 和 before 值，按冻结矩阵追加不可变 StudyRecord 并更新 LearningProgress；失败全部回滚，不自动重试/重放。100% 不自动完成，回未读须显式 0，首次开始时间不覆盖，完成/重开与归档/恢复按契约保存时间和记忆状态；总结单独追加不伪造进度变更或版本增加。
- 复习边界：只读取既有 ActiveReviewPlan 验证 SCHEDULED/PAUSED 条件，覆盖 REVIEW_DUE 归档/恢复时计划/日期/版本不变。不得凭学习请求创建/暂停/完成计划或写 ReviewRecord；复习动作及其页面仍为后续任务。违反必要计划条件返回受控 409，不产生不一致数据。
- 复用共享安全中间件、既有数据库/版本/历史保护与资源可见性规则；不改资源本体字段/updated_at，不泄露私密总结/疑问、SQL、路径或令牌到错误。资源详情/筛选读取现有权威进度，不复制第二套状态。
- coordinator 仅同步中文契约 1.3 与 OpenAPI 顶层 x-delivery-profile 的真实阶段/三操作可用性，不改变标准 paths/schemas/要求。README 说明后端已交付但页面记录操作未接入；不会把无界面功能伪装成已经能点击。
- 既有 test_taxonomy.py 的全局可用操作数量固定为 17；仅将这个交付目录断言同步为新增三操作后的 20，保留原分类/文件断言并验证新增项，不改变分类测试语义或实现。
- 禁止所有未列路径，尤其前端、模型/迁移、现有资源/分类/文件实现、安全协议、依赖/锁文件、治理规则、真实数据。不开笔记/复习写入/统计/正文解析/AI/公网，不发明新公共字段或接口。

## 完成条件

1. 三个既定操作及 envelope/page/schema 可用；完整学习生命周期、单资源/全局记录读取、重启持久化可复现，资料本体及历史不被覆盖。
2. 状态矩阵与附加条件、before/版本冲突、初次开始/完成/重开/归档/恢复、100% 不自动完成、总结-only 无进度变更、复习计划边界有正反测试。
3. 严格请求、筛选、时区/范围、分页/稳定排序；不可见 FILE/未知父资料、未知筛选为空页；安全门禁前置、不读未授权正文、不漏敏感信息；历史不开放修改删除。
4. 真实临时 SQLite 集成覆盖记录插入/进度更新/提交故障的原子回滚、竞争写不丢历史或覆盖新进度、现有资源投影/归档筛选联动；标准契约未改变且响应形状绑定其 schema。后端/契约/治理全检通过；未改前端，复用 TASK-014 已合并的 168 前端/19 浏览器证据，不重跑未变界面。
5. 实现/检查证据固定后，独立实际只读 Review 及另一独立实际只读 Acceptance 通过；只合法证据写回，最终用户合并。

## 上下文包

根/后端规则、本任务、上述局部需求/契约；现有 taxonomy 分层模式、resource_store 可见性/进度投影、数据库 LearningProgress/StudyRecord/ActiveReviewPlan 与测试夹具。只读相关内容，不完整读取全仓或旧任务。
准确检查：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-015-learning-backend.md --worktree`；开发期 `cd backend && .venv/bin/pytest tests/test_learning.py`。不安装依赖、不改模型。

## 实现与测试

- 已实现三个 study-records 操作：严格输入与查询、纯状态规则、单次事务追加历史与更新进度、只读稳定分页；复用统一令牌/来源检查，错误只含固定码/说明与安全版本。只写 LearningProgress/StudyRecord；复习计划、资料本体、文件、旧历史不修改，无模型/迁移/依赖变化。
- 实现 SHA：`f40e0a518b2c0762db7e4c7375d4e49d28d5b0ba`。base 为任务基线；15 个文件，最终 product_fingerprint=`68c2b314879d2c6afc0d7174bdcd9a566eda177b22b5d8703a58b3feb4a70618`。
- 2026-09-03，macOS、Python 3.13.9，已安装锁定依赖。开发定向 `.venv/bin/pytest tests/test_learning.py -q --tb=short` 最终退出 0：93 项通过；`.venv/bin/mypy src tests` 退出 0，52 源文件；Ruff 通过。
- 全检命令 `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-015-learning-backend.md --worktree`：范围/敏感模式/JSON/diff 静态 PASS；后端格式/lint/类型、366 项 pytest（5.09 秒）、契约/FastAPI 结构、治理规则/lint/格式和 23 项治理测试均退出 0。脚本整体退出 1，仅 `uv build --offline` 因宿主 uv 缓存访问权限退出 2；没有隐藏这次失败。
- 随后只为受阻构建开放已有缓存访问，原命令 `cd backend && uv build --offline` 退出 0，产出 sdist/wheel；离线、未安装/改依赖/改配置、产品输入未变，因此复用上述其他检查，不重复整套。最终所有必要检查项均有成功证据，不把首次脚本退出 1 改写成 CHECKS PASS。生成包不提交。
- 93 个新测试含五状态 25 组合、各原状态归档恢复、版本/before 冲突、时间与 100%/显式完成、总结-only 无版本变化、复习计划条件且不改计划、真实文件资料联动、历史重启持久化、查询/分页/时间边界/稳定决胜、不可见 FILE 及未知父资料、未知筛选空页、响应字段/schema 绑定、安全拒绝、插入/更新/提交故障原子回滚、竞争写与 ORM 冲突不重放。全套旧 273 项保留（仅交付操作目录断言 17→20 且新增三项断言）。
- 标准契约深比较退出 0：OpenAPI 除 x-delivery-profile 全部相同；原 17 操作配置不变、仅新增学习三操作；中文仅 1.3 交付注释变化。后台能力说明明确界面未接入。前端无变更，不重复已合并 TASK-014 的 168 前端/19 浏览器测试；未声称这次运行了它们。
- 开发失败及修正：首轮 45 失败/44 通过，主要是严格时间字段与前置字符串校验组合误拒合法 RFC 3339；仅该时间字段允许已检查字符串转换，整数/范围/未知字段仍严格。空令牌用例纠正为既有 INVALID，另加真正缺少令牌的 REQUIRED 验证。类型检查补空列表类型后通过；初稿 lint/格式问题已修正。无削弱契约断言或未处理必要失败。
- 已知边界：本地单进程；SQLite 竞争写允许受控 500 回滚（也可能明确 409），不重放。总结-only 属追加历史，不改变当前进度版本；用户再次明确提交会新增一条，不承诺幂等写入。学习接口只核对既有复习计划，不代替复习动作；页面、笔记、复习和统计待后续任务。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03：IN_PROGRESS；L3，依赖已合并，边界与必要检查已确认。
- 2026-09-03：IN_REVIEW；实现及完整检查证据固定，等待独立只读审查，不预写 Review/Acceptance PASS。

### 独立只读 Review

- 2026-09-03：独立 CLI 会话 `01a06636-5a82-7d42-94a3-dc5f4fa06a0f`，沿用用户已批准临时 `gpt-5.4 / medium`，未改默认模型。运行头 read-only / never、禁止子派发，非写入权限检查退出 1，进程退出 0。冻结候选 `3453af065c0688242e30c910b66d8e9085f6cdbd`。以下为报告原文。

PASS。`base=94a037f5a3cc279546a3869b2bcec472bb96db76`，`candidate=3453af065c0688242e30c910b66d8e9085f6cdbd`。运行独立性/只读证据：当前 sandbox=`read-only`、approval=`never`；`test -w .` 退出 `1`，未试写；`HEAD` 即 candidate，`git merge-base(base,candidate)=base`；`git status --short --branch` 仅显示 `agent/learning_worker/TASK-015-learning-backend...origin/main [ahead 2]`，无工作区改动。

No findings。已完整审阅一次 `base..candidate` 15 文件 diff，并补核相关调用链：新路由经既有 `LocalAccessMiddleware` 先做 Host/令牌/Origin/Fetch Metadata 前置判定，再读 body；`learning_store.py` 仅写 `LearningProgress/StudyRecord`，复用既有可见性与版本保护；`state.py` 对应契约第 6 节的 before/version、状态/时间矩阵、归档记忆、`REVIEW_DUE` 只读计划条件；全局/单资源分页、半开时间范围、排序白名单与 `id` 决胜实现一致。已按要求复用指纹 `68c2...0618` 的既有检查证据，未机械重跑全套；覆盖内无阻断缺口。

- coordinator：Review PASS，No findings；无需产品修订，进入 IN_ACCEPTANCE。审查后仅同任务 status/EVIDENCE 与索引行写回；原实现/测试证据不变。


### 独立只读 Acceptance

- 2026-09-03：独立于实现者及 Reviewer 的 CLI 会话 `01a06639-451c-79b3-aae6-8c830d858220`，沿用已批准临时 `gpt-5.4 / medium`，启动头 read-only / never，禁止子派发，进程退出 0。以下为报告原文。

PASS。验收候选 `3453af065c0688242e30c910b66d8e9085f6cdbd`，当前 `HEAD=75cfb899958df47619c578a0442804e66f3ba579`。本会话实际独立只读：`approval=never`，`test -w .` 退出 `1`，未试写；`git status --short --branch` 仅见分支前进，无工作区改动。`candidate..HEAD` 仅变更 [docs/tasks/TASK-015-learning-backend.md](/Users/yuklimching/Desktop/StudyPilot/docs/tasks/TASK-015-learning-backend.md) 与 [docs/tasks/任务索引.md](/Users/yuklimching/Desktop/StudyPilot/docs/tasks/任务索引.md) 的合法状态/Review/EVIDENCE/索引写回；`--static-only` 返回 `EVIDENCE_ONLY PASS`，未称全测。

五项完成条件证据完整，均绑定同一 `product_fingerprint=68c2b314879d2c6afc0d7174bdcd9a566eda177b22b5d8703a58b3feb4a70618`：三操作与 schema/page/envelope、状态矩阵与 before/version/summary-only/复习边界、严格筛选/分页/安全与未知筛选空页、SQLite 原子回滚/竞争写受控回滚、契约深比较不变且仅新增 metadata 三操作。366 后端测试、93 新测、23 治理与契约/类型/lint/format 均有退出 0 证据；首次全检脚本退出 1 仅因 `uv` 缓存权限导致 `uv build --offline` 退出 2，后续同输入单独构建退出 0，已诚实保留，不构成阻断。未解决缺口仅为已记录边界：前端本次未接入且未重跑旧前端/浏览器证据，SQLite 竞争写允许受控 `500/409` 回滚且不重放，summary-only 追加历史不改 progress version，不创建/暂停/完成复习计划。最终是否合并仍由用户本人决定。

- coordinator：五项完成条件证据齐备，366 项后端已包含 93 项新增测试；Review / Acceptance 均 PASS、无待修复 findings。首次构建失败与成功补跑完整保留，最终必要检查均完成。ACCEPTED，等待用户最终合并；未推送 main、未代为合并。最终仅证据写回与窄门禁，不递归验收。

<!-- EVIDENCE:END -->
