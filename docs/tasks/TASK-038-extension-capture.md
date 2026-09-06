# TASK-038：扩展采集网页正文（经 UI 页面写入快照）

```toml
schema_version = 2
id = "TASK-038"
status = "IN_REVIEW"
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
- **但中文契约文档要改一处**：`extension/AGENTS.md` §4（TASK-037 写入）规定「与 UI 页面之间的消息格式属跨模块契约，须在相应任务中与 frontend 一并定义并写入契约文档；不得由本模块单方面约定」。本任务新增的扩展↔`/capture` 页面 postMessage 格式正是这样一份跨模块契约，故须写入 `docs/contracts/API与数据契约基线.md`。**登记时把契约整体列为非目标是错的**——那会让本任务违反自己模块的嵌套规则。实现开始前据此修订 `allowed_paths`，新增 `docs/contracts/API与数据契约基线.md` 一条（不含 openapi 快照，因为这不是 HTTP 操作）。此项修订属**扩大**授权面，与 TASK-037 决定日志中「授权面修订只有在收窄时才安全」的判据方向相反，故须特别说明：① **【此条初版陈述不实，经第一轮 Review 后用 git 证伪，据实更正，不删除】** 初版写的是「它发生在任何实现写入之前、登记刚完成时」。实际情况是：`allowed_paths` 里的契约那一条**首次出现在实现提交 `540027e` 中**（登记提交 `6891166` 的 `allowed_paths` 只有 9 条、不含它），也就是**授权面的扩大与实现代码落在同一个提交里，没有一个独立的前置控制面提交**。我在编辑器里确实是先改记录再写代码，但提交历史里没有这个先后，而我把它当作事实写进了正当性论证的第一条。**本次修订的正当性因此不依赖时序**，而依赖下面②③两条可独立核验的事实；② 它的动因是遵守既有的嵌套规则，不是为了让某段已写好的代码合法；③ 若 Reviewer 认为该扩大不成立，正确的处置是把消息契约的定义方式退回讨论，而不是保留代码删掉文档。
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

- 实现 SHA/变更摘要：**最终实现 SHA `4ed3062`**（base `b4a3fd0`，32 个文件；其中 `extension/package-lock.json` 一个文件占了大部分行数）；第一轮实现 SHA 为 `540027e`，经第一轮 Review 的 R1 F1/F2/F3 与 R2 F1/F2/F3/F5 处置后被取代。**本段下方记录的命令与指纹一律是最终值**（`4ed3062` → `f22c17db…`）；第一轮的值只在明确标注「第一轮」处出现。
  1. **扩展侧**：`src/shared/protocol.ts`（消息契约与载荷校验）、`src/injected/extract.ts`（在文章页运行，Defuddle 提取 + 转 Markdown）、`src/injected/relay.ts`（只在本机 UI 源运行的中转脚本）、`src/popup/capture.ts`（编排逻辑，与 chrome API 解耦）、`src/popup/bridge.ts`（真实 chrome 接线）、popup 增加「保存这一页的正文」按钮。
  2. **构建**：内容脚本与注入脚本必须是经典脚本，而 Rollup 只在 es/system 下支持多入口，故新增 `vite.injected.config.ts`，用 `--mode` 选入口各构建一次（`extract.js`、`relay.js`），跟在 popup 构建之后、`emptyOutDir: false`。
  3. **权限**：`activeTab` + `scripting` + `storage` + 一条只匹配 `http://127.0.0.1:5173/*` 的 `content_scripts`。**未申请 `host_permissions`、未申请 `<all_urls>`**。manifest 白名单断言由五键扩到七键，另新增两条断言分别锁死权限清单的确切三项与内容脚本的唯一匹配源。
  4. **前端**：`features/capture/protocol.ts`（扩展协议的平行实现）与 `CapturePage.tsx`（确认页），在 `shell/pages.ts` 与 `shell/Screen.tsx` 注册 `/capture`；不放进导航（没有从扩展过来就没有内容可看）。
  5. **契约**：`docs/contracts/API与数据契约基线.md` 新增 **§14**「浏览器扩展与 UI 页面的消息契约」，含消息表、载荷约束、信任边界与权限边界。**openapi 快照一字未改**（本任务不新增、不修改任何 HTTP 操作）。
  6. **文档漂移守卫**：`extension/src/boundaries.test.ts` 新增一条断言——manifest 申请的每一项 reach 都必须在 `extension/README.md` 与 `extension/AGENTS.md` 里被提到，否则失败。
  7. **清掉 TASK-037 遗留 L8**：两处 README 与 `extension/AGENTS.md` 补 Edge 加载路径、改正验证状态表述、写入「只支持 Chrome 与 Edge」。

- 命令、真实退出结果、product_fingerprint、环境、未运行原因：

  **任务检查（全套，最终）**：`check_task.py --task docs/tasks/TASK-038-extension-capture.md --candidate 4ed3062` → **CHECKS PASS**，base=`b4a3fd0`、files=32、`profiles=contracts,extension,frontend`、`product_fingerprint=f22c17dbe1b81716f474543e350cc709eee2dc488e3eb2b313bb5b51984f4114`。完整输出留存于 `scratchpad/check-038-r2.log`（145 行）；extension 组五条命令在第 7/17/25/33/50 行逐条可见、全部 exit=0，报 **7 files / 78 tests passed**；frontend 组报 **17 files / 382 tests passed**（本轮未新增前端测试文件，新增用例都加在既有的 `CapturePage.test.tsx` 里）。

  第一轮（已被取代，仅备查）：`--candidate 540027e` → CHECKS PASS，files=31、同样三个 profile、`product_fingerprint=f6c1552186cb08ae8c15c344a201c437b9a24f8dd5669ef886a0a4fef2bcc268`，输出留存于 `scratchpad/check-038.log`；当时 extension 44 tests / frontend 380 tests。运行环境沿用 TASK-037 经 Review 认可的路径：主工作区因未跟踪的 `docs/research/` 不满足脚本的干净要求，故 `git worktree add` 一个独立干净的 worktree 检出 `540027e` 后在其中运行（临时分支 `...-capture-check`，零提交差异、未推送，检查后连同 worktree 与 `.git/info/exclude` 的临时行一并删除）。

  **governance 组未被自动选中**：`selected_profiles()` 的治理规则只匹配根 `AGENTS.md` 与 `.codex/`、`.agents/`、`docs/governance/`、`scripts/governance/` 前缀，`extension/AGENTS.md` 不在其中——这与 TASK-037 第一轮 A 部分 Review 核实并接受的既有行为一致（其风险下限仍由 `risk-policy.json` 的 `**/AGENTS.md` 独立兜住 L3）。本任务未改治理脚本，另行单独运行治理组：`validate_governance.py` PASS、`ruff check/format --isolated scripts/governance` 全绿、`unittest discover -s scripts/governance` **23 tests OK**。

  **backend 组未被自动选中**（本任务不改 `backend/**`），另行在主工作区单独运行：`ruff format --check . && ruff check . && mypy src tests && pytest -q` → 全绿，**525 passed**，与基线一致；处置后再次单跑 `pytest -q` 仍为 **525 passed**。

  **e2e**：`cd frontend && npm run test:e2e` → **41 passed**，与基线一致。本任务未新增 e2e，原因见「已知限制」第 1 条。

  **变异验证（第一轮六项 + 处置后四项，共十项，均已回滚，回滚后复跑全绿）**：
  1. *信任边界是否真被测住*：删掉 `capturedFrom` 里的 `event.source` 与 `event.origin` 校验 → 采集页测试 **2 failed / 9 passed**。
  2. *「必须用户确认」是否真被测住*：让页面一收到内容就自动 `createResource` → **2 failed / 9 passed**。
  3. *内容脚本范围是否被锁死*：把 `matches` 放宽为 `[RELAY_MATCH, '<all_urls>']` → 扩展测试 **1 failed / 42 passed**。
  4. *扩展是否真的不直连后端*：在 `bridge.ts` 里加一行指向 `http://127.0.0.1:8000/api/v1/resources` 的常量 → **1 failed / 42 passed**。
  5. *权限清单是否被锁死*：给 manifest 加 `'tabs'` 而不改文档 → **2 failed**（权限断言 + 新增的文档漂移守卫各一条）。
  6. *文档漂移守卫是否有效*：见上第 5 项；该守卫在首次运行时就真实抓到一处缺漏（`extension/README.md` 未写出内容脚本的确切匹配源），已修。
  7. *（处置 R1 F2 后）「不发网络请求」是否被钉住*：把 `useAsync` 改回 `true` → `extract.test.ts` **1 failed / 11 passed**；把 `.parse()` 改成 `.parseAsync()` → **3 failed**（该断言 + 两条依赖同步提取的实质断言）。
  8. *（处置 R2 F1 后）带锚点的网址是否被拒*：`normalizeSourceUrl` 与两份 `isCapturePayload` 各有用例；前端新增两条伪造投递用例（`#锚点`、带凭据）断言页面停在空态、不出现表单。
  9. *（新增守卫）协议漂移是否被捕获*：把**前端那份**的 URL 规则放宽（去掉 `#` 与反斜杠的拒收）→ 扩展侧的跨目录守卫 **1 failed / 24 passed**，报两份 `isSafeSourceUrl` 函数体不一致。
  10. *（R1 S6 的推断）实测不成立*：见「已知限制」第 5 条。

  **实现过程中自查发现并修正的两处**（记录在案，因为它们都属本任务链上反复出现的缺陷类型）：① `extension/README.md` 与 `AGENTS.md` 仍写「顶层键恰好五个」，而实物已是七个——与 TASK-037 F1「宣称比实物宽」方向相反但同族，是「文档口径落后于实物」，第 6 项守卫即为此而加；② 我最初写的「不可用内容不开确认页」测试实际走的是超时分支，**是一条空断言**，改为让假 bridge 真实回传不可用内容、并断言结论必须是 `unusable` 而非 `timeout`。

  环境：macOS（Darwin 25.5.0）、Node v24、npm 11、Python 3.13（`backend/.venv`）。`extension/` 的依赖安装因用户级 npm 缓存 `EACCES` 需用仓库内 `.npm-cache`（README 既有 FAQ）。

