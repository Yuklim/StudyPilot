# TASK-037：`extension/` 顶层工程基线与 `extension` 检查组

```toml
schema_version = 2
id = "TASK-037"
status = "IN_REVIEW"
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

- **不实现任何抓取、注入或图片冻结**。骨架不含 content script 的业务逻辑、**不申请任何权限**（原文曾写「不申请 host permissions 之外的权限」，字面上等于预先允许了 host_permissions，与实现和 README 均不符，经 Review 指出后收紧）、不与后端或 UI 页面通信。这些属 TASK-038。
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

- 实现 SHA/变更摘要：**最终实现 SHA `984b2f4`**（base `32c3750`，25 个文件）；第一轮实现 SHA 为 `5e7ef25`，经第一轮 Review 的 F1/F2/F3 处置后被取代。**本段下方记录的命令与指纹一律是最终值**（`984b2f4` → `bd485b94…`）；第一轮的值只在明确标注「第一轮」处出现。（此处措辞是对 TASK-036 A1 的针对性纠正：上个任务的这一段留着被取代的第一轮指纹，却被我描述为最终值，经 Acceptance 指出才更正。）
  1. 新建顶层 `extension/`：独立 npm 工程（`package.json`/`package-lock.json`/`tsconfig.json`/`vite.config.ts`/`eslint.config.js`/prettier 配置），脚本名与 `frontend/` 对齐；不做 workspace、不共享 `node_modules`。
  2. `src/manifest.ts` 是 manifest 的唯一来源，`vite.config.ts` 的 `studypilot-emit-manifest` 插件在构建时产出 `dist/manifest.json`，仓库里没有第二份副本可漂移。manifest 不申请任何 `permissions`/`host_permissions`/`content_scripts`。
  3. popup 为诚实空壳：`popup.html` + `src/popup/main.ts`（仅 DOM 接线）+ `src/popup/popup.ts`（纯函数 `popupText`，与 DOM 解耦以便测试），显示「工程框架已就绪，网页采集功能尚未实现」，无任何按钮。
  4. `extension/AGENTS.md` 按 `MODULE_AGENTS_TEMPLATE.md` 七节撰写；`extension/README.md` 与根 `README.md` 补安装/构建/加载与检查说明。
  5. `check_task.py` 三处改动：`PROFILE_NAMES` 增 `extension`、`selected_profiles()` 增 `extension/` 前缀、`commands()` 增 extension 分支；`test_check_task.py` 增选组断言；`docs/governance/风险分级与检查规则.md` 检查组清单增一行。
  6. A3：`ContentSnapshot` 新增 `sourceType` prop，两处文案改为按来源分支（`snapshotHints`/`emptyHints`），`ResourceDetail` 传入 `item.source_type`；`ResourcePages.test.tsx` 新增两组 `it.each` 共 6 条断言。
  7. 未改 `.gitignore`：其 Node 段（`node_modules/`、`dist/`、`*.tsbuildinfo`）不带目录前缀，对 `extension/` 天然生效，已核实 `git add -A extension` 不会带入生成物。

- 命令、真实退出结果、product_fingerprint、环境、未运行原因：

  **任务检查（全套，最终）**：`check_task.py --task docs/tasks/TASK-037-extension-baseline.md --candidate 984b2f4` → **CHECKS PASS**，base=`32c3750`、files=25、`profiles=extension,frontend,governance`、`product_fingerprint=bd485b941e85561d06207f3f27d8c52b9eb61a660daf557fc4aed99c6ddcdae4`。完整输出留存于会话临时目录 `scratchpad/check-037-r2.log`（155 行）。extension 组的五条命令在输出第 5/15/23/31/48 行逐条可见并全部 exit=0，其中 `npm run test -- --run` 报 **2 files / 5 tests passed**；frontend 组报 **16 files / 369 tests passed**。

  第一轮（已被取代，仅备查）：`--candidate 5e7ef25` → CHECKS PASS，同样 25 文件、同样三个 profile，`product_fingerprint=8a50315df815e211feb109c9e9bcb81cc916310c1f33d22b835d8c09858e6733`，输出留存于 `scratchpad/check-037-full.log`。

  **该检查的运行环境须如实说明**：主工作区因存在**未跟踪**的 `docs/research/`（用户在另一会话创建、至今未纳入 Git）而不满足脚本的 `git status --porcelain` 干净要求，全套检查会以 `FAIL: full checks require the candidate checked out with a clean worktree` 拒绝执行。未改动、未移动、未提交该用户文件；改为 `git worktree add` 一个**独立干净的 worktree** 检出候选 `5e7ef25` 后在其中运行。该 worktree 需要一个符合 `agent/<role>/TASK-\d{3,}-.+` 的分支名（脚本拒绝 detached HEAD），故建了临时本地分支 `agent/coordinator/TASK-037-extension-baseline-check`；它只用于跑检查，不含任何提交差异，不推送，检查后删除。`backend/.venv` 以符号链接引入该 worktree（Python 工具链），`frontend/`、`extension/` 各自 `npm ci`。**这一路径比在脏工作区里跑更严格**：它同时证明了提交出去的树在全新检出下自足（`npm ci` 依锁文件安装即可通过全部检查）。

  **backend 组未被自动选中**（本任务不改 `backend/**`），另行在主工作区单独运行：`ruff format --check . && ruff check . && mypy src tests && pytest -q` → 全绿，**525 passed**，与基线一致（本任务不应改变后端数量）。

  **e2e**：`cd frontend && npm run test:e2e` → **41 passed**，与基线一致。本任务不新增 e2e；已核实既有快照 e2e（`frontend/e2e/resource-pages.spec.ts:229,245`）用的是 WEB 资料，而 WEB 的空态文案未变，故 A3 改动不触及该断言。

  **变异验证（第一轮三项 + 处置后三项，共六项，均已回滚，回滚后复跑全绿）**：
  1. *A3 是否真被测住*：把 `snapshotHints`/`emptyHints` 三个来源改回 TASK-036 的单一 WEB 文案（含「上方」），`ResourcePages.test.tsx` **5 条失败 / 34 通过**（WEB 空态那条本就正确，故仍通过——这正是预期）。
  2. *extension 组是否真在跑*：在 `extension/src/broken.ts` 写入类型错误，按 `check_task.commands("extension")` 逐条执行，`typecheck` **exit=1**（`error TS2322`），组判 FAIL。
  3. *manifest 权限门闩是否有效*：给 manifest 加 `permissions: ['tabs']`（格式合规，先过 prettier），`npm run test -- --run` **1 failed / 4 passed**，报 `expected [ 'tabs' ] to be undefined`。
  4. *（处置 F1 后）白名单是否挡住黑名单挡不住的键*：分别加 `optional_permissions: ['tabs']` 与 `externally_connectable: { matches: [...] }` —— 这两个键在**旧的黑名单断言下全绿**，在白名单下各自 **1 failed / 4 passed**，报 `expected [ 'action', 'description', …(4) ] to deeply equal [ …(3) ]`。
  5. *（处置 F2 后）方位断言是否咬住 DOM 顺序*：按 Reviewer 给的决定性反例，**文案一字不改**，只把 `ResourceDetail.tsx` 的 `<ContentSnapshot>` 移到三个来源区块之后 —— 修复前该反例**六条全绿**，修复后 **6 failed / 33 passed**。
  6. *（处置后回归）*：全部回滚后 extension 5 tests、frontend 369 tests、e2e 41、治理 23 复跑全绿。

  环境：macOS（Darwin 25.5.0）、Node v24（`.node-version`）、npm 11、Python 3.13（`backend/.venv`）。`extension/` 首次 `npm install` 因用户级 npm 缓存 `EACCES` 失败，改用仓库内已忽略的 `.npm-cache`（README 既有 FAQ 的同款做法，本任务把该 FAQ 从「`frontend/`」扩到「`frontend/` 或 `extension/`」）。

- 已知限制/未完成项：
  1. **A4 未做且仍在恶化**：`openapi-v1.json` 的 `x-delivery-profile` 仍停在 `stage: "TASK-022"`，`available_operations` 有 35 项而实现已有 47 个 operationId，缺 `scheduleReview`/`pauseReview`/`completeReview`/`listReviews`/`listResourceReviewRecords`/`getOverviewAnalytics`/`listTopicAnalytics`/`detachAllTagResources`/`mergeTag`/`getResourceSnapshot`/`putResourceSnapshot`/`deleteResourceSnapshot` 共 12 项，且 `backend/tests/test_taxonomy.py:485` 硬编码 `len(available) == 35`。已明示为非目标，本任务未处理。
  2. **`docs/research/阅读器与标注能力调研.md` 仍未纳入 Git**，而 TASK-036 的上下文包引用了它——任何从 Git 检出工作的 Reviewer 都看不到被引用的内容。属用户文件，本任务不处理，仅记录。
  3. 扩展骨架**不含任何采集能力**，也没有与 UI 页面之间的消息契约；那属 TASK-038。
  4. **扩展从未在真实浏览器里加载过**：本环境无法驱动 Chrome 的「加载已解压的扩展程序」。已验证的只是构建产物存在且形状正确（`dist/` 下有 `manifest.json`、`popup.html` 与 JS 资源，manifest 为合法 JSON、`manifest_version: 3`、`default_popup` 指向确实存在的文件）。「能被 Chrome 成功加载」尚无证据，README 的加载步骤未经实机验证——请用户首次按 README 加载时确认。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：第一轮候选 **`f91dbbe`**（代码 `5e7ef25`，base `32c3750`）。经第一轮 Review 处置后的**代码修订 SHA 为 `984b2f4`**（`product_fingerprint=bd485b94…`，全套 CHECKS PASS）；**本轮的冻结候选即本条写回所在的提交，其精确 SHA 在下一次写回（增量复核结论）时补记** —— 提交无法引用自身，这与根 `AGENTS.md` §6「候选精确 SHA 在之后的 Review/证据段记录」一致。`984b2f4` 与该候选之间只差本任务记录一个文件，指纹不含任务记录与索引，故被测产品内容相同。
- Review（第一轮，L3 独立只读，`32c3750..f91dbbe`）：**整体 CHANGES_REQUIRED**（A 部分 PASS + B 部分 CHANGES_REQUIRED，按「任一为 CHANGES_REQUIRED 则整体 CHANGES_REQUIRED」计）。因单实例连续三次被 watchdog 中断（详见下方「审查过程本身的证据」），改由**两个全新只读实例并行分范围审查**，两份并集为完整 diff（除 `package-lock.json`）、无重叠。两份报告原文如下，未作任何压缩或改写。

  **关于报告中的行号**：两份报告引用的行号系各自所收 patch 的**文件内行号，不是源文件行号**。B 部分基准为派发会话生成的 `T037-B-code.patch`（493 行），对应关系经派发会话逐条核实：`manifest.test.ts:183-191` → 源文件 `extension/src/manifest.test.ts:28-36`（三条 `expect` 在 :33/:34/:35）；`README.md:47-53` → `extension/README.md:19-25`；`vite.config.ts:317-326` → `extension/vite.config.ts:10-13`；`ResourcePages.test.tsx:466-489` → `frontend/src/features/resources/ResourcePages.test.tsx:595-616`。此为主 Agent 附加的定位说明，报告原文未改。

## TASK-037 Review · A 部分：治理门禁

### 独立只读身份与权限证据
本实例工具白名单仅 `Read` / `Grep` / `Glob`，无 `Write`/`Edit`/`NotebookEdit`，无 `Bash`。因此本次审查全程只读，未写入、未提交、未推送任何内容；下述结论全部来自读取 patch 与工作树文件后的静态推理，未执行任何命令。

### 范围
base `32c3750` → candidate `f91dbbe`。覆盖文件全集（8 + 1 补投）：`scripts/governance/check_task.py`（全文）、`scripts/governance/test_check_task.py`、`extension/AGENTS.md`、`docs/governance/风险分级与检查规则.md`、`docs/tasks/TASK-037-extension-baseline.md`、`docs/tasks/TASK-036-content-snapshot.md`、`docs/tasks/任务索引.md`、`README.md`、`extension/package.json`（跨边界接缝补投）。参照读取（不产出 findings）：`validate_governance.py`、`risk-policy.json`、`.gitignore`、`frontend/package.json`、`frontend/AGENTS.md`、`extension/vite.config.ts`。**B 部分（扩展源码、`manifest.test.ts`、前端 A3）不在本报告范围。**

---

### 核查点 1：三处改动是否削弱既有门禁 —— 否

- **不会抢走既有组**：`check_task.py:58-69` 是五条**并列 `if` + `groups.add()`**，无 `elif`、无 `return`、无互斥。新增的 `extension/` 分支只能向集合里加元素，数学上不可能使 backend/frontend/contracts/governance 少选一个。既有四个 `commands()` 分支（`:182-217`、`:228-235`）逐字未改，我已对全文核实。
- **退出码聚合无吞噬**：`failures = sum(run_command(...) for group in sorted(groups) for ...)`（`:390-394`），`run_command` 返回 `int(returncode != 0)`，`OSError`/`TimeoutExpired` 也返回 1（`:245-247`）。`CHECKS PASS` 只在 `failures == 0` 时打印且 `return 0`（`:408-409`）。新增分支返回的是 5 个 `(dir, argv)` 元组，走同一条聚合路径，没有任何新的 `try`/`continue`/短路。
- **失败是闭合的**：若只加 `PROFILE_NAMES` 而不加 `commands()` 分支，`commands()` 抛 `ValueError`（`:236`）→ 由 `main()` 的 `except`（`:410-412`）捕获 → `FAIL` + `return 1`，不会静默漏检。若 `extension/` 目录不存在，`subprocess.run(cwd=...)` 抛 `OSError` → 计 1 次失败。两条最危险的路径都是「红」而非「绿」。
- **边界判定**（`str.startswith("extension/")` 语义）：`extension`（无斜杠）→ 不匹配任何组，与既有 `frontend`/`backend` 同形；`extensions/x` → 不匹配（第 10 字符 `s` ≠ `/`）；`frontend/extension/x` → 只进 `frontend`，正确。`extension/AGENTS.md` → 只进 `extension` 组，不进 governance —— 与既有 `frontend/AGENTS.md` 行为一致，且风险下限由 `risk_floor` 经 `**/AGENTS.md` 独立兜住 L3（`risk-policy.json:43`，`fnmatch` 的 `*` 跨 `/` 匹配），非新增缺口。

### 核查点 2：extension 组是否满足「不装依赖、不自动格式化写源码」—— 满足，但断言的锁定力不如任务记录所称

对 `test_check_task.py:106-111` 做定向反证（把实现改坏、看是否转红）：

| 改坏方式 | 是否转红 |
| --- | --- |
| 命令改成 `npm ci` / `npm install` | ✅ 红（`{"install","sync","ci","--write"}` 命中） |
| 命令改成 `npm run format` | ✅ 红（`"format" in command` → 要求 `--check`） |
| 命令加 `--write` | ✅ 红 |
| **把 `package.json` 的 `"format:check"` 脚本体改成 `prettier --write .`** | ❌ **绿** |
| 命令改成 `npm run lint -- --fix` | ❌ **绿**（`--fix` 不在禁用集合） |

即：该断言锁的是 **argv 里的字面 token**，看不见 npm script 的**脚本体**。完成条件 4 称它证明「新组的命令不含安装依赖、不含自动格式化写入」——前半句成立，后半句超出该断言的实际能力。

**但真正的行为级防线在别处且有效**：`check_task.py:389` 与 `:403-407` 在跑完所有命令后比对 (a) 全部 `changed` 文件的磁盘字节、(b) `git status --porcelain --untracked-files=all`。任何在检查期间写回源码的格式化器（无论来自 argv 还是脚本体）都会改变其中之一 → `failures += 1` + `FAIL: inputs changed during checks`。因此该约束**实质上被守住了**，只是守它的不是那条被引用的断言。这是覆盖归因问题，不是安全缺口。

### 补投三问（逐条作答）

1. **5 个 script 名逐一存在**：`extension/package.json:10-17` 定义 `format` / `format:check` / `lint` / `typecheck` / `test` / `build`；门禁调用的 `format:check`、`lint`、`typecheck`、`test`、`build` **全部命中，无一对不上**。（附带：`npm run <不存在的脚本>` 本身也是非零退出，即使写错也是红不是绿。）
2. **失败时均非零退出**：`prettier --check .` 有差异 → 1；`eslint .` 有 error → 1；`tsc --noEmit` 有错 → 2；`vite build` 失败 → 非零，且 `build` 用 `&&` 串联可正确传播前段失败。关于 `npm run test -- --run`：npm 会把 `--` 之后的参数追加给脚本，实际执行 `vitest --run`，单次运行后按结果退出。**若 `--run` 未透传导致进 watch**，`subprocess.run(..., timeout=600)`（`:243`）会抛 `TimeoutExpired` → `run_command` 返回 1 →「挂起」最终收敛为 **FAIL，不会退出 0**。另：`vite.config.ts:28-31` 未设 `passWithNoTests`，vitest 默认在**零测试文件时非零退出**，所以「检查组在跑但什么都没测」这个失效模式也是闭合的。
3. **`build` 与 `typecheck` 确有重复**（`tsc --noEmit && vite build` vs `tsc --noEmit`）。这与 `frontend/package.json:15,19`（`tsc -b` vs `tsc -b && vite build`）**同形，属沿用先例的有意冗余**：vite/esbuild 只剥类型不做类型检查，`npm run build` 自带 `tsc` 才能在门禁之外单独使用时仍类型安全。代价是门禁里多跑一次 tsc（骨架规模下可忽略）。**可选建议范畴，不阻断。**

### 核查点 3：`extension/AGENTS.md` 是否放宽根底线 —— 未放宽，逐条更严

与 `frontend/AGENTS.md` 同模板同措辞（§1「不得放宽根规则」、§6「默认允许/默认禁止」句式一致），并在其上**新增**三条不变量：

- **第三方站点凭证**：「不要求、不读取、不存储、不转发……登录态、Cookie 或扫码登录结果」+「不得绕过任何站点的访问控制、付费墙或权限检查」。后半句「会话由浏览器自己持有」是机制说明而非豁免口子——它没有为「代持凭证」留任何条件从句。
- **`security/local_access.py`**：§3 与 §7 两处独立写死，§7 把「为让扩展直连而修改 `security/local_access.py` 或放宽 `Origin`/`Sec-Fetch` 校验」列为**要发现的违规行为**，并给出理由链而非口号。
- **不直连后端 API**：§3「扩展不直接调用 `/api/v1`」，§4 进一步规定消息格式属跨模块契约、「不得由本模块单方面约定」。

措辞留口子扫描：未发现「原则上」「一般情况下」「除非必要」一类软化词。「默认禁止……与未获批准的业务契约」中的「默认/未获批准」与 frontend 先例逐字相同，且其含义（任务单授权路径）由根 §5 定义，非本文件自造。§3 关于权限增量「必须写明用途与替代方案，并经独立 Review」是**加严**。

### 核查点 6：独立 worktree 跑检查是否构成规避 —— **直说：不构成规避，它更严格；但 PASS 绑定的是实现 SHA 而非候选 SHA，这一点需要如实标注**

判据是「那条路径拿到的 PASS 是否绑定了正确的被测内容」，我分两问回答：

**(a) 是否绕开了干净工作树前置条件想防的东西？没有，恰恰相反。** `check_task.py:387` 那条前置条件防的是「磁盘上真正被 npm/pytest 跑的那棵树 ≠ 候选提交」。注意 `--candidate` 模式下 `read_current` 走 `git show`（`:275-283`），静态部分本来就读提交内容，未跟踪的 `docs/research/` 根本进不了 `changed`；受污染的只有**子进程实际运行的那棵磁盘树**。在全新 `git worktree` 中检出候选后，磁盘树与候选提交逐字节相等、`git status` 为空——该条件是**被字面满足**的，代码走的是同一分支，没有加 `--static-only`、没有改脚本、没有跳过任何断言。且它额外证明了一件主工作区证明不了的事：新检出 + `npm ci` 依锁文件即可通过全部检查（自足性）。临时分支 `...-baseline-check` 只为满足 `valid_task_branch`（其错误文案 `:271` 表明该规则防的是 main 与 detached HEAD），指向候选本身、零差异、未推送、事后已删（你已用 git 核实）。**结论：更严格，不是规避。**

**(b) 残余的真实偏差：检查绑定在实现 SHA `5e7ef25`，冻结候选是 `f91dbbe`。** 你已核实两者仅差 `docs/tasks/TASK-037-extension-baseline.md` 一个文件，且 `check_task.py` blob 完全相同；`product_fingerprint` 按 `:359` 本就排除任务记录与索引，故**被测产品内容逐字节相同**。这也正是根 `AGENTS.md` §6 明文预期的形态（「实现结果记录实现 SHA；候选精确 SHA 在之后的 Review/证据段记录，避免提交引用自身」），TASK-036 亦是同样形态。唯一未被机器覆盖的是候选版任务记录本身——`validate_governance.py:297-303` 会解析每份 `TASK-*.md`。我已**逐项手工核验候选版该文件**：恰一个 ```toml 块且位于 `EVIDENCE:BEGIN` 之前、`BEGIN`/`END` 各一且有序（满足 `parse_task`）；`status="IN_PROGRESS"` ∈ `STATES`；`owner="coordinator"` ∈ `AGENTS`；`base` 为 40 位十六进制；`allowed_paths` 12 条全部通过 `valid_scope`；`checks=[]` 合法；`risk_flags` 四项在 `risk-policy.json` 中全部已知（`governance`/`architecture` 属 high → `risk_floor` = L3 = 声明值）。**该缺口经人工核验已闭合，不构成 finding。**

