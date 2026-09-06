# TASK-038：扩展采集网页正文（经 UI 页面写入快照）

```toml
schema_version = 2
id = "TASK-038"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "本任务把扩展从「零权限」变成「能读用户当前打开的任意网页、并向本机 UI 页面注入脚本」。浏览器扩展权限是一次性授予、长期生效的，用户不会重新审视，因此这次授予的边界就是它此后的边界。同时新增一条**新的数据写入路径**：正文不再只由用户手工粘贴，而是由页面内容自动提取后进入永久快照（快照一旦写入即不可回溯重建）。第三处实质风险在信任边界：`/capture` 页面要接收来自扩展内容脚本的 postMessage，而任何网页都能向同源页面发 postMessage，所以「谁可以让 StudyPilot 写一条资料」这个问题必须在本任务里答对。命中 `**/AGENTS.md` 高风险路径下限。不改后端、不改契约、不改 `infrastructure/security/local_access.py`。"
risk_flags = ["security", "architecture", "business", "tests"]
owner = "coordinator"
base = "b4a3fd0c646f2ea144fb4b3cb6d9bb784e2fff23"
allowed_paths = [
  "extension/**",
  "frontend/src/features/capture/**",
  "frontend/src/shell/pages.ts",
  "frontend/src/shell/Screen.tsx",
  "frontend/src/styles.css",
  "docs/contracts/API与数据契约基线.md",
  "README.md",
  "docs/tasks/TASK-038-extension-capture.md",
  "docs/tasks/TASK-037-extension-baseline.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

- 用户授权（2026-09-06，本轮明确回答）：
  1. **浏览器范围：「先只做 chrome 和 edge 浏览器，其他的不扩展」**，并要求记住这一点。据此本任务只做 Chromium，不引入 `browser.*` 兼容层、不产出第二套构建产物。
  2. **任务拆分：采集正文与图片冻结分开做**，本任务只做采集正文，图片冻结留给 TASK-039。
- 前序决策（TASK-036/037 已记录，本任务继承）：正文格式为 **Markdown**；扩展**走 UI 页面写入，不改安全边界**；实施顺序取「甲」：正文快照 → 浏览器扩展 → PDF 阅读器。

### 复核过的现状事实（主 Agent 在基线 `b4a3fd0` 亲自核实）

1. **扩展确实不能直连后端**：`infrastructure/security/local_access.py:17` 要求 `sec-fetch-site: same-origin`，`:154/:200` 要求 `Origin` 等于 UI 源。扩展发起的请求是 `chrome-extension://` 源、`Sec-Fetch-Site: cross-site`，必被拒。**这不是本任务要绕开的障碍，而是本任务的设计前提**：经 UI 页面转交，后端只信任 UI 源，该门禁一行不改。
2. **后端与契约零改动**：`createResource`（`frontend/src/features/resources/api.ts:256`）与 `putResourceSnapshot`（`:351`）已存在且已冻结，采集流程复用它们即可。故 `docs/contracts/**` 与 `backend/**` 不在允许路径内。
3. 前端路由由 `frontend/src/shell/pages.ts` 的 `pages` 注册表 + `frontend/src/shell/Screen.tsx` 的组件映射驱动，新增页面需同时改这两处。
4. 扩展骨架当前**零 `chrome.*` 调用、manifest 仅五个顶层键**（TASK-037 的 Acceptance 与两位 Reviewer 均已独立核实）。`extension/src/manifest.test.ts` 的白名单断言会因本任务新增的任何 manifest 键而失败——**这是 TASK-037 有意设计的门闩，本任务正是它的第一个考验**。
5. 遗留 L8：两处 README 与 `extension/AGENTS.md` 的加载说明已过时（仍写「尚未实机验证」、只给 Chrome 地址栏），按其重评触发条件由本任务一并改正。

### 目标

