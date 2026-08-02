#!/usr/bin/env bash
# MarketMind - single-command launcher (Git Bash / macOS / Linux).
#
#     ./run.sh
#
# Sets up anything missing (venv, Python deps, npm deps, backend/.env), picks a
# free API port, then runs the API and the web app together. Ctrl+C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
API_PID=""

step() { printf '\033[36m==> %s\033[0m\n' "$1"; }
cleanup() {
  if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
    step 'Stopping API'
    kill "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Windows venvs use Scripts/, POSIX uses bin/
if [ -x "$BACKEND/.venv/Scripts/python.exe" ]; then
  PY="$BACKEND/.venv/Scripts/python.exe"
elif [ -x "$BACKEND/.venv/bin/python" ]; then
  PY="$BACKEND/.venv/bin/python"
else
  step 'Creating Python virtual environment'
  python -m venv "$BACKEND/.venv" 2>/dev/null || python3 -m venv "$BACKEND/.venv"
  PY="$BACKEND/.venv/Scripts/python.exe"
  [ -x "$PY" ] || PY="$BACKEND/.venv/bin/python"
fi

if ! "$PY" -c "import fastapi, uvicorn, yfinance" 2>/dev/null; then
  step 'Installing backend dependencies (first run, 1-2 min)'
  "$PY" -m pip install --quiet --disable-pip-version-check --upgrade pip
  "$PY" -m pip install --quiet --disable-pip-version-check -r "$BACKEND/requirements.txt"
fi

if [ ! -f "$BACKEND/.env" ]; then
  step 'Creating backend/.env from template'
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  printf '\033[33m    Market data works with no keys. AI features need one:\n'
  printf '    Free key -> https://aistudio.google.com/apikey (set GEMINI_API_KEY)\033[0m\n'
fi

if [ ! -d "$FRONTEND/node_modules" ]; then
  step 'Installing frontend dependencies (first run, ~1 min)'
  (cd "$FRONTEND" && npm install --silent)
fi

# Use 127.0.0.1 everywhere, not localhost: localhost can resolve to ::1 first while
# uvicorn binds IPv4-only, which makes probes and the Vite proxy hang.
PORT=8000
while [ "$PORT" -lt 8026 ]; do
  if ! curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/" 2>/dev/null; then break; fi
  PORT=$((PORT + 1))
done
[ "$PORT" -eq 8000 ] || echo "    Port 8000 is in use; using $PORT instead."

step "Starting API on http://127.0.0.1:$PORT"
(cd "$BACKEND" && "$PY" -m uvicorn main:app --port "$PORT") &
API_PID=$!

READY=0
for _ in $(seq 1 60); do
  if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/health"; then READY=1; break; fi
  sleep 0.5
done
[ "$READY" -eq 1 ] || { echo "API did not become ready on port $PORT. See output above."; exit 1; }
echo "    API ready - docs at http://127.0.0.1:$PORT/docs"

step 'Starting web app - open the URL below. Ctrl+C stops both.'
export VITE_BACKEND_URL="http://127.0.0.1:$PORT"
cd "$FRONTEND" && npm run dev
