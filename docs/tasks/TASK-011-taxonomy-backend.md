# TASK-011：主题/标签后端与资料标签关联

```toml
schema_version = 2
id = "TASK-011"
status = "IN_REVIEW"
risk = "L3"
risk_reason = "实现既定分类修改、版本前置条件、删除未使用分类及资料标签关联，涉及删除与事务一致性；仅同步发布能力清单，不改变接口字段或已确认语义。保留独立 Review 与独立验收。"
risk_flags = ["business", "deletion", "sensitive-storage", "tests"]
owner = "resource_worker"
base = "706c32732c4b3312acf26694302b43a8800ca2ea"
allowed_paths = ["backend/src/studypilot/modules/taxonomy/**", "backend/src/studypilot/application/taxonomy.py", "backend/src/studypilot/api/taxonomy.py", "backend/src/studypilot/infrastructure/database/taxonomy_store.py", "backend/src/studypilot/main.py", "backend/tests/test_taxonomy.py", "frontend/e2e/taxonomy.spec.ts", "docs/contracts/API与数据契约基线.md", "docs/contracts/openapi-v1.json", "README.md", "docs/tasks/TASK-010-resource-pages.md", "docs/tasks/TASK-011-taxonomy-backend.md", "docs/tasks/任务索引.md"]
checks = ["backend", "frontend", "governance", "contracts"]
```

## 需求与范围

- 用户“已合并，下一步”，承接 TASK-010 明确的主题/标签分类管理。PR #15 核实 MERGED（2026-09-03T05:17:50Z），合并提交为 base。无来源不明修改。
- 依据：需求 5.1/5.2/5.4；架构第 12 节资料/分类后端与前端分工；已合并契约 2.1～2.4、4.5～4.7、9、10 及对应 OpenAPI operation/schema。本任务先完整实现分类后端，分类页面和表单选择/筛选器接入为后续前端任务，不为了降级拆分删除或版本保护。
- 主 Agent兼任 resource_worker，为唯一代码写入者；coordinator 串行维护任务/索引/已合并状态。无并行写入；L3 最终一位实际只读 Reviewer + 另一位实际只读 Integration/Acceptance，主 Agent只核对证据，不重复审代码。
- 实现 Topic/Tag 各自创建、分页/名称搜索/排序、详情、修改和删除未使用项，及资料标签 PUT/DELETE 幂等关联，共 12 个既定操作。名称去首尾空白、按已有模型 NFKC/大小写/空白规范化唯一；Topic 可选 description，Tag 不增加颜色/描述等字段。
- PATCH 必需 expected_version；省略字段不改，Topic.description 显式 null 清空，空改动/非法 null 拒绝；无实际变化不增版本。DELETE 只接受强 If-Match 版本；缺失/不可用前置条件受控拒绝，不降级为无条件删除；过期版本 409 并仅提供 current_version。
- 分类仍被资料引用则 409 TAXONOMY_IN_USE，安全计数、不连带删除资料/关联；taxonomy 只读取主题引用，不写 LearningResource.topic_id 或学习状态。标签关联验证资源/标签存在，重复 PUT 不新建、不变创建时间，重复 DELETE 无关联时仍 204；父对象缺失 404。仅变关联，资料/学习版本不变。现有资料创建可引用本任务创建的主题/标签。
- 复用已有数据库模型/迁移、统一安全门禁与连接/会话工厂；只在通过安全与输入校验后的显式操作开会话。事务提交成功才返回成功；数据库/并发错误不泄漏 SQL、路径、内容/令牌。重名、旧版本、使用中删除与不确定失败覆盖测试，不自动重放非幂等写入。
- 契约文件只同步 1.3 与 x-delivery-profile 的**实际交付状态**：在原四个可用操作上增加本次通过检查的 12 个既定操作，保留 FILE 限制及全部标准 paths/schemas/错误/版本规则，不做契约决定或改变已有语义。README 说明“分类后端可用、页面尚未接入”。
- 禁止：所有未列路径；模型/迁移/安全配置/共享客户端/依赖/治理规则/产品需求修改，资料 PATCH/删除/主题重分配、文件功能、前端功能页面、学习/笔记/复习/AI/公网部署。TASK-010 只写合并事实，不重写历史证据。

## 完成条件

1. 12 个操作按冻结字段/状态码/响应投影工作；规范化重名、长度/类型/未知字段/分页筛选错误、无效 ID、缺失与过期版本受控；错误中没有用户文本、原始异常或内部 normalized_name。
2. 真正 SQLite 临时库验证创建→读取→修改/无变化→重启持久化；重复名称并发竞争/旧版本覆盖均不能破坏数据；事务失败回滚且不能回假成功。
3. 使用中的分类不能删除；未使用分类凭匹配版本可删。被拒绝操作不改资料主题、标签关联、正文、初始进度或版本；关联重复请求的响应/时间稳定、删除后重加为新关联；缺失父对象不会伪装成功。
4. 既有安全拒绝在读正文/连接数据库前发生；未建库/数据库故障受控；现有资料接口及页面回归不破坏。所有测试临时库/合成数据，不操作正式数据库、日志或真实资料。
5. 后端/前端/治理/契约结构检查与真实 Chromium 经共享客户端完成“建分类→创建引用分类的资料→关联/解除→重启页面读取”通过；分类 DELETE 的 If-Match 在浏览器内按原协议验证，不向 Node/日志导出临时令牌。全部 trace 关闭。公开操作清单与实现对应且标准契约不变；独立 Review 与独立验收覆盖最终候选，用户保留合并权。

