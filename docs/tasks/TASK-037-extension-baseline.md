# TASK-037：`extension/` 顶层工程基线与 `extension` 检查组

```toml
schema_version = 2
id = "TASK-037"
status = "READY"
risk = "L3"
risk_reason = "本任务改的是治理门禁本身：`scripts/governance/check_task.py` 的检查组选择逻辑决定了「哪些代码会被自动检查覆盖」，改错的后果不是某个功能坏掉，而是此后所有扩展代码在无人察觉的情况下逃过检查，且这种缺陷不会以失败的形式暴露出来。命中 `scripts/governance/**`、`docs/governance/**`、`**/AGENTS.md` 三条高风险路径下限。另一半实质风险是先例效应：`extension/` 是仓库的第三个顶层代码目录，其工程约定（构建、lint、测试、依赖边界、与前后端的关系）一旦落地就会被后续所有扩展工作沿用，事后改造成本远高于第一次定对。本任务不实现任何抓取行为，不改安全边界，不改后端。"
risk_flags = ["governance", "architecture", "tooling", "tests"]
owner = "coordinator"
base = "32c3750d9a7a8f08674b50144792eeaf3f609515"
allowed_paths = [
  "extension/**",
  "scripts/governance/check_task.py",
  "scripts/governance/test_check_task.py",
  "docs/governance/风险分级与检查规则.md",
  "README.md",
  ".gitignore",
  "frontend/src/features/resources/ContentSnapshot.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "docs/tasks/TASK-037-extension-baseline.md",
  "docs/tasks/TASK-036-content-snapshot.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

- 用户授权（2026-09-06）：
  1. 「使用独立顶层目录 `extension/` 吧，万一以后还需要拓展其他的功能，可以同样放进 extension，不然全放 frontend 是否会越来越乱？」——顶层目录位置由用户明确选定；
  2. 「同意，登记 TASK-037」——用户批准本轮提出的拆分方案（基线任务与扩展实现任务分开）。
- 前序决策（TASK-036 已记录，本任务继承）：扩展**走 UI 页面写入，不改安全边界**；实施顺序取「甲」：正文快照 → 浏览器扩展 → PDF 阅读器。
- 拆分理由（本任务存在的原因）：扩展代码要被自动检查覆盖，`extension` 检查组必须**先存在**。若与扩展实现打包，Worker 会在同一个 diff 里既写扩展代码、又发明验证它的检查组——冻结时「检查通过」这句话就失去独立含义。且改 `scripts/governance/**` 是治理门禁（L3），与扩展功能本身正交，混在一起会摊薄 Reviewer 的注意力。先例：TASK-002「建立可运行的项目与本地开发脚手架」同样是先立工程基线、后做功能。

### 复核过的现状事实（主 Agent 在基线 `32c3750` 亲自核实）

1. `check_task.py` 需改三处：`PROFILE_NAMES`（:32）、`selected_profiles()` 的路径前缀规则（:62-65）、`commands()` 的命令分派（:200-223）。
2. 该脚本对新增检查组是**自洽**的：`test_check_task.py:105-107` 遍历 `PROFILE_NAMES` 逐个调 `commands()`，只往集合里加名字而不加命令分支会直接红，不会静默漏配。
3. `selected_profiles()` 对未知组名会抛错（`test_check_task.py:27-28` 已覆盖），任务无法通过写 checks 绕过自动选组。
4. 仓库**没有 CI**（无 `.github/`），`check_task.py` 是唯一的自动门禁，因此漏配检查组等于该目录完全无人把关。
5. 顶层代码目录现为 `backend/`、`frontend/`、`scripts/` 三个；`frontend/` 与 `backend/` 各有一份嵌套 `AGENTS.md`，`extension/` 应比照建立。
6. `.gitignore` 的 Node 段（`node_modules/`、`dist/`、`*.tsbuildinfo` 等）不带目录前缀，对 `extension/` 天然生效，**无需新增忽略规则**；若实现时确认无需改动则不写入该文件。

### 目标

1. **`extension/` 顶层工程基线**：一个可构建、可类型检查、可 lint、可跑单测的 MV3 浏览器扩展工程骨架。
   - 自带 `package.json` / `package-lock.json` / `tsconfig` / `vite.config.ts` / `eslint.config.js` / prettier 配置，**独立于 `frontend/`**，不与之共享 `node_modules`、不做 npm workspace（保持顶层目录之间无构建耦合，与 `backend/`↔`frontend/` 现状一致）。
   - 脚本名与 `frontend/` 对齐：`format` / `format:check` / `lint` / `typecheck` / `test` / `build`，使检查组命令与既有 frontend 组同形，降低两处漂移的概率。
   - 目录形状为「一个扩展、内部按功能分区」（`extension/src/features/*`），而不是「多个扩展的容器」——用户说的「以后拓展其他功能同样放进 extension」由内部分区承载，不预先造 monorepo。
2. **`extension` 检查组**：`check_task.py` 认识 `extension/` 前缀并跑上述五条命令；`test_check_task.py` 补断言；`docs/governance/风险分级与检查规则.md` 的检查组清单同步新增一行。
3. **`extension/AGENTS.md`**：嵌套模块规则，写明模块职责、不可放宽的边界（下条）与准确命令。
4. **诚实的空骨架**：popup 明确显示「工程框架已就绪，抓取功能尚未实现」，不放无效按钮、不放假数据（`frontend/AGENTS.md` §3 同款要求，本目录继承）。
5. **顺带修复 A3**（TASK-036 用户批准延期的两处文案缺陷，见下「A3 明细」）。
6. `README.md` 补一节扩展目录的安装/构建/加载方式（若实现时确认 README 结构不适合插入，则改放 `extension/README.md` 并在任务记录说明）。

### A3 明细（TASK-036 遗留，用户批准在下个触及该组件的任务修复）

- `ContentSnapshot.tsx:76` 写「需要最新内容请用**上方**的「打开原网页」」，但该链接在 `ResourceDetail.tsx:102-114`，位置在 `<ContentSnapshot>`（:97）**之后**，即页面下方。方位词与事实相反。
- 同文件 `:82-85` 的空态文案「只存链接的话，原文改版或消失后这份资料就找不回来了」是 WEB 资料专属说法，但组件对 PASTE / FILE 资料同样渲染（`ResourceDetail.tsx:97` 无条件挂载），对这两类资料该句不成立。组件当前不接收 `source_type`。
- 修法：`ContentSnapshot` 增加 `sourceType` prop，由 `ResourceDetail` 传入；两处文案按来源类型分支；`ResourcePages.test.tsx` 对三类资料各断言一次文案正确。

### 非目标 / 禁止范围

- **不实现任何抓取、注入或图片冻结**。骨架不含 content script 的业务逻辑、不申请 host permissions 之外的权限、不与后端或 UI 页面通信。这些属 TASK-038。
- **不改 `backend/**` 任何文件**，不改 `security/local_access.py`，不改任何 API 契约（`docs/contracts/**` 不在允许路径内）。
- **不引入任何第三方站点凭证**（继承 TASK-036 的硬性非目标）。
- **不做 A4**（`x-delivery-profile.available_operations` 已停在 `stage: "TASK-022"`，缺 12 个 operation，且 `backend/tests/test_taxonomy.py:485` 硬编码 `len(available) == 35`）。它的正确修法不是把 12 条补回去，而是补一个漂移守卫测试，否则下次照样烂掉；那是有独立测试故事的另一个任务，塞进本任务会让一个已跨 governance/extension/frontend 三面的 L3 再多一个 contracts 面。**A4 仍未修复**，本任务不得声称已处理。
- 不改 `frontend/` 除 A3 三个文件以外的任何内容，不改 `frontend/package.json`。
- 不放宽 `check_task.py` 任何既有检查、不改既有检查组的命令、不动敏感扫描与路径范围逻辑。
- 不动未列路径。

- 依赖/前置条件：TASK-036 已由用户合并（PR #41，merge `32c3750`）。无未合并依赖。
- 并行：否，单写入者 `coordinator`（主 Agent 亲自充当 Worker；L3 的 Review 与 Acceptance 由独立只读子 Agent 执行）。
- 状态收尾并入本任务控制面提交：把 TASK-036 由 `ACCEPTED` 标 **MERGED**（merge `32c3750`、PR #41）。

## 完成条件

1. `extension/` 五条命令在该目录下真实通过：`npm run format:check`、`npm run lint`、`npm run typecheck`、`npm run test -- --run`、`npm run build`；`build` 产出可被浏览器加载的 MV3 目录（含 `manifest.json`）。
2. `extension/` 至少有一条**有意义**的单元测试（不是 `expect(true).toBe(true)`），且能证明测试确实在跑该目录的源码。
3. `check_task.py` 对含 `extension/` 路径的变更自动选出 `extension` 组：`selected_profiles(["extension/src/a.ts"], [])` 返回 `{"extension"}`；`test_check_task.py` 新增该断言。
4. 既有的 `test_profiles_never_install_or_format_source`（:105-107）在包含 `extension` 后仍通过——即新组的命令不含安装依赖、不含自动格式化写入。
5. **本任务自身的检查跑出了 `extension` 组**：`check_task.py --task docs/tasks/TASK-037-extension-baseline.md --candidate <SHA>` 的输出中可见 extension 组的五条命令被真实执行并通过。这是对新门禁最直接的端到端证明。
6. 反向证明：故意在 `extension/` 放一处 lint 或类型错误时，检查组**失败**（变异验证，记录到证据段后回滚）。不做这一步就无法区分「检查通过」与「检查根本没跑」。
7. `docs/governance/风险分级与检查规则.md` 的检查组清单新增 extension 一行，与脚本实际行为一致（不多承诺、不少列）。
8. `extension/AGENTS.md` 存在，写明模块职责、边界与准确命令，且不放宽根 `AGENTS.md` 任何底线。
9. A3 两处文案修复：WEB 资料的提示指向正确方位；PASTE / FILE 资料不再看到 WEB 专属说法。`ResourcePages.test.tsx` 对三类资料各有断言，且这些断言在修复前会失败（变异验证）。
10. `cd backend && ruff format --check . && ruff check . && mypy . && pytest` 全绿（基线 525，本任务不应改变数量）；`cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build` 全绿（基线 363，A3 测试后应 >363）；`npm run test:e2e` 全绿（基线 41，本任务不新增 e2e）。
11. 治理组全绿：`validate_governance.py`、`ruff check/format --isolated scripts/governance`、`unittest discover -s scripts/governance`。
12. `check_task.py` CHECKS PASS，记录 product_fingerprint。
13. L3 执行链完整：独立只读 Reviewer 审 `32c3750..candidate` 完整 diff；独立只读 Acceptance（第三个只读实例）核对上述 13 条完成条件。两者原文写回 EVIDENCE 区。

## 上下文包

根 `AGENTS.md` + `frontend/AGENTS.md`（作为嵌套规则的写法样板）+ 本记录 + `docs/governance/风险分级与检查规则.md`。

只读参照（不改）：`scripts/governance/check_task.py:32,53-66,176-223`（检查组三处改点与既有命令形态）、`scripts/governance/test_check_task.py:21-28,105-110`（既有断言形态）、`frontend/package.json`（脚本名与工具版本，用于对齐）、`frontend/eslint.config.js`、`frontend/tsconfig*.json`、`frontend/vite.config.ts`（配置写法先例）、`.gitignore`（Node 段已覆盖 extension）、`frontend/src/features/resources/ContentSnapshot.tsx:76,82-85` 与 `ResourceDetail.tsx:97,102-114`（A3 事实）。

准确命令：
- `cd extension && npm run format:check && npm run lint && npm run typecheck && npm run test -- --run && npm run build`
- `cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test -- --run && npm run build`
- `cd backend && ruff format --check . && ruff check . && mypy . && pytest`
- `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python -m unittest discover -s scripts/governance -p 'test_*.py'`

## 实现与测试

- 实现 SHA/变更摘要：待填
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：待填
- 已知限制/未完成项：待填

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项（仅有真实问题时）：待填
- 日期与决定日志：2026-09-06 登记（用户「同意，登记 TASK-037」）。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
