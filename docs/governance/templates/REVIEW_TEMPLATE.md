# TASK-XXX 独立 Review（L2/L3）

默认直接返回并写入单任务 EVIDENCE 区；L3 大证据/遗留任务才另存。
- Reviewer 身份、实际只读权限证据：
- base / candidate；增量时加 previous_candidate 与继承报告：
- [P0/P1/P2/P3] path:line — 触发条件、违反规则、影响、最小安全修正。无合格问题写 No findings。
- 覆盖范围、复用测试证据、定向验证（未执行不记通过）、残余风险：
- 结论：PASS / CHANGES_REQUIRED / BLOCKED。

首轮完整最终 diff；增量覆盖本轮变化和影响上下文，并声明新最终候选的整体结论。只返回报告，不修改文件或代写实现。