## 上下文包

本任务、根/后端规则、task-intake/implement/review/stage-acceptance Skills；上述需求/契约局部段落；main/resources 三层既有实现、数据库模型相关类/事件、tests/conftest/support。只读与当前任务有关内容，不重复全仓调查。

检查：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-011-taxonomy-backend.md --worktree`；`cd frontend && npm run test:e2e`（15173/18000 临时服务）。不安装新依赖、不启动正式数据服务。

## 实现与测试

- 已实现 12 个既定操作：Topic/Tag 创建、分页/名称搜索/排序、详情、带版本修改、删除未使用分类，以及 ResourceTag 幂等关联/解除。SQLAlchemy 适配器只写三类 taxonomy 对象；读取资料 ID/主题引用，不修改资料主体、主要主题或学习状态。独立会话提交后才返回成功；唯一/FK/版本冲突用新只读事务分类，不解析或泄漏数据库异常，不重放写入。
- 新增 39 项分类后端测试、1 项实际浏览器分类联通测试，保留原测试和前端页面实现。能力清单由 4 个增至 16 个既定操作；Node 深比较（去除 x-delivery-profile）证明完整标准 OpenAPI 内容与 base 一致，exit=0；中文仅 1.3 交付清单改变。README 明确“分类后端可用，页面仍待接入”；不新增模型、迁移、依赖或安全策略。
- 实现提交 `789e303ce32598fb252da19a50d08c0f951193b9`；最终输入指纹 `fa99765c2fc37ce98db7ddb6be9bef2208bd637019907a3bf4a6d1dff142b546`。主 Agent完成一次变更自检与边界核对，不冒充独立审查。
- 环境：macOS、Python 3.13.9 / pytest 8.4.2、Node 24.18.0 / npm 11.16.0；已有锁文件与依赖未改。全部测试使用既有隔离临时目录/数据库，不读取或修改正式运行资料。
- 任务检查命令 `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-011-taxonomy-backend.md --worktree`：静态/范围/敏感模式/Git diff PASS；Ruff format/lint、mypy（35 源文件）、pytest **226 PASS**、OpenAPI/FastAPI 结构、前端 format/lint/typecheck/Vitest **70 PASS**/生产构建、治理校验/Ruff/**23 PASS** 均 exit=0。脚本总 exit=1，**唯一失败是 uv build --offline 无权读既有缓存（exit=2）**；随后只对同输入在获准权限下重跑 `cd backend && uv build --offline`，exit=0，成功构建 sdist/wheel。其他已通过证据复用，不冒称第一次脚本全绿；必要检查的唯一失败已消除。
- `cd frontend && npm run test:e2e` exit=0：**12 Chromium PASS / 13.9s**、单 Worker、零重试。新增真实链路：建主题/标签→创建引用主题的资料→标签重复关联→修改主题→旧版本/使用中删除拒绝与未使用标签删除→刷新读取→实际详情显示标签→重复解除不改资料/进度。If-Match 测试仅在浏览器内使用原安全协议，不导出令牌；全套 trace 关闭，前端现有接口客户端未改。
- 删除与事务证据：各类已有/未引用生命周期、更新/删除/关联/解除在 before_commit 注入失败均保持原状态；重名约束竞争、ORM 版本竞争错误分类、真实两线程重名创建、无效请求在建库前拒绝及未授权请求在读取正文前拒绝均通过。SQLite 写锁竞争可以受控失败，不声称并发吞吐保证或静默重放成功。
- 开发期失败记录：Ruff 指出中文逗号/测试全角字母的歧义字符，文案改句号、合成字符用 Unicode 转义（不减少规范化测试）；mypy 对动态模型联合只推断 Base，补精确类型与实例收窄后通过；首次分类 pytest 为 33 PASS / 1 FAIL，原因测试遍历 OpenAPI paths 把既有 x-* 字符串扩展当路径对象，改为仅遍历对象后通过。最后新增回滚覆盖后共 39 分类测试全部 PASS。无隐藏失败或删减旧断言。
- 已知限制：本机个人/少量写入；分类页面尚未接入；资料主题修改/重分配、资料删除/文件、学习/AI 均未开放。支持 SQLite，不新增 PostgreSQL 或跨浏览器承诺。版本删除需要后续前端任务在受控客户端中接入，不通过任意头逃生口提前开放。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03：IN_PROGRESS，依赖已合并，按 L3 登记。Review / Acceptance 待完成；最终合并由用户执行。
- 2026-09-03：IN_REVIEW，实现与测试证据冻结；226 后端、70 前端、23 治理、12 Chromium 测试通过，唯一缓存权限构建失败已针对性重跑通过。等待实际只读独立审查与验收。
<!-- EVIDENCE:END -->