---

### Findings

**必须修复（阻断）：无。**

**可记录后继续：**

1. **`scripts/governance/validate_governance.py:215-218` 存在第二份硬编码检查组名单，本次未同步。**
   触发：任何任务在 TOML 里显式写 `checks = ["extension"]`。
   影响：`validate_task` 报 `unknown or missing check groups` → `check_task.py:301-303` 直接 `FAIL`；更麻烦的是 `validate()` 会遍历**全部** `docs/tasks/TASK-*.md`，一份这样的任务记录会让整个治理组对所有任务失败。**方向是「误红」不是「漏绿」，不构成门禁削弱**，且 extension 组本就由路径自动选中、不依赖显式声明，所以当前无实际损害。但 `docs/governance/风险分级与检查规则.md:41` 现已把 extension 列为检查组，照文档写 `checks` 的人会撞上无法自解释的失败。
   最小修复：把 `"extension"` 加入 `validate_governance.py:217` 的元组。**注意该文件不在 TASK-037 的 `allowed_paths` 内**，本任务不应擅自扩范围去改——建议记为遗留，由下一个触及治理脚本的任务修，或经用户批准后追加路径。

2. **`docs/tasks/任务索引.md` 的 TASK-037 行写 `READY`，而 `TASK-037-extension-baseline.md` 的 TOML 写 `status = "IN_PROGRESS"`。**
   触发：读索引判断任务阶段时。影响：两处治理记录自相矛盾；`validate_governance` 不做这项交叉校验，机器抓不到。最小修复：EVIDENCE 写回时一并把索引行改为与最终状态一致（status 与本任务索引行都在证据段允许改动的范围内，零成本）。

