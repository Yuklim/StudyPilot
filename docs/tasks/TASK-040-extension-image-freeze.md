# TASK-040：扩展冻结正文图片（采集侧）

```toml
schema_version = 2
id = "TASK-040"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "本任务把扩展从「只读当前页已渲染的 DOM、不发任何网络请求」变成「可代表用户向任意站点取字节」。这是一次实质的授权面扩张，也是本扩展第一次真正联网。虽然采用可选权限（安装时不要、采集时才请求、可撤销），但一旦授予即长期有效，用户不会重新审视，所以这次授予的边界就是它此后的边界。第二处实质风险：新增 background service worker —— 扩展从此有了一个不依附于用户点击的常驻执行上下文，它能做什么必须一次定清。第三处：取回的字节来自不可信的第三方站点，经消息通道穿过本机 UI 页面写入受控目录，这条新的数据流全程要有边界。另有跨模块面：同时改 `extension/` 与 `frontend/`，并关闭 TASK-039 遗留 G（删除预览少报图片张数，属用户可见的数据陈述错误）。不改后端一行、不改 `/api/v1` 契约、不改本机访问门禁。"
risk_flags = ["security", "architecture", "public-api", "business"]
owner = "coordinator"
base = "4066c022111aafc9c919ff903f4e4256eecaecc6"
allowed_paths = [
  "extension/**",
  "frontend/src/features/capture/**",
  "frontend/src/features/resources/api.ts",
  "frontend/src/features/resources/api.test.ts",
  "frontend/src/features/resources/ResourceDeletion.tsx",
  "frontend/src/features/resources/ResourceDeletion.test.tsx",
  "frontend/src/api/client.ts",
  "frontend/src/api/client.test.ts",
  "frontend/e2e/**",
  "docs/contracts/API与数据契约基线.md",
  "README.md",
  "docs/tasks/TASK-039-snapshot-assets.md",
  "docs/tasks/TASK-041-reading-research-doc.md",
  "docs/tasks/TASK-040-extension-image-freeze.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

### 用户授权

2026-09-07 用户合并 PR #44（TASK-039）与 PR #45（TASK-041）后指示「开 task040」，并就两个范围问题作答：

1. **权限**：「重要的是要把功能做好、做全，权限的事情都可以商量。」
   据此选**可选权限 + 采集时按需请求**（`optional_host_permissions: ["<all_urls>"]`），而非永久 `host_permissions`。**理由是这两条的覆盖面完全相同**（都能取任意图床的字节），可选权限只多出「安装时不要权限、授权后可随时撤销」两项，没有以覆盖面换安全性；用户那句话要的是「做全」，而这条选择不牺牲任何覆盖面。**若用户日后要求「一次都不弹框」，改为永久权限即可，属重评触发条件。**
2. **渲染**：用户选「只采集不渲染」。资料详情页仍只展示 Markdown 源码，**本任务交付后用户仍然看不到图片本身**，但图片已被冻结、可列出、可取字节。

### 目标

1. 采集时把正文引用的图片字节取回并存进本机（经 TASK-039 的四个端点），使「冻结」真正完整。
2. **关闭 TASK-039 遗留 G**（硬性前置）：删除预览必须把图片张数算进去。
3. 顺带关闭已到触发条件的三项遗留：TASK-039 遗留 A（实跑 `frontend`/`extension` 两组检查）、TASK-038 遗留 B（`tsconfig` 的 `types` 作用域收敛）、TASK-038 遗留 A2（确认页每次新开标签页）。

### 非目标（明示不做）

- **不改后端一行**。TASK-039 的表、端点与契约已就位，本任务只做调用方。`backend/**` 不在 `allowed_paths` 内。
- **不渲染 Markdown、不显示图片**（用户明确决定）。因此本任务交付后，冻结的图片在界面上不可见，只能经端点列出与取字节。
- **不引入任何第三方站点凭证**。取图片走 `credentials: 'omit'`：需要登录才能看的图片取不到，退化为保留原链接。这与 TASK-036 建立的「凭证始终由浏览器持有」一致。
- **不做跨快照去重、不压缩、不转格式、不清洗 EXIF**（TASK-039 已登记的取舍，本任务不改变）。
- **不扩展到 Firefox/Safari**（用户 2026-09-06 决定只做 Chrome 与 Edge）。
- **不改本机访问门禁**，不改 `/api/v1` 的 HTTP 契约。中文契约只新增扩展侧的消息与权限说明。

### 禁止范围

所有未列入 `allowed_paths` 的路径；额外禁止：`backend/**`、`frontend/src/infrastructure/**` 以外的前端目录（除已列出的四个文件）、`scripts/governance/**`、`AGENTS.md`、`docs/governance/**`。

### 依赖/前置条件

基线 `4066c02`（main，TASK-039 与 TASK-041 均已合并）。依赖 TASK-039 的四个资产端点，它们已在 main 上。

### 并行

否。唯一写入者 `coordinator`。

### 顺带完成的状态登记

`docs/tasks/TASK-039-snapshot-assets.md` 与 `docs/tasks/TASK-041-reading-research-doc.md` 在 `allowed_paths` 内，**仅用于把 TASK-041 的 `status` 由 `ACCEPTED` 登记为 `MERGED`**（用户 2026-09-07 合并 PR #45，merge commit `4066c02`），以及在 TASK-039 的 EVIDENCE 区把遗留 A/B/G 标注为「已由 TASK-040 承接」。依据是根 `AGENTS.md` §5。**除此之外不改这两份记录一个字**。（TASK-039 自身的 `status` 已在 TASK-041 的控制面提交中登记为 MERGED。）

## 关键设计决定

### ① 可选权限，且在用户看得见图片张数之后才请求

`optional_host_permissions: ["<all_urls>"]`，安装时授权面**与今天完全相同**（`activeTab` / `scripting` / `storage`）。

`chrome.permissions.request()` 必须在用户手势中调用，而手势会被 `await` 消耗 —— 提取是异步的，所以**不能**在 popup 打开时自动请求。因此 popup 的流程由「打开即采集、随即关闭」改为两步：

1. 打开 popup → 自动提取正文（与今天相同）；
2. 若正文里有图片，显示「发现 N 张图片，一并保存？」两个按钮。点「一并保存」是一次**新的用户手势**，在其中调 `permissions.request`；点「只存正文」或直接关闭 popup 则走今天的路径。

**这既是技术约束的结果，也是更好的形态**：用户在看到「N 张图片」之后才被要求授权，而不是在不知道要干什么的时候。**代价如实登记**：带图页面的采集从一次点击变成两次。

拒绝授权、或某张图取不到，一律**不阻断采集**：正文照存，那些图片保留原站地址（退化回 TASK-039 之前的行为）。

### ② 字节由 service worker 取，因为只有它能绕开 CORS

MV3 下内容脚本的跨源请求受 CORS 管，而正文图片大多在与文章不同源的图床上，绝大多数图床不发 CORS 头。持有 host 权限的 **service worker** 不受此限，这正是「只有浏览器扩展做得到」那句话的具体含义（TASK-036 记录、契约 §4.13 均已写明）。

因此本任务**首次引入 background service worker**。它的职责被限死为一件事：**收到 popup 的取图请求 → 用已授予的权限 fetch → 回传字节**。它不注册任何其他监听、不常驻状态、不主动发起任何请求。`manifest.test.ts` 的顶层键白名单会因新增 `background` 与 `optional_host_permissions` 而失败 —— 这是该守卫**按设计工作**，本任务显式更新它并逐条说明新增键的理由。

fetch 的形态是安全面的一部分，逐条定死：`credentials: 'omit'`（不带任何站点凭证）、`redirect: 'follow'` 但只接受 http(s) 最终地址、单张响应体超过 10 MiB 即中止、总耗时上限、并发上限。

### ③ 字节以 base64 逐张穿过既有的中转通道，不落 `chrome.storage`

扩展消息通道会把载荷 JSON 序列化，`ArrayBuffer` 无法原样通过，所以字节以 base64 传输。**不经 `chrome.storage.local`**：它有 10 MB 配额，而 N 张 10 MiB 的图片必然撑爆，且会把第三方站点的字节留在扩展存储里（TASK-038 已登记过「未交付正文滞留扩展存储」这类问题）。

**逐张按需传输**：`/capture` 页面处理完第 i 张才要第 i+1 张。峰值内存因此只与单张图相关，与图片数量无关；任何一张传输失败只影响那一张。

### ④ 页面上传，且必须在正文写入成功之后

上传资产要带 `If-Match` 为**当前快照版本**，所以顺序固定为：建资料 → 写正文（拿到快照版本）→ 逐张上传图片。图片失败不回滚前两步 —— 「资料 + 正文已存、部分图片没存下」是**可接受的降级**，而「因为一张图没取到就丢掉整篇正文」不是。

页面必须如实告诉用户结果：**成功冻结几张、失败几张、失败的那些仍指向原站**。不许把部分成功显示成完全成功 —— 这正是 TASK-038 遗留里「第二个半成功状态不提示孤儿资料」那条的同类问题。

### ⑤ 遗留 G 是硬性前置，必须在同一个 PR 里关闭

TASK-039 的删除预览已返回 `snapshot_asset_count`，但前端**两份**各自固定六键的解析器与**一份**标签表都忽略它。本任务一旦让扩展开始写资产，带图资料的删除预览就会**少报将被删除的图片**——用户据以决定是否删除的数字是错的。

四处（由 TASK-039 的 Acceptance 定位）：`frontend/src/api/client.ts` 的 `DeletionImpact` 接口与键表、`frontend/src/features/resources/api.ts` 的键表、`ResourceDeletion.tsx` 的标签表。

### ⑥ 标签页复用：零新增权限

`bridge.ts` 现在无条件 `chrome.tabs.create`。改为把上次打开的标签页 id 存入 `chrome.storage.local`，下次先试 `chrome.tabs.update(id, {url, active: true})`，抛错（标签页已关闭）即回落到新开。**`chrome.tabs.update` 对已知 id 不需要 `tabs` 权限**（只有读取 url/title 才需要），因此 manifest 的授权面不因这条增加一个字。

## 完成条件

1. **安装时授权面不变**：`manifest.test.ts` 断言 `permissions` 仍恰好是 `['activeTab','scripting','storage']`；新增的 `optional_host_permissions` 与 `background` 两个顶层键被显式断言，且白名单仍是精确集合相等。
2. **未授权时行为与今天完全一致**：不请求权限、不发任何网络请求、正文照常保存，且有用例证明。
3. **两步 popup**：无图片时不出现第二步；有图片时显示准确张数；点「只存正文」不触发权限请求。
4. **权限被拒不阻断**：拒绝后正文照常保存，页面明确告知图片未冻结、仍指向原站。
5. **service worker 的职责边界有机器守卫**：有用例断言它只注册所约定的那一个消息监听，且 fetch 使用 `credentials: 'omit'`。
6. **单张上限与总量**：超过 10 MiB 的响应在读取中途即中止，不完整读入内存；并发与总耗时有上限且可配置为测试可控值。
7. **只取 http(s)**：`data:`/`blob:`/`file:`/相对地址一律不取（相对地址在提取端已解析为绝对地址）。
8. **逐张传输**：有用例证明第 i+1 张的请求发生在第 i 张处理完之后，且失败一张不影响其余。
9. **上传顺序**：图片上传发生在 `putResourceSnapshot` 成功之后，且带正确的 `If-Match` 快照版本。
10. **部分成功如实告知**：页面显示成功与失败张数；失败原因可读；不自动重试。
11. **遗留 G 关闭**：四处全部更新，删除预览显示图片张数；`client.test.ts` 与 `ResourceDeletion.test.tsx` 有对应断言。
12. **标签页复用**：第二次采集不新开标签页；标签页已关闭时回落到新开；manifest 授权面不变。
13. **TASK-038 遗留 B 关闭**：`tsconfig` 的 `types` 作用域收敛，`extension/src` 下写 `process.env` 不再能通过 typecheck。
14. **TASK-039 遗留 A 关闭**：`frontend` 与 `extension` 两组检查**实跑**并记录计数，不再只有结构性论据。
15. **契约同步**：中文契约 §14 增补扩展侧的图片取回流程、权限边界与降级语义；说明后端契约与端点一字未改。
16. **三组测试计数只增不减**，既有断言无删除、无弱化；新增至少一条走真实后端的 e2e（正文 + 至少一张图片，断言资产可列出）。

## 上下文包

- 规则：`AGENTS.md`、`extension/AGENTS.md`、`frontend/AGENTS.md`、`docs/governance/风险分级与检查规则.md`。
- 必读源文件：`extension/src/manifest.ts`（授权面的唯一来源与其白名单守卫）、`popup/capture.ts` 与 `popup/bridge.ts`（采集编排与 chrome API 接线）、`injected/extract.ts`（Defuddle 与 `useAsync:false` 那条承诺）、`injected/relay.ts`（握手与用后即删）、`shared/protocol.ts`（消息契约，与前端平行实现）、`frontend/src/features/capture/CapturePage.tsx`（两步写入与半成功状态）、`frontend/src/api/client.ts` 与 `features/resources/api.ts`（两份 `deletionImpact` 解析器）。
- 契约：`docs/contracts/API与数据契约基线.md` §4.14（资产语义与上限）、§14（扩展消息契约）、§7（门禁为何使扩展不能直连后端）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-040-extension-image-freeze.md --worktree`（预期自动选中 `extension`、`frontend`、`contracts` 三组）。

## 已知取舍（登记时即知）

1. **带图页面的采集从一次点击变成两次**。这是 `permissions.request` 必须在用户手势中调用所强制的，不是可选设计。
2. **可选权限一旦授予即长期有效**，用户不会被再次询问；撤销要去扩展设置页。已在 popup 文案与 README 中说明。
3. **登录墙后的图片取不到**（`credentials: 'omit'`），退化为保留原链接。这是「不引入第三方站点凭证」的直接后果，不是缺陷。
4. **交付后用户仍看不到图片**（用户选「只采集不渲染」）。冻结完整性靠端点与用例证明，不靠肉眼。
5. **base64 传输有 33% 体积放大**，逐张传输把峰值控制在单张量级，但一张接近 10 MiB 的图仍会产生约 13 MB 的瞬时消息。

## 实现与测试

- **实现 SHA**：`4b53256`（base `4066c02`，43 个文件，全部在 `allowed_paths` 内）。
  - **扩展**：新增 `src/background/worker.ts`（唯一发网络请求处：`credentials: 'omit'`、`redirect: 'follow'` 但复核落地地址、逐块读取超限即中止、超时）；`manifest.ts` 新增 `optional_host_permissions` 与 `background` 两个顶层键；`extract.ts` 新增 `collectImages`；`relay.ts` 新增按需取图并只服务本次载荷里的地址；`capture.ts` 拆成 `runCapture`（只提取）与 `deliverCapture`（请求权限 + 交付）；`bridge.ts` 复用确认页标签页；popup 改为两步。
  - **前端**：`api/client.ts` 新增 `uploadSnapshotAsset`（带 `If-Match` 的专用 POST 路径，不去放宽 `request()` 那份只允许 DELETE 带版本头的白名单）与三个新错误码；`features/capture/freeze.ts` 新增逐张取回与上传；`CapturePage.tsx` 在写完正文后按快照版本逐张冻结，并如实显示冻结/失败张数。
  - **遗留 G（四处）**：`client.ts` 的 `DeletionImpact` 接口与键表、`features/resources/api.ts` 的键表、`ResourceDeletion.tsx` 的标签表。
  - **遗留 B**：`tsconfig.json` 的 `types` 由 `["node","chrome"]` 收窄为 `["chrome"]`，测试与构建配置移入新的 `tsconfig.tools.json`，`npm run typecheck` 两份都跑。
  - **契约**：中文契约 §14.2 消息表三行与 `CapturePayload` 新增 `images` 一行、§14.4 权限边界重写、§14.5 边界更新为「已由 TASK-039/040 关闭」、新增 §14.6（消息流、信任边界、降级语义）。**`/api/v1` 的 HTTP 契约与 openapi 一字未改** —— 本任务只做 TASK-039 已冻结契约的调用方。
- **命令与真实退出结果**（全部由实现者本人在本机运行，无第三方复核）：
  - `check_task.py --worktree` → **CHECKS PASS**，`profiles=contracts,extension,frontend`，`files=43`，`product_fingerprint=6bed63307e788dddef2449a95f75c7a75f048facb60f3599f5a5db2817e1bd15`。
  - **extension**：`132 passed`（8 文件）。**基线为实测而非引用**：在 `4066c02` 的临时 worktree 上跑出 `84 passed`（7 文件），净增 **48**。
  - **frontend**：`427 passed`（19 文件）。同样实测基线：`4066c02` 上为 `408 passed`（18 文件），净增 **19**。（TASK-038 记录里写的 407 不准，此处以实测为准。）
  - **e2e**：`42 passed`，基线 41，净增 1（`e2e/capture-images.spec.ts`，走真实后端）。
  - `npm run typecheck` / `lint` / `prettier --check` 两个工程均通过。
  - **backend 未运行**：本任务在 `backend/**` 下零改动（不在 `allowed_paths` 内），检查脚本据变更自动选组因而未选中它。**这是结构性论据，不是观察到的 550 仍然为绿。**
  - 环境：macOS Darwin 25.5.0；Node 24；Chromium（Playwright）。
- **遗留 B 的关闭经变异验证**：在 `src/popup/popup.ts` 临时加一行 `process.env.HOME`，收窄后的 `tsc -p tsconfig.json` 报 `TS2591: Cannot find name 'process'`；删掉即恢复通过。收窄前这行会静默通过。
- **既有断言无删除、无弱化**：改动的既有断言只有 `manifest.test.ts` 的顶层键白名单（七键 → 九键，仍是精确集合相等，另新增两条专门断言钉住「站点权限必须留在 optional」与 background 条目的键集），以及各测试的载荷/影响字典 fixture 补字段（仍为精确相等）。
- **用户实测暴露的三个缺陷，与它们各自为什么没被测试拦住**（2026-09-07，用户在三个真实网站上试用）：
  1. **点「连图片一并保存」没有任何反应，且正文一并丢失。** 原因：权限请求在暂存之前，而浏览器在弹授权框时会关掉 popup，上下文当场消失。已改为**先暂存再请求**。测试没拦住是因为假 bridge 里两步都是立即返回的 Promise，顺序对结果毫无影响 —— **用例断言了「两步都发生」，没断言「谁先谁后」**，现已补上顺序断言。
  2. **六张图全失败，而界面只说「没能保存」。** 这不是实现缺陷而是**设计缺陷**：worker 内部本就区分四种原因，我却在页面上把它们合并成一句话，结果一次真实故障完全无法归因，用户和实现者都只能猜。已按原因分行显示，并把「问不到 worker」与「worker 说取不到」拆开。
  3. **`{ fetch: globalThis.fetch }` 丢掉 receiver，浏览器里每一次取图必抛 `Illegal invocation`。** 这是本任务真正的功能性 bug，**图片一张也存不下**。没被拦住有两层原因，都属测试设计问题：① worker 的全部单测都注入假 fetch，**默认依赖那条路一次都没被执行**；② 我此前「拿真实网络验证取图成功」是在 **Node** 里跑的，而 Node 的 `fetch` 没有 receiver 约束 —— 那条看起来很硬的证据**根本没覆盖它唯一运行的环境**。回归用例现在把全局 `fetch` 换成同样挑剔 receiver 的实现，让浏览器专属的失败在 Node 里也能发生。
- **用户实机确认（2026-09-07）**：修复后用户在自己的浏览器上复测，原话是「**这次应该下载成功了**」。**按原话记录，不上调**：这句带「应该」，且未给出具体张数、界面是否无失败提示、资产列表是否可见等细节，因此它确认的是「用户侧观察到图片这次下来了」，**不等于完成条件 16 所要求的全流程逐项核对**。此前三次失败的实机报告则是明确的（见上一条），本次成功报告的确定性弱于那三次。
- **真实浏览器端到端验证（Playwright 加载扩展，独立于 `frontend/e2e`）**：用 `chromium.launchPersistentContext` + `--load-extension` 拉起真实 Chromium，在**隔离的**后端(18000)与前端(15173)加一个本地合成文章页上跑完整链路。观察到：真实 `chrome.scripting` 注入 → 提取出 2 张图 → `chrome.storage` 暂存 → 中转脚本交付 → 页面逐张向 service worker 取字节 → `PUT /snapshot` 201 → **两次 `POST /snapshot/assets` 各 201** → 页面无失败提示并跳转详情 → `GET /snapshot/assets` 返回两条，`media_type=image/png`、`size_bytes` 为 99860 与 77817（与直接下载这两张图的真实字节数一致）。
  - **这个验证不是提交进仓库的自动化测试**，是一次诊断性运行，脚本与临时环境已清理；**因此它不构成可复跑的证据**，只证明「在那一次运行中链路成立」。之所以不入库：`launchPersistentContext` 需要有头浏览器、要改扩展的 `UI_ORIGIN` 常量才能指向 e2e 端口、且用户点击扩展图标授予 `activeTab` 这一步自动化无法真实触发（诊断中用 host 权限替代）。**登记为遗留项，不假装它已被 CI 覆盖。**
  - 未验证的仍有：真实的授权框交互（自动化下 `permissions.request` 直接返回 granted、不弹框）、popup 被浏览器关闭的行为、以及点击扩展图标授予 `activeTab` 的那条路径。

- **第一轮 Review 处置（两位独立 Reviewer 各自判 CHANGES_REQUIRED；阻断项属同一类）**：
  - **F1（两位都提，R2 的定位更要命）—— 面向用户的文案仍宣称「本版本不冻结图片」。** R2 指出的 `CapturePage.tsx:198` 就渲染在用户点「保存为资料」的那张表单上：用户在授权后、按下确认的那一刻，屏幕上写着「不会去第三方站点取字节」。R1 指出的根 `README.md:242` 同一句，且与我在同一节改过的 250 行**自相矛盾**。**更严重的是 R1 发现我重写那段时删掉了基线上两句既有安全承诺**（manifest 白名单守卫、扩展不直连后端），已恢复。另按两位定位补齐 `extension/AGENTS.md:25`（仍写「七个键」）与 `extension/README.md` 的一步式用法。
  - **R1 F2（已修）—— 默认 `fetch` 那条路修完后仍然一次都没被执行。** 回归用例传的是**手写的正确写法副本**与**手写的错误写法副本**，把 `worker.ts` 的默认值改回出 bug 的写法，全部单测照样绿。已补一行**不传第二个实参**的断言，真正走默认依赖。
  - **R1 F3（已修）—— 标签页 id 存进 `chrome.storage.local` 会跨浏览器重启持久，而 tab id 只在单次会话内唯一。** 重启后首次采集可能把一个恰好占用同一 id 的**无关标签页**导航到确认页，用户在那里未保存的输入丢失；`catch` 只挡「id 无效」，挡不住「id 有效但不是我的」。改用 `chrome.storage.session`（既有权限，关闭浏览器即清空）。
  - **R1 F4（已修）—— `URL.origin` 在非默认端口时带端口，而 match pattern 的 host 段不接受端口号**，会让整批权限请求被拒。popup 与 worker 两处统一改为 `protocol + hostname`，且两处必须一致，否则「请求的模式」与「查询的模式」不同，授了权也查不到。
  - **R2 N1（已修）—— 兜底文案臆断了它并不知道的原因。** 上传失败时 reason 是后端错误码（`VERSION_CONFLICT`/`STORAGE_PATH_UNAVAILABLE`…），却一律显示「扩展未响应、网络不通或已超时」，把人指向 `chrome://extensions`。而 `STORAGE_PATH_UNAVAILABLE` 恰好会让**所有**图片同时失败——正是「六张全失败」那次故障的形态。已改为已知后端码交给 `failureText`、认不出的只说没保存并附原始码，并加断言禁止兜底出现「扩展未响应」。
  - **R2 N3（已修）—— 平行 protocol 的守卫没跟上本次新增**，而记录称「两端消息格式由平行 protocol 的守卫覆盖」。已把 `isSafeImageUrl`/`isImageList`、两条图片消息名、`MAX_IMAGES`/`MAX_IMAGE_BYTES` 纳入逐字比对，并经变异验证（改镜像里的 `MAX_IMAGES` 立刻变红）。
  - **R2 N4（已修）—— 唯一接收字节的信任边界 `imageResultFrom` 无直接单测。** 已补拒绝表（跨窗口、跨源、类型不符、base64 形状不合、reason 非字符串），并钉住 `bad-bytes` 为 fail-closed、站点错误细节不透传。
  - **R2 N5（已修）—— 图片部分失败后表单仍可再次提交**，会静默新建第二份资料与快照并重下全部图片。已改为该状态下不渲染表单（与同页 `partial` 分支一致）。
- **两位 Reviewer 指出我三处自述比事实宽，均已更正**：
  1. 「三处文案已按实际授权面重写」——被重写的只是每份文件里的**一段**，同文件其它段落停在旧口径（R1 F1、R2 F1）。
  2. 「回归用例让浏览器专属失败在 Node 里也能发生」——桩确实解决了 receiver 那一半，但「默认依赖从未被执行」在修复后**依然成立**（R1 F2）。
  3. 「权限请求、标签页复用、service worker 唤醒三件事被抽象成 bridge 接口后以假实现测试」——对权限请求成立，对**标签页复用不成立**：那段逻辑整体住在无任何测试的 `bridge.ts` 里，完成条件 12 的前两句此前零机器证据（R1 F3）。
- **按 Reviewer 判定更正的完成条件**（R1 F5、R2 N2）：
  - **条件 5 部分满足**：`credentials:'omit'` 有双重守卫（用例 + 源码扫描）；但「只注册那一个监听」无机器证据——模块顶层的 `addListener` 在 node 环境下 `chrome` 未定义、从不执行，也没有用例去数注册了几个。
  - **条件 6 部分满足**：单张有 20s（worker）与 30s（页面）上限、并发由顺序循环结构性满足；但**没有总预算**，60 张最坏可让确认页停在「正在下载图片」约 20 分钟。
  - **已知限制 5 原文比事实宽**（R2 N2）：超过 60 张的图片在 `collectImages` 就被 `slice` 掉，**根本不进载荷**，因此既不计入 `frozen` 也不计入 `failed`——用户**完全无从得知有图被跳过**，而非原文所说的「混在没能保存的计数里」。现状比原登记更弱。

- **已知限制/未完成项**：
  1. **仓库里的 e2e 验不到扩展那一段**（真实浏览器验证见上，但那是一次性诊断运行，未入库）。Playwright 不加载扩展，所以提取、权限请求、service worker 取字节、中转脚本转交在 e2e 里全部由页面内的桩代替。它证明的是「页面拿到字节之后到后端存下并能列出」这一段。扩展侧由 `extension/` 单测覆盖，两端消息格式由两份平行 protocol 的守卫覆盖 —— **但三者之间没有任何一条端到端证据**，与 TASK-038 的同一处缺口性质相同，只能由用户实机确认。
  2. **权限请求、`chrome.tabs.update` 复用、service worker 唤醒这三件事无法在单测里真跑**：它们都被抽象成 bridge 接口后以假实现测试。真实的 chrome API 行为（尤其「`tabs.update` 对已知 id 不需要 `tabs` 权限」这一条）**只有实机能证**。
  3. **`collectImages` 不认引用式 Markdown 图片**（已在代码注释与契约 §14.6 说明）。用那种写法的页面，其图片保留原站地址。
  4. **base64 传输有 33% 放大**：一张接近 10 MiB 的图会产生约 13 MB 的瞬时消息。逐张传输把峰值控制在单张量级，但单张仍可能触及扩展消息通道的体积上限 —— 触及时该张记为失败，退化为保留原链接。**该上限的具体数值未经实测。**
  5. **一次采集最多 60 张**是扩展侧的自定上限（后端不设张数上限）。超出的图片保留原站地址，但**页面当前不会专门说明「有几张因为超过 60 张而未尝试」** —— 它们混在「没能保存」的计数里。
  6. **文档守卫的覆盖面比它看起来窄**：`boundaries.test.ts` 只断言三处文档**包含** manifest 声明的每个字符串。本次改动前，`<all_urls>` 早已作为「不采用的替代方案」出现在文档里，因此那条断言在语义完全相反时也会通过。三处文案已按实际授权面重写，但**这条守卫本身仍只证明字符串在场，不证明描述正确**。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：L3，两位独立只读 Reviewer，待填
- Acceptance：L3，独立只读，待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项（仅有真实问题时）：待填
- 日期与决定日志：2026-09-07 用户合并 PR #44 与 #45 后指示开 TASK-040，并就权限与渲染两项作答。主 Agent 据「做好、做全」选可选权限而非永久权限——理由是两者覆盖面相同、可选权限不牺牲任何覆盖面，因此这不是安全与功能之间的取舍；并据 `permissions.request` 必须在用户手势中调用这一约束，把 popup 改为两步，代价（带图页面两次点击）如实登记。
<!-- EVIDENCE:END -->
