#!/usr/bin/env bash
# 一键启动本机开发环境：后端（127.0.0.1:8000）+ 前端（127.0.0.1:5173），Ctrl+C 一起停。
#
# 做的事与 docs/开发与运行.md「运行」一节完全一致，只是把两个终端合成一个：
#   1. 检查依赖已装、端口空闲；
#   2. 若有待执行的数据库迁移，先把 backend/var/studypilot.db 备份到 backend/var/backups/，
#      再 `alembic upgrade head`（文档要求：已有真实数据升级前先备份）；
#   3. 起 uvicorn，等 /health 通过；起 Vite；打开浏览器；
#   4. 把两边日志汇到当前终端，Ctrl+C 时把两个进程一起停掉。
#
# 用法：scripts/dev.sh [--no-open]
#   --no-open  不自动打开浏览器
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${STUDYPILOT_API_PORT:-8000}"
UI_PORT="${STUDYPILOT_UI_PORT:-5173}"
OPEN_BROWSER=1
[[ "${1:-}" == "--no-open" ]] && OPEN_BROWSER=0

say() { printf '\033[1;32m[dev]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[dev]\033[0m %s\n' "$*" >&2; exit 1; }

# --- 1. 前置检查 -----------------------------------------------------------------
command -v uv >/dev/null || die "没有找到 uv，请先安装：https://docs.astral.sh/uv/"
command -v npm >/dev/null || die "没有找到 npm，请先安装 Node.js"
[[ -d "$ROOT/backend/.venv" ]] || die "后端依赖未安装：cd backend && uv sync --locked"
[[ -d "$ROOT/frontend/node_modules" ]] || die "前端依赖未安装：cd frontend && npm ci"

port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
port_busy "$API_PORT" && die "端口 $API_PORT 已被占用（可能已有一个后端在跑）：lsof -nP -iTCP:$API_PORT -sTCP:LISTEN"
port_busy "$UI_PORT" && die "端口 $UI_PORT 已被占用（可能已有一个前端在跑）：lsof -nP -iTCP:$UI_PORT -sTCP:LISTEN"

LOG_DIR="$ROOT/backend/var/logs"
mkdir -p "$LOG_DIR"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
: > "$BACKEND_LOG"; : > "$FRONTEND_LOG"

# --- 2. 数据库迁移（有待执行的才动，动之前先备份）------------------------------------
cd "$ROOT/backend"
DB_FILE="$ROOT/backend/var/studypilot.db"
current="$(uv run --quiet alembic current 2>/dev/null | awk '{print $1}' | head -1 || true)"
head="$(uv run --quiet alembic heads 2>/dev/null | awk '{print $1}' | head -1 || true)"
if [[ -z "$head" ]]; then
  die "读不到 alembic 迁移版本，请先手动执行：cd backend && uv run alembic heads"
fi
if [[ "$current" != "$head" ]]; then
  if [[ -f "$DB_FILE" ]]; then
    mkdir -p "$ROOT/backend/var/backups"
    backup="$ROOT/backend/var/backups/studypilot-$(date +%Y%m%d-%H%M%S).db"
    cp "$DB_FILE" "$backup"
    say "数据库有待执行的迁移（${current:-空} → ${head}），已先备份到 ${backup#"$ROOT"/}"
  else
    say "首次建库（→ ${head}）"
  fi
  uv run --quiet alembic upgrade head
else
  say "数据库已是最新（${head}）"
fi

# --- 3. 启动两端 ---------------------------------------------------------------------
BACKEND_PID=""; FRONTEND_PID=""; TAIL_PID=""
# 连同子进程一起停：`uv run` / `npm run` 都是包一层的启动器，真正监听端口的是它们的孩子。
stop_tree() {
  local pid="$1" child
  [[ -n "$pid" ]] || return 0
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do stop_tree "$child"; done
  kill "$pid" 2>/dev/null || true
}
cleanup() {
  trap - INT TERM EXIT
  say "正在停止…"
  stop_tree "$TAIL_PID"
  stop_tree "$FRONTEND_PID"
  stop_tree "$BACKEND_PID"
  wait 2>/dev/null || true
  say "已停止。日志保留在 backend/var/logs/"
}
trap cleanup INT TERM EXIT

say "启动后端 http://127.0.0.1:$API_PORT"
uv run --quiet uvicorn studypilot.main:app --host 127.0.0.1 --port "$API_PORT" --no-access-log \
  >>"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1; then break; fi
  kill -0 "$BACKEND_PID" 2>/dev/null || { cat "$BACKEND_LOG" >&2; die "后端启动失败，见上方日志"; }
  sleep 0.5
done
curl -fsS "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1 || { cat "$BACKEND_LOG" >&2; die "后端 30 秒内未通过 /health"; }
say "后端就绪"

say "启动前端 http://127.0.0.1:$UI_PORT"
cd "$ROOT/frontend"
npm run --silent dev -- --port "$UI_PORT" --strictPort >>"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$UI_PORT" >/dev/null 2>&1; then break; fi
  kill -0 "$FRONTEND_PID" 2>/dev/null || { cat "$FRONTEND_LOG" >&2; die "前端启动失败，见上方日志"; }
  sleep 0.5
done
say "前端就绪"

if [[ "$OPEN_BROWSER" == 1 ]] && command -v open >/dev/null; then
  open "http://127.0.0.1:$UI_PORT"
fi

say "运行中：界面 http://127.0.0.1:$UI_PORT ｜ 后端 http://127.0.0.1:$API_PORT/health ｜ Ctrl+C 停止"
say "日志：backend/var/logs/backend.log、frontend.log（下面实时汇总）"
tail -n +1 -F "$BACKEND_LOG" "$FRONTEND_LOG" &
TAIL_PID=$!
wait "$BACKEND_PID" "$FRONTEND_PID"
