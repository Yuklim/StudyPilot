# StudyPilot 浏览器扩展

把当前网页的正文交给本机 StudyPilot 保存。

**用法**：在想保存的网页上点扩展图标 →「保存这一页的正文」→ 浏览器会打开 StudyPilot 的确认页，核对标题与正文后点「保存为资料」。**不点确认就什么都不会保存。**

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

扩展**已在 Microsoft Edge 中实机加载验证过**（TASK-037，弹窗正常显示）；**Chrome 尚未实测**，两者同内核、manifest 未使用任何 Chromium 分支专有字段。TASK-038 新增的采集全流程尚待首次实机确认。

Edge 的入口是 `edge://extensions` → 左下角「开发人员模式」→「加载解压缩的扩展」。Chrome 的三步如下：

1. 打开 `chrome://extensions`；
2. 右上角开启「开发者模式」；
3. 点「加载已解压的扩展程序」，选择 `extension/dist/`。

改动代码后重新 `npm run build`，再在扩展页点一次刷新。

## 边界

- 扩展**不直接调用后端 API**，内容经本机 UI 页面（`http://127.0.0.1:5173`）转交。原因见 `extension/AGENTS.md` §3。
- 扩展**不涉及任何第三方站点的登录凭证**，只读取用户当前已登录、已看得见的页面。提取前会对页面做两处图片属性归一化（懒加载相关），页面内容不会被改动。
- **未确认的采集会暂存在扩展的本地存储中**：点了「保存这一页的正文」但没有打开确认页（或直接关掉了），那篇正文会留在扩展 profile 的磁盘上，直到下次采集覆盖它、或下次打开确认页时被清除。
- manifest 只申请 `activeTab`、`scripting`、`storage`，外加一条**只匹配 `http://127.0.0.1:5173/*`（本机 UI 源）** 的内容脚本；不申请 `host_permissions`、不申请 `<all_urls>`。`activeTab` 只在你点击图标后授予当前那一个标签页。`src/manifest.test.ts` 断言 manifest 的顶层键**恰好**是 `manifest_version`/`name`/`version`/`description`/`permissions`/`content_scripts`/`action` 七个，因此新增任何键都会让测试失败——不只是 `permissions` 和 `host_permissions`，也包括 `optional_permissions`、`externally_connectable`、`web_accessible_resources` 和 CSP 覆写。这些改动须经任务与独立审查。
