# StudyPilot 浏览器扩展

把当前网页的正文交给本机 StudyPilot 保存。**当前只有工程骨架，采集功能尚未实现**（TASK-037 建立基线，采集在后续任务）。

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

**以下步骤尚未在真实 Chrome 中实机验证**（建立此骨架的环境无法驱动浏览器）。已验证的只是构建产物的形状：`dist/` 下有 `manifest.json`、`popup.html` 与 JS 资源，manifest 为合法 JSON、`manifest_version: 3`、`default_popup` 指向确实存在的文件。首次加载请确认。

1. 打开 `chrome://extensions`；
2. 右上角开启「开发者模式」；
3. 点「加载已解压的扩展程序」，选择 `extension/dist/`。

改动代码后重新 `npm run build`，再在扩展页点一次刷新。

## 边界

- 扩展**不直接调用后端 API**，内容经本机 UI 页面（`http://127.0.0.1:5173`）转交。原因见 `extension/AGENTS.md` §3。
- 扩展**不涉及任何第三方站点的登录凭证**，只读取用户当前已登录、已看得见的页面。
- 当前 manifest 不申请任何权限。`src/manifest.test.ts` 断言 manifest 的顶层键**恰好**是 `manifest_version`/`name`/`version`/`description`/`action` 五个，因此新增任何键都会让测试失败——不只是 `permissions` 和 `host_permissions`，也包括 `optional_permissions`、`externally_connectable`、`web_accessible_resources` 和 CSP 覆写。这些改动须经任务与独立审查。