- 已知限制/未完成项：
  1. **「点扩展图标 → 采集」这一段没有自动化端到端覆盖**：Playwright 驱动不了浏览器扩展。有覆盖的是两端各自的逻辑——扩展侧 `runCapture` 的编排顺序与五种失败分支、`relayHandler` 的消息过滤、`extractFromDocument` 在 jsdom 里的真实提取；前端侧 `/capture` 的握手、伪造消息拒绝、确认写入与半成功状态。**中间那一跳（真实 chrome.storage + 真实 content script）只有靠人实机验证**，见第 2 条。**本记录中的任何组件测试都不得被称作端到端验证。**
  2. **全流程从未在真实浏览器里跑过**：Agent 无法加载扩展、无法点击图标。完成条件 14 因此须由用户实测后据实补记，与 TASK-037 的做法一致。
  3. **图片不冻结**：正文里的图片引用仍指向原站，原站改版或删图后这部分内容会失效。属 TASK-039 的范围。
  4. **提取质量只在合成页面上验证过**：`extract.test.ts` 用的是一个人工构造的典型文章骨架（导航/正文/推荐位/广告/页脚），证明了噪声剔除与 Markdown 转换成立，但真实站点千差万别，尤其是知乎/CSDN 这类重前端框架的页面。首次实机使用时值得留意提取效果。
  5. **`extract.js` 产物 707.60 kB**（Defuddle full 含 Markdown 转换）。对本机扩展无实际影响，但它是注入到用户浏览页面的脚本，体积值得知道。R1 的 S6 曾推断 `--mode extract` 可能导致 development 构建、体积数字要重报；**实测不成立**：产物中无 `process.env.NODE_ENV` 残留、无 `"development"` 字面量，且以 `--mode production` 重建得到**完全相同的 707.60 kB**。另一项观察：产物内有 5 处 `console.log` 调用点（来自 Defuddle），**我未验证它们在 `debug: false` 默认值下是否可达**，记为观察而非结论。
  6. **创建资料与写快照不是一个事务**，且有**两个**半成功状态，不是一个：
     - **创建成功、写快照失败**：留下一份没有正文的资料。页面明确告知、给出去处、并把正文原样留在屏幕上供复制（完成条件 5），不自动重试。
     - **创建请求在服务端成功但客户端没拿到可解析响应**（后端重启、`INVALID_RESPONSE`）：此时 `created` 仍为 null，页面走普通错误分支，**不会提示可能已经产生了一份孤儿资料**，用户重试就会得到重复资料。这条是第二轮 Review（R2 的 F3）指出的，初版记录只写了前一种。
     两者都无法在客户端根治——除非后端提供「创建资料同时写快照」的合并操作，那属新的 HTTP 契约，不在本任务范围。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：第一轮候选 **`8533b87`**（代码 `540027e`，base `b4a3fd0`）。经第一轮 Review 处置后的代码修订 SHA 为 **`4ed3062`**（`product_fingerprint=f22c17dbe1b81716f474543e350cc709eee2dc488e3eb2b313bb5b51984f4114`，全套 CHECKS PASS）；其后 `f274c05` 只更正了任务记录中被 git 证伪的时序陈述并把「实现与测试」段改为最终值，指纹不变。**本轮冻结候选即本条写回所在的提交**，其精确 SHA 在下一次写回（增量复核结论）时补记 —— 提交无法引用自身，与根 `AGENTS.md` §6「候选精确 SHA 在之后的 Review/证据段记录」一致。
- Review（第一轮，L3 独立只读，`b4a3fd0..8533b87`，按问题域拆 R1 扩展侧 / R2 前端与契约两部分并行，协议三件套**故意重叠**给双方）：**整体 CHANGES_REQUIRED**（R1 PASS + R2 CHANGES_REQUIRED，按「任一为 CHANGES_REQUIRED 则整体从其严」计）。两份报告原文如下，未作任何压缩或改写。

# TASK-038 Review · R1 部分：扩展侧、权限与提取

## 只读身份与权限证据

本实例通过 `tools` 白名单只被授予 `Read` / `Grep` / `Glob`，**没有** `Write`/`Edit`/`NotebookEdit`，也**未授予** `Bash`。因此在运行器层面无法写文件、无法提交/推送/合并，本轮全程只有读取与检索调用。独立于实现者（唯一写入者 `coordinator`），无上下文继承。

- base = `b4a3fd0`，冻结候选 = `8533b87`（实现 SHA `540027e`）。
- 审查输入：`.../scratchpad/T038-R1-ext.patch`（1132 行 / 22 文件）完整读毕，并按要求跳过 `extension/package-lock.json`。
- 机械证据（CHECKS PASS、`profiles=contracts,extension,frontend`、`product_fingerprint=f6c1552…c268`）按 **NOT_RUN** 对待，本报告不声称验证过任何命令。

## 覆盖文件全集

patch 内已逐行读透：`README.md`、`extension/AGENTS.md`、`extension/README.md`、`extension/package.json`、`extension/popup.html`、`extension/tsconfig.json`、`extension/vite.injected.config.ts`、`extension/src/manifest.ts`、`extension/src/manifest.test.ts`、`extension/src/boundaries.test.ts`、`extension/src/shared/protocol.ts`、`extension/src/injected/extract.ts`、`extension/src/injected/extract.test.ts`、`extension/src/injected/relay.ts`、`extension/src/injected/relay.test.ts`、`extension/src/popup/{main,bridge,capture,popup}.ts`、`extension/src/popup/{capture,popup}.test.ts`、`frontend/src/features/capture/protocol.ts`（仅作扩展侧对照）。

patch 外为交叉验证而独立读取：`extension/vite.config.ts`、`extension/eslint.config.js`、`extension/package.json`（实物）、`extension/node_modules/defuddle/package.json`、`defuddle/dist/index.full.d.ts`、`dist/types.d.ts`、`dist/defuddle.js`（构造/`parse`/`parseAsync`/`parseInternal`）、`dist/index.full.js`（检索）。

---

## 核查结论要点

