# TASK-009：网页与粘贴资料后端

```toml
schema_version = 2
id = "TASK-009"
status = "IN_REVIEW"
risk = "L3"
risk_reason = "首次启用资料持久化及原子创建事务，含敏感原文、初始进度和标签关联；本次续接另含用户授权的阶段契约说明，仍需 L3 独立审查验收。"
risk_flags = ["critical-data", "sensitive-storage", "public-api", "tests"]
owner = "architecture_owner"
base = "910e85b3164704e02664f1420eee65e509467e63"
allowed_paths = ["backend/src/studypilot/api/resources.py", "backend/src/studypilot/modules/__init__.py", "backend/src/studypilot/modules/resources/**", "backend/src/studypilot/application/__init__.py", "backend/src/studypilot/application/resources.py", "backend/src/studypilot/infrastructure/database/resource_store.py", "backend/src/studypilot/infrastructure/security/local_access.py", "backend/src/studypilot/main.py", "backend/tests/test_resources.py", "frontend/e2e/local-access.spec.ts", "frontend/e2e/resources.spec.ts", "README.md", "docs/contracts/API与数据契约基线.md", "docs/contracts/openapi-v1.json", "docs/tasks/TASK-008-local-access-foundation.md", "docs/tasks/TASK-009-resource-backend.md", "docs/tasks/任务索引.md"]
checks = ["backend", "frontend", "governance", "contracts"]
```

## 需求与范围

- 用户要求“已合并，下一步”；已核实 PR #13 MERGED，合并提交为 base。承接 TASK-008 明确的资料后端下一步。
- 依据：已批准契约第 2.1～2.3、4.1/4.2/4.4～4.7/4.10、5、7、10 节及 OpenAPI 的 createResource/listResources/getResource；架构 6.1、7.2 添加资料及阶段 B。最终需求、schema、模型、迁移不改；下述用户追加授权允许补充阶段性交付条款。
- 唯一实际写入者始终是主 Agent：此前兼任 resource_worker 完成业务实现；2026-09-03 用户同意补充契约说明后，串行切换 architecture_owner，只修改两份契约的阶段说明、README 和任务控制面，不重做或修改已有业务代码/测试。保留原允许路径仅用于完整候选审计，不表示架构角色可继续业务开发。coordinator 仍由同一主 Agent兼任；按 Git 规则角色切换沿用原分支。没有额外实现 Worker。L3 最后各一位实际只读独立 Reviewer、Integration Owner。
- 2026-09-03 追加授权：针对“补充分阶段交付说明，明确本阶段网页/粘贴、文件后续，最终需求不变、代码不重做，再复审验收”的提议，用户答复“可以”。新增允许路径为 `docs/contracts/API与数据契约基线.md` 和 `docs/contracts/openapi-v1.json`。只澄清当前可用范围、暂未实现输入的响应及客户端使用限制；不能以阶段说明豁免安全/数据完整性、删除最终 FILE 要求或缩减已稳定功能。
- 实现 POST JSON WEB/PASTE、GET 列表（既定搜索/筛选/排序/分页）、GET 详情。只保存链接，不抓取网页；粘贴内容原样保留，不解析/执行。支持引用既有 Topic/Tag；不新增分类管理接口。
- 初始进度仅通过存储适配建立 TASK-005 已定义的默认行（UNREAD/0/version=1），与新资料及标签关联同事务；这是资料创建必要完整性初始化，不实现学习状态转换、进度更新或学习记录。查询仅组合只读投影，不传可变 ORM 对象跨模块；taxonomy 保留分类及关联所有权，resources 只写自己的 topic_id。
- 安全中间件仅向可信 request state 暴露其生成的 request_id，供业务错误复用；不改既有授权判定。数据库仅在通过安全和输入校验后的业务请求显式打开，始终关闭；不自动建表/迁移，不操作用户已有数据作测试。
- 前端只改/增加真实浏览器测试，不改页面和 API 客户端。旧“未实现路由返回404”测试改到明确不存在的路径，保留原强度。界面表单和真实数据接入是下一任务。
- 非目标：FILE 上传/下载、PATCH、删除、分类 CRUD、学习/笔记/复习/统计写入、AI、公网部署、依赖升级、治理/Agent 配置变更。当前 multipart 返回 415，不能把部分接口实现冒称完整资料管理。
- 仅更新 TASK-008 status/EVIDENCE/索引合并事实；不重写历史。无并行写入；所有未列入路径禁止修改。

