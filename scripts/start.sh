#!/usr/bin/env bash
set -euo pipefail

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT="$REPO_ROOT/CAL.py"
BACK_LOG="${TMPDIR:-/tmp}/cal-py-uvicorn.log"
FRONT_LOG="${TMPDIR:-/tmp}/cal-py-http5173.log"
BACK_PID="${TMPDIR:-/tmp}/cal-py-uvicorn.pid"
FRONT_PID="${TMPDIR:-/tmp}/cal-py-http5173.pid"

echo "[start.sh] Resetting environment and (re)starting services..."

# Kill by PID files if present
kill_if_running() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid=$(cat "$pid_file" || true)
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "[start.sh] Killing PID $pid from $pid_file"
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file" || true
  fi
}

kill_if_running "$BACK_PID"
kill_if_running "$FRONT_PID"

# Kill anything listening on 8000/5173
for port in 8000 5173; do
  if pids=$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null || true); then
    if [[ -n "${pids:-}" ]]; then
      echo "[start.sh] Killing processes on port $port: $pids"
      kill -9 $pids 2>/dev/null || true
    fi
  fi
done

# Ensure venv and deps
cd "$ROOT"

# Optional clean rebuild if CLEAN=1
if [[ "${CLEAN:-0}" == "1" ]] && [[ -d .venv ]]; then
  echo "[start.sh] CLEAN=1 set, removing stale venv..."
  rm -rf .venv
fi

if [[ ! -d .venv ]]; then
  echo "[start.sh] Creating virtualenv at $ROOT/.venv"
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

# Fresh install to avoid ABI mismatch (e.g., musllinux vs manylinux)
pip install -r cal/server/requirements.txt

# Sanity check for pydantic_core native module; fallback force reinstall
python - <<'PY' || true
import sys
try:
    import pydantic_core._pydantic_core as _
    print('[start.sh] pydantic_core OK')
except Exception as e:
    print('[start.sh] pydantic_core import failed:', repr(e))
    raise SystemExit(1)
PY
if [[ $? -ne 0 ]]; then
  echo "[start.sh] Forcing reinstall of fastapi/pydantic/pydantic-core without cache..."
  pip install --no-cache-dir --force-reinstall "pydantic==2.11.9" "pydantic-core==2.33.2" fastapi starlette
fi

# Start backend (Uvicorn)
echo "[start.sh] Starting backend on :8000"
nohup python -m uvicorn cal.server.main:app \
  --host 0.0.0.0 --port 8000 \
  >"$BACK_LOG" 2>&1 &
echo $! > "$BACK_PID"

# Start frontend (static server)
echo "[start.sh] Starting frontend on :5173"
nohup python -m http.server 5173 --bind 0.0.0.0 \
  >"$FRONT_LOG" 2>&1 &
echo $! > "$FRONT_PID"

echo "[start.sh] Done. Backend :8000 (pid $(cat "$BACK_PID")), Frontend :5173 (pid $(cat "$FRONT_PID"))."
echo "[start.sh] Open: http://127.0.0.1:5173/cal/topiclist/"
