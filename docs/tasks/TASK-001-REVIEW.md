# TASK-001 第二次独立复审报告

## 1. 审查信息

- Reviewer：第二个全新独立 `qa_reviewer`
- 审查目标：TASK-001 相对稳定基线的完整实际合并差异
- 比较基线：`e1a77bf96a0223603df390441df782461d2f3e70`
- 冻结候选提交 SHA：`ea64bf25947a2bcb98fc8b7f7303e98291d8c309`
- 审查日期：2026-09-01
- 实际运行权限：`read-only`
- 权限证据：执行 `touch .codex-readonly-probe-task-001` 被系统以 `Operation not permitted` 拒绝；探针未创建，最终 Git 工作区和暂存区均保持干净。
- 合并差异确认：两端提交均可解析；`git merge-base` 精确返回指定基线 `e1a77bf96a0223603df390441df782461d2f3e70`。完整差异为 5 个文件、952 行新增、4 行删除。
- 候选完整性：候选包含修订 HANDOFF、历史 REVIEW、任务状态记录及完整架构提案。

## 2. Findings

No findings.

## 3. 审查覆盖

- [x] 完整 diff
- [x] 相关调用路径和文档数据流
- [x] 需求与任务全部验收条件
- [x] 测试和检查证据
- [x] 公共契约
- [x] 安全与隐私边界
- [x] 修改范围

### 历史四项 finding 闭环

1. **服务端本地 API 跨站写入防护：已闭环**
   - 第 5.4、9.2、10.2、13、16 节一致要求在读取请求体、创建临时文件和数据库查询前校验 `Host`、`Origin`、Fetch Metadata、本地访问令牌及自定义头。
   - 明确覆盖 `application/x-www-form-urlencoded`、`text/plain`、`multipart/form-data` simple POST 和跨站 fetch，失败时数据库及磁盘不得变化。
   - CORS 被正确限定为附加防线。FastAPI 官方文档确认简单请求会正常进入应用；OWASP 也明确列出上述三种 simple content type 的 CSRF 风险。[FastAPI CORS](https://fastapi.tiangolo.com/tutorial/cors/)、[OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

2. **上传状态机、成功门槛和崩溃对账：已闭环**
   - 第 5.4、7.2、8.1、10.2、11.1、13、16 节统一采用同卷暂存、`PENDING → READY/FAILED`、原子提升、启动及定时对账。
   - 只有最终文件重新核验且 `READY` 事务提交后才能返回成功并允许下载。
   - `PENDING` 提交前、提交后提升前、提升后 `READY` 前及 `READY` 后损坏均有确定恢复结果；提升、补记和孤儿回收均明确要求幂等。
   - `os.replace` 的原子性描述附带 POSIX 和目标平台验证边界，与 Python 官方说明一致。[Python `os.replace`](https://docs.python.org/3/library/os.html#os.replace)

3. **删除一次性令牌绑定完整影响版本：已闭环**
   - 第 7.1、7.4、8.1、10.2、11、13、16 节一致规定短时一次性令牌绑定资料 ID、资料版本、关联对象稳定 ID 及版本或等价变更序号。
   - 执行删除时在事务内重算；任何影响变化立即作废旧令牌、返回 409 和新摘要，强制用户重新确认。
   - 令牌过期、重放、绑定错误资料、关联对象变化及文件移动期间崩溃均进入必测范围。

4. **`resources/taxonomy` 的 `topic_id` 所有权：已闭环**
   - 模块职责表、所有权原则、添加流程、概念模型、需求追踪、迁移顺序、测试策略、风险表和决策摘要均统一规定：
     - `resources` 是 `LearningResource.topic_id` 的唯一写入所有者；
     - `taxonomy` 拥有 `Topic`、`Tag`、`ResourceTag`，只负责主题存在性验证和删除/转移规则；
     - `taxonomy` 不得直接修改 `topic_id`。
   - 未发现章节间的第二套所有权解释。

### TASK-001 验收条件

- [x] 第一阶段需求 5.1–5.10 和七项项目原则均有逐项映射，未增加多用户、商业化、云部署、AI/RAG 实现等产品范围。
- [x] FastAPI + React 与 Django 模板两套方案使用相同维度和预先声明的权重比较；加权分数 `4.20` 与 `4.10` 计算正确。
- [x] 最终推荐单一、组成完整、理由与重新评估条件明确。
- [x] 资料、分类、学习、笔记、复习、统计、API、前端和基础设施职责、依赖方向及所有权清晰。
- [x] 概念模型覆盖第一阶段全部核心对象，并明确后续待细化字段。
- [x] 原始文件、删除确认、笔记和未来 API Key 隐私边界，以及未来 AI/RAG/Agent 端口均有说明。
- [x] 后续任务顺序、共享契约前置条件、迁移串行要求和有限并行组明确。
- [x] 重大选择均解释实际问题；关键术语提供初学者说明。
- [x] 实现修订 `038c0a9..4dfe18d` 只修改架构文档；候选冻结提交只修改 coordinator 控制面文件。
- [x] 文档明确标记为提案，未冒充已生效决定。
- [x] 修订 HANDOFF 完整记录基线、实现 SHA、检查、限制和风险。

### 实际运行检查

- `git diff --check e1a77bf... ea64bf2...`：PASS
- `PYTHONDONTWRITEBYTECODE=1 python3 scripts/governance/validate_governance.py`：PASS
  - 13 个 Agent
  - 4 个仓库 Skill
  - 30 项治理不变量
- Markdown 行尾空白检查：PASS
- 高可信私钥、云凭据和访问令牌模式扫描：PASS
- 本地文档引用检查：PASS
- 16 个主章节结构检查：PASS
- 需求 5.1–5.10 十项追踪检查：PASS
- 最终 `git status --short --branch`：工作区干净
- 最终工作区及暂存区 `git diff --exit-code`：PASS

只读 sandbox 阻止 Git/Xcode 在 `/tmp` 创建缓存，产生警告，但上述命令均以退出码 0 完成，未改变仓库状态。

核心技术事实也与当前官方资料一致，包括 Fetch Metadata 的服务端预判用途、SQLite 事务可靠性以及 SQLAlchemy Session 的非并发单事务边界。[W3C Fetch Metadata](https://www.w3.org/TR/fetch-metadata/)、[SQLite](https://www.sqlite.org/about.html)、[SQLAlchemy Session](https://docs.sqlalchemy.org/en/20/orm/session_basics.html)

## 4. 测试缺口与剩余风险

- 本任务只有架构文档，没有可运行应用，因此未运行应用构建、lint、类型检查或运行时测试；与任务单和 HANDOFF 一致。
- 上传、删除、跨站防护和对账仍必须由后续实现任务通过故障注入及浏览器测试证明。
- Python/Node 及依赖精确兼容版本、SQLite 外键启用、本地启动体验、上传限制、对账周期和宽限期仍待后续脚手架及契约任务确定。
- 文件系统与 SQLite 不共享原子事务；提案已给出恢复协议，但最终可靠性依赖实现质量和目标平台验证。
- React/TypeScript 的额外学习成本仍是用户合并架构提案前需要确认的产品取舍。
- 本报告尚未写入仓库；`coordinator` 必须在 `agent/coordinator/<task-id>-evidence` 分支原样保存本报告后，才能推进阶段验收。

## 5. 总体结论

- `READY_FOR_ACCEPTANCE`

任何后续非证据变更都会生成新的候选 SHA，使本报告失效，并要求再次审查相对稳定基线的完整合并差异。