**可选建议：**

3. `docs/tasks/TASK-037-extension-baseline.md` 非目标段写「不申请 host permissions 之外的权限」，字面读起来允许 host_permissions；而实现与 `README.md` 均称 manifest **不申请任何权限**，`manifest.test.ts` 的门闩也锁在「无权限」。记录比实物宽松，建议改为「不申请任何权限」以免日后被援引为已授权。
4. `extension/package.json:13` 的 `lint` 无 `--max-warnings=0`，ESLint 仅 warning 时退出 0。与 `frontend` 先例一致，属既有约定，仅提示。
5. `README.md` 新增的 Chrome 加载步骤以肯定语气陈述，而任务记录「已知限制 4」如实声明该步骤**未经实机验证**。披露充分、不构成隐瞒；若愿意可在 README 加半句「首次加载请确认」。

### 覆盖与缺口

已覆盖：`check_task.py` 全文的组选择/命令分派/退出码聚合/输入完整性守卫、`test_check_task.py` 的断言锁定力（含反证推演）、`extension/AGENTS.md` 逐条对根底线比对、治理文档检查组清单与脚本实际命令的一致性（`:41` 与 5 条命令逐条相符，不多承诺不少列）、TASK-036 状态收尾改动的合法范围（仅 status 行 + EVIDENCE 区一条 + 索引本行，符合根 §5/§6）、候选版任务记录对 `validate_governance` 的手工过检、以及补投的 script 名/退出语义接缝。