## 完成条件

1. WEB/PASTE 创建 201，详情持久可读，字段/UUID/UTC/初始进度符合契约；重启应用后数据仍在。URL 真解析，无网络抓取，拒绝凭据/片段；未知字段、类型/边界、互斥和重复标签严格校验。
2. 全部必要创建步骤原子提交；缺失主题/标签、格式错误、存储错误无半成品，失败不回显正文/URL/路径/SQL/令牌，错误编号与响应头相同。原安全拒绝、health、未授权不读体/建库保持有效。
3. 列表仅摘要，无 URL/粘贴正文/文件哈希或内部存储键；搜索仅三个批准字段并遵守 Unicode 规范化；AND/OR、默认排除归档、READY 文件可见性、分页稳定决胜和时间/进度边界可验证。详情组合只读进度/标签/复习/原件，不因读取更新版本或时间。
4. 自动后端/前端/治理检查及真实 Chromium 的保存→刷新→列表→详情通过；仅临时已迁移数据库和合成数据，含令牌的浏览器测试关闭 trace。页面仍明确未接入，不伪装可操作。
5. README 准确说明后端能力、需显式建库和局限；冻结候选、测试绑定、独立 Review/Acceptance 有真实证据；最终合并由用户执行。
6. 追加授权的阶段说明在中文契约和 OpenAPI 一致可见；最终接口、字段、枚举、媒体类型目标和响应 schema 保持原样，补充清晰的当前可用子集及 FILE 后续交付门槛。对新增契约说明执行结构/语义检查，复用未改变代码的既有测试证据，同一 Reviewer 复核新的冻结候选。

## 上下文包

根/后端/前端 AGENTS.md、V2 task-intake/implement/review/stage-acceptance Skills；上述契约/架构段落；现有 database/models.py、connection.py、main.py、安全中间件和共用测试夹具。只读必要接口/字段，不重读全部历史。