**权限最小性（重点 1）——通过。** `activeTab`/`scripting`/`storage` 三项**逐项都被真实使用**，无冗余：`scripting` 用于 `bridge.ts:21` 的 `executeScript`；`storage` 用于 `bridge.ts:24` 的 `chrome.storage.local.set` 与 `relay.ts:26` 的读取，确为必需（popup 打开新标签页后即被关闭，内容必须落存储中转）。`bridge.ts:9` 用 `chrome.tabs.query` 只取 `tab.id`、`bridge.ts:27` 用 `chrome.tabs.create` — 二者在 MV3 下**不需要** `tabs` 权限（无该权限时仅 `url`/`title`/`pendingUrl` 被抹去），所以没有申请 `tabs` 是正确且必要的最小化，`manifest.test.ts:56` 的 `not.toContain('tabs')` 与实现自洽。`activeTab` 的语义按 Chrome MV3 实际规则复核：点击工具栏图标（打开 popup）即构成一次调用，只对当前活动标签页授予临时主机访问，这正是本流程所需，`host_permissions`/`<all_urls>` 的替代方案确实严格更大。**这套组合我判断已经不能再小**。

**白名单门闩（重点 1 续）——仍然咬得住。** `manifest.test.ts` 的顶层键断言从 5 键诚实地改为 7 键的精确集合（`:37-45`），新增 `host_permissions`、`optional_permissions`、`externally_connectable`、`web_accessible_resources`、CSP 覆写、`background` 等**任何顶层键仍会变红**。新增的三条断言是实质加固而非稀释：`permissions` 精确等于三项；`content_scripts` 长度为 1、`matches` 精确等于 `[UI_ORIGIN + '/*']`，**并且额外断言 `expect(UI_ORIGIN).toBe('http://127.0.0.1:5173')`** —— 这一条关键，它堵死了「改 `UI_ORIGIN` 常量来偷偷放宽 matches 而测试仍绿」的洗白路径；再加一条 `EXTRACT_SCRIPT` 不得被声明为静态内容脚本。门闩没有被改成形同虚设。

**`extension/AGENTS.md` 底线——只增不减。** §3 三条底线逐字保留（`extension/AGENTS.md:20-22`：不引入第三方站点凭证、不绕过访问控制、不改 `security/local_access.py` 且不直连 `/api/v1`），一字未松。新增的 `:16`（浏览器范围）、`:23`（已授予 reach 逐条有据、明确「不申请 host_permissions/`<all_urls>`」）都是**新增约束**。白名单条目 `:24` 从「五个」放宽到「七个」是必要且**诚实**的：它列出了确切键名，而非模糊化。`boundaries.test.ts` 新增的两条源码扫描（禁 `/api/v1`、`127.0.0.1:8000`；禁 `chrome.cookies`/`document.cookie`/`cookieStore`/`webRequest`）把两条原本只能靠人眼守的底线变成了会报警的机械门闩，且带 `sources().length >= 6` 反恒真守卫（当前实为 8 个源文件），是本轮的正向增量。

**注入链路与依赖上下文（重点 4 + 依赖问题）——设计正确。** `defuddle` 只被 `extract.ts` 引用，因此只会被打进 `dist/extract.js` 这**一个**产物；`relay.js` 与 popup 产物都不含它。`extract.js` 仅在用户点击后经 `chrome.scripting.executeScript` 注入，运行在**隔离世界（isolated world）**，不是页面主世界：它能读页面 DOM，但页面 JS 拿不到它，且 IIFE 的全局名 `StudyPilotExtract` 落在隔离世界的 global 上，不会泄漏给页面。构建入口与格式与 `package.json:16` 的 `build` 脚本一致（"共读文件对 3" 核对通过）：主 `vite build` 先以 `emptyOutDir: true` 产出 popup，随后两次 `-c vite.injected.config.ts --mode extract|relay` 以 `emptyOutDir: false` 追加 `dist/extract.js`、`dist/relay.js`，名字与 `manifest.ts:34-35` 及 `bridge.ts:21` 相符；顺序正确，不会互相清空。`vite.config.ts` 仍从 `src/manifest.ts` 单一来源生成 `dist/manifest.json`，测试断言的就是构建发货的同一模块，无第二份可漂移。

关于 `defuddle` 的供应链定级（我的独立判断）：它是一个**零权限基线扩展的第一个运行时依赖**，因此定级不能只看包本身，要看它落在哪个上下文。落点是隔离世界的内容脚本，那里可以访问 `chrome.runtime` 与 `chrome.storage`（扩展已申请 `storage`），因此**一旦该包被投毒，攻击者可读取 `pendingCapture` 暂存的正文，并可在用户点击过的那一页里注入元素做外发**；但由于**没有任何 host_permissions**，它无法跨源读取响应，攻击面被 activeTab 的「一次点击、一个标签页」显著收窄。我复核了实物：`defuddle/full` 是 webpack 自包含浏览器 bundle，**bundle 内没有任何 `require(`/`node:`/`fs`/`child_process` 引用**，`commander`、`linkedom` 等不可达，即不会有 Node 代码进入产物；对 `new Function`/`eval` 的检索唯一命中是 LaTeX 宏字符串 `\eval`/`\evaluated`（temml 的数学宏表），**不是 JS 动态求值**，不会撞 MV3 的 CSP。综合定级：**中等且已被架构收窄，非阻断**；主要控制手段是 `npm ci` 的锁文件钉死与升级时的重新审查。

**"不发网络请求"这一用户可见承诺——对本候选成立，但只是偶然成立。** `defuddle` 的 `DefuddleOptions` 明确提供 `useAsync`（"allow async extractors to **fetch content from third-party APIs**"，**默认 true**）与 `fetch` 覆写，其 `index.full.js` 内含大量 `fetch(` 调用点。我据 `dist/defuddle.js` 复核：`defuddle.js` 自身**零个** `fetch(` 调用点，全部 16 处分散在 `fetch.js`/`extractors/_base.js`/`youtube|reddit|bilibili|x-oembed|c2-wiki` 中，**只经 `extractAsync()` 到达**，而 `extract.ts:14` 调用的是同步 `parse()`，同步方法无法 await 这些路径。故根 `README.md:252` 的「它不发网络请求」对 `8533b87` **是真的**。但见 F2。

**测试是否咬得住（重点 5）——按代码判断，能变红，且实现者自述的那条空断言确已被真正修好。** `capture.test.ts` 的 `unusable` 四例中，假 bridge 的 `inject` 会**同步**调用 `deliver(bad)`，`extracted` promise 因此在 race 前就已 resolve，必然走到 `capture.ts:33` 的 `isCapturePayload` 失败分支；测试又**显式断言 `reason: 'unusable'`** 而非只断言「没开确认页」，这正好使「悄悄退化成 timeout 分支」不可能再无声发生。其余关键用例逐条验过可变红：调用顺序 `['subscribe','inject','stash','open','unsubscribe']`（把先订阅后注入的顺序改反即红）、`inject-failed`、`timeout`（用 `NOTHING` 哨兵，`deliver` 永不被调用，是真超时）、`no-tab`（`calls` 为空）。`relay.test.ts` 的 5 条拒收 + 4 条坏暂存均绑定真实输入并附 `storage.get` 未被调用的断言。`extract.test.ts` 跑真实 `defuddle` + jsdom，断言是「正文必须在、噪声必须不在」的实质断言而非 `toBeDefined()` 式空壳。**我没有找到同类空断言。**唯一接近恒真的是 `manifest.test.ts:57-58` 的 `not.toContain('tabs'|'cookies')`——在其上一行精确相等断言已通过的前提下它必然为真，但它不制造虚假信心（真正的门闩是精确相等那一条），属无害的意图注释。

---

## Findings

### 必须修复（阻断）

**No blocking findings.**

### 可记录后继续