未覆盖（**归 B 部分**）：`extension/` 源码、`src/manifest.ts` 与 `manifest.test.ts` 的门闩强度、popup 诚实性、A3 前端文案与 `ResourcePages.test.tsx`、`package-lock.json`/`tsconfig`/`eslint.config.js` 内容。本报告对 `extension/package.json` 与 `vite.config.ts` 的引用**仅限于判断门禁命令是否落空**，未审其工程质量。另：README 中「`manifest.test.ts` 会在新增权限时失败」这一断言的真伪须由 B 确认，我只核了它与任务记录的变异证据自洽。

### 剩余风险

1. 门禁对 npm 生态的信任止于 script 名；脚本体的改动（如把 `format:check` 改成写盘）**只**被 `check_task.py:403-407` 的输入完整性守卫兜住，`test_profiles_never_install_or_format_source` 兜不住。当前无缺陷，但若日后有人放宽那条守卫，两道防线会同时失效。
2. 检查证据绑定 `5e7ef25`；`f91dbbe` 的唯一增量（任务记录文档）由本次人工核验覆盖，未再跑机器检查。
3. 本仓库无 CI，`check_task.py` 是唯一自动门禁——这一点放大了上述第 1 条的长期重要性，但不影响本候选。

### 结论

`PASS`（附 2 项可记录后继续、3 项可选建议，均已在上文给出处置方向；无阻断项）。本结论仅覆盖 A 部分范围，需与 B 部分报告合并后方构成 TASK-037 的完整 Review。

