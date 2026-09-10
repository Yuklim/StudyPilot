# TASK-004：多 Agent 开发制度 V2 优化

```toml
schema_version = 2
id = "TASK-004"
status = "MERGED"
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
- 追加授权：用户要求驳回前评估实际使用中的风险、发生概率与修复/维护成本，不追求理论完备；补充有边界的非阻断问题处理，不降低安全与真实证据底线。
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
- 用户追加实际风险/成本原则：新增阻断/非阻断/建议的处置标准，同步根规则、风险指南、两份 Skills 与模板；未改代码、机器风险路由、必要检查或 TASK-003。相同治理检查入口退出 0，23 测试及 lint/format/范围检查通过；本次最新指纹 `163a287d4bb3ce182ef0087115b4453066c5b6d90aa0607d9e9293e2b6e028a1`。两份改动 Skills 的 quick_validate 均通过；纯决策指引由同一独立 Reviewer 定向复核，不新增匹配措辞的形式化测试。

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

- 2026-09-03：用户已合并 PR #8，合并提交 `9b6b21d73752e86a2c89e871222d3705d4dea6c7`；当前状态 MERGED。以下原验收记录保留为历史证据。

- 2026-09-03 追加修订完成：ACCEPTED；最新最终候选为 `0021895a96d0e725b08dd2ea60f9edd66538bac7`。同一 Reviewer `01a062f8-bb34-7032-80f8-ec811697bc71` 增量复核 PASS，无新增阻断/非阻断问题；以下旧候选记录保留为历史证据，最新报告见末尾。
- 本次主 Agent证据验收 PASS（仍仅用户已授权的一次性例外）：新增规则与当前需求相符，23 项测试通过且候选静态指纹与本次被测指纹一致；实际只读 Review 覆盖新增 10 文件、继承旧覆盖；TASK-003 指针仍为 `fe6196f724cafbb67a30f1479769a57b5affc8d4`。没有放宽必要检查、改变已确认契约或遗留阻断问题。
- 用户操作仍为合并同一 PR #8；不创建额外任务/PR，不自动合并。下面 Reviewer 末句所说的候选已经提交冻结，无需再提交实现。
- 2026-09-03：IN_PROGRESS；用户授权本次主 Agent 实施 + 1 个独立 Reviewer，余下验收为主 Agent 证据核对。
- 2026-09-03：IN_REVIEW；实现与机械检查完成，准备冻结候选并派发唯一独立只读 Reviewer。
- 首轮 Reviewer：独立会话 `01a062f8-bb34-7032-80f8-ec811697bc71`，候选 `7a64aa8bb49aadec87bbe41749a1b2076eb4b3c0`，CHANGES_REQUIRED；1 个 P2（分支角色名下划线误拒绝），已定点修正，待同一 Reviewer 更新结论。
- 权限说明校正：运行器启动记录明确 `sandbox: read-only`、`approval: never`；Git 临时缓存写入被系统拒绝。首轮报告称“已执行临时文件试写”，但显式探测命令被拦截或语法失败，不能作成功执行的检测证据；要求 Reviewer 在最终报告更正，不沿用不准确表述。
- 验收：主 Agent证据核对，结果见下。
- 用户合并：未发生。
- 最终候选：`ecd3f3d5c82a12752a991f6b8d1a2f1e0fc77e54`。
- 最终 Review：同一独立 Reviewer PASS；继承首轮完整覆盖，增量复核仅 3 文件，未重新派发。
- 主 Agent证据验收（仅本次用户例外，不冒称独立 Acceptance）：PASS。
  - 条件 1/2：最终 Review 覆盖根规则、风险路由、4 Skills、13 角色与单任务模板，未见冲突。
  - 条件 3/4：检查入口真实退出 0，23 个测试 + lint/format 通过；最终候选静态指纹与最后被测指纹一致，未重复运行产品测试。
  - 条件 5：TASK-003 原分支仍精确指向 `fe6196f724cafbb67a30f1479769a57b5affc8d4`，业务实现和原证据未改。
  - 远程 main 只读核对仍是 `3b911834f2e44edd5bd25500b60275640e34a676`，与比较基线相同。
- 2026-09-03：ACCEPTED，等待用户合并。只完成 V2；没有自动续跑 TASK-003 或合并任何分支。
- 剩余限制：本地机械检查不是 GitHub required checks；敏感模式不是完整秘密检测；风险语义仍需主 Agent判断。没有新增项目依赖，未修改远程保护配置。
- 下一步：用户合并本次 V2 PR 后，再恢复 TASK-003 剩余独立 Review/Acceptance；不重做契约实现。

<details>
<summary>唯一独立 Reviewer 的最终报告原文</summary>

## Reviewer 报告（TASK-004，继续）

### 实际权限证据
- 任务记录与运行上下文一致：`sandbox=read-only`、`approval=never`。
- 本次审查未执行任何仓库/临时文件写入，且当前环境仍有 Git 缓存写入被系统拒绝的证据（`/tmp` 写入 `xcrun_db-*` 报 `Operation not permitted`）。

### 候选与继承覆盖
- 比对范围：`3b911834f2e44edd5bd25500b60275640e34a676 → ecd3f3d5c82a12752a991f6b8d1a2f1e0fc77e54`
- 本次新增增量文件（仅 3 个）：
  - [scripts/governance/check_task.py](<repo>/scripts/governance/check_task.py)
  - [scripts/governance/test_check_task.py](<repo>/scripts/governance/test_check_task.py)
  - [docs/tasks/TASK-004-governance-v2.md](<repo>/docs/tasks/TASK-004-governance-v2.md)
- 继承上轮审查覆盖：保留上一轮已检查范围（风险路由、TASK-003 保全、fail-closed、权限/契约一致性）不变；无新增治理/配置/产品契约文件变化需复查。

### 上轮问题关闭情况
- 已修复：分支角色名正则从 `agent/[a-z0-9-]+/TASK-\d{3,}-.+` 调整为允许下划线的 `agent/[a-z0-9_-]+/TASK-\d{3,}-.+`（封装为 `valid_task_branch`）。
- 已添加定向回归测试：`test_branch_role_accepts_hyphen_and_underscore`，同时覆盖合法正例与非任务分支反例。
- 任务记录同步更新了“首轮 CHANGES_REQUIRED 已闭环修正”与最新指纹，执行结果记载为 23 个测试及 lint/format 静态检查通过。

### Findings / 风险
- No findings。
- 残余风险：仅有“角色名必须为小写且含 `0-9a-z_-`”的约束；与本轮变更目标一致，未引入新风险。

### 结论
**PASS**

</details>
<details>
<summary>同一独立 Reviewer 对实际风险/成本追加规则的最终报告原文</summary>

### REVIEW 结论（TASK-004，same Reviewer）

- 当前候选：`0021895a96d0e725b08dd2ea60f9edd66538bac7`  
- 继承审阅范围：已继承 `3b911834f2e44edd5bd25500b60275640e34a676 → ecd3f3d5c82a12752a991f6b8d1a2f1e0fc77e54` 的完整审查结论（含上轮 P2 问题已闭环）。本轮仅做 `3cb56c4aaf739397f4755945d7bd704ef37656f2 → 0021895a96d0e725b08dd2ea60f9edd66538bac7` 增量复核，覆盖 10 文件。

### 实际权限依据
- 运行仅读取；本轮未执行任何仓库/临时文件写操作。
- `git show`/`git status` 相关执行输出出现系统层提示：`/tmp/xcrun_db-*` 创建失败 `Operation not permitted`，与启动说明中的 `sandbox: read-only`、`approval: never` 一致，满足实际只读验证要求（且不需要试写）。
- 具体命令失败事实：`git: warning confstr() failed ...; error: couldn't create cache file ... Operation not permitted`（已如实记录）。

