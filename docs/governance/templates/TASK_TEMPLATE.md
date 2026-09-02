# TASK-XXX：任务名称

```toml
schema_version = 2
id = "TASK-XXX"
status = "DRAFT"
risk = "L2"
risk_reason = "按实际影响说明；不能只写文件少。"
risk_flags = ["business"]
owner = "填写唯一写入角色"
base = "填写稳定基线完整 SHA"
allowed_paths = ["精确文件或模块子目录/**", "docs/tasks/TASK-XXX-name.md", "docs/tasks/任务索引.md"]
checks = []
```

## 需求与范围

- 用户授权/相关需求章节：
- 目标与非目标：
- 禁止范围：所有未列入 allowed_paths 的路径；额外禁止项：
- 依赖/前置条件：
- 并行：默认否；若允许写出独立路径和依赖依据。

## 完成条件

- 可观察结果和必须覆盖的失败场景。

## 上下文包

适用规则版本、必要源文件、需求/契约章节链接、相关 diff、准确附加检查命令。
不要复制全仓背景；必要检查自动按变更选组，checks 只补充不会减掉自动选择的组。

## 实现与测试

- 实现 SHA/变更摘要：
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：
- 已知限制/未完成项：

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：
- Review：L1 N/A；L2/L3 填实际独立只读身份、权限证据、base/candidate、findings/No findings、结论。
- Acceptance：L1/L2 N/A；L3 填独立只读身份、权限证据、条件→证据、结论。
- 最终状态/风险/用户操作：
- 日期与决定日志：

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