# TASK-037 Review · B 部分：扩展与前端

## 1. 独立只读身份与权限证据

本实例的工具白名单为 **`Read` / `Grep` / `Glob` 三项只读工具**，运行器层面未授予 `Write` / `Edit` / `NotebookEdit`，也未授予 `Bash`——因此我既不能改文件，也不能执行任何命令（包括 `git`、`npm`、`vitest`）。本次审查为**纯静态审查**：我未重跑任何检查，机械检查证据的核对属 A 部分。我独立于唯一写入者 `coordinator`，无上下文继承。

## 2. 范围

base `32c3750` → candidate `f91dbbe`（工作树 HEAD 即候选，已逐文件交叉验证）。

覆盖 16 文件：`extension/` 的 `.prettierignore`、`.prettierrc.json`、`README.md`、`eslint.config.js`、`package.json`、`popup.html`、`src/manifest.ts`、`src/manifest.test.ts`、`src/popup/main.ts`、`src/popup/popup.ts`、`src/popup/popup.test.ts`、`tsconfig.json`、`vite.config.ts`；`frontend/src/features/resources/` 的 `ContentSnapshot.tsx`、`ResourceDetail.tsx`、`ResourcePages.test.tsx`。另读只读参照 `frontend/package.json`、`frontend/src/features/resources/api.ts`、`fixtures.ts`、`FileOriginal.tsx`、`.gitignore`、`extension/dist/manifest.json`（构建产物，未纳入 Git）。

## 3. 依赖独立核对：通过

逐项比对 `extension/package.json` 与 `frontend/package.json`：`@eslint/js` 10.0.1、`@types/node` 24.13.3、`eslint` 10.9.1、`globals` 17.12.0、`prettier` 3.9.6、`typescript` 6.0.3、`typescript-eslint` 8.69.0、`vite` 8.2.2、`vitest` 4.1.11 —— **9/9 完全同版本**，`engines` 亦一致（node >=24 <25 / npm >=11 <12）。**无新包、无版本分叉、`dependencies` 为空**（无任何生产依赖）。实现者的自陈属实。我未读 `package-lock.json`。

## 4. Findings

### 必须修复（阻断）· 1 项

**F1 — `extension/src/manifest.test.ts:183-191`：权限门闩是黑名单，挡不住它自称挡住的东西。**

该断言只否定三个键：

```ts
expect(declared.permissions).toBeUndefined()
expect(declared.host_permissions).toBeUndefined()
expect(declared.content_scripts).toBeUndefined()
```

**它实际的保护范围**：仅这三个安装期键。以下真实 MV3 键**加进去后测试全绿**：

- **`optional_permissions` / `optional_host_permissions`** —— 运行时经 `chrome.permissions.request()` 授予，是 MV3 里申请 `activeTab`／主机访问的**惯用做法**，也正是本扩展"下一步做采集"最可能走的路；
- **`externally_connectable`** —— 携带 host pattern，允许列出的网页向扩展发消息。**本模块自己选定的架构（"不直连 `/api/v1`，经本机 UI 页面 `http://127.0.0.1:5173` 转交"，见 `extension/AGENTS.md:20`、`README.md:29`）几乎必然要用到它**；
- **`web_accessible_resources`**（含 `matches` 主机模式）、**`content_security_policy`**（放宽 `extension_pages` 即可加载远程代码，MV3 典型审查失分点）、`background`、`declarative_net_request`、`devtools_page`、`chrome_url_overrides`。

至于"换字段名"：那不是有效绕过——Chrome 只认真实键名，改名等于放弃权限。真正的绕过面是上面这些**真实的别处键**。

`manifest.ts` 的闭合类型 `Manifest`（5 字段）确实是第二道软闸（对象字面量的 excess property check 会挡住直接加键），但扩展该类型只需在同一文件加一行，**没有任何测试观察类型**，因此不构成门闩。

**之所以判为阻断，而非理论完备性**：本任务的交付物**本身就是这道门闩**——`README.md:30` 写"`src/manifest.test.ts` 对此设有门闩"，`manifest.ts:1-7` 注释写 "`manifest.test.ts` fails if this file grows either field, which is the point"。下一个实现者会读到这两句、合理地认定权限受测试保护，然后加 `optional_permissions` 或 `externally_connectable` 看到全绿。这是**具体、近在眼前、由本模块既定架构直接指向**的失效路径，且修复成本一行。

**最小修复**（把黑名单换成白名单，任何新增顶层键都会响）：

```ts
expect(Object.keys(manifest).sort()).toEqual(
  ['action', 'description', 'manifest_version', 'name', 'version'].sort(),
)
```

（可接受的替代解：保留现断言，但同步把 `README.md:30` 与 `manifest.ts` 注释改成如实陈述"门闩只覆盖 permissions / host_permissions / content_scripts"。补断言更便宜也更好。）

### 可记录后继续 · 2 项

**F2 — `frontend/src/features/resources/ResourcePages.test.tsx:466-489`：6 条新断言锁住了"哪种资料显示哪句话"，但没有一条锁住"方位词说得对不对"。**

针对派发方与实现者的具体提问，逐条给结论：

