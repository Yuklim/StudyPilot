# TASK-002 第二轮独立审查报告

## 1. 审查信息

- Reviewer：`qa_reviewer`
- 审查目标：TASK-002 可运行项目与本地开发脚手架的完整合并差异
- 比较基线：`2ded4eb3612fd0df2129f667bc4ace05fb2dbf20`
- 冻结候选提交 SHA：`36da78d0fa9eec1a2f02af696aaad50bfeff8322`
- 合并基点：`2ded4eb3612fd0df2129f667bc4ace05fb2dbf20`
- 审查日期：2026-09-02
- 实际运行权限：`read-only`
- 权限证据：
  - 运行时权限配置明确为只读，审批策略不允许提权；
  - Git、Vitest 等工具尝试创建缓存或临时文件时被系统以 `Operation not permitted` 或 `EPERM` 拒绝；
  - 当前 HEAD 精确等于冻结候选，工作区相对候选无修改；
  - 审查过程未写入文件、未创建提交、未修复代码。

## 2. Findings

### [P2] 在 React 根节点覆盖会泄露原始异常的默认回调

- 位置：`frontend/src/main.tsx:15`
- 违反的需求、任务或规则：TASK-002 功能要求 12、根规则与前端规则中的敏感日志禁令，以及架构第 9.3 节日志脱敏边界。
- 触发场景：任意由 `ErrorBoundary` 捕获的子组件抛出包含 API 响应、私人笔记或密钥的异常。虽然 `componentDidCatch` 已改为只记录固定文本，但 `createRoot(rootElement)` 没有配置 `onCaughtError`。锁定的 React DOM 19.2.8 默认回调仍会把原始异常交给 `console.error`。
- 实际影响：上一轮日志泄露问题没有在真实 React 渲染调用路径上完全关闭。使用候选锁定的 React 19.2.8 和 jsdom 进行只读内存复现时产生两次控制台调用：错误边界的固定消息存在，但原始敏感标记同样进入了控制台参数；生产构建中的默认回调也会记录原始错误。
- 安全修复路径：在 `createRoot` 的根选项中提供不会转发 `error` 或 `componentStack` 的 `onCaughtError`，只输出固定脱敏诊断或完全抑制日志，并避免与 `componentDidCatch` 重复记录。补充经过实际 React 根节点渲染的测试，证明全部控制台调用均不包含异常消息或组件栈中的敏感标记；同时按相同隐私原则审视根级 `onUncaughtError` 和 `onRecoverableError`。

未发现其他符合报告阈值的问题。

## 3. 审查覆盖

- [x] 完整 diff
- [x] 相关调用路径
- [x] 需求与任务验收条件
- [x] 测试和检查证据
- [x] 公共契约
- [x] 安全与隐私边界
- [x] 修改范围

完整差异核对结果：

- 两个 SHA 均为有效提交；指定基线是新候选祖先，实际合并基点与指定基线一致；
- 完整差异为 42 个文件：38 个实现文件均属于任务允许路径，另外 4 个是 coordinator 获准维护的 TASK-002 HANDOFF、REVIEW、任务状态和索引；
- 根 `AGENTS.md` 仅修改第 3 节；
- 未发现提交的数据库、运行数据、依赖目录、构建产物、缓存、日志、个人绝对路径、真实邮箱或高风险密钥模式；
- npm 锁文件根依赖与 `package.json` 一致，非根包均包含完整性校验，未发现非 npm registry 来源；uv 锁文件仅包含项目自身 editable 来源和 PyPI registry 来源。

上一轮三项发现复核：

1. 异常日志：`componentDidCatch` 已停止转发原始异常并补充直接调用测试，但真实 React 根调用路径仍会通过默认 `onCaughtError` 泄露原始异常，因此未完全解决。
2. 控制面状态：已解决。任务单和任务索引均同步为 `IN_REVIEW`，决定日志完整。
3. Node 类型定义：已解决。`@types/node` 已调整为 `24.13.3`，`package-lock.json` 已同步。

独立只读检查：

- `git diff --check`：PASS
- 治理验证：PASS，30 项语义不变量
- 治理单元测试：PASS，3 项
- Ruff 格式检查和静态检查：PASS
- Prettier 格式检查：PASS
- ESLint：PASS
- 后端无写入测试子集：PASS，3 项
- React 根节点日志内存复现：确认原始敏感异常仍会进入控制台参数

## 4. 测试缺口与剩余风险

- `frontend/src/ErrorBoundary.test.tsx` 直接调用 `componentDidCatch`，绕过了 `createRoot` 的默认错误处理，因此无法证明真实渲染路径已脱敏。
- Reviewer 无法在实际只读环境重新运行 Vitest：Vite 必须创建临时文件，写入被只读 sandbox 拒绝；候选中的完整前端测试结果仍依赖 HANDOFF 证据。
- Reviewer 未重新运行会生成依赖目录、构建产物、缓存或临时目录的完整安装、pytest、Vitest 和构建命令；HANDOFF 已记录这些检查通过。
- 默认 npm 用户缓存仍存在既有 `EACCES`，README 已提供使用被 Git 忽略的项目内缓存进行干净安装的替代步骤。
- Host、Origin、Fetch Metadata、本地令牌和自定义头协议按任务边界有意延期；在正式契约批准前，全部 `/api/v1` 请求必须继续默认拒绝。

## 5. 总体结论

- `CHANGES_REQUIRED`

修订会形成新的冻结候选 SHA，必须重新审查相对同一基线的完整合并差异。