**F1 — 文档漂移门闩覆盖不到根 README，而根 README 正是四处宣称之一。**
`extension/src/boundaries.test.ts:40-43` 的 docs 门闩只读 `../README.md` 与 `../AGENTS.md`，即 `extension/README.md` 与 `extension/AGENTS.md` **两份**；但该测试自身的注释（`:38`）写的是「三处宣称」，而任务口径是四处。我实测根 `README.md`：`:252` 对权限清单与「不发网络请求」的陈述**准确**，但它写的是「只匹配**本机 UI 源**的内容脚本」，**不含字面的 `http://127.0.0.1:5173/*`**——因此即使把它塞进门闩的 docs 列表，当前写法也会直接失败。
触发：将来任何一次 manifest 权限/匹配源变更，只要作者只改了 `extension/` 下两份文档，根 README 就会静默停在旧口径，测试全绿。
影响：根 README 是普通用户最先读到的权限承诺；口径滞后属隐私陈述失准。这与 TASK-037 阻断项 F1 是同一条链（"宣称范围 > 门闩实际覆盖范围"），本轮**没有重演 F1 本身**（本轮各处宣称与实物一致，我逐条比对过），但**留下了同一条链上的机械覆盖缺口**。
最小修复：把根 `README.md` 纳入 `boundaries.test.ts` 的 docs 列表（路径 `../../README.md`），并把 `:252` 的「只匹配本机 UI 源」补成「只匹配本机 UI 源 `http://127.0.0.1:5173/*`」；同时把该测试注释里的「三处」改为与实际读取的份数一致。
分类：**可记录后继续**（当前无口径失准，属预防性门闩缺口；修复成本约三行）。

**F2 — `defuddle` 的 `useAsync` 默认为 true，"不发网络请求"未被任何显式开关或测试钉死。**
`extract.ts:14` 未传 `useAsync: false`；该承诺当前仅由「调用了同步 `parse()` 而非 `parseAsync()`」这一实现细节保障（我已核实 `defuddle.js` 同步路径无 fetch 调用点）。
触发：升级 `defuddle`、或将来有人把 `parse()` 改成 `parseAsync()` 以支持 YouTube/Reddit 抽取、或上游把 fire-and-forget 请求挪进同步路径。
影响：扩展会向第三方 API 发出请求（可能携带用户正在阅读的页面 URL），直接推翻根 `README.md:252`、`extension/README.md`、`extension/AGENTS.md` 中面向用户的绝对承诺；因无 host_permissions，跨源响应读不到，但请求本身仍会外发，属隐私陈述失准。当前发生概率为零。
最小修复：`extract.ts:14` 改为 `new Defuddle(doc, { url, markdown: true, useAsync: false })`，并在注释中写明「这一行是『不发网络请求』这条用户承诺的落点」。成本一行。
分类：**可记录后继续**（强烈建议本轮顺手修，因为它把一条偶然为真的用户承诺变成结构性为真）。

**F3 — `extension/AGENTS.md` §3 内部存在字面自相矛盾：`:25` 禁止「不记录用户正文」，`:23` 又授权把正文暂存进 `chrome.storage.local`。**
`bridge.ts:24` 确实把整篇采集正文写入 `chrome.storage.local` 的 `pendingCapture`。`:23` 明确授权（"暂存一份待交付内容，交付即删"），`relay.ts:16-18` 也确实在校验**之前**就 `remove`，因此坏数据同样会被清掉，实现是稳妥的。但 `:25` 那条不变量自 TASK-037 一字未改，两条并列会让后续 Agent 可以各取所需地援引。另有一处真实残留：若用户点了采集却再也不打开 `/capture`，这份正文会**无限期留在扩展 profile 的磁盘上**，直到下次采集覆盖或下次 relay 触发。
触发：下一位改扩展存储的 Agent 援引 `:25` 或 `:23` 中任一条。
影响：模块不变量可被两向解释；以及未交付正文的磁盘滞留。
最小修复：把 `:25` 改为「除 §3 已授权、交付即删的 `pendingCapture` 暂存外，不在扩展存储中持久化…」，并在 `extension/README.md` 隐私段落用一句话告知用户「未确认的采集会暂存在扩展本地存储中，下次采集或下次打开确认页时清除」。
分类：**可记录后继续**。

### 可选建议

- **S1** `manifest.test.ts` 只锁了 `content_scripts[0]` 的 `matches`、`js` 与数组长度，**未锁该条目的键集合**。新增嵌套键 `world: 'MAIN'`、`all_frames`、`exclude_matches`、`match_origin_as_fallback` 都**不会**让顶层白名单变红；当前唯一拦阻是 `manifest.ts:29` 手写 `Manifest` 类型的多余属性检查，而那个类型就在同一文件、放宽只需一行。影响有限（内容脚本只跑在自家 UI 源上），但门闩宣称的是「任何新增键都会失败」，严格说只对顶层成立。建议加 `expect(Object.keys(manifest.content_scripts[0]!).sort()).toEqual(['js','matches','run_at'])`。同理，`extension/README.md` 与 `AGENTS.md` 中「新增任何键都会让测试失败」建议写成「任何新增**顶层**键」。
- **S2** `bridge.ts:21` 用字符串字面量 `'extract.js'` 而非 `manifest.ts:35` 已导出的 `EXTRACT_SCRIPT`。同时构建产物文件名来自 `vite.injected.config.ts` 的 `mode`（`${mode}.js`），于是 "extract.js"/"relay.js" 在仓库里有**三处独立拼写**，没有任何测试把它们绑在一起（`manifest.test.ts` 只对 `POPUP_PAGE` 做了 `existsSync`）。重命名入口会产出指向不存在文件的 manifest，且测试全绿、只在实机加载时暴露。建议 `bridge.ts` 改用 `EXTRACT_SCRIPT`，并导出 `ENTRIES` 后加一条断言其键与两个常量一致。
- **S3** `defuddle` 的 `parse()` 在克隆前会对**用户的活文档**做两处轻微改写：`defuddle.js:53-56` 的 `_normalizeAttributes(this.doc.body)` 与 `_resolveNoscriptImages(this.doc.body)`。所有删除/清理都发生在 `defuddle.js:794-797` 的 `cloneNode(true)` 副本上，**用户页面不会被掏空**，但 `srcSet→srcset` 一类属性归一化与 noscript 懒加载图替换会落在实页上，理论上可能在 React/Vue 页面引发一次 hydration 抖动或图片跳变。文档一律称「只读取」，建议在 `extract.ts` 注释里如实标注这一处非只读副作用。
- **S4** `extract.ts:29` 的 `chrome.runtime.sendMessage` 没有 `.catch()`。MV3 popup 会在失焦时关闭；若用户点击采集后立刻点向别处，唯一的接收端消失，会在页面控制台留下未处理的 rejection，整次采集静默丢失（无数据泄漏）。鉴于「TASK-038 采集全流程尚待首次实机确认」，建议加 catch 并在实机验证时专门试一次这个时序。
- **S5** `relay.test.ts:35` 的 `postMessage` mock 只捕获第一个实参，`relay.ts:21` 的 `targetOrigin`（`win.location.origin`）**没有任何断言**；改成 `'*'` 不会有测试变红。同源自投场景下不可利用，但这是信任边界上的参数，值得断言。
- **S6** `vite build -c vite.injected.config.ts --mode extract|relay` 用 `--mode` 传入了非 `production` 的模式名，这会影响 Vite 的 `isProduction` 判定与 `process.env.NODE_ENV` 替换值，可能让 `extract.js` 走上 defuddle 的 development 分支（体积/日志差异，非安全问题）。若实机确认时发现产物异常大或控制台有调试输出，先查这一点。**我未运行构建，此项属推断，不作为 finding。**

---

## 覆盖与缺口

**已看透**：权限最小性与 `activeTab` 的 MV3 实际语义、内容脚本 matches 的可放宽性、`manifest.test.ts` 门闩的实际咬合力、四处宣称与实物的逐条比对、`extension/AGENTS.md` 三条底线的存废、注入链路的执行上下文与数据流向、构建入口与 `build` 脚本的一致性、扩展侧全部新增测试的可变红性、`defuddle` 的产物落点与网络能力可达性。

**明确缺口（未读或未读透，不猜测）**：

