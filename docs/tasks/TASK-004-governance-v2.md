# TASK-004：多 Agent 开发制度 V2 优化

```toml
schema_version = 2
id = "TASK-004"
status = "IN_REVIEW"
risk = "L3"
risk_reason = "治理权限、风险门禁与自动检查变化，不能因为文件是文档就判为 L1。"
risk_flags = ["governance"]
owner = "coordinator"
base = "3b911834f2e44edd5bd25500b60275640e34a676"
allowed_paths = ["AGENTS.md", ".codex/config.toml", ".codex/agents/**", ".agents/skills/**", "docs/governance/**", "scripts/governance/**", "docs/tasks/TASK-004-governance-v2.md", "docs/tasks/任务索引.md", "docs/architecture/MVP架构与技术选型提案.md", "README.md"]
checks = ["governance"]
acceptance_exception = "V2_USER_REQUEST_2026-09-03"
```

## 需求与范围

- 授权：用户 2026-09-03 的 V2 请求；明确要求主 Agent 修改制度，最后只用 1 个独立 Reviewer。
- 目标：风险分级、按需派发、单任务记录、复用上下文/测试证据、机械检查自动化、简短报告。
- 非目标：不改产品需求、技术选择、业务代码、公共 API、数据契约或 TASK-003 成果。不安装新依赖，不调整远程保护规则。
- 唯一写入者：主 Agent 同时承担 repo_maintainer 工作；不另派 Worker。
- 禁止路径：除 allowlist 外全部禁止；架构文档只允许修改第 12 节开头的普遍审查流程句子，不得改技术决定。
- 依赖：稳定 main 已存在；本次用户指令取代 V1 的“必须先合并 intake 才能写入”流程门槛，任务与实现同分支。
- 本次一次性例外：L3 独立 Reviewer 保留；不另启 Integration Agent，由主 Agent核对最终证据。该例外不自动适用于其他任务。

## 完成条件

1. 根规则、四个 Skills、Agent 配置、指南和模板采用一致的 L1/L2/L3 路由。
2. L1/L2 默认一份 TASK 文档；无需独立登记/收尾 PR，用户仍最终合并。
3. 自动检查覆盖范围、Git diff、敏感信息、JSON/OpenAPI 结构与按需 lint/format/测试；失败、缺失工具或未执行不能记为 PASS。
4. 治理检查及负向回归测试通过；独立 Reviewer 无未解决阻断问题。
5. TASK-003 分支和候选不变；明确续接策略，不重新实现或删改历史证据。

## 上下文包

根 AGENTS.md；本任务；docs/governance 的规则与模板；四个仓库 Skills；.codex/agents。
产品需求/契约不受本任务修改，只按需核对边界；无需重读产品历史。
检查入口：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-004-governance-v2.md --worktree`。
审查重点：分类降级漏洞、证据失效处理、角色权限、自动检查误报 PASS、TASK-003 保全。

## 实现与测试

- 首轮实现提交：`964e844a6a5bdabb77a2a45a7c26942076f616c5`。36 个文件，仅本任务 allowlist；业务源码、产品需求及 TASK-003 契约没有改动。后续修订由下述指纹与最终 Review 候选绑定。
- 主要变化：风险路由、单任务记录/分支、短上下文/短报告、同 Reviewer 增量复核、证据复用、只读权限保持；现有 13 角色/4 Skills 保留而非重建。
- 机械检查：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-004-governance-v2.md --worktree`，退出 0，STATIC/CHECKS PASS；自动选择 governance。
- 被测实现指纹：`672e4c5f89ce9be757764f153a13b1cbbf295eb65a028bba9720b3582f99818b`。任务及索引后续证据变化不改变此指纹，但仍受冻结授权检查。
- 结果：范围、diff、敏感模式、JSON、治理结构、Ruff lint、格式检查均通过；22 个单元测试通过（包括故意模拟失败/缺工具/超时的负向测试）。环境：项目 Python 3.13.9，Ruff 0.16.5。
- Skill Creator 的 `quick_validate.py` 对四个 Skills 均通过，使用现有 `/opt/anaconda3/bin/python3.13`，未新增依赖。
- 未运行：backend/frontend 业务套件与实际 OpenAPI 快照校验，因为本分支不改业务源码/契约；脚本的选择与 OpenAPI 结构负例有单元测试，不宣称结构校验等于业务语义验证。
- 系统 `python3` 为 3.9.6；新说明统一指向项目 3.13 环境，避免静默降级为不完整 TOML 正则解析。
- 静态文本统计：根规则 + 四个 Skills + 使用指南从 22130 字符降至 12212 字符，约减少 45%；不是实测 Token 或工时收益承诺。
- TASK-003 分支指针仍为 `fe6196f724cafbb67a30f1479769a57b5affc8d4`；该候选及实现提交均保留。
- 首轮 Review 后定点修订：分支角色段同时接受中横线和下划线，新增合法角色与 main/非任务分支反例测试。相同治理检查入口再次退出 0，23 个测试及 lint/format/静态检查全部通过；最新指纹 `9dda08ff7965f0a43407c78dbd8c0348d6eeed688dbe2afd6be447854c0196f0`。未改变其他治理行为。

## TASK-003 保全与迁移决定

- V1 基线：`3b911834f2e44edd5bd25500b60275640e34a676`。
- 原分支：`agent/coordinator/TASK-003-evidence-r4`。
- 冻结候选：`fe6196f724cafbb67a30f1479769a57b5affc8d4`。
- 实现提交：`2f41182aadba77bc341687cc2f3f519a05ea82e5`。
- 已有自检通过，但第四轮正式复审启动被中止；不能当作 Review 已通过。
- 暂停 TASK-003 的运行，不改变其文档、契约或状态证据。V2 不混入该候选。
- 恢复时读取候选中的 V1 规则，完成既定独立只读 Review + 独立只读 Acceptance，不重做已通过自检。
- 若 V2 先合并：合并前核对最新 main；仅任务索引冲突由协调者按已有事实处理。任何契约/实现冲突不得自动选择一边；退回原负责人形成新候选并复核受影响部分。原证据保留，未变部分可按 V2 证据续接规则复用，不伪称原 SHA 覆盖新内容。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03：IN_PROGRESS；用户授权本次主 Agent 实施 + 1 个独立 Reviewer，余下验收为主 Agent 证据核对。
- 2026-09-03：IN_REVIEW；实现与机械检查完成，准备冻结候选并派发唯一独立只读 Reviewer。
- 首轮 Reviewer：独立会话 `01a062f8-bb34-7032-80f8-ec811697bc71`，候选 `7a64aa8bb49aadec87bbe41749a1b2076eb4b3c0`，CHANGES_REQUIRED；1 个 P2（分支角色名下划线误拒绝），已定点修正，待同一 Reviewer 更新结论。
- 权限说明校正：运行器启动记录明确 `sandbox: read-only`、`approval: never`；Git 临时缓存写入被系统拒绝。首轮报告称“已执行临时文件试写”，但显式探测命令被拦截或语法失败，不能作成功执行的检测证据；要求 Reviewer 在最终报告更正，不沿用不准确表述。
- 验收：待执行。
- 用户合并：未发生。
<!-- EVIDENCE:END -->
