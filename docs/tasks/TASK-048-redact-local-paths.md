# TASK-048：清理文档中的本机用户名与绝对路径

```toml
schema_version = 2
id = "TASK-048"
status = "IN_PROGRESS"
risk = "L2"
risk_reason = "改动全部落在文档，不含产品代码、契约、门禁与数据，本质是文本脱敏（documentation 命中 low_risk）；但改动对象是 17 份**历史任务记录**，其中含 V1 保全的 TASK-003 证据与治理相关的 TASK-004，属证据载体。若改错会篡改历史结论，影响面跨越十余个已完成任务，故按「不确定升一级」路由为 L2，需独立只读 Review 确认无任何结论被改动。"
risk_flags = ["documentation", "uncertain"]
owner = "coordinator"
base = "a4a244f1a141b8fa47a909f296aabc3c4ae216cf"
allowed_paths = [
  "docs/StudyPilot-主Agent交接说明.md",
  "docs/tasks/TASK-003-REVIEW.md",
  "docs/tasks/TASK-004-governance-v2.md",
  "docs/tasks/TASK-005-database-baseline.md",
  "docs/tasks/TASK-008-local-access-foundation.md",
  "docs/tasks/TASK-009-resource-backend.md",
  "docs/tasks/TASK-011-taxonomy-backend.md",
  "docs/tasks/TASK-012-taxonomy-pages.md",
  "docs/tasks/TASK-015-learning-backend.md",
  "docs/tasks/TASK-016-learning-pages.md",
  "docs/tasks/TASK-018-core-product-focus.md",
  "docs/tasks/TASK-033-tag-usability.md",
  "docs/tasks/TASK-034-taxonomy-usage.md",
  "docs/tasks/TASK-037-extension-baseline.md",
  "docs/tasks/TASK-042-snapshot-rendering.md",
  "docs/tasks/TASK-043-reader-toolbar.md",
  "docs/tasks/TASK-047-repo-public-showcase.md",
  "docs/tasks/TASK-048-redact-local-paths.md",
  "docs/tasks/任务索引.md",
]
checks = ["governance"]
```

## 需求与范围

- 用户授权/相关需求章节：用户 2026-09-10 在 TASK-047 合并后明确指示「B，清一下」——
  前半句选定「提交不再加 `Co-Authored-By: Claude Code` 尾注」（已另行记为会话约定，**不属本任务、不改仓库文件**），
  后半句授权清理文档中的本机用户名与绝对路径。该问题由 TASK-047 的 Review 附带发现并记入其证据段（「越界记录」），
  当时因不在 `allowed_paths` 内未处置。
- 目标与非目标：
  - 目标：消除 `docs/` 中对本机用户名 `yuklimching` 与 `/Users/yuklimching` 绝对路径的暴露，使仓库公开后不泄露
    本机用户名与个人目录结构；**仅做文本替换，不改变任何陈述的含义、结论、数字、SHA 或状态**。
  - 非目标：不修改任何产品代码（`backend/` `frontend/` `extension/`）、契约、门禁（`AGENTS.md`、`docs/governance`）、
    迁移与数据；不改写 Git 历史；不重写任何已合并任务的证据结论；不把历史记录中的旧 SHA/命令「修正」为现值。
- 禁止范围：所有未列入 allowed_paths 的路径；额外禁止项：`backend/**`、`frontend/**`、`extension/**`、
  `AGENTS.md`、`docs/governance/**`、`docs/contracts/**`、`.agents/**`、`.claude/**`。
- 依赖/前置条件：无未合并依赖；基线 main = `a4a244f`（TASK-047 与 TASK-045 状态登记均已合并）。
- 并行：默认否。

### 替换方案（唯一写入者适用）

按「保留含义、去掉身份」原则，逐类替换：

| 原串 | 替换为 | 理由 |
| --- | --- | --- |
| `/Users/yuklimching/Desktop/StudyPilot` | `<repo>` | 去掉用户名与个人目录层级，后续相对路径与行号保留，可读性不变 |
| `/Users/yuklimching/Documents/Study` | `~/Documents/Study` | 去用户名；该目录本就以 `~` 语义被描述 |
| `/Users/yuklimching`（裸） | `~` | 去用户名 |
| `/private/tmp/claude-501/-Users-yuklimching/<uuid>/…` | `/private/tmp/claude-501/…/…` | 该段是 Claude 临时目录对本机路径的转义，同样暴露用户名；uuid 与具体日志名一并省略 |
| 正文中的用户名（如 `yuklimching`、`uid=501` 并列处） | 改为中性表述（如「本机非特权用户」） | 保留原判断（只读、非 root）不变，仅去掉身份 |

**不替换**：GitHub 账号 `Yuklim`（README、LICENSE、徽章、仓库 URL 中**有意公开**的作品集身份，与本次清理无关）。

## 完成条件

1. `git grep -n 'yuklimching'` 在本分支返回 **0 行**；
2. 替换仅限上表所列形态，未引入任何其他字面改动——可由 diff 逐行核对；
3. 所有被改行的**语义不变**：涉及的数字、SHA、状态、测试计数、结论、findings 判定一个字不改；
4. 未触碰 `allowed_paths` 之外的任何文件，尤其未改产品代码与门禁；
5. 未把 markdown 链接指向的文件路径/行号改错（链接 label 与目标行的对应关系保持）；
6. background 任务记录不被「修正」——TASK-037/TASK-042/TASK-043 中的历史候选 SHA、reflog 路径等原样保留，只脱敏路径前缀。

## 上下文包

适用规则版本：AGENTS.md V2（2026-09-03 生效，本次未变）。
必要源文件：`docs/governance/risk-policy.json`（定级）、`docs/governance/templates/TASK_TEMPLATE.md`（记录格式）。
相关契约章节：无（本任务不触碰 `/api/v1`）。
补充检查命令：`git grep -n 'yuklimching'`（完成条件 1 的直接判据，governance 组不会自动覆盖）。

## 实现与测试

- 实现 SHA/变更摘要：见 EVIDENCE 段候选 SHA。
- 命令、真实退出结果、环境：
  - `git grep -n 'yuklimching'` 改动前 39 行 / 17 文件 → 改动后 0 行；
  - `scripts/governance/validate_governance.py` 与 governance 单测。
- 已知限制/未完成项：
  - 历史记录中形如 `[文本](/Users/.../x.md:12)` 的链接脱敏后仍**不是可点击的相对链接**（改为 `<repo>/…` 后依旧非相对路径）。
    本次只做脱敏，不改变链接形态；如需把历史链接改成可用的仓库内相对链接，属另一个范围更大的任务，未授权故不做。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：
- Review：
- Acceptance：L2 N/A
- 最终状态/风险/用户操作：
- 非阻断遗留项（仅有真实问题时）：
- 日期与决定日志：2026-09-10 用户指示「清一下」；由 TASK-047 附带发现并登记；定级 L2。
<!-- EVIDENCE:END -->
