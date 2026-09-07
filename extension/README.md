# StudyPilot 浏览器扩展

把当前网页的正文交给本机 StudyPilot 保存。

**用法**：在想保存的网页上点扩展图标 →「保存这一页的正文」→ **若正文里有图片，会再问一次「连图片一并保存」还是「只保存正文」**，选前者时浏览器弹出授权框，允许后才会下载图片 → 浏览器打开 StudyPilot 的确认页，核对标题与正文后点「保存为资料」；图片在正文保存成功之后逐张下载。**不点确认就什么都不会保存。** 不授权或某张下载失败时，那些图片仍指向原网站，确认页会说明有几张没保存、分别什么原因。**一处例外**：一次采集最多处理 60 张，超出的图片在提取阶段就被截断、根本不会进入这次采集，确认页也不会提到它们。

**只支持 Chrome 与 Edge**（Chromium）。不支持 Firefox 与 Safari。

本目录是独立的 npm 工程，不与 `frontend/` 共享依赖。

## 开发

在 `extension/` 中运行：

```bash
npm ci
npm run test -- --run
npm run build
```

`npm run build` 产出 `extension/dist/`，其中的 `manifest.json` 由 `src/manifest.ts` 在构建时生成，仓库里没有第二份副本。

## 在 Chrome 中加载

扩展**已在 Microsoft Edge 中实机加载验证过**（TASK-037，弹窗正常显示）；**Chrome 尚未实测**，两者同内核、manifest 未使用任何 Chromium 分支专有字段。TASK-038 的采集全流程已由用户实机确认。TASK-040 的图片冻结：主 Agent 用 Playwright 加载扩展做过一次真实浏览器诊断运行（提取→取字节→上传→后端可列出，全程成功），用户在修复后复测的原话是「这次**应该**下载成功了」（带保留语气，未给出张数或界面细节，此处按原话记录、不上调）；但**点击扩展图标授予 `activeTab`、以及真实授权框的交互，自动化无法触发**，这两处仍只有用户实机确认。

Edge 的入口是 `edge://extensions` → 左下角「开发人员模式」→「加载解压缩的扩展」。Chrome 的三步如下：

1. 打开 `chrome://extensions`；
2. 右上角开启「开发者模式」；
3. 点「加载已解压的扩展程序」，选择 `extension/dist/`。

改动代码后重新 `npm run build`，再在扩展页点一次刷新。

## 边界

- 扩展**不直接调用后端 API**，内容经本机 UI 页面（`http://127.0.0.1:5173`）转交。原因见 `extension/AGENTS.md` §3。
- 扩展**不涉及任何第三方站点的登录凭证**，只读取用户当前已登录、已看得见的页面。提取前会对页面做两处图片属性归一化（懒加载相关），页面内容不会被改动。
- **未确认的采集会暂存在扩展的本地存储中**：点了「保存这一页的正文」但没有打开确认页（或直接关掉了），那篇正文会留在扩展 profile 的磁盘上，直到下次采集覆盖它、或下次打开确认页时被清除。
- manifest 安装时只申请 `activeTab`、`scripting`、`storage`，外加一条**只匹配 `http://127.0.0.1:5173/*`（本机 UI 源）** 的内容脚本；**不申请永久的 `host_permissions`**。`activeTab` 只在你点击图标后授予当前那一个标签页。**冻结图片需要的站点权限是「可选权限」**：manifest 里写的是 `optional_host_permissions: ["<all_urls>"]`，**安装时不授予任何站点权限**，只有当这一页的正文里有图片、且你点了「连图片一并保存」时，浏览器才会弹出授权框；拒绝或事后在扩展设置页撤销，采集照常完成，图片保留原网站地址。取图由 `background` service worker 完成——那是扩展**唯一**会主动发网络请求的地方，取图时不带任何站点凭证（`credentials: 'omit'`），因此登录墙后的图片取不到。`src/manifest.test.ts` 断言 manifest 的顶层键**恰好**是 `manifest_version`/`name`/`version`/`description`/`permissions`/`optional_host_permissions`/`background`/`content_scripts`/`action` 九个，因此新增任何键都会让测试失败；另有一条断言钉住「站点权限必须留在 optional 里」，把 `<all_urls>` 挪进 `host_permissions` 会立刻变红。这些改动须经任务与独立审查。
