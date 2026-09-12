# TASK-054：一键启动开发环境脚本 `scripts/dev.sh`

```toml
schema_version = 2
id = "TASK-054"
status = "ACCEPTED"
risk = "L1"
risk_reason = "新增一个本机开发便利脚本，把 docs/开发与运行.md 已写明的两步（后端 alembic + uvicorn、前端 vite）合成一条命令；不改产品代码、契约、门禁、CI 与数据含义。唯一有副作用的动作是「有待执行迁移时先备份数据库再 alembic upgrade head」——与文档既有要求一致且比手动更保守。可证明低风险：脚本已在本机真实数据库上实跑（起停、端口占用、健康检查），所有失败路径都明确退出。"
risk_flags = ["documentation"]
owner = "coordinator"
base = "23c9dc5b17bc8de24e7c10ef28b06f609069e1c8"
allowed_paths = [
  "scripts/dev.sh",
  "docs/开发与运行.md",
  "docs/tasks/TASK-053-dedupe-body-title.md",
  "docs/tasks/TASK-054-dev-script.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

- **用户授权**：2026-09-12 用户合并 PR #61 后先说「帮我启动看看效果」，随即改为「帮我把启动做一个脚本吧」。
- **目标**：`scripts/dev.sh`——从仓库根目录一条命令起本机开发环境：① 检查 uv/npm、`.venv`/`node_modules` 已装、8000/5173 空闲（占用则明确退出、不结束别人的进程）；② `alembic current` ≠ `heads` 时先把 `backend/var/studypilot.db` 备份到 `backend/var/backups/studypilot-<时间>.db` 再 `upgrade head`，已是最新则跳过；③ 起 uvicorn 并等 `/health`、起 Vite（`--strictPort`）并等首页可达；④ 打开浏览器（`--no-open` 不打开）；⑤ 两边日志写 `backend/var/logs/` 并实时汇到终端；Ctrl+C/SIGTERM 时连子进程一起停。端口沿用 `STUDYPILOT_API_PORT` / `STUDYPILOT_UI_PORT`。
- **非目标**：不改后端/前端任何代码与配置；不改 CI；不做生产部署脚本；不改监听地址（仍 127.0.0.1）。
- **禁止范围**：所有未列入 `allowed_paths` 的路径。
- **依赖**：无。**并行**：否。

### 顺带完成的状态登记

`docs/tasks/TASK-053-dedupe-body-title.md` 在 `allowed_paths` 内，仅用于把 `status` 由 `ACCEPTED` 登记为 `MERGED`（2026-09-12 用户合并 PR #61，merge `23c9dc5`，已用 `gh pr view 61` 与 `git log origin/main` 双向核实），并同步索引该行。

## 完成条件

1. 在本机真实环境实跑：`scripts/dev.sh --no-open` 后 `/health` 返回 `{"status":"ok",...}`、`http://127.0.0.1:5173` 返回 200、真实浏览器打开 `/resources` 无页面错误与 4xx/5xx API 响应。
2. 停止后 8000/5173 无监听、无残留 uvicorn/vite 进程。
3. 端口被占用时脚本明确退出（exit 1）且不影响占用者。
4. 数据库已是最新时不备份不迁移；本次实跑即此情形（`0005_snapshot_assets`）。
5. `docs/开发与运行.md` 「运行」一节增加一段指向脚本，手动步骤原样保留。
6. `check_task.py --worktree` PASS。

## 上下文包

- `docs/开发与运行.md` 第 52-83 行（两步手动启动）、第 147 行（端口环境变量）。
- macOS 自带 bash 3.2：变量后紧跟中文标点必须写 `${var}`，否则 `set -u` 下报 unbound（实跑首轮即踩到）。

## 实现与测试

- **实现**：`scripts/dev.sh`（可执行，bash 3.2 兼容）+ 文档一段。
- **实跑记录（本机，真实 `backend/var/studypilot.db`，2026-09-12）**：
  - 首轮：`head）: unbound variable`——bash 3.2 把 `$head）` 里的多字节标点字节当成变量名的一部分；改为 `${head}` 后修复。
  - 正常启动：输出「数据库已是最新（0005_snapshot_assets）→ 启动后端 → 后端就绪 → 启动前端 → 前端就绪 → 运行中」；`curl /health` → `{"status":"ok","service":"StudyPilot"}`；`curl :5173` → 200，`<title>学习概览 · StudyPilot`；Playwright 真实浏览器打开 `/resources`：`h1`=「资料库」、14 条资料链接、页面错误 0、API ≥400 响应 0（未截图入库、未读取任何资料内容）。
  - 停止：向脚本发 SIGTERM → 「正在停止… / 已停止」，8000/5173 监听数 0，`pgrep uvicorn|vite` 0。（直接对**后台子 shell** 发 SIGINT 无效属 shell 语义——后台作业忽略 SIGINT；终端里 Ctrl+C 会同时送达前台进程组里的 uvicorn/vite 与脚本本身，另加 `stop_tree` 递归杀子进程兜底。）
  - 端口占用：先用 `python3 -m http.server 8000` 占住 → 脚本输出「端口 8000 已被占用……」exit 1，占用者未受影响。
  - 未实跑路径：**有待执行迁移时的备份分支**（本机库已是 head，无法在不伪造状态的情况下触发；逻辑为 `cp` 后 `upgrade head`，属 NOT_RUN，不是 PASS）。
- **检查**：见 EVIDENCE。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：实现、登记与证据同一提交，精确 SHA 在下一次写回时补记（提交无法引用自身）。
- 检查：`check_task.py --task … --worktree` → `risk=L1 stages=('worker',)`，`files=5`，`product_fingerprint=1db34227…`，`profiles=`（`checks = []`，不触发前后端套件）→ **CHECKS PASS**。前后端测试 **NOT_RUN**（本任务不改任何代码；不是 PASS）。
- 完成条件逐条：1 ✅（实跑记录见实现段）；2 ✅；3 ✅；4 ✅；5 ✅；6 ✅。
- Review：**L1，N/A**。Acceptance：**L1，N/A**。
- 最终状态/风险/用户操作：status=**ACCEPTED**。待用户合并；合并后直接 `scripts/dev.sh` 即可启动。
- 非阻断遗留项：迁移备份分支未实跑（NOT_RUN，见实现段），逻辑为 `cp` + `alembic upgrade head`，首次遇到新迁移时会走到。**重评触发条件**：下一个含 alembic 迁移的任务合并后，主 Agent 在本机实跑一次并补记。
- 日期与决定日志：2026-09-12 用户要求做启动脚本；主 Agent 按文档两步合一，先在本机实跑再入库。
<!-- EVIDENCE:END -->
