# TASK-042：渲染正文快照并显示已冻结的图片

```toml
schema_version = 2
id = "TASK-042"
status = "READY"
risk = "L3"
risk_reason = "本任务把「不可信内容退化为惰性文本」这条自 TASK-036 起就成立的结构性安全性质，换成「由渲染器的配置来保证」。TASK-036 明写选 Markdown 而非 HTML 的理由是「抓自开放网络的 HTML 属不可信输入，需永久维护消毒器；Markdown 让不可信内容退化为惰性文本」——一旦开始渲染，这道门就重新打开，此后安全性依赖渲染器选项、链接协议校验与依赖版本，而不再依赖「压根不进 DOM」。被攻破的后果也比一般 XSS 重：本机 UI 源是后端门禁**唯一信任**的源，页面内存里握着本次会话的访问令牌，且扩展的中转脚本也跑在这个源上；那里跑起一段外来脚本等于拿到整个资料库的读写删权限。第二处实质风险：首次引入 Markdown 渲染这一**生产依赖**（前端此前生产依赖只有 React 三件套），它从此是安全关键面。第三处：改变「打开一份资料会不会向外部站点发请求」这一可观察行为。不改后端一行、不改 `/api/v1` 契约、不改本机访问门禁、不改扩展。"
risk_flags = ["security", "architecture", "business"]
owner = "coordinator"
base = "01069535d9910aecc56c6b7380dd17d68985c169"
allowed_paths = [
  "frontend/package.json",
  "frontend/package-lock.json",
  "frontend/src/features/resources/ContentSnapshot.tsx",
  "frontend/src/features/resources/ContentSnapshot.test.tsx",
  "frontend/src/features/resources/snapshotMarkdown.ts",
  "frontend/src/features/resources/snapshotMarkdown.test.ts",
  "frontend/src/features/resources/api.ts",
  "frontend/src/features/resources/api.test.ts",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/api/client.ts",
  "frontend/src/api/client.test.ts",
  "frontend/src/styles.css",
  "frontend/e2e/**",
  "docs/contracts/API与数据契约基线.md",
  "README.md",
  "docs/tasks/TASK-040-extension-image-freeze.md",
  "docs/tasks/TASK-042-snapshot-rendering.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

### 用户授权

2026-09-07 用户合并 PR #46（TASK-040，merge `0106953`）后指示「接下来做完整渲染」，并在听取两条路线的解释后明确选择**甲：渲染 Markdown，但关掉原始 HTML**（不引入消毒器）。用户此前已就本方向作答：TASK-040 阶段选「只采集不渲染」，本任务是那次后置的兑现。

### 目标

1. 资料详情页把正文快照**渲染**出来（当前是 `<pre>` 显示 Markdown 源码）。
2. 正文里的图片，凡已冻结的，显示**本机那一份**；未冻结的按设计决定 ③ 处理。
3. 让用户第一次能在界面上看见 TASK-039/040 冻结下来的东西。

### 非目标（明示不做）

- **不引入消毒器，也不允许原始 HTML**（用户决定，见设计决定 ①）。
- **不改后端一行**、不改 `/api/v1` 契约与 openapi、不改本机访问门禁、**不改 `extension/`**。
- 不做阅读器的其余能力：不做标注、不做目录、不做阅读进度、不做多版本快照对比。
- 不改采集侧的任何行为；不改快照的写入语义。
- 不为渲染而修改已存快照的内容——**正文一字不动**，渲染只发生在显示时。

### 禁止范围

所有未列入 `allowed_paths` 的路径；额外禁止：`backend/**`、`extension/**`、`docs/contracts/openapi-v1.json`、`frontend/src/features/capture/**`、`scripts/governance/**`、`AGENTS.md`、`docs/governance/**`。

### 依赖/前置条件

基线 `0106953`（main，TASK-040 已合并）。依赖 TASK-039 的 `listSnapshotAssets` 与取字节端点（已在 main 上；`listSnapshotAssets` 此前无调用方，本任务即 TASK-040 遗留 F 的重评触发条件）。

### 并行

否。唯一写入者 `coordinator`。

### 顺带完成的状态登记

`docs/tasks/TASK-040-extension-image-freeze.md` 在 `allowed_paths` 内，**仅用于把它的 `status` 由 `ACCEPTED` 登记为 `MERGED`**（用户 2026-09-07 合并 PR #46，merge commit `0106953`），依据根 `AGENTS.md` §5。**除此之外不改该记录一个字。**

## 关键设计决定

### ① 关掉原始 HTML，因此不需要消毒器——但这是一次真实的性质变化，必须说清

用户选甲。渲染器以 **`html: false`** 运行：正文里的 `<script>`、`<img onerror=…>`、`<iframe>` 等会被当作**字面文本**显示，压根不进 DOM。

**这不等于「和以前一样安全」。** TASK-036 的性质是「不可信内容根本不渲染」，属结构性；现在的性质是「不可信内容按配置被转义」，依赖三件事同时成立：渲染器的 `html` 选项、链接协议校验、以及该依赖此后的版本。三者任一失守，后果是本机 UI 源上的任意脚本执行，而那个源握着访问令牌、且是门禁唯一信任的源。**因此本任务把这三条各配一条机器守卫**（完成条件 2、3、4）。

**当前语料的实测**（登记时对用户库中 7 份快照扫描）：`<script>` 0 处、`on*` 事件属性 0 处、`javascript:` 0 处；唯一命中 `<` 的是 `<endl`/`<len`/`<self`，来自 C++ 代码块（`cout << endl`、`vector<len>`），不是 HTML。**这说明甲方案在当前语料上的还原度代价接近于零，但它不能证明将来采集的页面也如此**——这正是守卫必须是机器的而非人工抽查的理由。

### ② 选 `markdown-it`，因为它的默认就是我们要的那个默认

`markdown-it` 的 `html` 选项**默认为 false**，且内置 `validateLink` 默认拒 `javascript:`/`vbscript:`/`file:` 与除图片外的 `data:`。选它意味着**「安全」是默认值、要出事得主动去改**，而不是反过来。

对比：`marked` 曾有的 `sanitize` 选项已废弃并移除，官方指引是「自己接消毒器」——那正是用户不选的乙方案。

它是前端的**第一个非 React 生产依赖**，因此本任务须一并交代：为什么必须是生产依赖（渲染发生在浏览器里）、锁文件的来源核对、以及它从此属安全关键面。

### ③ 未冻结的图片**不自动加载**，显示占位与原址

正文里可能有没冻上的图（用户没授权、取不到、超过 60 张被截断）。若照原样渲染成 `<img src="https://cdn…">`，**浏览器打开这份资料时就会向那个站点发请求** —— 等于把「你在什么时候读了哪篇文章」告诉原站，而这恰好是本项目一路避免的事（后端不出网、取图不带凭证、扩展只在用户点击后行动）。

因此：**未冻结的图片渲染为占位块**，显示原始地址并提供「在新标签页打开」的链接，由用户显式决定是否去访问。**打开一份资料不会向任何外部站点发出请求**——这条写进完成条件并配守卫。

代价如实登记：还原度因此低于「直接加载」。若用户日后更想要「打开即显示全部图片」，那是一次可逆的产品决定，届时重评。

### ④ 已冻结的图片经 `fetch` → blob URL 显示，且必须回收

门禁要求每个 `/api/v1/*` 请求带进程令牌与 `sec-fetch-dest: empty`，而 `<img src>` 两样都不满足（TASK-039 设计决定 ④，已有测试钉死）。所以流程是：`listSnapshotAssets` 拿到 `source_url → asset id` 映射 → 逐张 `fetch` 取字节 → `URL.createObjectURL` → 塞进 `<img>`。

**blob URL 必须显式 `revokeObjectURL`**：不回收会在这一次页面会话里持续占用内存，切换资料越多占得越狠。回收时机与失败降级写进完成条件 8。

### ⑤ 正文一字不动

渲染只发生在显示时，`content_snapshots.content` 不因渲染而改写一个字符（TASK-039 设计决定 ② 的延续：原站地址是溯源信息）。图片替换发生在**渲染管线内**，不回写数据库。

## 完成条件

1. **渲染生效**：资料详情页的快照区显示渲染后的正文（标题、列表、粗体、链接、代码块），不再是 `<pre>` 源码。旧的「查看源码」能力保留或有等价入口（用户此前只能看到源码，不应因本任务失去它）。
2. **原始 HTML 不进 DOM**：正文含 `<script>alert(1)</script>`、`<img src=x onerror=alert(1)>`、`<iframe>` 时，页面上出现的是**这些字符本身**，DOM 里不存在对应元素。须有用例逐条断言（查 `container.querySelector('script')` 等为 null）。
3. **危险协议的链接被拒**：`[x](javascript:alert(1))`、`[x](vbscript:…)`、`[x](data:text/html,…)` 渲染后不产生可点击的该协议链接。须有用例。
4. **渲染器配置有机器守卫**：有一条用例直接断言渲染器以 `html: false` 构造（而不仅仅断言「某个样例没被渲染成 HTML」）——**按 TASK-040 决定日志立下的检查动作**：默认依赖/配置必须有一条直接看那个配置的用例。
5. **已冻结图片显示本机那一份**：正文里 `source_url` 与某个资产匹配时，`<img>` 的 `src` 是 blob URL，且字节经取字节端点获得。须有用例证明请求打到 `/snapshot/assets/{id}/bytes`。
6. **未冻结图片不发外部请求**：渲染含未冻结图片的正文后，**没有任何指向外部源的网络请求**；页面显示占位与原始地址。须有用例（断言 fetch/请求列表里无外部源）与一条 e2e。
7. **打开资料详情页不向外部站点发请求**：整页级别的断言，覆盖正文、图片与链接预取。
8. **blob URL 被回收**：组件卸载或切换资料时对每个创建过的 blob URL 调用 `revokeObjectURL`；取字节失败时该图退化为占位且不影响其余。须有用例。
9. **正文未被改写**：渲染前后 `content` 不变；无任何写请求（PUT/PATCH/POST）因渲染而发出。
10. **无快照、空快照、超长正文**三种形态各自表现正常且不崩。
11. **新增依赖如实交代**：`package.json` 与锁文件同步；记录写明版本、为何是生产依赖、锁文件核对方式，以及它从此属安全关键面。
12. **契约同步**：中文契约 §4.13 的「渲染属阅读器范畴，不在本任务」按实际情况更新，并写明当前渲染的安全形态（`html: false`、无消毒器、未冻结图片不自动加载）。**openapi 与 `/api/v1` 一字不改。**
13. **三组测试计数只增不减**，既有断言无删除、无弱化；`extension` 组计数与基线**完全一致**（本任务不碰它）；新增至少一条走真实后端的 e2e（含图片资料：渲染 + 显示本机图片 + 无外部请求）。

## 上下文包

- 规则：`AGENTS.md`、`frontend/AGENTS.md`、`docs/governance/风险分级与检查规则.md`。
- 必读源文件：`frontend/src/features/resources/ContentSnapshot.tsx`（当前的 `<pre>` 展示与增删改）、`features/resources/api.ts`（`listSnapshotAssets`、`snapshotAsset` 投影）、`src/api/client.ts`（门禁头与 `request()` 的白名单）。
- 契约：§4.13（快照与「渲染属阅读器范畴」那句）、§4.14（资产语义、`<img src>` 为何不可用）、§7（门禁）。
- 依据文档：`docs/research/阅读器与标注能力调研.md`（TASK-041 入库）第 1.4 节说明本方向此前的进展。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-042-snapshot-rendering.md --worktree`（预期选中 `frontend`、`contracts`）。

## 已知取舍（登记时即知）

1. **安全性质从结构性变为配置性**（设计决定 ①）。这是用户在听取两条路线后作出的选择，代价已当面说明。
2. **未冻结的图片看不到**（设计决定 ③），还原度低于「直接加载」，换取「打开资料不向外部发请求」。
3. **新增一个生产依赖**，且它属安全关键面，需随版本更新跟进。
4. **不支持内嵌 HTML 的排版**：极少数依赖 HTML 的表格、折叠块会显示为源码。当前语料实测代价接近于零。
5. **本任务仍不做标注、目录、复习等阅读器能力**。

## 实现与测试

- 实现 SHA/变更摘要：待填
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：待填
- 已知限制/未完成项：待填

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：L3，两位独立只读 Reviewer，待填
- Acceptance：L3，独立只读，待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项（仅有真实问题时）：待填
- 日期与决定日志：2026-09-07 用户合并 PR #46 后指示做完整渲染，并主动问「消毒器是什么」。主 Agent 解释后给出两条路线（甲：关掉原始 HTML、不需消毒器；乙：允许 HTML + 消毒器），并出示对用户库中 7 份快照的实测（无 `<script>`/`on*`/`javascript:`，唯一的 `<` 命中来自 C++ 代码块），说明甲方案在当前语料上的还原度代价接近于零。用户选甲。主 Agent 据此另定两项：选 `markdown-it`（`html` 默认为 false，安全是默认值而非需要主动开启的选项），以及未冻结图片不自动加载（否则打开资料就会向原站发请求，泄露阅读行为，与本项目一路的姿态相悖）。
<!-- EVIDENCE:END -->