1. **`extension/package-lock.json` 完全未读**（按任务指令排除）。因此「228 包、resolved 全部指向官方 registry、无 `file:`/`git+`、唯一 `hasInstallScript` 为 `fsevents`」**纯属实现者自述抽查，我未做任何独立核实**，报告中不得当作已验证。我独立核实的只有 `package.json` 的依赖清单本身，以及 `defuddle/full` 产物内不含 Node 代码。注意 `defuddle` 声明了 4 个 `optionalDependencies`（`linkedom`/`mathml-to-latex`/`temml`/`turndown`），npm 默认会安装它们——它们进入了本机 `node_modules`（开发机供应链面），但**不进入扩展产物**。若主 Agent 需要完整供应链结论，应就锁文件补派一次定向审查。
2. **`defuddle/dist/index.full.js` 只做了定向检索**（`fetch(`/`eval`/`new Function`/Node 内置模块/凭证 API），**未逐行审读**这个压缩 bundle，也未审 `markdown.js` 的 HTML→Markdown 转换是否会在极端输入下产生异常输出。对一个第三方 bundle 而言逐行审读不现实，这是接受依赖时的固有残留。
3. **所有机械检查按 NOT_RUN 处理**：我未运行 `npm run test`/`typecheck`/`lint`/`build`。`extract.test.ts` 依赖真实 `defuddle` 在 jsdom 下的行为，我只能判断其**断言是实质的**，无法判断其**当前是否通过**——这一点必须由 CHECKS PASS 证据承担。
4. **`extension/dist/` 产物未检视**（未构建，且产物不入库）。IIFE 全局名不泄漏给页面、`extract.js` 自包含 defuddle 等结论来自配置与源码推理，**未经实机或产物验证**。
5. **R2 范围整体未覆盖**：前端 `/capture` 页与 `CapturePage.tsx`、postMessage 信任边界的前端侧校验、契约文档 §14、e2e 覆盖陈述、任务记录叙述。我只从扩展侧看了 `frontend/src/features/capture/protocol.ts`，确认它与 `extension/src/shared/protocol.ts` 的 `CAPTURE_READY`/`CAPTURE_PAYLOAD` 常量值、三个上限值与 `isCapturePayload` 逻辑**逐字一致**；但**两份定义之间没有任何构建或测试耦合，没有任何机械手段能在将来发现漂移**——是否需要一条跨目录的常量一致性检查，请与 R2 的结论合并判断。
6. 明示非目标（图片冻结、Firefox/Safari、A4 契约清单漂移、`validate_governance.py` 第二份清单）未审，按要求不作为 findings。

## 剩余风险

1. 采集全流程**从未实机运行过**（文档自述 TASK-037 只在 Edge 验证过弹窗加载，Chrome 未实测，TASK-038 全流程待首次确认）。activeTab 授予时机、popup 失焦关闭的时序（S4）、`chrome.storage` 中转握手在真实 React 挂载时序下是否可靠，都只有单测覆盖。
2. 第一个运行时依赖引入后，供应链面从零变为非零，且落在能访问 `chrome.storage`/`chrome.runtime` 的内容脚本上下文中；控制手段仅有锁文件钉死，且锁文件本轮未经独立审查（缺口 1）。
3. 协议双份定义无构建耦合，漂移只能靠人守（缺口 5）。
4. 未交付的采集正文会滞留在扩展本地存储磁盘上（F3）。

## 结论

**PASS**

覆盖边界：本结论**仅覆盖 R1 问题域**（扩展侧、权限与提取），且以上述「覆盖与缺口」为限——特别是 `package-lock.json` 的供应链完整性**未经我独立核实**，全部机械检查按 NOT_RUN 计。核心四项（权限最小性、四处宣称口径一致性、`extension/AGENTS.md` 底线存废、白名单门闩是否仍咬得住）我已逐条看透，**均无阻断项**：权限组合已不能再小且逐项有真实使用，`activeTab` 语义与实现者描述相符，内容脚本匹配源被 `UI_ORIGIN` 字面断言双重钉死，TASK-037 的门闩被诚实放宽而非架空，TASK-037 阻断项 F1 未重演。F1/F2/F3 三项建议按「可记录后继续」处置，其中 F2 与 F3 的修复各约一行、建议本轮顺手做。本任务的完整 Review 结论须与 R2 报告合并后才成立。

# TASK-038 Review · R2 部分：前端、信任边界与契约

## 只读身份与权限证据

我作为独立子 Agent 运行，工具白名单仅 `Read` / `Grep` / `Glob`：无 `Write`/`Edit`/`NotebookEdit`，无 `Bash`（因此也无法 git 操作、无法提交/推送/切分支、无法运行任何检查）。这是运行器层面的真实只读，非声明式承诺。我独立于实现者（`coordinator`），无上下文继承。本轮未写入任何文件。

**base** `b4a3fd0` → **candidate** `8533b87`（实现 SHA `540027e`）。机械证据（CHECKS PASS、`profiles=contracts,extension,frontend`、`product_fingerprint=f6c1552…268`、六项变异验证）按 **NOT_RUN** 处理，我未运行也未复核其执行事实；下文所有判断均出自源码静态分析。

## 覆盖文件全集

patch 内 8 文件全部逐行读完：`docs/contracts/API与数据契约基线.md` §14（新增 42 行）、`extension/src/shared/protocol.ts`、`extension/src/injected/relay.ts`、`frontend/src/features/capture/{protocol.ts,CapturePage.tsx,CapturePage.test.tsx}`、`frontend/src/shell/{Screen.tsx,pages.ts}`。
交叉验证另读（工作树，未在 patch 内）：`backend/.../resources/contracts.py`、`.../resources/snapshots.py`、`frontend/src/features/resources/api.ts`、`frontend/src/App.tsx`、`frontend/src/test/render.tsx`、`frontend/src/features/resources/fixtures.ts`、`extension/src/injected/extract.ts`、`extension/src/popup/{capture.ts,bridge.ts,popup.ts}`、`extension/AGENTS.md`、`frontend/AGENTS.md`、`docs/tasks/TASK-038-extension-capture.md`、`TASK-037-extension-baseline.md`（相关段）、`docs/tasks/任务索引.md`、`frontend/src/styles.css`（类名存在性）、全 `frontend/src` 的 HTML 汇聚点检索。

---

## 核查重点逐条结论

### 1. postMessage 信任边界 —— **成立，未找到可用绕法**（最高优先级，明确结论）

`frontend/src/features/capture/protocol.ts:510-517` 的 `capturedFrom` 我逐条推演过实现者点名的每一种绕法：

- **`event.source === window` 能否被伪造**：`source` 由浏览器按 HTML 规范的 incumbent settings object 填写，脚本无法设置，`MessageEvent` 构造函数只在**页面自己 dispatchEvent** 时可控（那已等价于同窗口代码执行）。
- **iframe**：子框架调 `parent.postMessage(...)`，incumbent 是子框架的 global，接收端 `event.source` 是 iframe 的 `contentWindow` ≠ `window` → 拒。同源子框架若想伪造，须先在父窗口执行脚本，那已是同源代码执行，越过任何 JS 层校验。
- **`window.opener` / `window.open`**：无论跨源还是同源，opener 发来的消息 `source` 是 opener 窗口 ≠ 本窗口 → 拒。攻击者拿到 `/capture` 的 window 句柄也只能作为发送方出现。
- **其它信道**：`MessagePort`/`BroadcastChannel`/`ServiceWorker.client.postMessage` 的 message 事件不派发到 `window` 的 `message` 监听器（前二者派发到 port/channel 对象，后者到 `navigator.serviceWorker`），不构成旁路。
- **隔离世界**：这一条实现者问得对——`source === window` 证明的是「消息由**本窗口内运行的脚本**发出」，**不是**「由 StudyPilot 扩展发出」。内容脚本虽在隔离世界，共享同一个 Window，故 `source === window` 成立；同理，**任何**对 `127.0.0.1:5173` 有访问权的第三方扩展的内容脚本同样能满足。这不是缺陷：能在该源注入内容脚本的扩展本就能直接替用户点击按钮，不构成权限升级；而**远程网页无法在该窗口内执行脚本**，正是这道校验要挡的对象，它挡住了。
- **结构校验被骗**（原型污染 / getter / `toString`）：`postMessage` 走结构化克隆，接收端拿到的是接收方 realm 的纯数据对象，getter/Proxy/自定义原型都无法穿过；`__proto__` 反序列化用 CreateDataProperty，不触发 setter。`isCapturePayload`（:499-507）先 `typeof !== 'string'` 全部拒非字符串，无对象注入面。

