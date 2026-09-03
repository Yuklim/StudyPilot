# TASK-013：原始文件上传、保存、下载与中断恢复

```toml
schema_version = 2
id = "TASK-013"
status = "IN_ACCEPTANCE"
risk = "L3"
risk_reason = "实现既定原始文件敏感存储、两阶段事务、中断恢复和孤儿回收；下载缓存头适配安全中间件。保留独立只读 Review 与独立 Acceptance。"
risk_flags = ["business", "sensitive-storage", "security", "deletion", "tests"]
owner = "resource_worker"
base = "ff03d8bb7660fd327e55be8ffbd122f5da491517"
allowed_paths = ["backend/src/studypilot/modules/resources/contracts.py", "backend/src/studypilot/modules/resources/files.py", "backend/src/studypilot/api/resources.py", "backend/src/studypilot/api/files.py", "backend/src/studypilot/api/file_upload.py", "backend/src/studypilot/application/files.py", "backend/src/studypilot/infrastructure/files/**", "backend/src/studypilot/infrastructure/database/file_store.py", "backend/src/studypilot/infrastructure/database/resource_store.py", "backend/src/studypilot/infrastructure/config.py", "backend/src/studypilot/infrastructure/security/local_access.py", "backend/src/studypilot/main.py", "backend/pyproject.toml", "backend/uv.lock", "backend/tests/test_files.py", "backend/tests/file_fixtures.py", "backend/tests/test_resources.py", "backend/tests/test_taxonomy.py", "backend/tests/conftest.py", "backend/tests/run_browser_server.py", "frontend/e2e/original-files.spec.ts", ".env.example", "README.md", "docs/contracts/API与数据契约基线.md", "docs/contracts/openapi-v1.json", "docs/tasks/TASK-012-taxonomy-pages.md", "docs/tasks/TASK-013-original-files.md", "docs/tasks/任务索引.md"]
checks = ["backend", "frontend", "contracts", "governance"]
```

## 需求与范围

- 用户在上一项明确说明下一步为文件后端后确认“已合并”。PR #17 已核实 MERGED，时间 2026-09-03T06:19:16Z，合并提交为 base；起始工作区干净。只给 TASK-012 追加真实合并记录，不改其历史证据。
- 依据：需求 5.1，架构 5.4、7.5、12；已批准契约 2、4.2、5、7、8 和 9 的文件恢复要求。根/后端规则中早期脚手架限制是历史阶段；本任务明确授权文件启动维护，但不自动建表/迁移，不改变本机单用户边界。
- 主 Agent 兼任 resource_worker，唯一实现写入者；coordinator 串行维护任务/索引及契约的交付元数据。按 intake / implement / review / stage-acceptance Skills 执行；不另派实现 Worker，不重复全文审查或全套测试。
- multipart 创建 FILE：单文件 1～26,214,400 字节，PDF/DOC/DOCX/MD/TXT；扩展名、声明媒体类型、真实内容联合校验，受控随机同卷暂存、哈希和落盘。原始名称仅作安全显示/下载。
- 原件和资料/初始进度/分类在既定两阶段事务中登记；只有最终原件验证且 READY 提交成功才返回 201。PENDING/FAILED 不在普通资料投影暴露。只初始化已有进度默认值，不实现学习规则。
- 按文件 UUID 下载，只允许 READY，先校验完整大小与 SHA-256，附件方式、无嗅探、private/no-store，不暴露真实路径。中间件只兼容受控附件的更严格缓存头，不放松权限或持久化令牌。
- 启动及每 60 秒对账；恢复两阶段中断和仍有记录的 trash，PENDING 超过 10 分钟失败；缺失/损坏 READY 失败并禁止下载。孤儿仅随机受控键、无数据库引用、无活跃上传且满 24 小时后清理；重复执行安全。未初始化数据库时不创建库或迁移；不自动删除资料记录。
- 允许新增必要格式/流式 multipart 依赖及锁文件，配置受控原件目录、合成测试隔离路径。当前本机单进程模式；不支持公网/多 Worker，不扫描病毒/提取正文，不执行文档内容。
- 完成实现、测试、Review 和验收后交付说明同步为 FILE 后端可用（等待用户合并）；仅契约 1.3、OpenAPI x-delivery-profile，以及 createResource.description 中已过期的 TASK-009 阶段限制说明可改。后者在首次 Review 发现后由 coordinator 明确为同一交付元数据修正：只删过期阶段一句，保留目标要求和指向当前清单的引用；不改字段、schema、标准操作规则/行为或已确认需求。文件页面随后另任务接入；不开放资料删除 API、修改、AI 或云存储。
- 所有未列路径禁止，尤其模型/迁移、前端生产代码、治理规则、用户运行数据与密钥。

## 完成条件

