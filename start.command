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

HTTP_PORT=${HTTP_PORT:-3000}
WS_PORT=${WS_PORT:-3001}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 not found. $2"; exit 1; }
}

require_cmd node  "Install Node.js 18+ first."
require_cmd npm   "Install Node.js (includes npm) first."
require_cmd lsof  "This script needs lsof to check port usage."
require_cmd curl  "This script needs curl to probe server readiness."

# 1. Ensure server deps installed
if [[ ! -d "server/node_modules" ]]; then
  echo "[0/3] Installing server dependencies (first run)..."
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

kill_port "$HTTP_PORT" "HTTP" || exit 1
kill_port "$WS_PORT" "WebSocket" || exit 1

# 3. Start Node.js server in background
echo "[1/3] Starting Node.js server..."
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

# 4. Open MaxMSP patch
echo "[2/3] Opening MaxMSP patch..."
PATCH_FILE="sonification/max_wav_osc.maxpat"
PATCH_STATUS="(not opened)"

if [[ -f "$PATCH_FILE" ]]; then
  if open -a "Max" "$PATCH_FILE" >/dev/null 2>&1; then
    PATCH_STATUS="$PATCH_FILE"
    # Wait for Max to open
    sleep 2
  else
    PATCH_STATUS="(not opened - could not open with Max)"
    echo "  WARN: Could not open MaxMSP patch (is Max installed?): $PATCH_FILE"
  fi
else
  PATCH_STATUS="(not opened - patch file not found)"
  echo "  WARN: Max patch not found: $PATCH_FILE (skipping)"
fi

# 5. Open browser
echo "[3/3] Opening browser..."
# Include ws_port parameter so frontend knows the correct WebSocket port
open "http://localhost:${HTTP_PORT}?ws_port=${WS_PORT}"

echo ""
echo "========================================"
echo "  All systems launched!"
echo "========================================"
echo ""
echo "  - Server: http://localhost:${HTTP_PORT}"
echo "  - MaxMSP: $PATCH_STATUS"
echo "  - Browser: Should open automatically"
echo ""
echo "  Press Ctrl+C to stop the server"
echo "========================================"
echo ""

# Keep terminal open and show server logs
wait "$SERVER_PID"
