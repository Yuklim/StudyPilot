# TASK-058：SQLite 写事务改为 BEGIN IMMEDIATE，修并发写入时的「database is locked」500

```toml
schema_version = 2
id = "TASK-058"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "改 `backend/src/studypilot/infrastructure/database/connection.py` 的事务模式（命中 risk-policy 高风险路径 `backend/**/database*`）：从 sqlite3 的隐式 BEGIN DEFERRED 改为 SQLAlchemy `begin` 事件显式 `BEGIN IMMEDIATE`。影响所有会话与迁移连接；改错会让提交静默失效或把所有请求串成一串。因此 L3：独立只读 Review + 独立 Integration/Acceptance，并以并发回归测试与全量后端套件为证据。"
risk_flags = ["critical-data", "internal-refactor"]
owner = "coordinator"
base = "881e9aeb1244af1a2885e7d8d390fb473bfd6827"
allowed_paths = [
  "backend/src/studypilot/infrastructure/database/connection.py",
  "backend/tests/test_resources.py",
  "backend/tests/test_database.py",
  "backend/tests/test_notes.py",
  "backend/tests/test_resource_updates.py",
  "docs/tasks/TASK-057-library-filters.md",
  "docs/tasks/TASK-058-sqlite-begin-immediate.md",
  "docs/tasks/任务索引.md",
]
checks = ["backend"]
```

## 需求与范围

- **用户授权**：2026-09-12 用户合并 PR #65 后指示「老问题修复一下」——两项老问题之一（另一项为 ≤760px 顶栏导航重叠，另立 TASK-059）。
- **现象**（TASK-056 沙盒发现，本任务用后端测试客户端复现）：对同一份资料**并发**两次 `POST /resources/{id}/deletion-preview`，一次 200、一次 `500 UNKNOWN_ERROR`。临时打印被吞的异常：`sqlite3.OperationalError: database is locked`，抛在 `preview_deletion` 的 `flush()`。
- **根因**：引擎以 `connect_args={"autocommit": False}`（Python 3.12+ 的非 legacy 事务控制）连接，sqlite3 在每个事务开头隐式 `BEGIN`（DEFERRED）。两个请求各自先做只读查询（拿 SHARED 锁），再同时试图升级为写：SQLite 对「读→写升级」冲突**立即**返回 `SQLITE_BUSY`、不走 `busy_timeout`（等下去必然死锁），于是第二个写者 500。`busy_timeout=5000` 与 `timeout: 5` 对这一形态无效。任何「先读后写」的接口在并发时都可能撞上，不止删除预览。
- **修法**（SQLAlchemy 官方 pysqlite 建议）：连接改为 legacy 事务控制 + `isolation_level=None`（驱动不再隐式 BEGIN），在引擎 `begin` 事件里显式发 `BEGIN IMMEDIATE`：事务一开始就拿 RESERVED 锁，第二个写者在 `BEGIN` 处按 `busy_timeout` 等待而不是死锁。代价：所有事务（含只读）串行化，单机单用户可接受；`commit()/rollback()` 在 legacy 模式下照常生效（**不能**用 sqlite3 的 `autocommit=True`：那种模式下 commit/rollback 是空操作，会让写入静默不落库）。
- **目标**：① 并发两次预览均 200 且得到两个不同的一次性令牌；② 全量后端套件不变；③ `PRAGMA foreign_keys` 仍在事务外生效（迁移路径 `foreign_keys=False` 照旧）；④ 显式断言每个事务以 `BEGIN IMMEDIATE` 开头（回归测试）。
- **非目标**：不开 WAL；不改任何模型/迁移/契约/前端；不改 `busy_timeout`。

### 顺带完成的状态登记

`TASK-057-library-filters.md`（PR #65，merge `881e9ae`）登记 MERGED，索引同步。

### 实现中修订授权范围（登记后、冻结前）

改为 BEGIN IMMEDIATE 后，7 条既有用例失败——全部是**测试自身**在一个线程里叠开两个事务或在事务内部用 Barrier 制造「两个写者同时在 check_version 里」的形态，这正是 IMMEDIATE 使之不可能的形态：
- `test_database.py`（2 条）：「每个新连接都启用 FK」改在原生 DBAPI 连接上读 PRAGMA（不经 SQLAlchemy 开事务）；「版本冲突与 noop 保时间戳」把第二个会话的读取挪到第一个会话 `commit()` 之后。断言不变。
- `test_notes.py`（2 个参数化函数共 4 条）与 `test_resource_updates.py`（1 条）「真实并发」：Barrier 从 `check_version` 内部挪到**发请求之前**（两个请求同时在途，事务在 BEGIN 处串行）；**断言收紧**：此前容忍 loser 为 `500 UNKNOWN_ERROR`（正是本任务修的「database is locked」），现在必须是干净的 `409 VERSION_CONFLICT`（删除先赢时为 `404`）。不再 monkeypatch `check_version`。
故追加上述三个测试文件到 `allowed_paths`。

## 完成条件

1. `test_resources.py` 新增并发预览回归用例：两线程同时预览同一资料 → 均 200、令牌不同；在改动前该用例必红（记录）。
2. 新增事务模式断言：连接上抓到的第一条语句为 `BEGIN IMMEDIATE`；提交后数据确实落库（防 legacy/autocommit 混用导致的静默不提交）。
3. `uv run pytest` 全绿（基线 553）；ruff/mypy 通过；`check_task` backend profile PASS。
4. L3：独立只读 Review PASS；独立 Integration/Acceptance PASS。

## 实现与测试

（实施后填写）

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

（实施后填写）
<!-- EVIDENCE:END -->