**唯一实现层面的瑕疵**（不构成漏洞，见可选建议 O1）：`isCapturePayload` 校验的是解构出的**副本**，`capturedFrom` 返回的却是原对象 `envelope.payload`，`CapturePage.tsx:342-346` 之后又重新读取属性——这在有 getter 的世界里是 TOCTOU，但结构化克隆使其在真实浏览器中不可达（仅在测试的 `dispatchEvent` 路径下可构造）。

**纵深防线我独立核实为真**：全 `frontend/src` 检索 `dangerouslySetInnerHTML|innerHTML|new Function|eval(` **零命中**；唯一的 URL 出链 `ResourceDetail.tsx:106-111` 的 `href` 走 `safeWebUrl`（`api.ts:419-432`，拒 `javascript:`、空白、控制字符、`#`、凭据）。因此契约 §14.3 末段「即便以上全部被绕过，攻击者也只能让确认页预填一段文字」**属实**——被注入的文本没有任何 HTML/JS 汇聚点，最坏后果限于文本预填 + 用户误点。

### 2. 「必须用户确认才写入」 —— **守住，未发现任何非点击写入路径**（明确结论）

`createResource` / `putResourceSnapshot` 在 `CapturePage.tsx` 中**只有一处调用**（:377,:382），位于 `save()` 内，`save` 只被 `<form onSubmit={save}>`（:424）引用。全文件两个 `useEffect`（:334 生命周期标志、:349 注册监听 + 发 READY）均无写入；消息处理器 `receive`（:341-347）只 `setState` 预填。无自动提交、无错误重试（半成功分支只 `setPartial`，:387）、无定时器。竞态：`busy.current` 在 `await` 前同步置位（:371），且 `fieldset disabled={pending}`（:425）在挂起期间禁用提交按钮，重复提交双重挡住。扩展侧 `capture.ts:27-66` 的 `runCapture` 也确实不写入，只 stash + 开页。

### 3. 协议三处一致性 —— **一致；三个长度数字我独立核对无误**

我不采信记录的行号引用，直接读了后端：`contracts.py:50` 标题 `max_length=200`、`contracts.py:68` `source_url` `max_length=2048`、`snapshots.py:8` `SnapshotContent` `max_length=1_000_000`（且 `min_length=1` + `not_blank`）。三处（`extension/src/shared/protocol.ts:112-116`、`frontend/.../protocol.ts:483-487`、契约 §14.2 表）**数值与语义完全一致**，`isCapturePayload` 两份实现逐字等价，`CAPTURE_READY`/`CAPTURE_PAYLOAD` 字符串一致。`extract.ts:21-23` 在提取端就按同样上限截断，所以「超长导致整条静默丢弃」不成立。
**但 URL 的格式约束三处都不足**，见 F1。

### 4. 契约 §14 与授权面扩大 —— **判定成立，不阻断**（这是与 TASK-037 判据方向相反的一次修订，我按其原文逐条判）

TASK-037 沉淀的判据原文（`TASK-037-extension-baseline.md:431,746`）我已核对，其阻断情形是「**为让已写进去的东西合法而扩写授权**」，其安全性论证的机制是「收窄绝不可能放行未经审查的产品变化」。据此对本次扩大逐条核：

1. **动因是外部既有规则，不是本任务的产物**：`extension/AGENTS.md:31` 逐字写着「与 UI 页面之间的消息格式属跨模块契约，须在相应任务中与 `frontend/` 一并定义并写入契约文档；不得由本模块单方面约定」。该规则在 TASK-037 已合并冻结。不扩 `allowed_paths` 就必然违反自己模块的嵌套规则——这与「为既成事实追认」有实质区别。
2. **风险面被 diff 形态本身限死（我从 patch 独立核实，非采信记录）**：契约文件的 hunk 是 `@@ -697,3 +697,45 @@`，**零删除、零改写**，§14 纯追加于文件末尾，既有条款一字未动；§14.1 明确写明第 7 节本机访问门禁一字未改。因此这次扩大**没有**放行任何未经审查的既有契约变更。
3. **被"追认"的对象正在本次审查范围内**：§14 描述的协议就是本候选交付的协议，它与实现同处一个 diff、同受这次 Review 覆盖，不存在"绕过审查取得合法性"的空间。

**我未能核实的一点（如实标注）**：记录理由①称该修订发生在任何实现写入之前。我无 Bash/git，**无法验证 `allowed_paths` 修订提交与实现提交 `540027e` 的先后**。建议由主 Agent 或 Acceptance 用一条 `git log` 确认；即便时序相反，上述 1、2 两条仍独立成立，我的结论不变。
按任务交代的处置口径：我**不**建议"删掉文档保留代码"——那恰恰会违反 `extension/AGENTS.md:31`。

### 5. e2e 边界陈述 —— **诚实；测试可以变红，非恒真**

记录 完成条件 11 与 已知限制 1 都明确写「Playwright 驱动不了扩展」「本记录中的任何组件测试都不得被称作端到端验证」，`CapturePage.test.tsx` 全篇用 `dispatchEvent` 构造消息，无一处自称 e2e。**未发现把组件测试说成端到端验证。**
断言可红性我逐条推演：伪造用例（:207-223）的**第二条**断言 `queryByRole('form', {name:'确认采集内容'})).not.toBeInTheDocument()` 在 `await waitFor` 之后执行，此时 React 的同步 lane 微任务已冲刷，若删掉 source/origin/结构任一校验，表单会出现 → 变红；六个用例分别绑定 `source`、`origin`、缺字段、空白正文、`javascript:` scheme、非对象载荷，与被测输入真实绑定。正向用例（:196-205、:225-267）用 `findByDisplayValue`/断言 POST body 等于采集内容，构成有效的"正反配对"，使负向用例不至于恒真。写入断言 `request.mock.calls.filter(([, options]) => options?.method)).toEqual([])` 虽弱，但确实会因任何写请求变红。前端 380 − 基线 369 = 11，恰等于本文件的 11 个用例（3 + 6 + 2），口径自洽。
**注意第一条断言 `await waitFor(() => expect(getByText(空态)))` 本身近似恒真**（空态在 deliver 之前就在，waitFor 首次同步检查即通过），它不承担鉴别力——鉴别力全在紧随其后的 form 断言上。这不是缺陷，但值得记录（见 O2）。

### 6. 六条已知限制 —— **基本如实；第 6 条覆盖不完整**

逐条核：①②与代码事实一致；③图片不冻结与 §14.5 一致；④⑤属 R1 范围，未复核。**第 6 条（两步写入非事务）**：`CapturePage.tsx:376-392` 确实产生"资料已建、正文未写"的状态，页面 :408-416 明确告知并给出去处、不自动重试，记录属实。但它**只覆盖了两个半成功状态中的一个**，且其补救指引与实际渲染冲突，见 F2、F3。

---

## Findings

### 必须修复（阻断）

**F1｜带 `#` 的网址会走完全程后在保存时必然失败，且用户无法修复 — `extension/src/injected/extract.ts:31` + `frontend/src/features/capture/protocol.ts:504` + 契约 §14.2（第 30 行）**