1. 合法五类文件可上传、创建资料/分类关联、列表/详情读取、下载同字节原件；普通 JSON 行为保持。文件上限、空文件、伪装/错误格式、重复/未知字段、错误分类受控拒绝，不产生假成功或部分可见资料。
2. 安全中间件先于正文/数据库/文件副作用；文件名/存储键穿越、符号链接、损坏、非 READY 下载受保护。错误不泄露输入、磁盘路径或堆栈，响应附件头符合契约。
3. 对两次事务、落盘/提升/响应前失败有故障测试；启动和周期对账、PENDING 超时、READY 损坏、trash 恢复、24 小时孤儿回收/活跃上传排除与幂等有合成临时目录测试；数据库不可用时不回收文件。
4. 新增真实 Chromium 同源 FormData 上传→读取→下载比对场景，无凭据持久化/trace/真实资料；现有回归与自动 backend/frontend/contracts/governance 检查通过；OpenAPI 与 base 排除交付元数据及上述单句历史阶段描述后完全一致（该 description 其余文字也保持），schemas/参数/响应/安全声明无变化。
5. README/配置/交付说明与实际能力一致，独立实际只读 Review 与另一独立 Acceptance 对最终候选 PASS，最终合并由用户执行。

## 上下文包

当前任务、根/后端规则（浏览器测试另读前端规则）、上述局部契约/架构、已有 resources/config/security/database 与测试。检查：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-013-original-files.md --worktree`；另 `cd frontend && npm run test:e2e`。依赖改变后后端全检。测试只使用临时库/目录。

## 实现与测试

- 实现 SHA `7836dbebb79e3fe812057ae8633a3b025682b952`；唯一写入者为主 Agent 兼任 resource_worker。下述最终输入指纹绑定此实现；冻结提交只补证据与状态。
- 实现流式有界 multipart、单文件大小/UTF-8/容器识别、随机受控键、流式 SHA-256 与落盘复核、两次数据库事务、仅 READY 成功、已校验字节快照附件下载。复用既有分类验证、初始进度和 READY 投影；模型/迁移和前端生产代码不变。
- 同卷 staging/objects/trash，按配置规范化祖先路径、拒绝受控根/内部符号链接、独占创建及目录刷新。启动与每 60 秒对账；PENDING 10 分钟超时，READY 损坏拒绝，trash 回滚恢复；随机无引用孤儿 24 小时及活动上传排除，失败不删除资料记录。数据库缺失不创建/迁移，异常仅固定代码日志。
- 依赖新增 python-multipart 0.0.32、pypdf 6.16.2、olefile 0.47、defusedxml 0.7.1；uv lock / uv sync --locked exit=0。格式校验只认结构不抽正文，容器子进程限 6 秒墙钟/4 秒 CPU，Linux 另设 768 MiB 地址空间；macOS 不声称有系统内存硬限。DOCX 解压校验预算 128 MiB。默认/未知 MIME 由内容识别，明确类型冲突拒绝。
- 最终自动检查：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-013-original-files.md --worktree` exit=0 / CHECKS PASS；base 同上，30 文件，product_fingerprint=`29da9625aa593bef2a5407544c0840ef92f31b41cf0cdef4baacbef0800214ed`。后端 format/lint/mypy、pytest **273 PASS**（含新文件 47 项，3.62 秒）、离线源码包/轮子构建；OpenAPI/FastAPI 校验；前端 format/lint/typecheck、**114 PASS**、生产构建；治理校验/Ruff/**23 PASS**，范围/敏感模式/Git diff 均通过。治理单测 fake-test/missing-tool 为故意验证失败检测的测试，不是本任务未通过。
- 新测试涵盖六个有效扩展分支/五种格式、确切上限和超限、空/损坏/格式伪装/UTF-8/ZIP 穿越、分类事务、重复/未知/中断表单、未授权先拒绝、两次提交失败/提交后响应失败、提升前后中断与幂等恢复、PENDING/READY 不一致、trash 恢复、各目录 24 小时宽限/活动上传/数据库错误不回收、符号链接/路径和下载安全头。仅合成内容及隔离临时数据。
- `cd frontend && npm run test:e2e` 最终 exit=0，**16 PASS / 17.1 秒**。新增真实 Chromium 同源 FormData 上传→201 READY→详情读取→下载逐字相等与附件/no-store、无持久化验证；原 15 场景均通过。单 Worker/零重试/trace off，临时后端 18000、前端 15173；服务均正常退出，无真实资料或令牌输出。前端产品脚本保持 index-B16M3D_k.js。
- 契约一致性：Python JSON 深比较 base 与工作区，排除顶层 x-delivery-profile 后完全相等；中文第 1.3 节以外逐字相等，exit=0。仅交付元数据随实现更新，不修改标准 API、schema、需求或模型。README/.env.example 说明准确边界与停服整组备份。
- 开发期失败如实记录：第一次新测试 36 PASS/3 FAIL，macOS 拒绝 RLIMIT_AS 设置导致有效 PDF/DOCX/DOC 被误拒；只对 Linux 设置该硬限并区分校验器初始化失败，随后 39 项及最终 47 项通过。首套浏览器 15 PASS/1 FAIL，新上传 503，根因为 macOS /var 临时目录祖先别名；启动时规范化配置祖先、仍拒绝受控根符号链接，补回归后最终全套 16 PASS。初始 Ruff 行宽/中文逗号与测试类型标注错误已修正，未删断言或隐藏失败。
- 环境：macOS / Python 3.13.9 / Node 24.18.0 / npm 11.16.0；本机单进程，未验证 Linux 运行、未适配 Windows/多 Worker/公网。复杂极端文件可能保守拒绝；自动恢复不是备份。文件页面、资料删除与正文解析尚未交付。主 Agent完成一次范围/实现自检，独立 Review/Acceptance 另行记录，不用自检替代。
- 首次 Review 后修订仅清除 createResource.description 的过期阶段一句，并明确上述元数据范围；源代码/依赖/测试/配置未改，复用实现 7836dbe 的 273/114/23/16 通过证据。原“排除 x-delivery-profile 全等”是首轮候选的真实检查，不冒用为修订后全等：修订后另对该 description 精确删句比较，再排除此受控描述与交付清单深比较其他全部字段；中文仍只改 1.3。定向 OpenAPI 模型校验与候选静态门禁另记录于最终证据。
- 修订验证：Python 精确删句断言、其他完整 JSON 深比较和 FastAPI OpenAPI 模型校验 exit=0；check_task.py --worktree --static-only exit=0 / STATIC PASS，30 文件，product_fingerprint=`579982ac23f0f40112424c674bfa87a93e485ccdf34ba9b15e4542ebc29e1b06`。静态门禁不是另一次全套测试；代码/环境未变的全套结果继承首轮候选。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03：IN_PROGRESS；L3，稳定依赖已合并。Review / Acceptance 尚未执行。
- 2026-09-03：IN_REVIEW；实现与全部自动/浏览器证据冻结，等待独立实际只读 Review 与 Acceptance。

### 独立 Review 首轮原文

- 会话 `01a06603-fb61-7371-89b8-d2bc913b01d6`；gpt-5.4 medium，CLI 实际 read-only / approval never，仓库 test -w 返回 1，exit=0。未试写；Git 的自身缓存尝试由沙箱拦截。

base `ff03d8bb7660fd327e55be8ffbd122f5da491517`，candidate `6e52d7d42d610e02d12e10c7eb79b93f321291a4`。运行时为实际只读：会话配置 `approval never` / read-only；仓库根执行 `test -w .` 返回非可写，且 `git` 连 `/tmp` 缓存试写都被系统拒绝。

审查范围：首次完整检查 `base..candidate` 最终 diff，覆盖文件上传/下载链路、两阶段事务与恢复、格式识别、24h 回收、安全中间件缓存头、README/契约 2/4.2/5/7/8/9 与交付元数据 diff；复用指纹 `29da...14ed` 绑定的已通过自动/Chromium 证据，未机械重跑。

阻断：
- `docs/contracts/openapi-v1.json:52`：`x-delivery-profile` 已声明 TASK-013 开放 FILE 上传/下载，但 `createResource` 的标准 operation description 仍写“当前 TASK-009 仅交付 JSON WEB/PASTE，multipart 返回 415，FILE 后续完成”。触发：任何按 operation description 阅读/生成客户端/做验收的人。影响：交付元数据自相矛盾，和 README 及契约 1.3 不一致，违反“交付说明与实际能力一致”。最小修正：把该描述改为与 TASK-013 当前可用性一致，或删除过时的阶段性 415 表述。

其余未见新的可达阻断；单进程/macOS/无病毒扫描/页面未接入均已在契约与证据内披露。结论：`CHANGES_REQUIRED`。

- 2026-09-03：RETURNED → IN_REVIEW。采纳唯一文档阻断，最小删除过期阶段一句，不改变产品契约含义；同步候选范围说明后请同一 Reviewer 增量确认。未重跑代码审查或未变更的测试。


### 独立 Review 增量原文

- 同一会话 `01a06603-fb61-7371-89b8-d2bc913b01d6`，再次实际 read-only / approval never，test -w 返回 1，exit=0；仅检查两个文件增量。

权限：实际只读成立，`test -w .` 返回 `1`。增量复审仅查看 `previous_candidate 6e52d7d42d610e02d12e10c7eb79b93f321291a4..new_candidate 8e09b7ca857ee874e39eebda956bc424887ded67`，变更仅 `docs/contracts/openapi-v1.json` 与 `docs/tasks/TASK-013-original-files.md`。

我继承首轮对 `base ff03d8bb7660fd327e55be8ffbd122f5da491517..previous_candidate` 未变范围的完整覆盖；本轮唯一阻断已解决：OpenAPI `createResource.description` 中过期的 TASK-009/415 阶段说明已删除，现与 `x-delivery-profile`、README 和任务证据一致。TASK 同步了该元数据范围、首轮原文报告和静态验证证据；无代码/依赖/配置/测试新增风险。剩余风险不变，仍限已披露的本机单进程/macOS/页面未接入边界。结论覆盖 `new_candidate`：`PASS`。

- 2026-09-03：IN_ACCEPTANCE；最终审查候选 `8e09b7ca857ee874e39eebda956bc424887ded67`。主 Agent只核对范围、测试绑定、唯一阻断闭环和 Review 结论，不重复代码审查。此后仅同任务状态/EVIDENCE 与索引行写回，交另一实际只读会话验收。

<!-- EVIDENCE:END -->