- **作用域**：3 条否定式全部作用于 `region = screen.getByRole('region', { name: '正文快照' })`，即 `ContentSnapshot` 那一个 `<section>`，**不是整页**。作用域是紧的，因此**这 3 条不是恒真断言**——`打开原网页` / `只存链接的话` / `上方` 在 region 内只可能来自 hint 字符串本身。就"防恒真"这一点，实现者做得没问题，与此前那次 e2e 搜索词恒真不是同一类问题。
- **双向锁**：只有单向。否定式只覆盖"WEB 专属文案不得出现在 PASTE/FILE"，没有反向（PASTE 的「粘贴原文」未被断言在 WEB/FILE 下缺席）。所以 FILE 误显示 PASTE 文案这一路径未被否定式覆盖。
- **与实现者看法相反的一点，请注意**：真正咬住 source→文案映射的**是 3 条肯定式**，不是否定式。三条 hint 互不包含（`下方的「打开原网页」`／`下方的「粘贴原文」`／`下方的原件`），组件只渲染一条字符串，因此任何错配都会让**肯定式**失败。否定式在此基础上基本是冗余备份；其中只有 `not.toHaveTextContent('上方')` 提供了额外价值（禁止旧 bug 原词复活），而那也只是单串黑名单——文案若改成"请用**右侧**的…"（同样错误）依旧通过。
- **最关键的一问，答案是：没有。一条都没有。** 全部 6 条断言都被限制在 region 内，而它们所指的三个目标（「打开原网页」链接、「粘贴原文」区块、原件区块）全都在 region **之外**，没有任何一条断言去查询这些目标、断言它们存在、或比较文档顺序。

  派发方举的"把 下方 改回 上方 会不会通过"这一例**会失败**——但**是因为错的原因**：肯定式里硬编码了生产文案的副本 `'下方的「打开原网页」'`，字符串对不上了，**不是因为测试知道链接在哪里**。

  决定性反例：**把 `ResourceDetail.tsx:102-121` 的「原始网页」区块移到 `:97` 的 `<ContentSnapshot>` 之上（或整块删掉）** —— 文案「下方的「打开原网页」」立刻重新变成假话，正是 TASK-036 那个 bug 的同类复发，而**这 6 条测试全部通过**。同理适用于 PASTE、FILE。

  **如实结论**：本次修复相比 TASK-036 是**真实进步**——它第一次把文案绑定到了 `sourceType`（那正是被修的 bug），这一点确实做到了。但它**没有闭合** TASK-036 独立 Acceptance 点名的那个盲区本身："测试能验证文案渲染出来了，验证不了它指的方向对不对。"方位断言的真值目前**只由 `ResourceDetail.tsx` 的源码顺序保证，没有任何断言看守**。

  **最小修复**（约 6 行，无新依赖，在既有 `it.each` 里按 source 取目标）：

  ```ts
  const target: Record<string, () => HTMLElement> = {
    WEB: () => screen.getByRole('link', { name: /打开原网页/ }),
    PASTE: () => screen.getByRole('heading', { name: '粘贴原文' }),
    FILE: () => screen.getByText(/原件已保存/),
  }
  // 「下方」是一句关于版面的陈述：被指向的东西必须真的排在快照区块之后。
  expect(region.compareDocumentPosition(target[source]()) & Node.DOCUMENT_POSITION_FOLLOWING)
    .toBeTruthy()
  ```

  **风险判据与定级**：F2 本身的实际影响是文案误导（认知成本），无数据、无安全后果；错配 bug 已被肯定式真实覆盖；版面重排的发生可能中低。故判**可记录后继续**，不阻断。**但有一个条件**：若任务记录 / EVIDENCE 声称"TASK-036 的方位盲区已闭合"或"新增断言验证了文案属实"，该说法**不成立**，此时须二选一——补上面 6 行，或把措辞改成"已锁定 sourceType→文案映射，方位真值仍未被断言覆盖"。**不得让覆盖声明超出证据**。

**F3 — `extension/README.md:47-53`：加载步骤以既成事实的语气写出，但从未在真实浏览器验证过。**

已知限制第 4 条本身（见下 §6 判断）不阻断，但 README 把三步加载流程写成确定事实，未标注未验证。最小修复：在第 47 行标题下加一句「以下步骤尚未在真实 Chrome 中实机验证」。

### 可选建议 · 2 项

- **S1 `extension/tsconfig.json:5` `"types": ["node"]` 全局生效**，而 `eslint.config.js:73-83` 已正确区分 browser / node 作用域。结果是 popup 运行时代码里写 `process.env` 也能通过 `tsc --noEmit`，却在扩展沙箱中不存在。当前无实际影响（popup 只设一个 textContent），建议后续把 node 类型收敛到 `vite.config.ts` 与 `*.test.ts`。
- **S2 `extension/package.json:106` `"test": "vitest"` 默认 watch**。README 用 `npm run test -- --run` 规避。这与 `frontend/package.json:16` 的约定一致，故不作为缺陷；仅提示：若门禁脚本在非 CI 环境直接 `npm run test` 会挂起。

## 5. 无 finding 的核查项（已逐条验证）

- **扩展越权面为零**：`extension/src/` 全量 grep `fetch|XMLHttpRequest|http://|https://|chrome\.|browser\.|localStorage|cookie` —— **零命中**（仅注释与 md 提及）。popup 不发任何网络请求、不直连 `/api/v1`、不接触任何第三方站点凭证。`popup.html` 无外部资源（内联样式 + 本地 module script）。**根 AGENTS 的这条底线在代码层是真的做到了，不只是规则文本。**
- **实际产出的 manifest 独立核对**：`extension/dist/manifest.json`（gitignore 覆盖 `dist/`，未提交，是实现者真跑过 `npm run build` 的旁证）只含 5 个键，无 `content_scripts`、无 `web_accessible_resources`、无 CSP 覆写、无 `background`。未声明 CSP 即沿用 MV3 默认 `script-src 'self'`，远程代码不可加载。**候选当前的攻击面确为零。**
- **单一事实源成立**：`vite.config.ts:317-326` 的 `generateBundle` 由 `src/manifest.ts` 生成 manifest，测试断言的是构建所用的同一模块，仓库内无第二份副本（Glob 仅命中未跟踪的 `dist/`）。版本漂移由 `manifest.test.ts:170-177` 对 `package.json` 的比对锁住。
- **文案属实性（DOM 存在性维度）**：`ResourceDetail.tsx:97` 之后依次是 WEB 原始网页（102-121）、PASTE 粘贴原文（122-130）、FILE `FileOriginal`（131-133），**三者均在快照下方，「下方」在当前候选下属实**。我曾怀疑 FILE 的 `original_file` 可空会让「下方的原件」落空，但 `api.ts:171` `if ((source === 'FILE') !== (file !== null)) return invalid()` 在 API 边界强制二者等价，**该边界不成立，不是 finding**；`FileOriginal.tsx:69/87` 确有「原件」字样。
- `popup.ts` 不提供无效按钮（诚实空态），`main.ts` 对 `#status` 做了 null 检查。