检查：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-009-resource-backend.md --worktree`；`cd frontend` 后 `npm run test:e2e`。不引入依赖或扩大检查脚本权限。

## 实现与测试

- 实现 SHA：`66e14bdf31b1fba05c5b032a298cdcfdb030a61b`。16 文件，已自检范围；三个资料接口、纯命令校验、应用事务及私有 SQLAlchemy 适配器，安全中间件仅增加可信 request_id state。无模型/迁移/依赖/页面业务修改。查询先 SQL 筛选，普通列表直接 SQL 计数/分页；Unicode 搜索只加载必要元数据匹配，正文/URL 延迟加载。
- 环境：macOS arm64，既有 Python 3.13.9/pytest 8.4.2、Node 24/npm 11、Vitest 4.1.11、Playwright/Chromium（TASK-008 同一安装）。pytest 使用自动隔离的临时路径；E2E 使用临时已迁移库与 15173/18000 端口，不读取真实资料。
- 完整 `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-009-resource-backend.md --worktree`：exit=0/CHECKS PASS，16 文件，product_fingerprint=`78025e1025ce2c353b04078751e0b9ccc88187ed6e3245bbd3c67805e45dc9ee`。后端 Ruff 格式/lint、mypy（29 文件）、187 项 pytest、离线源码包/wheel 构建；前端格式/lint/类型、46 项 Vitest、生产构建；治理校验及 23 项单测全部通过。治理单测中的 fake-test/missing-tool 是验证失败处理的模拟，不是实际检查失败。
- 完整 `cd frontend` 后 `npm run test:e2e`：exit=0，8/8 Chromium PASS（11.6 秒）。真实共享客户端经代理保存 WEB/PASTE → 刷新 → 搜索列表 → 详情；原 7 项安全/页面/移动布局测试保留，旧未知路由断言移至 `/api/v1/unknown`。安全和资料套件 trace 关闭，临时令牌只留浏览器内存。未增加页面功能，因此不重复视觉选型/截图评审。
- 条件 1/2：新增 `test_resources.py` 72 项，创建/读取/应用重启、UUIDv4/UTC/默认进度、主题/标签引用；格式/类型/长度/来源互斥/URL解析/NaN/非法查询在建库前拒绝；故障注入证明资料+进度+标签关联回滚，已有 Tag 保留；错误无敏感回显、request_id 头体一致。既有安全和 health 115 项全部保留通过。
- 条件 3：Unicode NFKC/大小写/空白规范化搜索，正文/URL不参与搜索且不出摘要；筛选组合与进度/日期边界、缺失筛选ID空页、归档默认隐藏、分页稳定决胜及四种排序正反向、只读时间/版本不变；READY/PENDING/FAILED文件可见性及文件摘要/详情字段隔离。最大 1,000,000 字符原文正常持久化。
- 条件 4/5：上述完整检查及真实浏览器证据；README 同步后端已实现/界面未接入、显式迁移、单机范围与搜索成本。任务冻结前保留全部测试和完成条件，之后仅写回独立证据。
- 真实失败与修正：初始 Ruff 将故意测试 NFKC 的全角字母标为歧义字符，精确行注明测试用途；mypy 初始两项类型标注/变量复用问题已修正。定向测试依次 66/67 通过，补充分页输入与最大原文/排序后最终完整 72 项新测通过；没有降低断言、隐藏失败或新增依赖。
- 已知边界：只完成 JSON WEB/PASTE 创建和三接口，不支持 FILE 创建、元数据修改/删除、分类管理或界面表单。Unicode 搜索内存匹配适合当前个人/低流量场景，不声称适合海量资料。初始默认进度不是学习功能；不自动建表，无公网认证。独立 Review/Acceptance 待执行。

### 用户授权续接：阶段契约说明

- 说明实现 SHA：`c186962fb26d79b10e1a7344aaa2b49e7d6b4da8`，本次仅 5 文件（中文契约、OpenAPI、README、TASK-009 与索引）。最终任务相对 base 共 18 文件。新增契约第 1.3 节与 `x-delivery-profile`，明确同一 createResource 操作在 TASK-009 仅开放 JSON WEB/PASTE，multipart 安全前置后暂 415，后续文件任务完成后同步清单；保留最终 FILE schema、安全规则及完整 MVP 验收要求。
- 本次静态检查：`check_task.py --task docs/tasks/TASK-009-resource-backend.md --worktree --static-only` exit=0，18 文件，product_fingerprint=`dca4403e2c9f3f21a528fa1a4b2afb591ad242665a4eeba01339b862a1d38ddf`。指纹变化来自文档/契约，不冒称旧指纹仍覆盖全部输入。
- 增量检查命令：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python -c 'from scripts.governance.check_task import commands, run_command; results=[run_command(directory, command) for group in ("contracts", "governance") for directory, command in commands(group)]; raise SystemExit(any(results))'` exit=0。实际运行既有契约检查组（FastAPI OpenAPI 结构解析）及治理校验/lint/format/23 项单测，不修改检查脚本、不删除其他必要检查。
- 证据复用：`git diff --exit-code e33f989c4bb7c376cae9cb199e3165fff74e00ab -- backend frontend .env.example` exit=0；业务源码、测试、依赖、构建/运行配置没有变化，环境未变，复用上文 187 后端/46 前端/8 Chromium、两端构建及各自格式/类型/lint 证据，不重跑。最终完成证明为原有效测试 + 本次契约增量检查，不称只读静态校验为完整测试。
- 一次性 Node 语义断言 exit=0：与 `e33f989...:docs/contracts/openapi-v1.json` 的 JSON 比较，剔除新增 `x-delivery-profile`、恢复 info.description 与 createResource.description 后深比较完全相等；所有标准 paths/请求响应 schemas/枚举/媒体类型/版本未改。额外断言可用 operationId 均存在且恰为四项、createResource 只开放 JSON WEB/PASTE、暂缓 FILE 的 415/error_code/安全前置/无读体副作用与中文说明一致、FILE 目标仍保留，README 含相同阶段引用。静态检查同时验证 JSON 引用/结构、允许路径、敏感模式和 Git 空白。
- 本次无代码重做/测试失败。待同一 Reviewer 审新候选并显式继承原完整审查覆盖；之前 CHANGES_REQUIRED 原文保留为历史，不作为新候选已通过的证明。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03：IN_REVIEW。完整检查通过，主 Agent已完成一次自检；沿用获授权的 GPT-5.4 medium 实际只读运行器，不改默认 Agent 配置。独立 Review/Acceptance 待执行。
### 独立 Review 原文

