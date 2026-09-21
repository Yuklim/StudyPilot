# TASK-086：把文档追上这五个任务的实际行为，并更新仓库门面

```toml
schema_version = 2
id = "TASK-086"
status = "READY"
risk = "L3"
risk_reason = "要改 `docs/contracts/API与数据契约基线.md`（删除 TASK-085 留下的「生效前提」块、订正 §14.2 一处过期描述），命中 risk-policy.json 的 high_risk_paths，机器策略即 L3。其余是文档与登记。执行链：1 Worker → 自动检查 → 独立只读 Reviewer → 独立只读 Integration/Acceptance。"
risk_flags = ["public-api", "documentation"]
owner = "coordinator"
base = "9c64e7122494ce606ae86c6d9c06e79a7b9b8a35"
allowed_paths = [
  "README.md",
  "docs/contracts/API与数据契约基线.md",
  "docs/开发与运行.md",
  "docs/images/06-extension-popup.png",
  "docs/images/07-pdf-reader.png",
  "extension/README.md",
  "docs/tasks/TASK-083-pdf-page-boxes.md",
  "docs/tasks/TASK-084-capture-simplify.md",
  "docs/tasks/TASK-085-popup-feedback.md",
  "docs/tasks/TASK-086-docs-catchup.md",
  "docs/tasks/任务索引.md",
]
checks = ["contracts"]
```

## 需求与范围

### 用户授权

2026-09-21 用户（合并 #91/#92/#93 之后）：「**把这些收尾做了，同时 github 主页也相应更新一下新内容。**」
「这些收尾」指主 Agent 在上一轮汇报里列的三项——它们都是前几个任务里**明确登记、约定并入下一个任务**的。

### 要做的四件事

1. **删掉契约 §14.4 里那句「生效前提：TASK-084 先合并」与它下面的合并顺序引用块**。
   TASK-084（PR #92）已于 2026-09-21 合并，那段话自身随之过期——
   **这正是这几轮反复犯的同一种错**（改了行为没同步文档），TASK-085 的独立验收要求把它
   写进索引行让机器守着，本任务执行。
2. **补 083 / 084 / 085 三行索引并登记 MERGED**（PR #91 merge `36e09e2` / #92 merge `f0c5e21` / #93 merge `9c64e71`，均已合并），
   085 那一行里写上第 1 条的要求。
3. **修五处用户文档漂移**（TASK-085 独立验收给出的清单）：
   - `extension/README.md:5`、`:39`——仍写扩展按钮叫「保存这一页的正文」；
   - `docs/开发与运行.md:194`——同时含「抓不到时**自动**退回」与旧按钮名；
   - `docs/开发与运行.md:206`——`cross-origin` 仍写「当场放弃、退回存正文」；
   - `docs/contracts/API与数据契约基线.md:859`——仍写「页面据此告诉用户……退回存正文」，未提 popup。
4. **更新仓库门面 `README.md`**：它描述的仍是「采集网页正文 → 冻结快照 → 读」这条 2026-09 上旬的
   链路，而此后新增的三块能力一个字都没提——**文献 PDF 直抓与站内 PDF 阅读器**（TASK-073/080–083）、
   **文献信息**（TASK-075/078）、**高亮**（TASK-071/072）。同时换掉已经过期的扩展 popup 截图，
   补一张 PDF 阅读器截图。

### 非目标 / 禁止范围

- **不改任何行为**：本任务只动文档、截图与登记，不碰 `.ts`/`.tsx`/`.py`。
- 不重做其它截图（01–05 仍与现状相符）。
- 不改 README 的整体结构与语气。

### 主 Agent 登记的决定（Review 可挑战）

- **截图用真实运行的实例重拍**，数据是此前实测采集的真实公开论文（arXiv `1706.03762`）——
  README 已声明「截图取自真实运行的实例，数据为演示用途的合成内容」，这一句要同步改准：
  新截图里的论文是**真实公开文献**，不是合成数据。
- **「已知边界」一节要补**：出版社站基本拿不到 PDF（跨域身份握手），这是「不碰登录态」的必然结果。

## 完成条件

- 契约 §14.4 的「生效前提」与合并顺序引用块已删除，且 §14.4 全节读起来不再依赖任何未合并分支。
- §14.2 那处过期描述已订正。
- 索引含 083/084/085 三行、状态 MERGED、与各自记录的 status 一致，`validate_governance.py` PASS。
- 五处文档漂移逐项改正，且**全仓再无「保存这一页的正文」这个旧按钮名**（用 grep 自证）。
- README 写明三块新能力；扩展 popup 截图与当前实现一致；新增 PDF 阅读器截图；
  「合成内容」那句声明与实际截图相符。
- `check_task.py` 必要检查 PASS。
- L3：独立只读 Reviewer + 独立只读 Integration/Acceptance。
- **按用户既定指令：本次不主动推 PR**，先交给用户检查（README 是仓库门面，需要他看过）。

## 上下文包

- 来源：TASK-085 记录的「合并之后必须做的清理」「非阻断遗留项」，以及其独立验收给出的漂移清单。
- 检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-086-docs-catchup.md --worktree`。

## 实现与测试

- 实现 SHA：待填。
- 命令与结果：待填。
- 已知限制/未完成项：待填。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-21 用户合并 #91/#92/#93 后要求「把这些收尾做了，同时 github 主页也
  相应更新一下新内容」→ 登记 TASK-086。
<!-- EVIDENCE:END -->
