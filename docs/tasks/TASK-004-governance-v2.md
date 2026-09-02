# TASK-004：多 Agent 开发制度 V2 优化

```toml
schema_version = 2
id = "TASK-004"
status = "IN_PROGRESS"
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

待填真实结果。比较基线固定见元数据；测试证据必须包含命令、结果、输入指纹和未执行项。

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
- Reviewer：待执行。
- 验收：待执行。
- 用户合并：未发生。
<!-- EVIDENCE:END -->