1. **扩展采集**：用户在任意网页点扩展图标 → 提取该页正文 → 转成 Markdown → 打开本机 UI 的 `/capture` 页并把内容交给它。
2. **`/capture` 确认页**：预填标题、原网址与正文预览，**必须由用户点击确认才写入**；确认后依次调用 `createResource`（WEB，带 `source_url`）与 `putResourceSnapshot`。
3. **权限最小化并逐条说明用途**：本任务预计需要 `activeTab`（仅在用户点击时授予当前页访问，优于 `<all_urls>`）、`scripting`（注入提取脚本）、`storage`（popup 关闭后仍能把内容交给新标签页）、`host_permissions: http://127.0.0.1:5173/*` 与一条 `content_scripts`（仅匹配 UI 源，用于把内容 postMessage 给页面）。**最终清单以实现时的实际需要为准，每一项都必须在实现记录里写明用途、替代方案与为何不能更小**，并同步更新 `manifest.test.ts` 的白名单与三处宣称口径。
4. **正文提取**：采用 `docs/research/阅读器与标注能力调研.md` 推荐的 Defuddle（JS 库，只能跑在扩展里）+ Markdown 转换。这将是 `extension/` 的**首批运行时依赖**（此前 `dependencies` 为空），须在实现记录中列出并说明选型。
5. **清理遗留 L8**：两处 README 与 `extension/AGENTS.md` 的加载说明改正——补 Edge 的 `edge://extensions` 路径、把「尚未实机验证」改为与事实相符的表述（Edge 已实测、Chrome 未实测），并写入「只支持 Chrome 与 Edge」这一用户决定。

### 非目标 / 禁止范围

- **不做图片冻结**（用户已决定拆分）。正文中的图片引用本任务仍指向原站，是已知的不完整冻结，与 TASK-036 的现状一致。
- **不改 `infrastructure/security/local_access.py`，不放宽 `Origin`/`Sec-Fetch` 校验**。若实现中发现非改不可，须停止并上报，不得自行放宽。
- **不引入任何第三方站点凭证**（继承 TASK-036/037 的硬性非目标）。扩展只读用户已登录、已渲染的页面；不得绕过任何站点的访问控制或付费墙。
- **不支持 Firefox / Safari**（用户明确决定）。不引入 `webextension-polyfill` 一类兼容层，不产出第二套构建产物。
- **不改后端、不改 `/api/v1` 的 HTTP 契约、不改数据库**。`backend/**` 与 `docs/contracts/openapi-v1.json` 不在允许路径内；本任务复用既有的 `createResource` 与 `putResourceSnapshot`，不新增、不修改任何 HTTP 操作。
- **但中文契约文档要改一处**：`extension/AGENTS.md` §4（TASK-037 写入）规定「与 UI 页面之间的消息格式属跨模块契约，须在相应任务中与 frontend 一并定义并写入契约文档；不得由本模块单方面约定」。本任务新增的扩展↔`/capture` 页面 postMessage 格式正是这样一份跨模块契约，故须写入 `docs/contracts/API与数据契约基线.md`。**登记时把契约整体列为非目标是错的**——那会让本任务违反自己模块的嵌套规则。实现开始前据此修订 `allowed_paths`，新增 `docs/contracts/API与数据契约基线.md` 一条（不含 openapi 快照，因为这不是 HTTP 操作）。此项修订属**扩大**授权面，与 TASK-037 决定日志中「授权面修订只有在收窄时才安全」的判据方向相反，故须特别说明：① 它发生在**任何实现写入之前**、登记刚完成时，不是为已交付物追认合法性；② 它的动因是遵守既有的嵌套规则，不是为了让某段已写好的代码合法；③ 若 Reviewer 认为该扩大不成立，正确的处置是把消息契约的定义方式退回讨论，而不是保留代码删掉文档。
- **不做阅读器、不做 Markdown 渲染、不做标注、不做 PDF**。
- **不申请 `<all_urls>` host permission**，除非实现中证明 `activeTab` 无法满足且在记录中写明理由——即便如此也须独立 Review 认可。
- 不动未列路径。

- 依赖/前置条件：TASK-037 已由用户合并（PR #42，merge `b4a3fd0`）。无未合并依赖。
- 并行：否，单写入者 `coordinator`（主 Agent 亲自充当 Worker；L3 的 Review 与 Acceptance 由独立只读子 Agent 执行）。
- 状态收尾并入本任务控制面提交：把 TASK-037 由 `ACCEPTED` 标 **MERGED**（merge `b4a3fd0`、PR #42）。

## 完成条件