## 6. 已知限制第 4 条（扩展从未实机加载）——直说：**不应阻断**

按「实际风险」四问：

- **确认的使用场景**：本候选没有用户使用场景。它不面向终端用户发布，无商店条目，唯一使用者是下一个采集任务的实现者。
- **影响**：最坏情况是 Chrome 拒绝加载该 manifest，或 README 三步有出入。无用户数据风险、无安全风险、无生产面——因为它零权限、零网络、零 content script，运行时行为只有"给一个文本节点赋值"。
- **发生可能与发现成本**：若真有问题，下一个打开 `chrome://extensions` 的人 30 秒内就会撞上，且损失仅为那 30 秒。同时 manifest 的结构正确性已被闭合类型 + 4 条测试 + 真实构建产物部分固定。
- **修复/验证成本**：实机验证需要人拿着 Chrome 操作，**任何 Agent 都无法执行**。以此阻断，等于给一个实际风险面为零的 L3 设一道 Agent 无法解除的闸。

**结论：可记录后继续**，条件是该限制在任务记录中如实保留，并按 F3 在 README 标注加载步骤未经验证。把未验证的东西写成已验证，比未验证本身更值得纠正。

## 7. 覆盖与缺口

- **A 部分不在我的范围**：`scripts/governance/check_task.py` 门禁逻辑、`extension/AGENTS.md` 规则文本、任务记录叙述，均由并行的 A 实例负责，我未审、亦未据其下结论。需注意 F1 与 A 的规则文本存在耦合：`extension/AGENTS.md` 若声称权限受自动门禁保护，A 应据 F1 复核该措辞。
- **未读 `extension/package-lock.json`**（2452 行，按派发指示排除）。依赖结论来自我对 `extension/package.json` 与 `frontend/package.json` 的逐项独立比对，以及派发会话用 `git show f91dbbe:extension/package.json` 的核实；**锁文件与 package.json 的一致性、传递依赖树、完整性哈希我未验证**。
- **未执行任何命令**（无 Bash）。所有测试是否真的通过、`npm ci` / `build` / `lint` 的实际退出码，我未验证；这属检查证据核对，归 A 与主 Agent。
- 未审 `docs/research/`（用户文件）、openapi `x-delivery-profile`（明示非目标）。

## 8. 剩余风险

1. **F1 未修则残留**：下一个采集任务经 `optional_permissions` 或 `externally_connectable` 引入权限而门闩静默通过，且实现者有理由相信自己被保护着。这是本次审查中唯一有安全性质的残留项。
2. **F2 未修则残留**：`ResourceDetail` 版面重排会让三条方位文案重新变成假话而测试无感——即 TASK-036 已诊断出的那个盲区仍然开着（尽管开口比之前小了）。
3. 扩展在真实 Chrome 中的行为完全未知（已按 §6 接受）。
4. 锁文件内容未经我独立验证。

## 9. 结论

**CHANGES_REQUIRED**

唯一阻断项是 **F1**（`manifest.test.ts` 权限门闩为黑名单，与 README / 源码注释所宣称的保护范围不符），最小修复为一行白名单断言。F2 / F3 记录后可继续，**但 F2 附带一个硬条件：任务记录不得声称 TASK-036 的方位盲区已闭合**——按本次候选，它没有闭合。其余部分（依赖无分叉、扩展零越权面、popup 不直连后端不碰凭证、文案与实际版面一致、单一 manifest 事实源）**核查通过**。

- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 第一轮 findings 的处置（代码修订 SHA **`984b2f4`**）：
  - **F1（阻断）→ 已修，两处一起改**。① 断言由黑名单改白名单：`expect(Object.keys(manifest).sort()).toEqual(['action','description','manifest_version','name','version'].sort())`，任何新增顶层键都会失败。② 同步改准三处超宣措辞：`extension/README.md`（原写「新增权限……对此设有门闩」，"权限"是全称而门闩只覆盖三键）、`extension/src/manifest.ts` 注释（原写 "fails if this file grows either field"，指代不清且范围过窄）、`extension/AGENTS.md` §3（原文逐字点名三个键、**措辞本身准确**，但门闩变宽后同步扩写为「任何新增键」，并说明为何用白名单而非逐个点名）。**采纳 Reviewer 给的"补断言更便宜"但不采纳其"二选一"**：断言防的是新增键，措辞防的是「下一个人误以为受更宽的保护」，两者挡的不是同一个洞。变异验证：`optional_permissions` 与 `externally_connectable` 在旧断言下全绿，在白名单下各自 1 failed / 4 passed。
  - **A 可选建议 3（与 F1 同源，主 Agent 提为必改）→ 已修**。任务记录非目标段原写「不申请 host permissions 之外的权限」，字面等于预先允许 host_permissions，与实现和 README 均不符，收紧为「不申请任何权限」并在原处注明收紧缘由。**这三者叠加（记录比实物宽松 + 门闩比宣称宽松 + README 宣称有保护）是合读 A 与 B 才成立的结论，单看任一份报告都得不出。**
  - **F2（非阻断，附硬条件）→ 选择修，不选择改措辞**。在两组 `it.each` 中各加一条 `compareDocumentPosition` 断言，把方位词与 DOM 实际顺序绑成一条。**对 Reviewer 的锚点建议做了改进**：它给 FILE 用 `getByText(/原件已保存/)`，改为三处统一 `getByRole('region', { name })`（`原始网页` / `粘贴原文` / `原始文件`，分别来自 `ResourceDetail.tsx:103`、`:123` 的 `aria-labelledby` 与 `FileOriginal.tsx:61` 的 `aria-label`）—— 可访问名是结构性的，文本匹配会随文案改动而脆。变异验证用的正是 Reviewer 给的决定性反例：**文案一字不改**，只把 `<ContentSnapshot>` 移到三个来源区块之后 —— 修复前六条全绿，修复后 6 failed / 33 passed。
  - **F3（非阻断）→ 已修**。`extension/README.md` 的加载步骤前加明确标注「以下步骤尚未在真实 Chrome 中实机验证」并说明已验证的到底是什么；根 `README.md` 对应段落加「首次加载请确认」（A 可选建议 5）。
  - **A 可记录项 2（索引状态不一致）→ 已修**。`docs/tasks/任务索引.md` 的 TASK-037 行与记录 TOML 的 `status` 已对齐。
  - **A 可记录项 1（`validate_governance.py` 第二份硬编码清单）→ 不修，记为遗留**。见下「非阻断遗留项」。采纳 Reviewer 自己的判断：该文件不在本任务 `allowed_paths` 内，发现问题不等于有权顺手修。
  - **A 对完成条件 4 的覆盖归因修正 → 按其措辞记录，不改完成条件**。`test_profiles_never_install_or_format_source` 锁的是 argv 字面 token，看不见 npm script 的脚本体；真正守住「检查期间不写回源码」的是 `check_task.py:403-407` 的输入完整性守卫。**这是覆盖归因问题，不是安全缺口**——约束确实被守住了，只是守它的不是被引用的那条断言。**不修改完成条件 4 的文字**：事后改写完成条件以匹配已交付物，与「降低断言来通过检查」只有一线之隔；如实记录归因更诚实。
  - **B 的 S1（`types: ["node"]` 全局）→ 不做，见遗留项**。**S2** 与 frontend 既有约定一致，不是缺陷，不动。
  - **覆盖声明的自我约束**：处置 F2 后，本记录**不声称**「TASK-036 的方位盲区已闭合」。事实陈述是：本次补了 DOM 顺序断言，Reviewer 给出的决定性反例由全绿转为六条全红；**是否真正闭合由独立复核判定，不由实现者自己宣布**。
