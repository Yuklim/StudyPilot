# TASK-065：修阅读器侧栏 e2e 的偶发 strict-mode 失败（`getByRole('status')` 双命中）

```toml
schema_version = 2
id = "TASK-065"
status = "MERGED"
risk = "L1"
risk_reason = "只改一条既有 e2e 用例的定位方式（裸 `getByRole('status')` → 按文字定位），不改产品代码、不降低断言（仍断言「心得已保存」可见 + 角标变 3 + 后端计数）。L1（risk-policy 里 tests 属 L2 起步，本次是一条既有用例的定位修正，按 local-fix 归类）：Review/验收 N/A。"
risk_flags = ["local-fix"]
owner = "coordinator"
base = "4edcc27143eaace84de4f07a45e6cbc37e65f415"
allowed_paths = [
  "frontend/e2e/reader-notes-sidebar.spec.ts",
  "docs/tasks/TASK-065-sidebar-status-flake.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-15 用户：「两个 pr 的端到端测试都失败了」（PR #71、#72）。CI 日志：两次失败都是 `e2e/reader-notes-sidebar.spec.ts:65` 第 93 行 `expect(page.getByRole('status')).toContainText('心得已保存')` —— `getByRole('status')` 同时命中 `<p role="status" class="note-saved">心得已保存…</p>` 与列表刷新中的 `<p role="status">正在翻开心得…</p>`，strict mode 报错；同一提交在另一次运行里通过（#71 的 PR 运行 success、push 运行 failure；#72 反之）。该文件不在 #71/#72 的 `allowed_paths` 内，单开本任务从 main 修。

### 目标

第 93 行改为 `expect(page.getByText(/心得已保存/)).toBeVisible()`，与同文件第 117–119 行（PR #64 时修过的同类问题）一致；其余断言不变。

### 非目标

不动产品代码；不动其他文件里的 `getByRole('status')`（编辑器页只有一个 status，侧栏表单的用 `form.getByRole` 已限定范围）。

## 完成条件

1. 该用例本地通过；全套 e2e 通过；`check_task` frontend PASS；`git diff --check` exit 0。
2. L1：Review/验收 N/A。

## 实现与测试

- **实现 SHA**：`abe0856`（`reader-notes-sidebar.spec.ts` 第 93 行 → `expect(page.getByText(/心得已保存/)).toBeVisible()`，附注释；与本记录同一提交）。
- 本地：`playwright test reader-notes-sidebar` 2 passed；全套 e2e **62 passed**（main 基线）；`check_task --candidate abe0856` **CHECKS PASS**（frontend 607）；`git diff --check` exit 0。
- 判别性：该用例原本在本地即通过（偶发只在 CI 慢机器出现），无法本地复现变红；依据是 CI 两次失败日志同一行、同一 strict-mode 双命中，以及同文件第 117 行同类修法的先例。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选：`abe0856`；范围 `4edcc27..abe0856`，2 个文件，均在 `allowed_paths` 内；CHECKS PASS（frontend 607）、e2e 62、diff --check 0。
- Review / Acceptance：L1，N/A（主 Agent 自检：不改产品代码，断言未降低）。
- status=**ACCEPTED**；待用户合并。合并后 PR #71 / #72 的 CI 重跑即包含本修复（pull_request 事件在与 main 的合并结果上跑）。
- 2026-09-15：用户「两个 pr 的端到端测试都失败了」→ 定位为旧用例偶发 → 单开本任务修 → 待合并。
- 2026-09-15 用户已合并 PR #73，merge `028a995`；status=**MERGED**（登记并入 TASK-066 控制面提交）。
<!-- EVIDENCE:END -->