Reviewer session `01a06570-7368-7482-83de-88f3080584c2`，Codex CLI 0.145.0/GPT-5.4 medium，启动配置实际为 `sandbox: read-only`、`approval: never`；独立于主 Agent实现者，`test -w .` 输出 exit=1。初审输出 /private/tmp/studypilot-task009-review.32wcsz/review.md。

**CHANGES_REQUIRED**

base `910e85b3164704e02664f1420eee65e509467e63` → candidate `e33f989c4bb7c376cae9cb199e3165fff74e00ab`。实际权限证明：`test -w .` 返回 `exit=1`，当前运行时为只读；未写文件、未提交、未委派。

- [backend/src/studypilot/api/resources.py](/Users/yuklimching/Desktop/StudyPilot/backend/src/studypilot/api/resources.py:61) 把 `POST /api/v1/resources` 的所有非 `application/json` 请求一律返回 `415`。触发条件：按已批准 `createResource` schema 发送 `multipart/form-data` 的 FILE 创建。影响：与当前已批准契约/operation schema 冲突，[docs/contracts/API与数据契约基线.md](/Users/yuklimching/Desktop/StudyPilot/docs/contracts/API与数据契约基线.md:321) 第 5 节和 [docs/contracts/openapi-v1.json](/Users/yuklimching/Desktop/StudyPilot/docs/contracts/openapi-v1.json:22) 都声明该操作接受 FILE multipart；现实现会让契约客户端稳定失败。最小修正：要么在本任务内补齐已批准的 FILE 分支，要么先经授权单独冻结并收窄契约/OpenAPI，再审新候选。

覆盖：已完成首次完整审查 16 文件 `base..candidate` diff，核对了根/`backend`/`frontend` AGENTS、TASK-009、风险规则、三项 operation schema、`resources` API/应用层/store/安全接线，以及后端 `test_resources.py` 与前端 8 项 Chromium 用例。测试执行未默认重跑，复用已绑定证据：backend 187、frontend 46、governance 23、Chromium 8，静态指纹 `78025e1025ce2c353b04078751e0b9ccc88187ed6e3245bbd3c67805e45dc9ee`；其余未见新的阻断点。剩余风险：除上述契约偏差外，Unicode 内存搜索的规模边界已被任务明确披露，按当前个人/低流量场景可接受。

### 同一 Reviewer 定向复核原文

没有任何代码/任务授权修订，候选仍为 `e33f989c4bb7c376cae9cb199e3165fff74e00ab`。主 Agent提供阶段 B 架构 614～627 行、TASK-008 下一步和当前任务非目标作为范围证据，请同一身份定向判断，不单方面覆盖阻断；续接运行器仍为 read-only/approval never，未重新进行完整 Review 或测试。输出 /private/tmp/studypilot-task009-review.32wcsz/reconsideration.md。

