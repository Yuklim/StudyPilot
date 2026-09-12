# TASK-050：重截 README 阅读器截图 `03-reader.png`（TASK-047 遗留）

```toml
schema_version = 2
id = "TASK-050"
status = "ACCEPTED"
risk = "L1"
risk_reason = "只替换 `docs/images/03-reader.png` 一张公开门面截图，使其与 main 上已合并的 TASK-046（沉浸式阅读页）/ TASK-049（窄屏浮层）形态一致。不改任何代码、接口、数据、契约、门禁与治理规则；README 只引用该图，文件名不变故 README 零改动。截图数据来自隔离 e2e 沙盒（临时目录 + 18000/15173 端口），不触碰本机 `backend/var/studypilot.db`。二进制文件由主 Agent 目视核验并记录于本记录，与 TASK-047 处置方式相同。不判 L2 的理由：`docs/images/**` 不在 risk-policy 高风险路径内，且无任何行为影响。"
risk_flags = ["documentation"]
owner = "coordinator"
base = "40de899a5fc3a2a41b65442de87f388b174c0aad"
allowed_paths = [
  "docs/images/03-reader.png",
  "docs/tasks/TASK-049-narrow-notes-overlay.md",
  "docs/tasks/TASK-050-reader-screenshot.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

- **用户授权**：2026-09-12 用户合并 TASK-049（PR #57）后问「下一个任务是做什么」，主 Agent 列出四项遗留候选，用户选定「① 重截 03-reader.png」。
- **依据**：TASK-047 记录第 74/112 行明确登记：「截图基于 main（`f609145`）。TASK-046 合入后正文宽度与元信息会变，需重截」。TASK-046 已于 2026-09-12 合并（`1924717`），TASK-049 于同日合并（`40de899`），README 里的阅读器截图自此与线上形态不符（旧图仍有左栏/面包屑外壳、「正文快照」元信息、内嵌滚动框与底部按钮）。
- **目标**：`docs/images/03-reader.png` 替换为当前 main 形态的阅读器截图（1440×900、独占整窗、740px 正文、无元信息、⋯ 菜单收纳三动作），内容仍为真实运行的沙盒数据，无占位、无伪造。
- **非目标**：
  - 不改 README 文案（图注「资料详情 = 阅读器 —— 冻结的正文快照、两层工具条」仍成立）。
  - 不重截其余 5 张（它们对应的页面自 `f609145` 后未改版）。
  - 不把截图 spec 入库（沿用 TASK-047 做法：一次性临时 spec，截完删除，命令记录于本记录）。
  - 不改任何代码、样式、契约、门禁。
- **禁止范围**：所有未列入 `allowed_paths` 的路径。
- **依赖**：无。
- **并行**：否。

### 顺带完成的状态登记

`docs/tasks/TASK-049-narrow-notes-overlay.md` 在 `allowed_paths` 内，**仅用于把其 `status` 由 `ACCEPTED` 登记为 `MERGED`**（2026-09-12 用户合并 PR #57，merge commit `40de899`，已用 `gh pr view 57` 与 `git log origin/main` 双向核实），并同步索引该行。按根 `AGENTS.md` §5「状态登记可并入下一个已授权任务的控制面提交」。

## 完成条件

1. `docs/images/03-reader.png` 内容为当前 main 的沉浸式阅读页：无 `.sidebar`/面包屑/页脚，顶栏含「返回资料库」与动作按钮，正文居中、无「正文快照/保存于…」元信息，无底部「替换正文/删除正文」按钮。
2. 截图来自沙盒（e2e 后端 18000 / 前端 15173），本机 `backend/var/studypilot.db` 的 mtime 在截图前后不变。
3. 主 Agent 目视核验并在 EVIDENCE 区记录看到了什么。
4. `check_task.py --worktree` 除「二进制需人工核验」这一预期项外通过，`files` 全在 `allowed_paths` 内。
5. TASK-049 记录与索引行登记为 MERGED，SHA 与 `gh pr view` 一致。

## 上下文包

- 规则：`AGENTS.md` §4/§5、`docs/governance/风险分级与检查规则.md`（L1）。
- 参考：`docs/tasks/TASK-047-repo-public-showcase.md` 第 66-75 行（截图方式与遗留）；`frontend/e2e/reader-immersive.spec.ts` 的 `call/seed` 写法。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-050-reader-screenshot.md --worktree`。

## 实现与测试

- **变更摘要**：`docs/images/03-reader.png` 由 TASK-047 时代的旧形态（左栏 + 面包屑外壳、「正文快照 / 保存于 2026-09-10 · 共 777 字…」元信息、内嵌滚动框、底部「替换正文/删除正文」按钮）替换为当前 main 形态；同一提交内把 TASK-049 登记为 MERGED 并置本任务索引行。README 零改动。
- **截图方式**（一次性临时 spec `frontend/e2e/showcase-capture.spec.ts`，截完即删，未入库）：
  - `cd frontend && npx playwright test showcase-capture` → `1 passed (3.1s)`；Playwright 自起 e2e 沙盒后端（`tests/run_browser_server.py`，端口 18000）与前端（`e2e/vite.config.ts`，端口 15173）；
  - 数据：走真实 API 建一份 `WEB` 资料「React 状态管理的取舍」+ `PUT snapshot`（合成演示正文，主题与旧图一致）+ 两个标签「待复习/精读」+ 一条心得（角标显示 1）；
  - 视口 1440×900，`fullPage: false`，等 `.snapshot-rendered` 可见且 `.sidebar` 计数为 0 后截图；
  - **本机库未触碰**：`backend/var/studypilot.db` mtime 截图前后均为 `1788762724`。
- **检查**：
  - `check_task.py --task … --worktree` → `FAIL: binary file needs explicit manual validation: docs/images/03-reader.png`（治理检查器对任意二进制按设计返回 FAIL，与 TASK-047 相同，人工核验见 EVIDENCE 区）；
  - 把该 PNG 临时 `git stash` 后重跑同一命令 → `STATIC PASS` / `CHECKS PASS`，`files=3`（TASK-049 记录、索引、本记录），`product_fingerprint=997803fd…`；随后 `stash pop` 复原，`git status` 为 4 个改动全在 `allowed_paths` 内；
  - 前端/后端测试：**NOT_RUN**（`checks = []`，本任务不改任何代码；不是 PASS）。
- **已知限制**：
  1. 正文为合成演示内容（与 TASK-047 六张图一致），非真实网页快照。
  2. 图注「冻结的正文快照、两层工具条」仍成立：顶栏为动作层，标签 + 保存原因为上下文层，正文即冻结快照。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`1144f43`（实现、登记与证据同一提交；本行为其后的补记）。
- 二进制人工核验（主 Agent 目视，完成条件 1/3）：`file` 识别为 `PNG image data, 1440 x 900, 8-bit/color RGB`，156,299 字节，sha256 `9e069941…3b13db`。图中可见：顶栏左「← 返回资料库」+「网页」徽章 + 标题 h1，右「未开始 · 0%」+ 心得按钮（角标 1）+ 原网页 + ⋯；下方标签「待复习」「精读」与「收下它是因为 …」；正文 740px 居中、18px、从 `# React 状态管理的取舍` 起顺读到「服务端状态不该手写」列表；**无左栏、无面包屑、无页脚、无「正文快照」元信息、无内嵌滚动框、无底部动作按钮**。无个人真实数据、令牌或本机路径。
- 完成条件逐条：1 ✅（上）；2 ✅（db mtime 不变）；3 ✅（本条）；4 ✅（除二进制预期 FAIL 外 CHECKS PASS，files 全在范围内）；5 ✅（TASK-049 记录 status/最终状态/日志 + 索引行均为 MERGED `40de899`，与 `gh pr view 57` 一致）。
- Review：**L1，N/A**（`AGENTS.md` §4）。Acceptance：**L1，N/A**。
- 最终状态/风险/用户操作：status=**ACCEPTED**。L1 执行链：主 Agent 充当 Worker → 自动检查 → 自检。待用户合并 PR；合并后 README 线上截图即与产品一致。
- 非阻断遗留项：无。
- 日期与决定日志：2026-09-12 用户在四项遗留候选中选定本项；主 Agent 沿用 TASK-047 的临时 spec 方式重截并删除 spec。
<!-- EVIDENCE:END -->