1. 在一个普通文章网页上点扩展图标，能打开 `/capture` 并看到该页的标题、网址与正文 Markdown 预览；正文不是整页 `innerText`，导航与页脚等噪声被剔除（以一个具体页面为例记录提取前后的字符数与实际效果）。
2. **不点确认就不写入任何数据**：`/capture` 打开后若用户直接关闭，资料库中不新增任何资料，也不产生快照。有测试覆盖。
3. 确认后创建的资料 `source_type=WEB`、`source_url` 为采集时的实际页面地址，且其快照内容与预览一致。
4. **信任边界成立**：`/capture` 只接受来自同源 `window` 的 postMessage，并校验消息结构；伪造的消息（错误 origin、错误结构、缺字段）被丢弃且页面显示可理解的空态而非崩溃。**有测试直接构造伪造消息证明其被拒绝。**
5. **创建成功但写快照失败时不留下误导状态**：资料已创建、快照未写入时，页面明确告知发生了什么以及下一步（去详情页手工粘贴），不谎称成功、不自动重试。有测试覆盖。
6. **manifest 权限清单逐条有据**：`manifest.test.ts` 的白名单更新为新的确切键集；`extension/AGENTS.md`、`extension/README.md`、根 `README.md` 三处宣称口径与实物一致（TASK-037 的教训：门闩比宣称窄，会让下一个人误以为受保护）。实现记录中逐条列出每个权限的用途、替代方案与为何不能更小。
7. 扩展不发起任何对 StudyPilot 后端的直接请求：有检查证明 `extension/src` 中无指向 `127.0.0.1:8000` 或 `/api/v1` 的调用。
8. **不接触第三方站点凭证**：有检查证明 `extension/src` 中无 `cookie` / `chrome.cookies` / 登录态相关调用。
9. 遗留 L8 清理完成：两处 README 与 `extension/AGENTS.md` 补 Edge 加载路径、改正验证状态表述、写入「只支持 Chrome 与 Edge」。
10. `cd extension && npm run format:check && npm run lint && npm run typecheck && npm run test -- --run && npm run build` 全绿（基线 5 tests，本任务后应 >5）；`cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test -- --run && npm run build` 全绿（基线 369，本任务后应 >369）；`cd backend && ruff format --check . && ruff check . && mypy src tests && pytest` 全绿（基线 525，本任务不应改变）；`npm run test:e2e` 全绿（基线 41）。
11. **e2e 的边界须如实说明**：Playwright 无法驱动浏览器扩展，因此「点扩展图标 → 采集」这一段**没有自动化端到端覆盖**；`/capture` 页面侧可以且必须有测试（用构造的 postMessage 驱动）。记录中不得把组件测试说成端到端验证。
12. `check_task.py` CHECKS PASS，记录 product_fingerprint；检查须在独立干净 worktree 中对被测提交运行（沿用 TASK-037 的路径，理由已由其 Review 认可）。
13. L3 执行链完整：独立只读 Reviewer 审 `b4a3fd0..candidate` 完整 diff；独立只读 Acceptance 核对上述 14 条完成条件。两者原文写回 EVIDENCE 区。
14. **实机验证由用户完成**：Agent 无法驱动浏览器加载扩展并点击图标。交付时必须当面请用户在 Edge（或 Chrome）中实测一次采集全流程，其结果据实补记——这条沿用 TASK-037 的做法，不得由 Agent 自行宣称满足。

## 上下文包

根 `AGENTS.md` + `extension/AGENTS.md` + `frontend/AGENTS.md` + 本记录。

只读参照（不改）：`backend/src/studypilot/infrastructure/security/local_access.py:17,154,170,200`（UI 源与 Sec-Fetch 校验，本任务不改但须据此设计转交路径）、`frontend/src/features/resources/api.ts:256,351`（`createResource` 与 `putResourceSnapshot` 的既有签名与校验）、`frontend/src/shell/pages.ts` 与 `Screen.tsx`（页面注册方式）、`frontend/src/features/resources/ContentSnapshot.tsx`（快照写入的既有交互与错误处理先例）、`extension/src/manifest.ts` 与 `manifest.test.ts`（白名单门闩）、`docs/research/阅读器与标注能力调研.md`（**作为调研输入，其建议须由本任务重新判断，不得当作已批准决定**；注意该文档至今未纳入 Git，见 TASK-037 遗留 L6）。

**审查输入的准备（TASK-037 的教训）**：本任务会引入 `extension/package-lock.json` 的大幅变更（首批运行时依赖）。派发 Review 时须用 `git diff <base>..<candidate> -- . ':(exclude)**/package-lock.json'` 导出 patch，另附直接依赖清单供核——TASK-037 的 Reviewer 因 2452 行锁文件连续三次被 watchdog 中断。同时须检查「必须共读才有意义」的文件对（如 manifest 权限清单与其宣称口径、检查组命令与 npm script 定义），不要把它们拆到不同 Reviewer。

准确命令：
- `cd extension && npm run format:check && npm run lint && npm run typecheck && npm run test -- --run && npm run build`
- `cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test -- --run && npm run build`
- `cd backend && ruff format --check . && ruff check . && mypy src tests && pytest`
- `cd frontend && npm run test:e2e`