**CHANGES_REQUIRED**

候选未变：`e33f989c4bb7c376cae9cb199e3165fff74e00ab`。只读证明继承首轮：`test -w .` 为 `exit=1`；本次未重读全量源码/治理/契约，未重跑测试，完整继承我首轮对 16 文件 `base..candidate` 的覆盖结论。

重新评估后，唯一 finding 仍为阻断。依据不是“必须一次做完整资料管理”，也不是要求扩大到文件实现；而是当前候选已经在公开已冻结的同一操作 `POST /api/v1/resources` 上提供了与已批准契约相冲突的现网行为。[docs/contracts/API与数据契约基线.md](/Users/yuklimching/Desktop/StudyPilot/docs/contracts/API与数据契约基线.md:321) 第 5 节与 [docs/contracts/openapi-v1.json](/Users/yuklimching/Desktop/StudyPilot/docs/contracts/openapi-v1.json:22) 都把 `createResource` 定义为同一路径同一操作，接受 `application/json` 的 WEB/PASTE 和 `multipart/form-data` 的 FILE；而 [backend/src/studypilot/api/resources.py](/Users/yuklimching/Desktop/StudyPilot/backend/src/studypilot/api/resources.py:61) 对所有 multipart 固定返回 `415 CONTENT_TYPE_UNSUPPORTED`。这不是单纯“后续阶段未做”，而是已暴露操作对一类已批准输入给出相反结果。当前可达损害是：任何按已冻结 schema/OpenAPI 生成或手写的 FILE 客户端请求都会稳定失败，且失败语义与契约不一致。

因此我不能把它降为非阻断未完成范围。若要放行，需要新的授权路径消解这处冲突：要么补齐 FILE 分支，要么先冻结一个明确允许该操作分阶段未实现的新契约/兼容方案，再基于新候选复核。其余首轮结论不变，未新增 findings。

### 协调结论与下一步

- 候选 `e33f989c4bb7c376cae9cb199e3165fff74e00ab` 静态检查 exit=0，指纹仍为 `78025e1025ce2c353b04078751e0b9ccc88187ed6e3245bbd3c67805e45dc9ee`，与真实完整测试一致；后续仅证据写回。
- 2026-09-03：BLOCKED。首轮及同一 Reviewer 定向复核均 CHANGES_REQUIRED，唯一阻断是 FILE multipart 未实现与最终 createResource 契约的阶段解释分歧；不是自动测试失败。其余首轮审查结论未报告阻断。
- 主 Agent判断：批准架构阶段 B 已区分资料/原始文件后端，当前无 FILE 客户端和可用功能回归；直接加入文件处理会扩大已登记范围。仍遵守不可覆盖独立阻断及两轮不收敛停止规则，不改最终产品需求/契约、不找第二位 Reviewer 寻求不同结论、不启动尚无前置条件的 Acceptance。
- Acceptance：NOT_RUN，原因是独立 Review 未通过；不冒称 ACCEPTED。代码和测试全部保留在本分支，不丢弃、不重做，不推送/合并 main。
- 请求用户授权的最小下一步：在保持最终 MVP 功能契约不变的前提下，补充明确的阶段性接口可用范围/兼容说明（本阶段 WEB/PASTE，可见且暂不支持 FILE，后续单独文件任务完成），登记新增契约文档允许路径后再按实际改动复核。若用户选择本阶段完成 FILE，需另行明确扩大范围和完成条件，不能由 Worker自行加入。
- 本次后端已可工作、界面尚未接入；目前未创建合并请求，不请求用户在阻断状态下合并。

- 2026-09-03：用户答复“可以”，明确授权上述最小阶段契约说明并继续复审验收。已完成授权路径/角色登记和契约增量检查，状态 IN_REVIEW。保留之前暂停记录；新的候选待同一独立只读 Reviewer 判断，不能由主 Agent覆盖原阻断。
<!-- EVIDENCE:END -->