- **触发**：在任何 URL 含片段标识符的页面上采集（文档站锚点、GitHub/MDN 锚点、hash 路由 SPA）。`extract.ts:31` 用 `location.href` 原样作为 `url`，链路上（`capture.ts` → `bridge.ts:24` stash → `relay.ts:77` → `capturedFrom`）**无任何一处规整或去 fragment**（bridge/popup 我已读，确认无规整）。
- **影响**：`isCapturePayload` 只查 `^https?://`，放行 → 确认页正常预填 → 用户点「保存为资料」→ 后端 `contracts.py:74-86` 的 `"#" in value` 判定无效，返回 422 → `failureText`（`api.ts:444`）只显示「资料内容未通过检查，请检查输入的格式和长度。」。**页面不提供网址编辑框**，用户没有任何可行动作；此时扩展暂存已在交付时被 `relay.ts:75` 删除，本次采集的正文只能靠回原页重采。核心用例（完成条件 1/3）对一类常见页面直接不可用。讽刺的是页面**已经知情**：`CapturePage.tsx:399` 的 `safeWebUrl` 对含 `#` 的网址返回 null，页面只在 :429 印一句「该网址无法安全打开，仅显示文本」，却仍放用户去撞 422。
- **为何判必须修复**：触发条件常见、发生在已确认需求的主路径末端、无用户可执行的补救、且因"全流程从未实机跑过"没有任何其他环节会先发现它；修复成本极小。
- **最小修复**：在 `extract.ts` 取 URL 时去掉 fragment（`const u = new URL(location.href); u.hash = ''`，失败时回退原值），并把该约束同步进**三处**——两份 `isCapturePayload` 的 url 规则与契约 §14.2 的 `url` 行（应写明须满足 4.1 `source_url` 的全部规则：不含 `#`、空白、`\`、控制字符与凭据，而不只是 `http(s)://` 开头）。若认为「去 fragment 后就不是采集时的实际地址」与完成条件 3 有张力，请在记录中明写该取舍——后端契约本就不接受带 fragment 的 `source_url`。

### 可记录后继续

**F2｜半成功提示把唯一一份正文从屏幕上抹掉，而提示语要用户「粘贴进去」 — `frontend/src/features/capture/CapturePage.tsx:408-417`**
触发：POST 成功、PUT 失败。影响：`partial ? … : !captured ? … : form` 的三元使表单**整体被替换**，含正文的 textarea 消失；提示语「你可以打开它把正文粘贴进去」指向一份用户手里并不存在的剪贴板内容（扩展暂存已删、原页可能已关）。状态本身在 `markdown` state 里仍然存在，只是不再渲染。最小修复：半成功时保留（或只读展示）正文文本框，让提示语中的「粘贴」真的可执行。

**F3｜已知限制 6 只描述了两个半成功状态中的一个 — `docs/tasks/TASK-038-extension-capture.md:136`**
触发：POST 在服务端成功但客户端未拿到可解析响应（后端重启、`api.ts:87` 的 `INVALID_RESPONSE`）。影响：`created` 仍为 null，页面走普通错误分支（`CapturePage.tsx:390`），**不提示可能已创建一份孤儿资料**；用户重试即产生重复资料。记录只写了"第一步成功第二步失败"。最小修复：在已知限制 6 补一句该状态与其后果（或在错误文案中提示先去资料库确认）。

**F4｜`risk_reason` 与本候选事实矛盾 — `docs/tasks/TASK-038-extension-capture.md:8`**
`risk_reason` 仍写「不改后端、**不改契约**、不改 `local_access.py`」，而 `allowed_paths:18` 已含契约文件、§14 已交付，矛盾的解释写在 57 行的非目标段。触发：任何依据 `risk_reason` 复核授权面的读者/后续任务。影响：正是本任务链反复出问题的「宣称与实物不一致」，且方向是**宣称比实物窄**——读者会得出"本任务未触碰契约"的错误结论。处置：按 TASK-037 已背书的先例（`TASK-037…md:438`「保留原文 + EVIDENCE 记录更正」），**不要回头改冻结区原文**，在 EVIDENCE 记录这处更正即可；若选择改原文，则形成新候选。

**F5｜索引状态滞后 — `docs/tasks/任务索引.md:24`** 索引写 `READY`，TOML 写 `IN_PROGRESS`。与 TASK-037 第二轮 Finding 2 同型（当时判可记录后继续）。最小修复：EVIDENCE 写回时一并对齐（索引本行属证据段允许改动范围，零成本）。

### 可选建议

**O1** `frontend/.../protocol.ts:516` 返回 `envelope.payload` 原对象而非已校验的解构副本；真实浏览器有结构化克隆兜底，不可利用。建议返回 `{ title, url, markdown }` 副本，让"校验的即所用的"在代码层面自明（两份 protocol 同步）。
**O2** `CapturePage.test.tsx:221` 的空态断言不承担鉴别力（详见上文第 5 条），建议要么删除、要么改为在 deliver 后先 `await` 一次微任务再断言，避免后来者误以为它是那道防线的守护者。
**O3** `CapturePage.test.tsx:172-175` 的 `mount(handler?: Parameters<typeof api.request>[1] extends never ? never : unknown)` 是无意义的条件类型 + `void handler` 死参数，全部调用点都是 `mount()`。建议删成 `function mount() {…}`。
**O4** `CapturePage.tsx:399` 的 `link` 只用于决定是否印一句提示，从不渲染为链接；措辞「无法安全打开」易被读成"不影响保存"。与 F1 一并处理更自然。
**O5** 契约 §14 声明「改动须三处同步」，但 `extension/src/shared/protocol.ts` 还含 §14 未提的 `CAPTURE_EXTRACTED`、`PENDING_KEY`、`UI_ORIGIN`/`RELAY_MATCH`。建议在 §14 一句话说明哪些常量属契约、哪些属扩展内部，避免"改了该文件就必须改契约"的误判。
**O6** `extension/AGENTS.md:22` 写 `backend/src/studypilot/security/local_access.py`，而任务记录与实物是 `.../infrastructure/security/local_access.py`（路径漂移，可能属 R1 口径范围，供合并时判归属）。

---

## 覆盖与缺口

**已覆盖**：patch 内 8 文件全部；信任边界的全部已知绕法面；写入触发路径的全调用点；三处协议一致性与三个后端数字的独立核对；契约 §14 的越界/漏项与授权面判据；`CapturePage.test.tsx` 的可红性（静态推演）；六条已知限制中的 ①②③⑥；`/capture` 的路由与导航可见性（无 `section` → 不入 `primaryNavigation`/`moreNavigation`；旧导出 `navigation` 全仓无引用，注释与实物一致）；CSS 类名全部预先存在，故 `styles.css` 未改属合理。

**缺口（如实标注，未读或未读透）**：
1. **我未运行任何检查**，CHECKS PASS、380/44 tests、六项变异验证均为记录自述，我只做了口径自洽性核对（如 380−369=11 恰等于本文件用例数），**不构成验证**。
2. **无 git 能力**：无法确认 `allowed_paths` 修订与实现提交的时序（见第 4 条）、无法确认候选 diff 的**全部 31 个文件**均在 `allowed_paths` 内。我只见到 8 个文件，**`docs/contracts/openapi-v1.json` 一字未改这一点我无法证实**（记录声称如此，且 `profiles` 含 `contracts` 与之相容）。**建议 Acceptance 明确核这两项。**
3. **R1 范围未审**：manifest 权限清单、`manifest.test.ts` 与 `boundaries.test.ts` 的门闩、Defuddle 提取实现与其测试、构建配置、四处宣称口径、`extract.js` 707 kB、扩展侧测试的可红性——均不在本报告结论内。我读 `extract.ts`/`capture.ts`/`bridge.ts`/`popup.ts` 仅为追 URL 数据流与写入触发点，**不构成对这些文件的审查**。
4. 已知限制 ④⑤（提取质量、产物体积）未复核，属 R1。
5. 明示非目标（图片冻结、Firefox/Safari、A4 清单漂移、`validate_governance.py` 第二份清单）按要求未审。

## 剩余风险

1. **同源框嵌/点击劫持**：任何网站都能把 `http://127.0.0.1:5173/capture` 放进 iframe（Vite 不发 `X-Frame-Options`/`frame-ancestors`），框内的 relay 会正常交付暂存内容，攻击者虽读不到（跨源），但可诱导用户误点「保存为资料」。危害限于本机库多出一条用户自己采集的资料，且这是**全站既有属性、非本任务引入**，故不列为 finding；建议记入长期风险台账。
2. **第三方扩展**：任何对 `127.0.0.1:5173` 有内容脚本权限的扩展都能满足 `source === window` 从而预填表单。因其已能直接代用户点击，不构成升级；但契约 §14.3 第 1 条的措辞（「跨源 opener 或 iframe」）容易让人误读为"只有本扩展能发"，建议将来补一句"本校验证明的是同窗口来源，不证明发送方是 StudyPilot 扩展"。
3. F1 未修前，一类常见页面的采集会在最后一步失败；F2 使半成功状态下的正文更难挽回。
4. 全流程从未实机跑过（记录已如实声明），完成条件 14 须由用户实测补记。