## 实现与测试

- 实现 SHA/变更摘要：**`540027e`**（base `b4a3fd0`，31 个文件；其中 `extension/package-lock.json` 一个文件占了大部分行数）。
  1. **扩展侧**：`src/shared/protocol.ts`（消息契约与载荷校验）、`src/injected/extract.ts`（在文章页运行，Defuddle 提取 + 转 Markdown）、`src/injected/relay.ts`（只在本机 UI 源运行的中转脚本）、`src/popup/capture.ts`（编排逻辑，与 chrome API 解耦）、`src/popup/bridge.ts`（真实 chrome 接线）、popup 增加「保存这一页的正文」按钮。
  2. **构建**：内容脚本与注入脚本必须是经典脚本，而 Rollup 只在 es/system 下支持多入口，故新增 `vite.injected.config.ts`，用 `--mode` 选入口各构建一次（`extract.js`、`relay.js`），跟在 popup 构建之后、`emptyOutDir: false`。
  3. **权限**：`activeTab` + `scripting` + `storage` + 一条只匹配 `http://127.0.0.1:5173/*` 的 `content_scripts`。**未申请 `host_permissions`、未申请 `<all_urls>`**。manifest 白名单断言由五键扩到七键，另新增两条断言分别锁死权限清单的确切三项与内容脚本的唯一匹配源。
  4. **前端**：`features/capture/protocol.ts`（扩展协议的平行实现）与 `CapturePage.tsx`（确认页），在 `shell/pages.ts` 与 `shell/Screen.tsx` 注册 `/capture`；不放进导航（没有从扩展过来就没有内容可看）。
  5. **契约**：`docs/contracts/API与数据契约基线.md` 新增 **§14**「浏览器扩展与 UI 页面的消息契约」，含消息表、载荷约束、信任边界与权限边界。**openapi 快照一字未改**（本任务不新增、不修改任何 HTTP 操作）。
  6. **文档漂移守卫**：`extension/src/boundaries.test.ts` 新增一条断言——manifest 申请的每一项 reach 都必须在 `extension/README.md` 与 `extension/AGENTS.md` 里被提到，否则失败。
  7. **清掉 TASK-037 遗留 L8**：两处 README 与 `extension/AGENTS.md` 补 Edge 加载路径、改正验证状态表述、写入「只支持 Chrome 与 Edge」。

- 命令、真实退出结果、product_fingerprint、环境、未运行原因：

  **任务检查（全套）**：`check_task.py --task docs/tasks/TASK-038-extension-capture.md --candidate 540027e` → **CHECKS PASS**，base=`b4a3fd0`、files=31、`profiles=contracts,extension,frontend`、`product_fingerprint=f6c1552186cb08ae8c15c344a201c437b9a24f8dd5669ef886a0a4fef2bcc268`。完整输出留存于会话临时目录 `scratchpad/check-038.log`（145 行）；extension 组五条命令在第 7/17/25/33/50 行逐条可见、全部 exit=0，报 **6 files / 44 tests passed**；frontend 组报 **17 files / 380 tests passed**。运行环境沿用 TASK-037 经 Review 认可的路径：主工作区因未跟踪的 `docs/research/` 不满足脚本的干净要求，故 `git worktree add` 一个独立干净的 worktree 检出 `540027e` 后在其中运行（临时分支 `...-capture-check`，零提交差异、未推送，检查后连同 worktree 与 `.git/info/exclude` 的临时行一并删除）。

  **governance 组未被自动选中**：`selected_profiles()` 的治理规则只匹配根 `AGENTS.md` 与 `.codex/`、`.agents/`、`docs/governance/`、`scripts/governance/` 前缀，`extension/AGENTS.md` 不在其中——这与 TASK-037 第一轮 A 部分 Review 核实并接受的既有行为一致（其风险下限仍由 `risk-policy.json` 的 `**/AGENTS.md` 独立兜住 L3）。本任务未改治理脚本，另行单独运行治理组：`validate_governance.py` PASS、`ruff check/format --isolated scripts/governance` 全绿、`unittest discover -s scripts/governance` **23 tests OK**。

  **backend 组未被自动选中**（本任务不改 `backend/**`），另行在主工作区单独运行：`ruff format --check . && ruff check . && mypy src tests && pytest -q` → 全绿，**525 passed**，与基线一致。

  **e2e**：`cd frontend && npm run test:e2e` → **41 passed**，与基线一致。本任务未新增 e2e，原因见「已知限制」第 1 条。

  **变异验证（六项，均已回滚，回滚后复跑全绿）**：
  1. *信任边界是否真被测住*：删掉 `capturedFrom` 里的 `event.source` 与 `event.origin` 校验 → 采集页测试 **2 failed / 9 passed**。
  2. *「必须用户确认」是否真被测住*：让页面一收到内容就自动 `createResource` → **2 failed / 9 passed**。
  3. *内容脚本范围是否被锁死*：把 `matches` 放宽为 `[RELAY_MATCH, '<all_urls>']` → 扩展测试 **1 failed / 42 passed**。
  4. *扩展是否真的不直连后端*：在 `bridge.ts` 里加一行指向 `http://127.0.0.1:8000/api/v1/resources` 的常量 → **1 failed / 42 passed**。
  5. *权限清单是否被锁死*：给 manifest 加 `'tabs'` 而不改文档 → **2 failed**（权限断言 + 新增的文档漂移守卫各一条）。
  6. *文档漂移守卫是否有效*：见上第 5 项；该守卫在首次运行时就真实抓到一处缺漏（`extension/README.md` 未写出内容脚本的确切匹配源），已修。

  **实现过程中自查发现并修正的两处**（记录在案，因为它们都属本任务链上反复出现的缺陷类型）：① `extension/README.md` 与 `AGENTS.md` 仍写「顶层键恰好五个」，而实物已是七个——与 TASK-037 F1「宣称比实物宽」方向相反但同族，是「文档口径落后于实物」，第 6 项守卫即为此而加；② 我最初写的「不可用内容不开确认页」测试实际走的是超时分支，**是一条空断言**，改为让假 bridge 真实回传不可用内容、并断言结论必须是 `unusable` 而非 `timeout`。

  环境：macOS（Darwin 25.5.0）、Node v24、npm 11、Python 3.13（`backend/.venv`）。`extension/` 的依赖安装因用户级 npm 缓存 `EACCES` 需用仓库内 `.npm-cache`（README 既有 FAQ）。

