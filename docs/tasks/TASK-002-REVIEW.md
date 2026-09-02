# TASK-002 独立审查报告

## 1. 审查信息

- Reviewer：`qa_reviewer`
- 审查目标：TASK-002 可运行项目与本地开发脚手架的完整合并差异
- 比较基线：`2ded4eb3612fd0df2129f667bc4ace05fb2dbf20`
- 冻结候选提交 SHA：`93b6ff47c1a692eb89b3ba2a599066c9cacb77a4`
- 合并基点：`2ded4eb3612fd0df2129f667bc4ace05fb2dbf20`
- 审查日期：2026-09-02
- 实际运行权限：`read-only`
- 权限证据：
  - 运行时权限配置明确为只读；
  - Git 尝试创建 `/tmp/xcrun_db-*` 缓存时被系统以 `Operation not permitted` 拒绝；
  - 审查结束时 HEAD 仍为冻结候选，工作区相对候选无修改；
  - 未写文件、未创建提交、未修复代码。

## 2. Findings

### [P2] 不要在全局错误边界记录未经清理的异常对象

- 位置：`frontend/src/ErrorBoundary.tsx:18`
- 违反的需求、任务或规则：
  - TASK-002 功能要求 12；
  - `AGENTS.md` 安全与数据规则；
  - `frontend/AGENTS.md` 第 3 节“不得记录用户正文、笔记或密钥”；
  - 架构第 9.3 节日志脱敏边界。
- 触发场景：README 将 `npm run dev` 作为当前主要使用方式；任何后续子组件若抛出包含 API 响应、用户正文、笔记或密钥信息的异常，`componentDidCatch` 会把完整 `error` 和 `errorInfo` 交给 `console.error`。
- 实际影响：敏感内容和异常上下文可能进入浏览器控制台；当前测试仅屏蔽 `console.error`，没有验证日志参数已脱敏。作为全局脚手架边界，这会把不安全的日志默认行为带入后续所有页面。
- 安全修复路径：不要转发原始异常对象；只记录固定、脱敏的诊断信息或安全错误编号。补充测试，证明异常正文和上下文不会作为控制台参数输出。

### [P2] 在冻结候选中同步任务的审查状态

- 位置：`docs/tasks/TASK-002-runnable-project-scaffold.md:5`；`docs/tasks/任务索引.md:24`
- 违反的需求、任务或规则：
  - `AGENTS.md` 第 8 节阶段门禁；
  - `docs/governance/多Agent开发制度使用指南.md` 的冻结候选流程；
  - 任务索引定义的状态机。
- 触发场景：冻结候选已经包含完成的实现和 HANDOFF，且正式独立审查已经启动，但任务单和索引仍显示 `READY`，索引说明仍称“等待 intake 分支进入 main”；实际上 intake 已在比较基线 `2ded4eb` 中合并。
- 实际影响：控制面把已完成并处于审查阶段的任务显示为仍可分配，不能准确反映路径占用和证据阶段，削弱后续验收的可追溯性。
- 安全修复路径：coordinator 保存本报告时，将任务单和索引按当前结论同步为 `RETURNED` 并记录决定；形成修订候选时，再将两处一致更新为 `IN_REVIEW`。仅修改允许的状态字段和决定日志。

### [P3] 让 Node 类型定义与固定的 Node 24 运行时一致

- 位置：`frontend/package.json:29`
- 违反的需求、任务或规则：TASK-002 关于固定 Node.js 版本、降低环境差异和建立可信 TypeScript 检查基线的要求。
- 触发场景：项目运行时明确限制为 Node `>=24 <25`，但类型检查使用 `@types/node` `26.4.1`。后续工具代码调用 Node 26 新增 API 时，TypeScript 可能接受代码，而固定的 Node 24 在运行时并不提供该 API。
- 实际影响：类型检查不能可靠代表仓库声明的运行环境，可能产生“类型检查通过、实际启动或构建失败”的回归。
- 安全修复路径：将 `@types/node` 固定为兼容 Node 24 的版本，同步更新 `package-lock.json`，重新执行 `npm ci`、lint、typecheck、测试和正式构建。

## 3. 审查覆盖

- [x] 完整 diff
- [x] 相关调用路径
- [x] 需求与任务验收条件
- [x] 测试和检查证据
- [x] 公共契约
- [x] 安全与隐私边界
- [x] 修改范围

补充证据：

- 两个 SHA 均验证为提交，基线是候选祖先，实际合并基点与指定基线一致。
- 候选包含实现提交 `188bee69c00899a919407e888faab6addce856c2` 和 HANDOFF 冻结提交。
- 完整差异共 39 个文件：38 个实现文件均在任务允许路径内，另一个是 coordinator 控制面的 HANDOFF。
- 未发现被提交的运行数据、数据库、依赖目录、缓存、构建产物、个人绝对路径或高风险密钥模式。
- `package-lock.json` 共 267 个 package 条目，非根条目均有 integrity，未发现非 npm registry 来源；前后端清单与锁文件的直接依赖一致。
- 独立只读复核结果：
  - `git diff --check`：PASS
  - 治理验证：PASS，30 项不变量
  - 治理单元测试：PASS，3 项
  - 内存态 `/health` 与 `/api/v1` 默认拒绝冒烟：PASS
- HANDOFF 记录了后端 6 项测试、前端 3 项测试及格式、lint、类型、构建、安装和人工冒烟结果。

## 4. 测试缺口与剩余风险

- 错误边界测试没有验证异常内容不会进入控制台日志。
- Reviewer 为保持实际只读，没有重新执行会生成 `.venv`、`node_modules`、临时目录、缓存或 `dist` 的完整安装、pytest、Vitest 和构建命令；这些结果依赖冻结候选所含 HANDOFF 证据。
- 用户环境默认 npm 缓存仍存在既有 `EACCES`；HANDOFF 已验证使用独立缓存的 `npm ci` 替代步骤。
- Host、Origin、Fetch Metadata、本地令牌和自定义头的完整协议按任务边界有意延期；当前所有 `/api/v1` 请求必须继续保持默认拒绝。

## 5. 总体结论

- `CHANGES_REQUIRED`

以上问题修订后会形成新的冻结候选 SHA，届时必须重新对新基线差异执行完整只读审查。