### 关键变更与一致性核查
- 变更文件均为治理文案/技能模板，未改 `scripts/governance/check_task.py` 等实现逻辑、未改风险机器路由、未改 TASK-003 保全内容或产品契约。
- 已同步的增量规则（`AGENTS.md`、[risk guide](<repo>/docs/governance/风险分级与检查规则.md)、[review/acceptance skill](<repo>/.agents/skills/studypilot-review-change/SKILL.md)、[模板](<repo>/docs/governance/templates/REVIEW_TEMPLATE.md)）与既有 Review/Acceptance 流程不冲突：  
  - 仍保留 `TASK-004` 的一次性例外（主 Agent代验收），未泛化。  
  - 明确要求 PASS 可含已处置的非阻断问题，阻断问题仍必须拦截；允许记录而非阻断的边界场景有明示依据。  
  - 明确禁止覆盖独立阻断结论。  
- 任务状态与记录已更新为 `IN_REVIEW`，与本轮“新增增量待同一 Reviewer”语境一致；历史证据（如旧 PASS 文案）仅作历史背景。

### 阻断/非阻断 findings
- 阻断：无。  
- 非阻断：无新增真实问题。  
- 可选建议：可选。

### 决议
- **PASS**。  
- 需用户动作：按你既有流程继续提交该候选为最终冻结 SHA，并完成最终合并决策。

</details>
<!-- EVIDENCE:END -->