- 已知限制/未完成项：
  1. **「点扩展图标 → 采集」这一段没有自动化端到端覆盖**：Playwright 驱动不了浏览器扩展。有覆盖的是两端各自的逻辑——扩展侧 `runCapture` 的编排顺序与五种失败分支、`relayHandler` 的消息过滤、`extractFromDocument` 在 jsdom 里的真实提取；前端侧 `/capture` 的握手、伪造消息拒绝、确认写入与半成功状态。**中间那一跳（真实 chrome.storage + 真实 content script）只有靠人实机验证**，见第 2 条。**本记录中的任何组件测试都不得被称作端到端验证。**
  2. **全流程从未在真实浏览器里跑过**：Agent 无法加载扩展、无法点击图标。完成条件 14 因此须由用户实测后据实补记，与 TASK-037 的做法一致。
  3. **图片不冻结**：正文里的图片引用仍指向原站，原站改版或删图后这部分内容会失效。属 TASK-039 的范围。
  4. **提取质量只在合成页面上验证过**：`extract.test.ts` 用的是一个人工构造的典型文章骨架（导航/正文/推荐位/广告/页脚），证明了噪声剔除与 Markdown 转换成立，但真实站点千差万别，尤其是知乎/CSDN 这类重前端框架的页面。首次实机使用时值得留意提取效果。
  5. **`extract.js` 产物 707 kB**（Defuddle full 含 Markdown 转换）。对本机扩展无实际影响，但它是注入到用户浏览页面的脚本，体积值得知道。
  6. **创建资料与写快照不是一个事务**：两次 HTTP 请求，第一步成功第二步失败时会留下一份没有正文的资料。页面对此有明确提示与去处（完成条件 5），但状态本身无法避免——除非后端提供「创建资料同时写快照」的合并操作，那属新的 HTTP 契约，不在本任务范围。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项（仅有真实问题时）：待填
- 日期与决定日志：2026-09-06 用户合并 TASK-037（PR #42，merge `b4a3fd0`）后回答本任务的两项范围问题：浏览器只做 Chrome 与 Edge、其他不扩展；采集正文与图片冻结拆成两个任务。主 Agent 据此把图片冻结移出本任务——理由是它躲不开后端改动（`content_snapshots` 只存 Markdown 且上限 100 万字符，`original_files` 为 `UNIQUE(resource_id)` 且 media_type 白名单不含图片，两者都装不下图片），属独立的 L3 数据模型任务。
<!-- EVIDENCE:END -->
