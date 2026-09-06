# TASK-037：`extension/` 顶层工程基线与 `extension` 检查组

```toml
schema_version = 2
id = "TASK-037"
status = "ACCEPTED"
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

  **该检查的运行环境须如实说明**：主工作区因存在**未跟踪**的 `docs/research/`（用户在另一会话创建、至今未纳入 Git）而不满足脚本的 `git status --porcelain` 干净要求，全套检查会以 `FAIL: full checks require the candidate checked out with a clean worktree` 拒绝执行。未改动、未移动、未提交该用户文件；改为 `git worktree add` 一个**独立干净的 worktree** 检出被测提交后在其中运行 —— **第一轮检出 `5e7ef25`、处置后检出 `984b2f4`，两次都走同一条路径、都在独立干净 worktree 中运行**（上文「任务检查（全套，最终）」那次 CHECKS PASS 即第二次，跑在 `984b2f4` 的干净检出上）。该 worktree 需要一个符合 `agent/<role>/TASK-\d{3,}-.+` 的分支名（脚本拒绝 detached HEAD），故各建了一个临时本地分支（`...-baseline-check` 与 `...-baseline-check2`）；它们只用于跑检查，不含任何提交差异，不推送，检查后连同 worktree 一并删除，`.git/info/exclude` 中为符号链接临时添加的一行也已移除。`backend/.venv` 以符号链接引入该 worktree（Python 工具链），`frontend/`、`extension/` 各自 `npm ci`。**这一路径比在脏工作区里跑更严格**：它同时证明了提交出去的树在全新检出下自足（`npm ci` 依锁文件安装即可通过全部检查）。

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

- 候选 SHA：第一轮候选 **`f91dbbe`**（代码 `5e7ef25`，base `32c3750`）。经第一轮 Review 处置后的代码修订 SHA 为 **`984b2f4`**；第二轮 Review 候选 **`ec68f5c`**；**最终验收候选 `1e335acaefb4f46e86bae72a5e4f0468c49620b0`**（`product_fingerprint=bd485b941e85561d06207f3f27d8c52b9eb61a660daf557fc4aed99c6ddcdae4`，自 `984b2f4` 起三个候选**指纹一致**）。`git diff --name-only 984b2f4..ec68f5c` 输出**只有 `docs/tasks/TASK-037-extension-baseline.md` 一个文件**（主 Agent 与派发会话各自用 git 独立核实；索引的状态变更发生在 `984b2f4` 提交内部，不在该区间）。机制依据：`scripts/governance/check_task.py:359` 的 `if path not in {args.task, "docs/tasks/任务索引.md"}` —— 任务记录与索引**均不计入 `product_fingerprint`**，故无论两者落在哪个提交，指纹都相同，「检查在 `984b2f4` 通过 ⇒ 结论可代表候选」这条推理成立。`ec68f5c..1e335ac` 为**纯文档增量**（本任务记录 + 索引），但其中处置 A Finding 1 的那一处落在「实现与测试」段、即 EVIDENCE 标记区**之外**，故按 §6 形成了新候选 `1e335ac` —— **此句初版写作「其后另有一次纯 EVIDENCE 写回」，是错的**，经独立 Acceptance（F-a）指出后更正；同一句的候选 SHA 也一并从 `ec68f5c` 更新为 `1e335ac`。本条所在提交是 `1e335ac` 之后的 Acceptance 写回，**这一次确为纯 EVIDENCE**（标记区外仅 `status`），不形成新候选。
- Review（第一轮，L3 独立只读，`32c3750..f91dbbe`）：**整体 CHANGES_REQUIRED**（A 部分 PASS + B 部分 CHANGES_REQUIRED，按「任一为 CHANGES_REQUIRED 则整体 CHANGES_REQUIRED」计）。因单实例连续三次被 watchdog 中断（详见下方「审查过程本身的证据」），改由**两个全新只读实例并行分范围审查**，两份并集为完整 diff（除 `package-lock.json`）、无重叠。两份报告原文如下，未作任何压缩或改写。

  **关于报告中的行号（主 Agent 附注，报告原文未改）**：**B 部分**报告引用的行号系其所收 patch（派发会话生成的 `T037-B-code.patch`，493 行）的**文件内行号**；**A 部分报告的行号为源文件行号**（该实例直接读取工作树文件）。此处初版曾把适用范围误写为「两份报告」，经 A 部分增量复核指出后更正。B 的四条对应关系：`manifest.test.ts:183-191` → `extension/src/manifest.test.ts:28-36`（三条 `expect` 在 :33/:34/:35）；`README.md:47-53` → `extension/README.md:19-25`；`vite.config.ts:317-326` → `extension/vite.config.ts:10-19`（初版误写 `:10-13`，结束行截短，经 B 指出后更正）；`ResourcePages.test.tsx:466-489` → `frontend/src/features/resources/ResourcePages.test.tsx:595-616`（±1 行内）。**按两位 Reviewer 的一致建议，本映射定位为「导航辅助」而非精确引用**——它自身已出过两处不准确，读者应以报告正文引用的代码内容为准、以行号为线索。

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

- Review（第二轮增量，L3 独立只读，`f91dbbe..ec68f5c`，A / B 各由**第一轮同一实例**复核并显式声明继承范围）：**整体 PASS**（A PASS + B PASS），第一轮的 CHANGES_REQUIRED 已解除。两份报告原文如下。

# TASK-037 Review · A 部分增量复核

## 独立只读身份与权限证据
工具白名单仍仅 `Read` / `Grep` / `Glob`；无 `Write`/`Edit`/`NotebookEdit`，无 `Bash`。本轮未写入、未提交、未推送、未执行任何命令。所有机械证据（`CHECKS PASS`、`product_fingerprint=bd485b94…`、六项变异验证、三组测试数）**按 NOT_RUN 处理**：我未复现、无第三方复核，下文凡引用均标注为实现者自述。

## 范围与继承声明
previous_candidate `f91dbbe` → **new_candidate `ec68f5c`**（代码修订 `984b2f4`）。本轮实读：增量 patch 全文（360 行）、`extension/src/manifest.test.ts`、`extension/src/manifest.ts`（为核验 A 范围内 `AGENTS.md`/`README.md` 措辞所援引的实物）。

**显式继承第一轮 A 部分的全部其余覆盖**：`check_task.py` 全文（组选择、`commands()` 分派、退出码聚合、`:403-407` 输入完整性守卫、边界判定）、`test_check_task.py` 断言锁定力与其反证表、`docs/governance/风险分级与检查规则.md:41` 与实际命令的逐条相符、`extension/package.json` 五个 script 名的存在性与非零退出语义、`docs/tasks/TASK-036-content-snapshot.md` 状态收尾的合法范围、独立 worktree 路径的判定（不构成规避）。上述结论在本轮**继续有效**，依据是你已用 git 核实 `check_task.py` 与 `test_check_task.py` 在 `f91dbbe..ec68f5c` 中零改动，且我在增量 patch 中确认无这两个文件的 hunk。

我另独立核对了增量 patch 的 hunk 边界：TASK 记录仅有 6 处 hunk（`status`、非目标一条、实现 SHA 行、检查行、变异验证段、EVIDENCE 区），**`目标`、`完成条件`、`allowed_paths`、`risk`、`risk_flags`、`checks`、`上下文包`、`准确命令`、`已知限制` 全部未被触碰**——与你的抽取结果一致。

---

## 第一轮 findings 的处置核对

| 第一轮项 | 处置 | 我的核对 |
|---|---|---|
| 可选建议 3（非目标措辞） | 已修 | ✅ 见下专项 |
| 可记录 1（`validate_governance.py` 第二份清单） | 不修，记为遗留 | ✅ 认可，且遗留条目写明了重评触发条件与责任角色，符合风险分级文档第 29 行的要求 |
| 可记录 2（索引 `READY` vs 记录 `IN_PROGRESS`） | 已对齐为 `IN_REVIEW` | ✅ 两处一致；`IN_REVIEW` 亦满足 `validate_governance.py:230`（L3 含 review 阶段） |
| 完成条件 4 覆盖归因 | 记录归因，不改条文 | ✅ 见下专项 |
| 可选建议 4（`lint` 无 `--max-warnings=0`） | 未单独处置 | 可接受——可选建议按规则"不要求修复、不发起返工循环" |
| 可选建议 5（README 加载步骤未验证） | 已加"这套加载步骤尚未在真实 Chrome 中实机验证，首次加载请确认" | ✅ 与「已知限制 4」一致 |

**非目标措辞收紧是否真的与实现和 README 一致 —— 是，三方逐字对齐。** 记录现写「**不申请任何权限**」；`manifest.ts:23-32` 实际声明的顶层键为 `manifest_version`/`name`/`version`/`description`/`action` 五个，**无任何 `permissions` 系列键**；根 `README.md` 写「当前 manifest **不申请任何权限**」。三者一致，且新措辞在原处保留了旧文并注明收紧缘由，可审计性完好。

**顺带核实 `extension/AGENTS.md` §3 的新措辞（A 范围内的规则文本）**：它现称「`src/manifest.test.ts` 断言 manifest 的顶层键**恰好是既定的五个**，任何新增键都会让它失败」。实物 `manifest.test.ts:28-40`：`expect(Object.keys(manifest).sort()).toEqual(['action','description','manifest_version','name','version'].sort())`。**不多不少，宣称与实物精确相符**——这正是第一轮我留给 B 的那条耦合（"若 AGENTS.md 声称权限受自动门禁保护，应据 F1 复核该措辞"）的闭合。新措辞把受管键从 3 个扩到"任何 reach ……等"并加"不得删除**或放宽**断言"，方向是**加严**，未放宽根 `AGENTS.md` 任何底线。

---

## 三个必答的治理判断（据 §6 原文，逐条直说）

### 判断一：候选提交同时更新「实现与测试」段 —— **不构成越界写回，我同意实现者的判断，但理由要说准**

§6 的禁令原文是「**审查后仅可**更新同任务的 status 和 EVIDENCE 标记区……实现与测试记录在标记区外，**禁止借证据写回变更它们**」。该句的约束对象是**证据写回这一动作**：它防的是「一次名为记录 Review 结果的提交，顺手改掉被冻结的授权/实现/测试叙述」。

而 §6 同段另有两条原文，方向相反且在此处优先：
- 「**冻结候选必须是包含需求、实现与测试证据的已提交 SHA**」；
- 「**任何实现/契约/配置/测试/任务授权修订形成新候选**，使旧结论不能直接代表新 SHA」。

代码在 `984b2f4` 被真实修订 → 依第二条形成新候选 → 依第一条，新候选**必须**携带与之匹配的实现与测试证据。若此时冻着不许改「实现与测试」段，冻结候选里就会写着一个已被取代的实现 SHA 和一个已失效的指纹——那才是真正的伪证。所以此处更新该段不是"借证据写回改冻结区"，而是"新候选重新冻结"。

**但这条推理只在一个前提下成立，我逐项验了这个前提：更新必须是增补与更正，不得是删除或软化。** 核对结果：① 实现 SHA 行——新值 `984b2f4` 在前，旧值 `5e7ef25` 原文保留并注明"经第一轮 Review 的 F1/F2/F3 处置后被取代"；② 检查行——最终值另起一行，第一轮的命令、指纹 `8a50315d…` 与日志文件名**整条保留**，标注"已被取代，仅备查"；③ 变异验证——原三项**一字未改**，新增第 4/5/6 项并把标题从"三项"改为"第一轮三项 + 处置后三项，共六项"。**无任何历史证据被删除、改写或降级**。这一形态可被后续 Acceptance 或用户逐条回溯，符合"不得隐藏测试失败/不得伪造结果"的底线。

### 判断二：非目标段措辞收紧 —— **属允许的修订，方向正确，且处理方式（原处注明旧文与缘由）值得沿用**

非目标确属授权面，也确在冻结区。但同样落在"任务授权修订形成新候选"的明文许可内：它形成了新候选、进入了独立复核、并且**我正在审它**——§6 要求的全部程序都走到了。

真正该问的是方向。判据我这样定：**授权面的修订只有在"收窄"且"不为已交付物追认合法性"时才安全。** 本例两项都过：① 从"预先允许 host_permissions"收到"不申请任何权限"，是收窄，收窄绝不可能放行未经审查的产品变化；② **实现并未随之改动去迎合新措辞**——`manifest.ts` 从第一轮起就是零权限，是**记录向实物对齐**，不是实物向记录对齐。若方向反过来（为了让已经写进去的 `host_permissions` 合法而扩写非目标），那就是事后追认，必须回到用户授权，我会判阻断。这条区分请写进本任务的决定日志，它比本次结论本身更有复用价值。

### 判断三：完成条件 4 不改条文、只记录归因 —— **处理恰当，我作为该修正的提出者明确背书**

三条理由：
1. 完成条件是冻结的授权面。**事后改写完成条件以匹配已交付物，与"降低断言来通过检查"在机制上无法区分**——两者都是"让标尺去适应结果"。实现者的这句自我约束是对的，我不打算因为改动方向"诚实"就为它开例外。
2. 实质门禁未被削弱：约束本身（检查期间不写回源码）**确实被守住了**，只是守它的是 `check_task.py:403-407` 的输入完整性守卫，而非被引用的那条断言。这是覆盖**归因**问题，不是覆盖**缺口**。
3. 保留原文 + EVIDENCE 记录更正，信息量严格大于改写原文：后来者能同时看到"当初的声称"和"复核后的实情"，而改写会把前者永久抹掉。

残余（归 L1 遗留类，不阻断）：完成条件 4 的条文若被**单独摘读**，仍会让人高估那条断言。缓解是同文件 EVIDENCE 区已有更正、且 A 报告的反证表已原文嵌入。真要根治，应由下一个触及治理脚本的任务在**新的**完成条件里正确表述，而不是回头改旧的。

---

## 程序问题：报告原文照贴 + 行号映射另附

**可接受，且放在报告块之前优于放到独立条目——但当前那条附注的事实范围写错了，须改。**

先说可接受的理由：§6 的「L3 独立报告仅允许原文写回」约束的是**报告内容**，不是其周边的编排文字；否则连"以下为 Reviewer 原文"这样的引导句都无法添加。判准应是：附注须(a)明确署名为主 Agent、(b)只增信息不改述、(c)不概括、不评级、不与报告结论相左。当前附注三条都满足，并注明"报告原文未改"、映射"经派发会话逐条核实"。放在报告**之前**也比放在远处的独立条目好——读者会先撞上行号，警示必须早于它出现。

**我另做了一件只有我能做的核验：逐段比对了嵌入的 A 部分报告与我第一轮的实际输出。正文文字、findings、结论逐句一致，无删改、无压缩。** 唯一差异是 markdown 表格分隔行的空格被规范化（`|---|` → `| --- |`），渲染与语义均无变化。就 A 部分而言，**"原文写回"属实**。

**但附注本身有一处事实错误（见 Finding 2）**：它说"两份报告引用的行号系各自所收 patch 的文件内行号"。这对 B 成立，对 A **不成立**——我第一轮是直接读取工作树源文件的，所引 `check_task.py:58-69/236/387/403-407`、`test_check_task.py:106-111`、`extension/package.json:10-17`、`vite.config.ts:28-31`、`risk-policy.json:43`、`validate_governance.py:215-218`、`风险分级与检查规则.md:41` **全部是源文件行号**。这条附注会让读者对一批本来正确的定位产生无谓怀疑，方向恰与它想解决的问题相反。

---

## Findings（本轮增量）

**必须修复（阻断）：无。**

**可记录后继续：**

1. **`docs/tasks/TASK-037-extension-baseline.md`「实现与测试」段的环境说明仍写第一轮 SHA，且未标注「第一轮」，与同段新增的自我约束句直接矛盾。**
   触发：读该段判断最终检查在什么树上跑的。证据：新增句承诺「**本段下方记录的命令与指纹一律是最终值**（`984b2f4` → `bd485b94…`）；第一轮的值只在明确标注「第一轮」处出现」，而紧随其后的环境说明段仍写「改为 `git worktree add` ……**检出候选 `5e7ef25`** 后在其中运行」，无第一轮标注。
   影响：读者无法确定 `--candidate 984b2f4` 的那次 `CHECKS PASS` 到底跑在哪棵树上——而"检查绑定的是不是正确的被测内容"正是本任务全程的核心判据。**这与 TASK-036 的 A1（旧指纹被当作最终值）是同一类缺陷**，而该句恰恰是为纠正 A1 而新加的。
   最小修复：把该处 `5e7ef25` 改为最终值并说明最终检查同样走独立 worktree；若两次都跑过，写成「第一轮检出 `5e7ef25`、处置后检出 `984b2f4`，均在独立干净 worktree 中运行」。**不要只删数字**——路径本身的证据价值应保留。

2. **EVIDENCE 区行号映射附注的适用范围写错。**（详见上一节）
   最小修复：「两份报告引用的行号」→「**B 部分**报告引用的行号系其所收 patch 的文件内行号；**A 部分报告的行号为源文件行号**（该实例直接读取工作树文件）」。四条 B 映射本身不动。

3. **EVIDENCE 区称「`984b2f4` 与该候选之间只差本任务记录一个文件」，但 `docs/tasks/任务索引.md` 的状态行同样在 `f91dbbe..ec68f5c` 中变更，其提交归属我无法用 git 核实。**
   影响：该句是"检查在 `984b2f4` 通过 ⇒ 结论可代表候选 `ec68f5c`"这条推理的承重句，措辞精度直接关系其可核性。**结论本身不受影响**——`check_task.py:359` 的指纹计算同时排除 `args.task` 与 `docs/tasks/任务索引.md`，无论索引落在哪个提交，`product_fingerprint` 都相同。
   最小修复：请用 `git diff --name-only 984b2f4..ec68f5c` 核实后据实改写（若为两个文件，写「只差任务记录与索引两个文件，**两者均不计入 product_fingerprint**」）。同时建议在该处点明"指纹排除这两个文件"这一机制依据，让读者不必自己去翻脚本。

**可选建议：**

4. 根 `README.md` 仍写「`extension/src/manifest.test.ts` 会在**有人新增权限**时失败」。白名单化之后门闩实际更宽（任何新增顶层键都失败），故该表述现在是**真子集，不构成超宣**，安全。若顺手可与 `extension/AGENTS.md`、`manifest.ts` 注释统一为「任何新增顶层键」，让三处宣称口径一致。

---

## 关于第一轮首个实例那句无从追回的 "Confirmed a concrete drift already"

实现者把它保留为遗留 L4、拒绝按"已澄清"处理——这个处理是对的，我不推翻。补一条**仅供参考、不构成结论**的观察：我第一轮在 A 范围内确实独立发现了一处**具体的漂移**——`validate_governance.py:215-218` 的第二份硬编码检查组名单未随 `PROFILE_NAMES` 同步。它与那句英文的字面描述（a concrete drift）吻合度较高，且属于任何认真通读门禁脚本的实例都会撞上的位置。但**我无法证明这就是同一处**，该实例未留下任何可比对的输出。**仍应按未澄清保留**，不得据此销账。

---

## 覆盖与缺口

已覆盖（本轮）：增量 patch 全部 4 文件、6 处 hunk 的边界与方向；非目标措辞与 `manifest.ts`/`manifest.test.ts`/根 README 的三方一致性；`extension/AGENTS.md` §3 新措辞与实物断言的精确比对；三个治理判断的 §6 依据；A 报告原文写回的忠实性（我自证）。

未覆盖：**机械证据整体 NOT_RUN**——`CHECKS PASS`、`product_fingerprint=bd485b94…`、六项变异验证（尤其新增的第 4、5 项）、extension 5 / frontend 369 / e2e 41 / 治理 23 的数字，我均未复现，无第三方复核，全部依赖实现者自述。**B 范围（`manifest.test.ts` 修复后的实际强度、`ResourcePages.test.tsx` 的 `compareDocumentPosition` 断言是否真咬住、popup/tsconfig/lock 文件）不在我的范围**，我对 `manifest.test.ts`/`manifest.ts` 的读取**仅用于核验 A 范围内两份文档的措辞是否超宣**，未评价其工程质量，也不代表对 B 处置的复核结论。`984b2f4..ec68f5c` 的提交级拆分我无 git 无法核实（Finding 3）。

## 剩余风险

1. 全部检查结论建立在实现者自述之上（无 CI、我无 Bash）。若需第三方绑定，只能由独立 Acceptance 复跑或由用户抽验。
2. Finding 1 未修则残留：最终检查所绑定的树在记录中口径不一，恰是本任务最需要说清的那一点。
3. 继承的 L1（`validate_governance.py` 清单漂移）仍开着；方向是误红不是漏绿，不削弱门禁。
4. 继承残留：`test_profiles_never_install_or_format_source` 的锁定力止于 argv 字面 token，实质约束由 `check_task.py:403-407` 独力承担；两道防线不独立。
5. L4 那处无从追回的 drift 未排除。

## 结论

**`PASS`**（针对新候选 `ec68f5c`，A 部分范围）。

第一轮 A 的两项可记录、三项可选建议均已按我的判断妥善处置或如实记为遗留；三个治理判断（实现与测试段更新、非目标收窄、完成条件不改条文）**我均认为处理恰当**，理由如上，实现者不需要按我的意见调整。本轮新增 3 项可记录后继续 + 1 项可选建议，**无阻断项**，其中 Finding 1、2 是记录准确性问题、Finding 3 需一条 git 核实，均不影响被测内容与门禁效力。

本结论仅覆盖 A 部分，**须与 B 部分对 `ec68f5c` 的增量复核结论合并**方构成 TASK-037 的完整 Review；B 若判 CHANGES_REQUIRED，则整体为 CHANGES_REQUIRED。

# TASK-037 Review · B 部分增量复核

## 1. 只读身份与复核方式

工具白名单仍为 **`Read` / `Grep` / `Glob`**，无 `Write`/`Edit`/`Bash`——本轮同样是**纯静态复核，未执行任何命令**。我独立于唯一写入者 `coordinator`。

## 2. 范围与继承声明

- previous_candidate `f91dbbe` → **new_candidate `ec68f5c`**（代码修订 `984b2f4`）。
- 本轮实际复核 4 文件：`extension/README.md`、`extension/src/manifest.test.ts`、`extension/src/manifest.ts`、`frontend/src/features/resources/ResourcePages.test.tsx`；受影响上下文另读 `frontend/src/features/resources/FileOriginal.tsx`、`extension/vite.config.ts`、`extension/dist/` 产物清单。
- **显式继承**：我第一轮 B 部分对 `f91dbbe` 的全部其余覆盖，在本轮未被修改、因而继续对 `ec68f5c` 有效——包括依赖 9/9 与 frontend 同版本无分叉、扩展代码零 `fetch`/`chrome.*`/凭证（根 AGENTS 底线在代码层做到）、dist manifest 仅 5 键且无 CSP 覆写/content_scripts/web_accessible_resources、单一 manifest 事实源、`ResourceDetail.tsx` 三个来源区块确在快照下方、`api.ts:171` 保证 FILE 必有 `original_file`、popup 诚实空态。`ResourceDetail.tsx` 与 `ContentSnapshot.tsx` 本轮未改，第一轮版面结论直接沿用。
- **A 部分（`check_task.py`、`extension/AGENTS.md`、任务记录叙述）仍不在我的范围**，含实现者对 `AGENTS.md:21` 措辞精确性的补正——我知情但不据此下结论。

## 3. 处置复核

### F1 → 已闭合

`manifest.test.ts` 新断言 `expect(Object.keys(manifest).sort()).toEqual(['action','description','manifest_version','name','version'].sort())`。独立核：`manifest` 是模块级对象字面量，`Object.keys` 取其全部自有可枚举键，恰为这五个；任何新增顶层键使长度与内容双双不符，`toEqual` 逐元素比较必红。我第一轮点名的全部绕过面——`optional_permissions`、`optional_host_permissions`、`externally_connectable`、`web_accessible_resources`、`content_security_policy`、`background`、`declarative_net_request`，以及 Chrome 日后新增的任何键——**现在全部被覆盖**。黑名单转白名单，方向正确。

措辞同步修正亦核对无误：`README.md` 与 `manifest.ts` 注释现在陈述的是"顶层键恰好五个"，与断言实际行为一致，**新措辞本身不构成新的超宣**。实现者"两处都做"的理由成立——断言防新增键、措辞防误解，确实是两个不同的洞；我原先给的二选一是偏保守的最低要求，做满更好。

残留（不构成 finding，仅备案）：白名单只锁**顶层**键，不锁既有键内部；MV3 中五个允许键里只有 `action` 有子结构，且无授予 reach 的子键，故实际风险为零。

### F2 → 盲区已在区块粒度闭合；逐条回答实现者点名的三问

先给结论：**这次是真的闭合了，不是又一轮字符串断言。** 依据来自独立读码，不采信自陈。

`assertBelow` 做了两件事，而不是一件：

```ts
const anchor = screen.getByRole('region', { name: anchorName })
expect(region.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
```

`getByRole`（非 `queryByRole`）在**零匹配时抛错**，因此第一行已经把「被指向的区块必须存在」钉住了；第二行才钉顺序。「下方的 X」这句话的两个构成命题——X 存在、X 在快照之后——**现在都在断言之下**。

**Q1：我给的决定性反例是否足够？** 不够——它只规定了顺序，没规定存在性。实现者用 `getByRole` 锚定的写法**覆盖了比我要求的更多**。所以：

**Q2 的三类失效，逐一核**：

- **目标区块被条件性渲染或整块移除** → `getByRole` 抛错 → 红。**已覆盖**，且这一层是我第一轮没写进最小修复的，属实现者补强。
- **位掩码用法是否正确** → 正确。`region.compareDocumentPosition(anchor)` 中 `anchor` 是 spec 里的 *other*；`DOCUMENT_POSITION_FOLLOWING`(4) 置位当且仅当 other 在 node 之后。反例（区块挪到快照之前）返回 `PRECEDING`(2)，与 4 相与得 0 → falsy → 红。**等价关系成立**。唯一理论性偏差：若 anchor 是 region 的**后代**，spec 规定同时置 `CONTAINED_BY`(16) 与 `FOLLOWING`(4)，会假通过——但三个锚点在 `ResourceDetail` 中是 `<ContentSnapshot>` 的**同级**而非后代，且真嵌进去了「下方」在视觉上也仍近似成立，故非实际风险，不列为 finding。
- **是否三种 source 都真正执行到** → 是。`assertBelow(region, anchorName)` 在两个 `it.each` 回调中**无条件调用**，不在任何 `if` 之内；`sources` 三条元组经 `as const` 均为 5 元，两处解构 `(source, item, hint, _empty, anchorName)` 与 `(source, item, _hint, empty, anchorName)` 的位序均与元组一致。**6/6 全部执行。**
- **新断言会不会又成恒真** → 不会。零匹配抛错、多匹配也抛错（全页 region 可访问名 `资料内容`/`记录与理解`/`资料信息`/`保存原因`/`正文快照`/`原始网页`/`粘贴原文`/`原始文件` 互不重复），顺序颠倒返回 falsy。三条通路都能变红，不存在"断言一个本来就不可能出现的东西"的恒真形态。

**锚点选择的改进是否成立：成立，且优于我的建议。** 我原建议 FILE 用 `getByText(/原件已保存/)`，那是拿一句提示文案当结构锚，文案一改测试就误红。实现者改用 `getByRole('region', { name: '原始文件' })`：我独立核实 `FileOriginal.tsx:61` 为 `<section className="resource-original file-original" aria-label="原始文件">`，且**同步无条件渲染**（组件内无 async 门控，`useEffect` 只做 blob URL 清理），不会引入时序不稳；WEB/PASTE 两处 `ResourceDetail.tsx:103/123` 以 `aria-labelledby="original-title"` 指向 h3，可访问名分别为「原始网页」「粘贴原文」。`<section>` 有可访问名才映射 `region` 角色，三处都有。**锚在无障碍语义上比锚在文案上稳，采纳。**

**Q3：单向锁本轮未处理——我判定不必处理，此项就此关闭。** 本轮否定式断言原样未动，仍只有"WEB 专属文案不得出现在 PASTE/FILE"这一向。但如我第一轮已论证：三条 hint 互不包含、组件恰好渲染一条字符串，因此**三条肯定式已构成 source↔文案的双射锁**——FILE 若显示 PASTE 文案，FILE 的肯定式 `'下方的原件'` 就会失败。仅存的缝隙是"某条 hint 同时含有自己的片段和别家的片段"，需要刻意编造。为此再加反向否定属理论完备性追求，**不修复是对的，我不再挂账**。

**新识别的第三种失效（我和实现者都没提过）——列为可选建议，不阻断**：

`ResourceDetail.tsx:106-118` 的 WEB 分支里，`safeWebUrl` 返回 null 时**不渲染链接**，改渲染 `<p role="alert">该网址无法安全打开，仅显示文本。</p>`，但「原始网页」section 本身仍在。此时 `assertBelow` 锚在 section 上照样通过，而 hint「需要最新内容请用下方的「打开原网页」」**指向了一个并不存在的控件**——正是原 bug 的同一类（说的话不属实），只是落在一条边界分支上。测试 fixture 用 `https://example.com/article`（安全），该分支从未被走到。

- 触发：资料存有 `safeWebUrl` 拒绝的 URL（非 http(s) scheme 等历史数据）。
- 影响：文案误导，认知成本；无数据、无安全后果。
- 发生可能：低（创建路径应已校验）。
- 定性：这更像**产品缺口**（链接不可用时这句提示该说什么，尚无定义）而非测试缺陷，故给可选建议，**不要求本任务处理**，记录即可。

因此，对"是否闭合"的独立结论：**在区块粒度上已闭合**——TASK-036 那句「验证不了它指的方向对不对」，本轮起不再成立。**在控件粒度上尚有一条已识别的边界分支未覆盖**（上述 WEB 不安全 URL）。任务记录若如实写"补了 DOM 顺序断言、由 Reviewer 判定"，可以升级为"经独立复核，方位与存在性已在区块粒度受断言覆盖；控件粒度的不安全 URL 分支未覆盖，已记录"。**不要写成"已完全闭合"。**

### F3 → 已闭合，且新增陈述本身经我独立验证属实

`README.md` 新增的未验证标注到位。更值得肯定的是它没有停在"未验证"，而是划清了**已验证的边界**："dist/ 下有 manifest.json、popup.html 与 JS 资源，manifest 为合法 JSON、manifest_version: 3、default_popup 指向确实存在的文件"。我独立核对 `extension/dist/`：确有 `manifest.json`、`popup.html`、`assets/popup-BdaQ7f-k.js`；`manifest.json` 为合法 JSON、`manifest_version: 3`、`default_popup: "popup.html"` 且 `dist/popup.html` 确实存在。**这句话没有超出证据。** 一个纠正超宣的修复本身不再超宣，这一点合格。

### S1 / S2

S1 记为遗留的理由（改 tsconfig 类型作用域会改变整个工程 typecheck 范围）成立，当前无实际影响，同意不做。S2 本就不是缺陷。

## 4. 机械证据的处置（如实标注）

`check_task --candidate 984b2f4` CHECKS PASS、`product_fingerprint=bd485b94…`，以及两项变异验证（白名单下 `optional_permissions`/`externally_connectable` 各 1 failed；DOM 顺序反例修复前全绿、修复后 6 failed / 33 passed）——**均为实现者自述，无第三方复核，我无 Bash 无法执行，本报告不为其真实性背书。**

我能独立提供的是**逻辑一致性核对**：依 `Object.keys` 白名单的语义，加任一键必红，与"1 failed"自述方向一致；依 `assertBelow` 无条件调用于 6 个用例，区块前移必致 6 条全红，与"6 failed"自述数量吻合。两项自述**与代码可推出的行为不矛盾**，但这不是执行验证。检查证据的真实性核对归 A 部分与主 Agent。

## 5. 程序性问题：「原文照贴 + 映射另附」是否可接受

**可接受，且是正确处理。** 理由：我的报告原文一字未改，符合 AGENTS §6"独立报告仅允许原文写回"；映射作为**主 Agent 具名附注**另列，不篡改结论也不改变覆盖范围，只补一层导航。事实上这是在修正**我自己的引用瑕疵**——我第一轮引的是所收 patch 的文件内行号而非源文件行号，附注把它讲清楚，比默默留着强。今后我会直接引源文件行号。

一处小订正：`vite.config.ts:317-326` 我指的是整个 `emitManifest` 插件常量，源文件对应 **`:10-19`**，附注写的 `:10-13` 只覆盖到 `this.emitFile({` 一行，结束行偏短。`manifest.test.ts:183-191`→`:28-36`、`README.md:47-53`→`:19-25` 我按 hunk 偏移复算，**精确成立**；`ResourcePages.test.tsx`→`:595-616` 在 ±1 行内。建议把该附注定位为**导航辅助**而非精确引用。

## 6. 覆盖与缺口

- 本轮为增量复核；`f91dbbe` 阶段的其余覆盖按 §2 显式继承，未重审。
- 仍**未读 `extension/package-lock.json`**（本轮亦未变更）；依赖结论来自 `package.json` 逐项比对与派发会话核实，锁文件一致性、传递依赖树、完整性哈希我未验证。
- **未执行任何命令**：vitest / eslint / tsc / npm 的真实退出码，以及两项变异验证，我均未独立复现。
- 未审 A 部分文件、`docs/research/`、openapi `x-delivery-profile`。

## 7. 剩余风险

1. WEB 不安全 URL 分支下，「下方的「打开原网页」」指向不存在的控件（可选建议，产品缺口，已记录）。
2. 白名单只锁 manifest 顶层键（当前无实际风险）。
3. 扩展仍从未在真实 Chrome 中加载；已按上一轮 §6 判据接受，且 README 现已如实标注。
4. 机械检查与变异验证均为自述，无第三方复现。
5. 锁文件内容未经我独立验证。

## 8. 结论（针对新候选 `ec68f5c`）

**PASS**

第一轮唯一阻断项 F1 已实质闭合（黑名单转白名单，覆盖我点名的全部绕过面，措辞同步改准）；F2 的处置**超出**我给的最低要求，`getByRole` 锚定同时钉住了存在性与顺序，我给出的决定性反例与"区块整块移除"两条通路现在都会变红——**TASK-036 那个"验证不了方向对不对"的盲区，在区块粒度上确已闭合**，这是独立读码的结论，非采信自陈；F3 已修且新增陈述本身经验证属实。新识别的 WEB 不安全 URL 分支属可选建议，不阻断。

PASS 附带两项已明确处置的非阻断项（WEB 不安全 URL 分支、S1 tsconfig 类型作用域遗留），以及一条对任务记录措辞的要求：**可写"经独立复核，方位与存在性已在区块粒度受断言覆盖"，不可写"已完全闭合"**。

- 第二轮 findings 的处置（均在 EVIDENCE 标记区内完成，唯一例外见下第 1 条）：
  - **A Finding 1（记录准确性）→ 已修，且该修改落在 EVIDENCE 区外。** 「实现与测试」段的环境说明原只写「检出候选 `5e7ef25` 后在其中运行」，与同段新加的「本段下方一律是最终值」自相矛盾——正如 A 指出的，这与 TASK-036 的 A1 是同一类缺陷，而那句话恰恰是为纠正 A1 才加的。已按 A 给的措辞改为「第一轮检出 `5e7ef25`、处置后检出 `984b2f4`，两次都走同一条路径、都在独立干净 worktree 中运行」，并补记第二个临时分支与 `.git/info/exclude` 的清理。**因该段在标记区外，本条使记录形成新的冻结候选**（指纹不变，增量为纯文档）；派发会话的待办清单曾把它归为「EVIDENCE 区内、不形成新候选」，此处按实际位置更正。
  - **A Finding 2（行号附注适用范围写错）→ 已修。** 「两份报告」→「B 部分为 patch 内行号，A 部分为源文件行号」。同时按 B 的订正把 `vite.config.ts` 映射改为 `:10-19`（初版 `:10-13` 结束行截短），并按两位 Reviewer 的一致建议把整段**降级定位为「导航辅助」而非精确引用**。该附注自身两次出错，降级是应该的。
  - **A Finding 3（`984b2f4..ec68f5c` 的文件数）→ 经 git 核实，原句准确，不改事实，只补机制依据。** `git diff --name-only 984b2f4..ec68f5c` 输出只有任务记录一个文件（主 Agent 与派发会话各自独立核实）；索引的状态变更发生在 `984b2f4` 提交内部，不在该区间。已按 A 的建议在该处点明 `check_task.py:359` 同时排除任务记录与索引，读者不必翻脚本。
  - **A 可选建议 4（根 README 三处口径统一）→ 不做。** A 自己判定当前表述是真子集、不构成超宣；改它会变更产品内容、使指纹改变并触发又一轮复核，收益（三处措辞更整齐）不抵成本。记为可选项，留给下一个触及 README 的任务。
  - **B 新识别的第三种失效（WEB 不安全 URL 分支）→ 不在本任务修，记为遗留。** 采纳 B 的定性：这是产品缺口而非测试缺陷——链接不可用时那句提示该说什么，本来就没定义过。见下「非阻断遗留项」。
  - **B 对措辞的硬性要求 → 照办，且不放宽。** 关于 TASK-036 方位盲区的最终表述为：**经独立复核，方位与存在性已在区块粒度受断言覆盖；控件粒度的不安全 URL 分支未覆盖，已记录。****不写「已完全闭合」。** B 给出的结论本身带粒度限定，限定词必须一起写进来才不算超宣。
  - **A 对三个治理判断的背书 → 接受，不据此调整。** A 明确表示实现者不需要按它的意见改动，并逐项验证了「实现与测试」段的更新是增补与更正、无任何历史证据被删除改写或降级（旧 SHA、旧指纹 `8a50315d…`、原三项变异验证全部原文保留）。
- Acceptance（L3 独立只读，第三批全新实例，独立于唯一写入者与 Reviewer A/B，无上下文继承）：**PASS**（针对候选 `1e335ac`），附 1 项须在本次写回中更正的记录准确性项（F-a，已按其要求更正，见上「候选 SHA」条）与 2 项可记录后继续（F-b 遗留项四要素已补齐、F-c 完成条件如实记为部分满足），**无阻断项**。报告原文如下。

# TASK-037 独立只读 Acceptance 报告

## 1. 只读证明与范围

本实例工具白名单仅 `Read` / `Glob` / `Grep`，**无 `Write`/`Edit`/`NotebookEdit`，无 `Bash`**。全程未写入、未提交、未推送、**未执行任何命令**。我独立于唯一写入者 `coordinator` 与 Reviewer A/B，无上下文继承。

- 基线 `32c3750` → **验收候选 `1e335ac`**（工作树 HEAD）。
- 已读：完整 diff patch（1406 行）、未覆盖增量 patch（307 行）、任务记录全文（647 行）、`check_task.py`/`test_check_task.py`/`validate_governance.py` 相关段、`extension/` 的 `AGENTS.md`/`package.json`/`manifest.test.ts`/`popup.test.ts`/`dist/manifest.json`、两处 README、`ContentSnapshot.tsx`、`ResourcePages.test.tsx:563-629`、`风险分级与检查规则.md:20-46`、任务索引。
- **一项超出预期的证据**：实现者会话的原始检查日志仍在本地 `/private/tmp/claude-501/-Users-yuklimching/54422e89-4ae6-4e67-99f8-a56f4378ba42/scratchpad/check-037-r2.log`（155 行），我**只读实读**了它。这不是独立执行（日志由实现者产生，理论上可伪造），但已把 A/B 当初只能按 NOT_RUN 处理的部分升级为「有原始输出可比对」。

## 2. 13 条完成条件逐条核对

| # | 条件 | 证据 | 判定 |
|---|---|---|---|
| 1 | 五条命令通过；build 产出**可被浏览器加载的** MV3 目录 | 日志第 5/15/23/31/48 行五条命令逐条 `exit=0`；`extension/dist/manifest.json` 我已实读：五键、`manifest_version:3`、`default_popup:"popup.html"` 且该文件存在 | **部分满足**（详见 §4） |
| 2 | ≥1 条有意义单测且证明跑该目录源码 | `manifest.test.ts` 4 条（`import { manifest, POPUP_PAGE } from './manifest'`：MV3、版本与 package.json 同步、popup 文件存在、五键白名单）+ `popup/popup.test.ts` 1 条（`import { popupText } from './popup'`）＝5，与日志 `2 files / 5 tests passed` 吻合 | 满足 |
| 3 | `selected_profiles(["extension/src/a.ts"],[])=={"extension"}` 并有断言 | `check_task.py:66-67` 并列 `if`；`test_check_task.py:24` 逐字为该断言 | 满足 |
| 4 | `test_profiles_never_install_or_format_source` 含 extension 后仍过 | 日志治理单测 `Ran 23 tests ... OK` | 满足（A 指出的覆盖归因偏差已在 EVIDENCE 更正、条文不动，我认同该处理） |
| 5 | 本任务检查真跑出 extension 组 | 日志第 4 行 `profiles=extension,frontend,governance`，五条命令带 `cwd=extension` 逐条可见 | 满足 |
| 6 | 反向变异验证 | 记录六项，含具体失败计数；我未复现 | 满足（自述，**NOT_RUN**；逻辑自洽见 §5） |
| 7 | 治理文档检查组清单新增一行 | `风险分级与检查规则.md:41` 与 `commands("extension")` 的五条命令逐条相符，不多不少 | 满足 |
| 8 | `extension/AGENTS.md` 职责/边界/命令且不放宽根底线 | 七节齐全；§3 三条不变量（不碰第三方凭证、不改 `local_access.py`、不直连 `/api/v1`）+ §7 三组 Review 规则，方向为**加严** | 满足 |
| 9 | A3 两处文案修复 + 三类资料各有断言 + 变异 | `ContentSnapshot.tsx:98` `snapshotHints[sourceType]` 按来源分支；`ResourcePages.test.tsx:566-629` 两组 `it.each(sources)`×3 源，`assertBelow` 用 `getByRole` 同时钉存在性与 DOM 顺序 | 满足 |
| 10 | backend 525 / frontend 全绿 / e2e 41 | frontend 五条 + `369 passed` **有日志**；**backend 525 与 e2e 41 仅自述，无日志、且不在任何自动检查组内** | **部分满足**（backend/e2e 部分 NOT_RUN） |
| 11 | 治理组全绿 | 日志 127-154 行：`Governance V2 PASS`、`ruff check` `All checks passed!`、`ruff format` `4 files already formatted`、`unittest 23 OK` | 满足 |
| 12 | CHECKS PASS + 记录指纹 | 日志末行 `CHECKS PASS`；`files=25`、`product_fingerprint=bd485b94…`，绑定 `input=984b2f4` | 满足 |
| 13 | L3 执行链完整（Reviewer 审完整 diff + 独立 Acceptance） | A/B 各两轮，均在报告内给出只读权限证明；本报告为独立 Acceptance | **部分满足**（`package-lock.json` 未被任何 Reviewer 覆盖，见 §5） |

**范围核对**：patch 中 24 个 `diff --git` 条目 + 已排除的 `extension/package-lock.json` ＝ 25 文件，**逐条命中 `allowed_paths`，无一越界**；`backend/**`、`docs/contracts/**`、`security/local_access.py`、`frontend/package.json` 均未出现在 diff 中，非目标确实未动。索引 `IN_ACCEPTANCE` 与 TOML 一致，TASK-036 已标 `MERGED`。

## 3. 未被 Review 覆盖的增量：独立核对结论

① **确为纯文档**。`ec68f5c..1e335ac` 的 patch 我已全文读过：只有 `TASK-037-extension-baseline.md` 与 `任务索引.md`，无任何代码/脚本/契约/测试 hunk；标记区外仅两处变化（`status IN_REVIEW→IN_ACCEPTANCE`、环境说明一处修正），与派发方的 git 核实一致。

② **A Finding 1 的处置合格，且我能给出 A 当时给不出的佐证**。记录 `:123` 现写「第一轮检出 `5e7ef25`、处置后检出 `984b2f4`，两次都走同一条路径、都在独立干净 worktree 中运行」——保留了路径的证据价值，**不是只删数字**，并补记了第二个临时分支与 `.git/info/exclude` 的清理。更关键的是：日志第 37/98 行是 **vitest 自己打印**的运行目录 `.../scratchpad/wt-037b/extension`、`.../wt-037b/frontend`，`wt-037b` 正是第二个 worktree。**这句被修正的话，我在实现者叙述之外拿到了独立佐证。**

③ **不起第三轮 Review 站得住，Acceptance 覆盖成立。** 依据：该增量产品内容为零（指纹不变，`check_task.py:359` 排除任务记录与索引）；其内容恰是 Reviewer A 点名指定的文字修正，A 已明说 F1/F2/F3「均不影响被测内容与门禁效力」；而这段增量的全部主题——「检查到底跑在哪棵树上」——正是 Acceptance 的本职（核对证据是否绑定被测内容），由第三方只读实例核对比再起一轮 Reviewer 更对口，且避免 §7 的无界循环。**我不判 CHANGES_REQUIRED。** 边界须说清：**我的结论覆盖 `1e335ac`，其代码级部分继承 A/B 对 `ec68f5c` 的 PASS**，依据是我独立核实两者代码零差异；若日后发现该增量含非文档内容，此继承立即失效。

## 4. 完成条件 1 的独立判定：**部分满足**（我不跟随 Review 的结论）

拆成两个谓词看：
- 「五条命令真实通过」「产出含 `manifest.json` 的目录」——**满足**，有日志与产物双证。
- 「**可被浏览器加载**」——**不满足**。这是一个关于 Chrome 加载器行为的谓词，本任务全程零证据。已验证的全部是静态形状，形状正确**不蕴含**可加载。

**但不阻断**，理由按「实际风险」判据（非因 Review 已接受）：(a) 该谓词在本环境内任何 Agent 都无法证实或证伪，以其阻断等于设一道 Agent 无法解除的闸；(b) 失败后果是用户一次加载重试，零数据、零安全影响；(c) 已在「已知限制 4」、遗留 L3、`README.md:248`、`extension/README.md:21` 四处如实标注「尚未在真实 Chrome 中实机验证」并划清了已验证边界，**无超宣**。

→ 处置要求：主 Agent 向用户提合并请求时**必须把这一条当面说出来**（「扩展从未实机加载过，请首次按 README 加载时确认」），不能只埋在任务记录里。

## 5. 遗留项登记合规性（对照 `风险分级与检查规则.md:29` 的四要素）

| 项 | 影响 | 暂不修理由 | 责任角色 | 重评触发 |
|---|---|---|---|---|
| L1 validate_governance 清单漂移 | ✅ | ✅ 不在 allowed_paths | ✅ | ✅ |
| L2 tsconfig 类型作用域 | ✅ | ✅ | ✅ | ✅ |
| L3 未实机加载 | ✅ | ✅ | **✗ 未写** | ⚠️ 有「须用户首次加载确认」，未按格式写 |
| L4 追不回的 drift | **✗** | **✗** | **✗** | **✗**（仅一句「见上」） |
| L5 A4 契约漂移 | ✅ | ✅ | ✅ | ✅ |
| L6 调研文档未入 Git | ✅ | ✅ 属用户文件 | **✗** | **✗** |
| L7 WEB 不安全 URL 分支 | ✅ | ✅ | ✅ | ✅ |

**L4 的记录方式本身是对的**：`:631` 明写「此为本轮 Review 的一处遗留不确定性，**不作已澄清处理**」，`:643` 明写「吻合不等于同一，L4 继续挂账，**不得据此销账**」——完全遵守了 A 的要求，未据其观察销账。缺的只是四要素的格式化补齐。

**B 的措辞硬性要求：已遵守。** `:617` 逐字采用带粒度限定的表述「经独立复核，方位与存在性已在区块粒度受断言覆盖；控件粒度的不安全 URL 分支未覆盖，已记录」，并明写「不写『已完全闭合』」。全文 grep 确认：「已完全闭合」四次出现全部是 B 报告原文与处置说明中的**否定式引述**，无一处作为主张。

**报告原文写回**：第一轮 A/B 两份的忠实性由 A（逐段自比对）与 B 各自自证；**第二轮两份的忠实性无任何第三方可核，我也无原件可比对——如实标注为未覆盖缺口。**

## 6. Findings

**必须在 Acceptance 写回时一并更正（不阻断合并，但不得遗漏）：**

**F-a — `docs/tasks/TASK-037-extension-baseline.md:148`：EVIDENCE 仍称「最终冻结候选 `ec68f5c4ebe0b8661b817ed48b1a8f024c773810`」，而实际验收候选是 `1e335ac`。**
触发：任何人日后按记录追溯本任务的最终候选。影响：记录会永久留下一个**错误的**最终候选 SHA——而「候选与被测内容的绑定」正是本任务全程的核心判据。**这是同一类缺陷第三次出现**（TASK-036 的 A1、本轮 A Finding 1，现在是它自己）。最小修复：写回 Acceptance 时把该句改为 `1e335ac`，并注明 `ec68f5c..1e335ac` 为纯文档增量、指纹不变。**该句在 EVIDENCE 标记区内，更正合法且零成本。**

**可记录后继续：**

**F-b — 遗留项 L3 / L4 / L6 的四要素不齐**（见 §5 表）。影响：`风险分级与检查规则.md:29` 要求的「责任角色 + 重评触发条件」缺失，这三条无人认领、无重新处理的触发点，实际后果是它们更容易被下一个任务漏掉。最小修复：写回时各补一行（L3 责任角色 coordinator、触发＝用户首次加载反馈；L4 责任角色 coordinator、触发＝下一个触及 `scripts/governance/**` 的任务顺带留意；L6 责任角色＝用户、触发＝下次引用该文档时）。

**F-c — 完成条件 1 后半句无证据**（见 §4），须在 EVIDENCE 中如实记为「部分满足」，不要写成 13 条全部满足。

**定向补漏（我做的、无人覆盖的一块）**：两位 Reviewer 均明确未读 `extension/package-lock.json`（2452 行）。我用 grep 抽查：**157 处 `resolved` 全部指向 `https://registry.npmjs.org/`**，无第三方 registry、无 `file:`/`git+` 来源；唯一 `hasInstallScript: true` 为 `fsevents@2.3.3`（dev + optional + `os: darwin`，vite/vitest 的标准可选原生依赖）。**无异常**。这不构成对锁文件的完整审查（传递依赖树与 integrity 哈希未验证），但把「完成条件 13 完整 diff」的主要风险面收敛到可接受。

## 7. 剩余风险与是否阻断

1. 扩展从未实机加载（L3，须用户确认）——不阻断，但必须当面告知用户。
2. backend 525 / e2e 41 / 六项变异验证：**NOT_RUN**，纯实现者自述、无日志、我无 Bash 未复现。逻辑一致性核对通过：frontend 基线 363→369 的 +6 与两组 `it.each`×3 源新增 6 用例精确吻合，且日志实测 369；白名单断言语义决定「加任一键必红」与「1 failed」自洽；`assertBelow` 无条件用于 6 个用例与「6 failed / 33 passed」自洽。**无矛盾，但这不是执行验证。**
3. 第二轮两份 Reviewer 报告的原文写回忠实性无第三方复核。
4. 继承的非阻断项：L1 误红（不漏绿）、L2、L7、`test_profiles_never_install_or_format_source` 的锁定力止于 argv token（实质由 `check_task.py:403-407` 独力承担）。

以上均不触碰安全底线、不违反已确认需求/契约、不涉及必要检查失败或结果不真实。**不阻断交付。**

## 8. 结论

**`PASS`**（针对候选 `1e335ac`）。

附 1 项**必须在写回时更正**的记录准确性项（F-a，最终候选 SHA 过时）、2 项可记录后继续（F-b 遗留项四要素、F-c 完成条件 1 部分满足），无阻断项。13 条完成条件中 **10 条满足、3 条部分满足**（第 1、10、13 条），部分满足的三条各自的缺口均已在上文定位并给出如实记录要求——**请勿在 EVIDENCE 中写成「13 条全部满足」**。未被 Review 覆盖的增量经我独立核对确为纯文档、且处置符合 Reviewer A 的具体要求，不需第三轮 Review。

- **完成条件核对结果（按 Acceptance 的硬性要求如实记录，不得写成「13 条全部满足」）：10 条满足、3 条部分满足。**
  - **条件 1 部分满足**：「五条命令通过」与「产出含 `manifest.json` 的 MV3 目录」有日志与产物双证；**「可被浏览器加载」无任何证据**。Acceptance 拆开判定并指出「形状正确**不蕴含**可加载」，我接受该判定，不辩解、也不修改完成条件的措辞使其变成满足——那正违反本任务决定日志沉淀的第二条判据。
  - **条件 10 部分满足**：frontend 全绿与 `369 passed` 有原始日志；**backend 525 与 e2e 41 仅为实现者自述，无日志，且这两组不在本任务自动选中的检查组内**（本任务不改 `backend/**`，e2e 非自动组）。
  - **条件 13 部分满足**：L3 执行链的角色与独立性完整（A/B 各两轮 + 独立 Acceptance，均给出只读权限证明），但「Reviewer 审完整 diff」一项有缺口——`extension/package-lock.json`（2452 行）**未被任何 Reviewer 覆盖**，系派发时主动排除。Acceptance 事后补查了主要风险面（157 处 `resolved` 全部指向官方 registry，无第三方源、无 `file:`/`git+`，唯一 `hasInstallScript` 为 `fsevents@2.3.3` 的 darwin 可选原生依赖），但其自述这**不构成完整审查**（传递依赖树与 integrity 哈希未验证）。
- 最终状态/风险/用户操作：status=**ACCEPTED**。L3 执行链完整：Worker → 自动检查（`CHECKS PASS`，`profiles=extension,frontend,governance`）→ 独立只读 Reviewer 两部分各两轮（第一轮 A PASS / B CHANGES_REQUIRED → 处置 → 第二轮 A PASS / B PASS）→ 独立只读 Acceptance PASS。四个审查实例互不相同、均只有 Read/Grep/Glob、无 Bash 与写工具、无上下文继承。最终候选 `1e335ac` 待**用户本人执行合并**；分支仅在本地，未推送。
  **须向用户当面说明的三点（Acceptance 明确要求，不得只埋在记录里）**：① **扩展从未在真实 Chrome 中加载过**，完成条件 1 因此只算部分满足，请首次按 README 加载时确认；② 全部机械证据由**实现者单方运行**，两位 Reviewer 全程 NOT_RUN，Acceptance 只做了原始日志的只读比对（日志由实现者产生，非独立执行），其中 backend 525 与 e2e 41 **连日志都没有**；③ 遗留 7 项，其中 L5（A4 契约清单漂移 12 项）与 L1（`validate_governance.py` 第二份检查组清单未同步）需在后续任务中处理。
  **一条超出实现者叙述的独立佐证**（Acceptance 发现）：检查日志第 37/98 行是 **vitest 自己打印**的运行目录 `.../scratchpad/wt-037b/extension` 与 `.../wt-037b/frontend`，`wt-037b` 正是处置后那次检查所用的独立 worktree。「最终检查跑在 `984b2f4` 的干净检出上」这句话因此不再只依赖实现者自述。
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
  - **（L3）扩展从未在真实浏览器中加载过**。已验证的只是构建产物形状（`dist/` 下有 `manifest.json`、`popup.html` 与 JS 资源，manifest 为合法 JSON、`manifest_version: 3`、`default_popup` 指向确实存在的文件）。Reviewer 判定不应阻断（零权限、零网络、零 content script，实机验证任何 Agent 都无法执行，以此阻断等于设一道 Agent 无法解除的闸）。**须用户首次按 README 加载时确认**；README 已标注该步骤未经实机验证。责任角色 coordinator；**重评触发条件：用户首次加载后的反馈**——加载成功则据实补记为完成条件 1 满足，失败则按其错误另起修复任务。
  - **（L4）第一轮 Reviewer 提及但无从追回的那处 drift**，见上「审查过程本身的证据」。影响：无法排除候选中存在一处至今无人复现的漂移；A/B 两路重审均未提及，但两路均非全覆盖（锁文件由 Acceptance 补查、机械证据全程 NOT_RUN），故不能据此断定其不存在。暂不修的理由：**没有可修的对象**——该实例未留下任何可比对输出，修复无从下手；继续挂账的成本仅为记录一行，而据 A 的吻合观察销账的代价是把一处未知当成已知。责任角色 coordinator；**重评触发条件：下一个触及 `scripts/governance/**` 的任务顺带留意**；若届时 `validate_governance.py:215-218` 的清单漂移被修复而未发现其他漂移，可在该任务记录中说明后销账。
  - **（L5）A4 未做且仍在恶化**：`openapi-v1.json` 的 `x-delivery-profile` 停在 `stage: "TASK-022"`，`available_operations` 35 项 vs 实际 47 个 operationId，缺 12 项，且 `backend/tests/test_taxonomy.py:485` 硬编码 `len(available) == 35`。本任务明示非目标。责任角色 coordinator；重评触发条件：应作为独立任务处理，且其修法不应只是补回 12 条，而要加一个漂移守卫测试。
  - **（L7）WEB 资料的 `source_url` 被 `safeWebUrl` 拒绝时，快照区的提示指向一个并不存在的控件**。`ResourceDetail.tsx:106-118` 在链接不安全时不渲染 `<a>`、改渲染 `<p role="alert">该网址无法安全打开，仅显示文本。</p>`，但「原始网页」section 仍在，故新增的 `assertBelow` 照样通过，而文案「需要最新内容请用下方的「打开原网页」」此时是假话——与被修的原 bug 同类，只是落在测试 fixture（`https://example.com/article`）从未走到的边界分支上。由第二轮 B 部分独立发现，主 Agent 与第一轮 Reviewer 均未想到。影响：文案误导，认知成本；无数据、无安全后果。发生可能低（创建路径应已校验）。暂不修的理由：采纳 B 的定性——这是**产品缺口而非测试缺陷**，「链接不可用时这句提示该说什么」尚无产品定义，在本任务里随手编一句反而是未经确认的产品决定。责任角色 coordinator；**重评触发条件：下一个触及 `ContentSnapshot.tsx` 或阅读器文案的任务须一并定义并覆盖该分支。**
  - **（L6）`docs/research/阅读器与标注能力调研.md` 仍未纳入 Git**，而 TASK-036 的上下文包引用了它，从 Git 检出工作的 Reviewer 看不到被引用的内容。属用户文件，本任务不处理。影响：任何从 Git 检出工作的 Reviewer 都看不到 TASK-036 上下文包所引用的内容；本任务的两位 Reviewer 均明确未审该文档。暂不修的理由：它是用户在另一会话创建的个人文件，是否纳入版本库属用户决定，Agent 不应擅自提交他人未跟踪的内容。**责任角色：用户**（主 Agent 已在交付时告知）；**重评触发条件：下次有任务记录引用该文档时**——引用未入库的文档等于引用不存在的依据，届时须先解决归属。
- 日期与决定日志：2026-09-06 用户批准拆分方案（「同意，登记 TASK-037」），并在此前明确选定顶层目录位置（「使用独立顶层目录 extension/ 吧，万一以后还需要拓展其他的功能，可以同样放进 extension，不然全放 frontend 是否会越来越乱？」）。拆分理由：扩展代码要被自动检查覆盖，`extension` 检查组必须先存在；若与扩展实现打包，Worker 会在同一个 diff 里既写扩展代码、又发明验证它的检查组，冻结时「检查通过」就失去独立含义。主 Agent 另将 A4 排除在外，理由是其正确修法是补漂移守卫而非补回清单，属独立测试故事。第一轮 Review 因单实例三次中断改为 A/B 分范围并行；派发会话的拆分一度在「门禁调用的 script 名」与「script 的定义」之间留下跨边界盲区，经主 Agent 指出后补投 `extension/package.json` 给 A 部分闭合。
  **本轮沉淀的两条可复用判据（来自 A 部分增量复核，其价值高于本次结论本身）**：① **授权面的修订只有在「收窄」且「不为已交付物追认合法性」时才安全。** 本任务把非目标从「不申请 host permissions 之外的权限」收紧为「不申请任何权限」属前者：方向是收窄，且实现从第一轮起就是零权限——是**记录向实物对齐**，不是实物向记录对齐。若方向反过来（为让已写进去的 `host_permissions` 合法而扩写非目标），即属事后追认，必须回到用户授权，Reviewer 会判阻断。② **完成条件是标尺，事后改写标尺以匹配已交付物，与「降低断言来通过检查」在机制上无法区分**；因此完成条件 4 的覆盖归因错误只在 EVIDENCE 记录更正，不回头改条文，根治应由下一个任务在**新的**完成条件里正确表述。
  **审查组织方式本身也会引入缺陷**：A/B 拆分一度在「门禁调用的 script 名」与「script 的定义」之间制造盲区（已补投闭合）；根因则在本任务把 2452 行锁文件与 14 行门禁逻辑塞进同一个 diff。下个任务登记时须把生成物排除写进上下文包。
  **关于 L4 那处无从追回的 drift**：A 部分在第二轮补了一条**仅供参考、不构成结论**的观察——它第一轮独立发现的 `validate_governance.py:215-218` 清单漂移与那句 "a concrete drift" 吻合度较高，且是任何认真通读门禁脚本的实例都会撞上的位置；但它明确表示**无法证明是同一处，仍应按未澄清保留，不得据此销账**。主 Agent 采纳此处置：吻合不等于同一，L4 继续挂账。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
