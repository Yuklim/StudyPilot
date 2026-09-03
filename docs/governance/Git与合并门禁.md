# Git 与合并门禁 V2

## 一个任务默认一个分支

从已确认稳定 main 创建 agent/<role>/<task-id>-<name>。任务登记、实现、证据使用同一分支，单个串行任务不强制 worktree。
取消强制 intake/evidence/closeout PR；不取消写入前的任务授权、路径登记或未合并依赖门禁。并行写入才使用独立 worktree，最多两个。
角色切换不需要另建分支。进入写入前检查 Git 状态，来源不明修改不覆盖。

## 合并门槛

| 等级 | 必要证据 |
| --- | --- |
| L1 | 任务授权 + 最终检查/自检 + 主 Agent完成条件核对 |
| L2 | L1 + 针对最终候选的独立只读 Review 通过 |
| L3 | L2 + 独立只读 Integration/Acceptance 通过 |

所有等级都只由用户决定并执行最终合并。Agent 不向 main 提交/推送，不执行合并、强推、破坏性 reset、共享历史重写或删除他人分支。
ACCEPTED 只表示满足本级门槛，绝不等于 MERGED。未运行的检查写 NOT_RUN；有必要失败/阻断 finding 不得报“可合并”。

## 冻结与证据

实现与测试记录先提交，再冻结该提交为候选；候选不引用自身。之后主 Agent只写同任务状态、EVIDENCE 区和索引该行；不得更改已审授权、实现或检查。
`check_task.py --task <task> --candidate HEAD --evidence-from <candidate>` 只校验窄证据写回，不重跑业务测试。它不是独立 Review。
若产品/治理/契约/测试或授权变化，生成新候选。同一 Reviewer 优先审新增差异和受影响调用链并声明继承覆盖；无法界定影响时完整重审。冲突由原写入者解决，Reviewer/Integration 不能改文件。
合并前核对 main 是否变化及有无冲突，不未经授权 rebase/cherry-pick/修改目标候选。发生变化说明哪些旧证据仍有效，不能把一个 SHA 的批准当另一个 SHA 的批准。

## 合并后

核实用户实际合并，再登记 MERGED。状态可搭便车写入下一项已授权任务的控制面提交；必须在该任务 allowlist 列明旧任务的纯状态路径，无后续任务不强制制造收尾 PR。历史证据保留；分支/worktree 清理按需由用户授权，不默认删除。

## 远程保护

建议 main 禁止直接推送、强推和删除；使用 PR 与适用 CI 检查。当前规则文件不会自动开启 GitHub 保护；未验证的远程配置不得声称已生效。
AI Review 不等同 GitHub 人工批准。仅在检查确已在 CI 运行后设置 required checks；不要给单人仓库设置无法完成的第二人工批准门槛。
