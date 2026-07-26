#!/usr/bin/env bash
# Start the CruzWatch stack: mock dispatch (8001), detection backend (8000), dashboard (3000).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .logs

start() {  # name, dir, command
  local name=$1 dir=$2; shift 2
  if pgrep -f "$name" >/dev/null 2>&1; then echo "already running: $name"; return; fi
  ( cd "$dir" && setsid nohup "$@" > "../.logs/$name.log" 2>&1 & )
  echo "started $name -> .logs/$name.log"
}

start "mock_dispatch:app" backend python3 -m uvicorn mock_dispatch:app --port 8001
start "main:app"          backend python3 -m uvicorn main:app --port 8000
start "cruzwatch-web"     web     npm run dev -- --port 3000

echo
echo "dashboard      http://localhost:3000"
echo "backend api    http://localhost:8000/api/sites"
echo "mock dispatch  http://localhost:8001/dispatch  (SIMULATED)"