## 结论

**CHANGES_REQUIRED**（针对候选 `8533b87`，仅覆盖 R2 问题域）。

阻断项一条：**F1**（带 `#` 的网址走完全程后必然保存失败且用户无从修复，三处协议对 URL 格式的约束共同不足）。其余为 4 项可记录后继续 + 6 项可选建议。

最高优先级的两条我给出明确正面结论：**postMessage 信任边界成立**（未找到可用绕法，且"被绕过也只能预填文字"的纵深防线经我独立核实为真）、**「必须用户确认才写入」守住**（全文件唯一写入路径挂在表单提交上，无自动/重试/竞态旁路）。契约 §14 的授权面扩大我判**成立、不阻断**，理由是动因源于先在的 `extension/AGENTS.md:31` 且 diff 为纯追加零改写；其中时序一条我无法核实，已标注。

本结论**仅覆盖 R2**，须与 R1 对同一候选的结论合并方构成 TASK-038 的完整 Review；R1 若判 CHANGES_REQUIRED 或 BLOCKED，整体从其严。

- 第一轮 findings 的处置（代码修订 SHA **`4ed3062`**，记录更正 **`f274c05`**）：
  - **R2 F1（唯一阻断项）→ 已修，且修的范围比最小修复大。** 在 `extract.ts` 新增 `normalizeSourceUrl()` 于提取端去掉 fragment；**并把 URL 约束在三处协议定义里都换成后端 `source_url` 的完整规则**（新增共用的 `isSafeSourceUrl`：http(s) 开头、不含空白/控制字符/反斜杠/`#`、可解析且有主机名、不含凭据、长度上限），而不只是原来的 `^https?://`。只修 `extract.ts` 一处能让当前问题消失，但下一个人看到的仍是那个宽松版本；把规则写进三处才让它**保持**为真。契约 §14.2 的 `url` 行同步改写，并明写取舍：存下的地址可能不等于地址栏原文（少了 `#锚点`），这是必要的——后端本就不接受带 fragment 的 `source_url`，保留它只会让资料存不进去。
  - **R1 F2 → 已修，并加断言钉住。** `extract.ts` 提出 `EXTRACT_OPTIONS = { markdown: true, useAsync: false }`，注释明写「这一行是『扩展不发网络请求』这条用户承诺的落点」。**只加开关不加测试等于把一条偶然为真换成另一条偶然为真**，故另加断言：`EXTRACT_OPTIONS.useAsync` 必须为 `false`，且源码（剥注释后）必须含 `.parse()`、不得含 `parseAsync`。变异验证：两种改法各自变红（见「实现与测试」段第 7 项）。
  - **R1 F1 → 已修。** 文档漂移门闩纳入根 `README.md`（此前只读 `extension/` 下两份），根 README 补上字面的 `http://127.0.0.1:5173/*`，测试注释的份数与实际读取一致。R1 的判断很准：本轮各处口径都对，但**机械覆盖缺的恰是普通用户最先读到的那一处**。
  - **R1 F3 → 两半都修。** ① `extension/AGENTS.md` 的「不记录用户正文」改为明确 `pendingCapture` 暂存是唯一例外、交付即删；② **未交付正文滞留磁盘是真实的隐私残留**，`extension/README.md` 与根 `README.md` 都如实告知用户。这一条我原本没意识到。
  - **R2 F2 → 已修。** 半成功时保留只读正文框供复制，并把提示语改为「把**下面这段**正文粘贴进去」。原实现把唯一一份正文连同提示一起抹掉，提示语指向一个用户手里没有的东西。新增回归断言 `getByLabelText(/待粘贴的正文/)` 的值等于采集内容。
  - **R2 F3 → 已修。** 已知限制 6 补上第二个半成功状态（创建请求服务端成功但客户端未拿到可解析响应 → 不提示可能已产生孤儿资料 → 用户重试得到重复资料）。
  - **R2 F5 → 已修。** 索引与 TOML 状态对齐为 `IN_REVIEW`。
  - **R2 F4（`risk_reason` 说「不改契约」与实物矛盾）→ 不改冻结区原文，在此记录更正。** 采纳 R2 给出的首选处置与 TASK-037 已背书的先例：保留原文 + EVIDENCE 记录更正，信息量严格大于改写原文。**更正内容**：`risk_reason` 中的「不改契约」应读作「不改 `/api/v1` 的 HTTP 契约与 `openapi-v1.json` 快照」；本任务确实修改了 `docs/contracts/API与数据契约基线.md`，新增 §14 描述扩展↔UI 页面的 postMessage 契约，理由见「非目标」段。
  - **关于理由①的时序 → 已在 EVIDENCE 区外据实更正，未删除。** 派发会话用 `git log -S` 证伪：`allowed_paths` 里的契约那一条**首次出现在实现提交 `540027e` 中**，登记提交 `6891166` 不含它——授权面的扩大与实现代码在同一个提交里，**没有独立的前置控制面提交**。我在编辑器里确实是先改记录再写代码，但提交历史里没有这个先后，而我把它当事实写进了正当性论证的第一条。按建议改成如实描述而非删掉，以免读者不知道这里曾有过一个被证伪的论证。R2 事先声明「即便时序相反结论不变」，其 PASS 判定不受影响。**这是本任务链上第四次「宣称与实物不符」，而这次落在授权面的正当性论证里。**
  - **R1 S1/S2/S3/S4/S5 与 R2 O1/O2/O3/O4/O5/O6 → 全部处理。** 其中 S2 值得单说：`"extract.js"` 在仓库里原有三处独立拼写（manifest 常量、`bridge.ts` 字面量、构建配置的 mode），**没有任何测试把它们绑在一起**——改个入口名会产出指向不存在文件的 manifest 而测试全绿，只在实机加载时炸。已改用常量并加断言绑定三处。O4 随 F1 一并解决。
  - **R1 S6 → 实测不成立，不采纳其推断。** 它自己标了「未运行构建、属推断」。实测：产物中无 `process.env.NODE_ENV` 残留、无 `"development"` 字面量，且以 `--mode production` 重建得到**完全相同的 707.60 kB**。另记一项观察：产物内有 5 处 `console.log` 调用点（来自 Defuddle），**我未验证它们在 `debug: false` 默认值下是否可达**，记为观察而非结论。
  - **新增一道跨目录协议漂移守卫 —— 这是主 Agent 的决定，不是审查要求。** 准确情况：**R1** 在其「覆盖与缺口」第 5 条指出两份协议定义之间没有任何构建或测试耦合、漂移只能靠人守，并请与 R2 合并判断；**R2 独立核对了当前三处一致，但没有要求加机械检查**（其 O5 是另一件事）。也就是说两边都确认当前一致、都指出没有机械耦合，**但没有任何审查者要求加这条检查**。我判断它属「测试全绿但东西是坏的」那一族，值得一道门闩，故自行加了 `extension/src/shared/protocol.test.ts`：逐字比对两份 `isSafeSourceUrl` 与 `isCapturePayload` 的函数体、核对三个上限的数值、并先断言镜像文件确实存在（防止路径写错让整组变成空断言）。变异验证见「实现与测试」段第 9 项。
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项（仅有真实问题时）：待填
- 日期与决定日志：2026-09-06 用户合并 TASK-037（PR #42，merge `b4a3fd0`）后回答本任务的两项范围问题：浏览器只做 Chrome 与 Edge、其他不扩展；采集正文与图片冻结拆成两个任务。主 Agent 据此把图片冻结移出本任务——理由是它躲不开后端改动（`content_snapshots` 只存 Markdown 且上限 100 万字符，`original_files` 为 `UNIQUE(resource_id)` 且 media_type 白名单不含图片，两者都装不下图片），属独立的 L3 数据模型任务。
<!-- EVIDENCE:END -->
