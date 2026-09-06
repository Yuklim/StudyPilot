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

1. 打开 `chrome://extensions`；
2. 右上角开启「开发者模式」；
3. 点「加载已解压的扩展程序」，选择 `extension/dist/`。

改动代码后重新 `npm run build`，再在扩展页点一次刷新。

## 边界

- 扩展**不直接调用后端 API**，内容经本机 UI 页面（`http://127.0.0.1:5173`）转交。原因见 `extension/AGENTS.md` §3。
- 扩展**不涉及任何第三方站点的登录凭证**，只读取用户当前已登录、已看得见的页面。
- 当前 manifest 不申请任何权限；新增权限须经任务与独立审查，`src/manifest.test.ts` 对此设有门闩。
