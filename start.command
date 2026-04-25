#!/bin/bash
set -euo pipefail

# ===========================================
# Geo-Sonification Full Stack Launcher
# Double-click this file to start everything
# ===========================================

cd "$(dirname "$0")"

echo "========================================"
echo "  Geo-Sonification Launcher"
echo "========================================"
echo ""

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo ""
    echo "Stopping server (pid=$SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
    # give it a moment for a clean shutdown
    sleep 0.5
    kill -0 "$SERVER_PID" 2>/dev/null && kill -9 "$SERVER_PID" 2>/dev/null || true
  fi
}
# Only trap EXIT to avoid double cleanup (EXIT fires on any exit, including INT/TERM)
trap cleanup EXIT

## Source .env if present (so ports, etc. are available)
if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

HTTP_PORT=${HTTP_PORT:-3000}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 not found. $2"; exit 1; }
}

require_cmd node  "Install Node.js 18+ first."
require_cmd npm   "Install Node.js (includes npm) first."
require_cmd lsof  "This script needs lsof to check port usage."
require_cmd curl  "This script needs curl to probe server readiness."

# 1. Ensure server deps installed
if [[ ! -d "server/node_modules" ]]; then
  echo "[0/2] Installing server dependencies (first run)..."
  npm --prefix server install
  echo ""
fi

# 2. Check if ports are already in use
kill_port() {
  local port=$1
  local port_name=$2
  local pids
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [[ -z "$pids" ]]; then return 0; fi

  echo "  Port $port ($port_name) in use (pid: $pids) — stopping..."
  echo "$pids" | xargs kill 2>/dev/null || true
  sleep 1
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 0.5
  fi

  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "  ERROR: Failed to free port $port. Please stop the process manually."
    return 1
  fi
  echo "  OK: Port $port freed"
}

kill_port "$HTTP_PORT" "HTTP + WebSocket" || exit 1

# 3. Start Node.js server in background
echo "[1/2] Starting Node.js server..."
node server/index.js &
SERVER_PID=$!

# Wait for server to be ready
HEALTH_URL="http://localhost:${HTTP_PORT}/health"
echo "  Waiting for ${HEALTH_URL} ..."
SERVER_READY=false
for ((i = 0; i < 60; i++)); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    SERVER_READY=true
    break
  fi
  sleep 0.25
done

if [[ "$SERVER_READY" != "true" ]]; then
  echo "  ERROR: Server failed to start within 15 seconds"
  echo "  Check server logs above for errors"
  exit 1
fi
echo "  OK: Server is ready"

# 4. Open browser
echo "[2/2] Opening browser..."
# Server runs HTTP + WebSocket on the same port (single-port model);
# the frontend derives the WS URL from window.location.host.
open "http://localhost:${HTTP_PORT}"

echo ""
echo "========================================"
echo "  All systems launched!"
echo "========================================"
echo ""
echo "  - Server:  http://localhost:${HTTP_PORT}"
echo "  - Audio:   Web Audio (browser)"
echo "  - Browser: Should open automatically"
echo ""
echo "  Press Ctrl+C to stop the server"
echo "========================================"
echo ""

# Keep terminal open and show server logs
wait "$SERVER_PID"