- 审查过程本身的证据（按 Reviewer 与派发会话的一致意见，失败也是证据）：第一个 Reviewer 实例**连续三次被 watchdog 中断**（各 600s 无输出）。第一次中断前它留下一句「Confirmed a concrete drift already」，**但没来得及说是哪一处，且无任何可用输出，已无从追回**。派发会话据根 `AGENTS.md` §7 停止无界重试，换两个全新实例分范围重审。**若那处 drift 真实存在，A/B 两路应当会重新发现；两路均未提及，也不能据此断定它不存在。此为本轮 Review 的一处遗留不确定性，不作已澄清处理。** 根因判断：本任务 diff 3348 行中 `extension/package-lock.json` 独占 2452 行，对审查无信息价值却撑大了输入；后续引入生成物的任务应在登记时就把锁文件排除写进上下文包，另附直接依赖清单供核。
- 非阻断遗留项：
  - **（L1）`scripts/governance/validate_governance.py` 存在第二份硬编码检查组名单，未含 `extension`**。影响：任何任务若在 TOML 显式写 `checks = ["extension"]`，`validate_task` 会报 `unknown or missing check groups`，且因 `validate()` 遍历全部 `TASK-*.md`，一份这样的记录会让治理组对所有任务失败。**方向是「误红」不是「漏绿」，不削弱门禁**；extension 组由路径自动选中、不依赖显式声明，故当前无实际损害。暂不修的理由：该文件不在本任务 `allowed_paths` 内。责任角色 coordinator；**重评触发条件：下一个触及 `scripts/governance/**` 的任务必须一并修**（把 `"extension"` 加入该元组），或有人真的写了 `checks = ["extension"]` 时立即修。
  - **（L2）`extension/tsconfig.json` 的 `types: ["node"]` 全局生效**，popup 运行时代码里误用 `process.env` 也能通过 `tsc --noEmit`。当前无实际影响（popup 只设一个 textContent）。暂不修的理由：改类型作用域会改变整个工程的 typecheck 范围，可能翻出与本任务无关的问题，收益不抵风险。责任角色 coordinator；重评触发条件：TASK-038 引入真实 chrome API 类型时一并收敛。
  - **（L3）扩展从未在真实浏览器中加载过**。已验证的只是构建产物形状（`dist/` 下有 `manifest.json`、`popup.html` 与 JS 资源，manifest 为合法 JSON、`manifest_version: 3`、`default_popup` 指向确实存在的文件）。Reviewer 判定不应阻断（零权限、零网络、零 content script，实机验证任何 Agent 都无法执行，以此阻断等于设一道 Agent 无法解除的闸）。**须用户首次按 README 加载时确认**；README 已标注该步骤未经实机验证。
  - **（L4）第一轮 Reviewer 提及但无从追回的那处 drift**，见上「审查过程本身的证据」。
  - **（L5）A4 未做且仍在恶化**：`openapi-v1.json` 的 `x-delivery-profile` 停在 `stage: "TASK-022"`，`available_operations` 35 项 vs 实际 47 个 operationId，缺 12 项，且 `backend/tests/test_taxonomy.py:485` 硬编码 `len(available) == 35`。本任务明示非目标。责任角色 coordinator；重评触发条件：应作为独立任务处理，且其修法不应只是补回 12 条，而要加一个漂移守卫测试。
  - **（L6）`docs/research/阅读器与标注能力调研.md` 仍未纳入 Git**，而 TASK-036 的上下文包引用了它，从 Git 检出工作的 Reviewer 看不到被引用的内容。属用户文件，本任务不处理。
- 日期与决定日志：2026-09-06 用户批准拆分方案（「同意，登记 TASK-037」），并在此前明确选定顶层目录位置（「使用独立顶层目录 extension/ 吧，万一以后还需要拓展其他的功能，可以同样放进 extension，不然全放 frontend 是否会越来越乱？」）。拆分理由：扩展代码要被自动检查覆盖，`extension` 检查组必须先存在；若与扩展实现打包，Worker 会在同一个 diff 里既写扩展代码、又发明验证它的检查组，冻结时「检查通过」就失去独立含义。主 Agent 另将 A4 排除在外，理由是其正确修法是补漂移守卫而非补回清单，属独立测试故事。第一轮 Review 因单实例三次中断改为 A/B 分范围并行；派发会话的拆分一度在「门禁调用的 script 名」与「script 的定义」之间留下跨边界盲区，经主 Agent 指出后补投 `extension/package.json` 给 A 部分闭合。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
