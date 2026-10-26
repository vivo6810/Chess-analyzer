#!/usr/bin/env bash
set -euo pipefail

EXTERNAL_BASE="${1:-}"
PORT="${SMOKE_PORT:-3123}"
BASE="${EXTERNAL_BASE:-http://127.0.0.1:$PORT}"
TMP="$(mktemp -d)"
SERVER_PID=""

step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do kill_tree "$child"; done
  kill -TERM "$pid" 2>/dev/null || true
}

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill_tree "$SERVER_PID"
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

start_server() {
  local root i
  root="$(cd "$(dirname "$0")/.." && pwd)"
  (cd "$root" && exec npm run dev -- --hostname 127.0.0.1 --port "$PORT" >"$TMP/server.log" 2>&1) &
  SERVER_PID=$!
  for i in $(seq 1 90); do
    if curl -fsS "$BASE/" -o /dev/null; then return 0; fi
    sleep 1
  done
  printf 'The development server did not start. Log:\n'
  tail -30 "$TMP/server.log"
  return 1
}

check_route() {
  local path="$1" status
  status="$(curl -sS --max-time 30 -o "$TMP/response" -w '%{http_code}' "$BASE$path")"
  if [ "$status" != "200" ]; then
    printf 'FAIL %-42s got %s, wanted 200\n' "$path" "$status"
    return 1
  fi
  printf 'ok   %-42s %s\n' "$path" "$status"
}

if [ -z "$EXTERNAL_BASE" ]; then start_server; fi

step "Public website routes"
check_route /
check_route /play
check_route /analysis
check_route /profile

step "Chess.com proxy"
STATUS="$(curl -sS --max-time 30 -o "$TMP/chesscom" -w '%{http_code}' "$BASE/api/chesscom/hikaru" 2>/dev/null || true)"
case "$STATUS" in
  200|502) printf 'ok   %-42s %s\n' "/api/chesscom/hikaru" "$STATUS" ;;
  "") printf 'skip %-42s offline or request timed out\n' "/api/chesscom/hikaru" ;;
  *) printf 'FAIL %-42s got %s, wanted 200 or 502\n' "/api/chesscom/hikaru" "$STATUS"; exit 1 ;;
esac

step "Stockfish worker asset"
check_route /engine/stockfish-19-lite-single.js

printf '\nSmoke test passed.\n'
