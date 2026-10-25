#!/usr/bin/env bash
# End-to-end smoke test.
#
# Exercises the paths two players actually take now: register, challenge, play
# a game to checkmate, export it as PGN, import that exact PGN (and watch the
# dedupe skip it), filter a history page — and checks that the retired
# administration endpoints are really gone.
#
#   ./scripts/smoke-test.sh              # own server, throwaway database
#   ./scripts/smoke-test.sh <base-url>   # a server you already have running
#
# The default matters. These checks create accounts, and an earlier version ran
# them against the development database. By default the script starts its own
# dev server on SMOKE_PORT with DATABASE_PATH inside a mktemp directory, and
# deletes the lot on exit. Two dev servers cannot share the `.next` directory,
# so stop your own server before running this — the script prints its server's
# log if it fails to come up.

set -uo pipefail

EXTERNAL_BASE="${1:-}"
PORT="${SMOKE_PORT:-3123}"
BASE="${EXTERNAL_BASE:-http://127.0.0.1:$PORT}"
SERVER_PID=""
JAR_A="$(mktemp)"
JAR_B="$(mktemp)"
TMP="$(mktemp -d)"
STAMP="$(date +%s)"
PLAYER_A="smokea${STAMP}"
PLAYER_B="smokeb${STAMP}"
PASS="correct-horse-battery"
FAILED=0

# `next dev` starts the actual server in a grandchild, so killing the PID we
# spawned leaves it holding the port. Walk the tree instead.
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    kill_tree "$child"
  done
  kill -TERM "$pid" 2>/dev/null
}

cleanup() {
  rm -f "$JAR_A" "$JAR_B"
  if [ -n "$SERVER_PID" ]; then
    kill_tree "$SERVER_PID"
    wait "$SERVER_PID" 2>/dev/null
    # Turbopack's inner server is a grandchild the TERM can leave behind;
    # a listening port survives otherwise and poisons the next run.
    local port_pid
    port_pid="$(ss -ltnp "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
    if [ -n "$port_pid" ]; then
      kill -TERM "$port_pid" 2>/dev/null
      sleep 1
      kill -9 "$port_pid" 2>/dev/null
    fi
  fi
  rm -rf "$TMP"
  # Only reachable when pointed at someone else's server. Our own database is
  # inside $TMP and has just been deleted with it.
  [ -n "$EXTERNAL_BASE" ] && purge
}

# The checks run against a real server, so they leave real rows behind. This
# deletes exactly the accounts the run created; their games and challenges
# follow by foreign key.
purge() {
  local root db
  root="$(cd "$(dirname "$0")/.." && pwd)"
  db="${DATABASE_PATH:-$root/data/arbiter.db}"
  node "$root/scripts/purge-smoke.mjs" "$db" "$PLAYER_A" "$PLAYER_B"
}

start_server() {
  local root
  root="$(cd "$(dirname "$0")/.." && pwd)"
  printf '\n\033[1mStarting a disposable server on port %s\033[0m\n' "$PORT"
  ( cd "$root" && exec env DATABASE_PATH="$TMP/arbiter.db" NEXT_TELEMETRY_DISABLED=1 \
      npx next dev -H 127.0.0.1 -p "$PORT" > "$TMP/server.log" 2>&1 ) &
  SERVER_PID=$!

  local i
  for i in $(seq 1 60); do
    if curl -s -o /dev/null "$BASE/"; then return 0; fi
    sleep 1
  done

  printf 'The server did not answer after 60s. Its log:\n'
  tail -20 "$TMP/server.log"
  exit 1
}

step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
check() {
  if [ "$2" = "$3" ]; then
    printf '  ok    %-40s %s\n' "$1" "$2"
  else
    printf '  FAIL  %-40s got %s, wanted %s\n' "$1" "$2" "$3"
    FAILED=1
  fi
}

# A first hit on a not-yet-compiled route can be cut mid-compile by the dev
# server; retrying the *connection* is safe (a connection that failed was
# never delivered), while real statuses fail fast as before.
code() { curl -s --retry 3 --retry-all-errors -o "$2" -w '%{http_code}' "${@:3}"; }
register() {
  code "$BASE" "$2" -c "$3" -X POST "$BASE/api/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"$PASS\"}"
}

[ -z "$EXTERNAL_BASE" ] && start_server

step "Register two players"
STATUS=$(register "$PLAYER_A" "$TMP/a.json" "$JAR_A")
check "POST /api/auth/register (A)" "$STATUS" "200"
STATUS=$(register "$PLAYER_B" "$TMP/b.json" "$JAR_B")
check "POST /api/auth/register (B)" "$STATUS" "200"

step "The retired administration surface is gone"
STATUS=$(code "$BASE" "$TMP/admin.json" -b "$JAR_A" -X POST "$BASE/api/tournaments" \
  -H 'Content-Type: application/json' -d '{"name":"x","format":"swiss","timeControl":"3+0","players":["a","b"]}')
check "POST /api/tournaments is gone" "$STATUS" "404"
STATUS=$(code "$BASE" "$TMP/lab.html" "$BASE/lab")
check "GET /lab is gone" "$STATUS" "404"
STATUS=$(code "$BASE" "$TMP/owner.html" "$BASE/owner")
check "GET /owner is gone" "$STATUS" "404"
STATUS=$(code "$BASE" "$TMP/newhost.html" "$BASE/tournaments/new")
check "GET /tournaments/new is gone" "$STATUS" "404"

step "A challenge must name an existing player"
STATUS=$(code "$BASE" "$TMP/noone.json" -b "$JAR_A" -X POST "$BASE/api/challenges" \
  -H 'Content-Type: application/json' \
  -d '{"opponent":"nobody-here","timeControl":"3+2"}')
check "challenge to a missing player" "$STATUS" "400"
STATUS=$(code "$BASE" "$TMP/self.json" -b "$JAR_A" -X POST "$BASE/api/challenges" \
  -H 'Content-Type: application/json' \
  -d "{\"opponent\":\"$PLAYER_A\",\"timeControl\":\"3+2\"}")
check "challenge to yourself" "$STATUS" "400"

step "Anonymous challenges are rejected"
STATUS=$(code "$BASE" "$TMP/anon.json" -X POST "$BASE/api/challenges" \
  -H 'Content-Type: application/json' \
  -d "{\"opponent\":\"$PLAYER_B\",\"timeControl\":\"3+2\"}")
check "anonymous challenge" "$STATUS" "401"

step "A challenges B to a 3+2 game"
STATUS=$(code "$BASE" "$TMP/challenge.json" -b "$JAR_A" -X POST "$BASE/api/challenges" \
  -H 'Content-Type: application/json' \
  -d "{\"opponent\":\"$PLAYER_B\",\"timeControl\":\"3+2\"}")
check "POST /api/challenges" "$STATUS" "201"
CID=$(node -e "process.stdout.write(String(require('$TMP/challenge.json').challenge.id))")

STATUS=$(code "$BASE" "$TMP/again.json" -b "$JAR_A" -X POST "$BASE/api/challenges" \
  -H 'Content-Type: application/json' \
  -d "{\"opponent\":\"$PLAYER_B\",\"timeControl\":\"3+2\"}")
check "a standing duplicate is refused" "$STATUS" "400"

STATUS=$(code "$BASE" "$TMP/wrong.json" -b "$JAR_A" -X POST "$BASE/api/challenges/$CID" \
  -H 'Content-Type: application/json' -d '{"action":"accept"}')
check "the challenger cannot accept their own offer" "$STATUS" "400"

step "B accepts and the board exists"
STATUS=$(code "$BASE" "$TMP/accept.json" -b "$JAR_B" -X POST "$BASE/api/challenges/$CID" \
  -H 'Content-Type: application/json' -d '{"action":"accept"}')
check "POST .../accept" "$STATUS" "200"
GID=$(node -e "process.stdout.write(String(require('$TMP/accept.json').gameId))")

step "The board is live and the seats are held"
code "$BASE" "$TMP/state.json" -b "$JAR_A" "$BASE/api/games/$GID" > /dev/null
SEATED_A=$(node -e "process.stdout.write(String(require('$TMP/state.json').seats.seated))")
check "one of the players is seated" "$SEATED_A" "true"
code "$BASE" "$TMP/stateb.json" -b "$JAR_B" "$BASE/api/games/$GID" > /dev/null
SEATED_B=$(node -e "process.stdout.write(String(require('$TMP/stateb.json').seats.seated))")
check "the other is seated too" "$SEATED_B" "true"

# The pairing picks the colours; the script obeys, or every white move is a
# 403 about playing someone else's side.
if POSIXSEAT=$(node -e "const d=require('$TMP/state.json'); process.stdout.write(String(d.seats.isWhite))"); [ "$POSIXSEAT" = "true" ]; then
  WJAR="$JAR_A"; BJAR="$JAR_B"
else
  WJAR="$JAR_B"; BJAR="$JAR_A"
fi

step "Fool's mate ends the game as checkmate"
for MV in "f2 f3 $WJAR" "e7 e5 $BJAR" "g2 g4 $WJAR" "d8 h4 $BJAR"; do
  set -- $MV
  STATUS=$(code "$BASE" "$TMP/mv.json" -b "$3" -X POST "$BASE/api/games/$GID/move" \
    -H 'Content-Type: application/json' -d "{\"from\":\"$1\",\"to\":\"$2\"}")
  check "move $1$2" "$STATUS" "200"
done
MOVER=$(node -e "process.stdout.write(require('$TMP/mv.json').over.termination)")
check "mate is classified as checkmate" "$MOVER" "checkmate"

code "$BASE" "$TMP/fen.json" "$BASE/api/games/$GID" > /dev/null
GRESULT=$(node -e "process.stdout.write(require('$TMP/fen.json').game.status)")
check "the game is finished" "$GRESULT" "finished"

step "The finished game exports as PGN"
STATUS=$(code "$BASE" "$TMP/export.pgn" "$BASE/api/games/$GID/pgn")
check "GET .../pgn" "$STATUS" "200"
grep -q '^\[Event ' "$TMP/export.pgn" && PGN_OK="1" || PGN_OK="0"
check "the PGN carries headers" "$PGN_OK" "1"
grep -q 'd8h4' "$TMP/export.pgn" || grep -q 'Qh4' "$TMP/export.pgn"
# The last move must be in there one way or another:
grep -q 'h4' "$TMP/export.pgn" && PGN_LAST="1" || PGN_LAST="0"
check "the PGN carries the last move" "$PGN_LAST" "1"

step "The analysis page answers"
STATUS=$(code "$BASE" "$TMP/analysis.html" "$BASE/games/$GID/analysis")
check "GET /games/:id/analysis" "$STATUS" "200"
grep -q 'Export PGN' "$TMP/analysis.html" && A_OK="1" || A_OK="0"
check "the analysis page renders the board" "$A_OK" "1"

step "The signed-in player's challenge list answers"
STATUS=$(code "$BASE" "$TMP/notyet.html" "$BASE/api/challenges" -b "$JAR_A")
check "GET /api/challenges (session)" "$STATUS" "200"

step "Import: the same game is skipped, a new one lands"
cat > "$TMP/two.pgn" <<PGN_EOF
[Event "Smoke import"]
[White "$PLAYER_A"]
[Black "$PLAYER_B"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 1-0

[Event "Smoke import two"]
[White "$PLAYER_B"]
[Black "$PLAYER_A"]
[Result "1/2-1/2"]

1. d4 d5 2. c4 c6 1/2-1/2
PGN_EOF

IMPORT_BODY=$(node -e 'process.stdout.write(JSON.stringify({ pgn: require("fs").readFileSync(process.argv[1], "utf8") }));' "$TMP/two.pgn")
STATUS=$(code "$BASE" "$TMP/import.json" -b "$JAR_A" -X POST "$BASE/api/import" \
  -H 'Content-Type: application/json' -d "$IMPORT_BODY")
check "POST /api/import" "$STATUS" "201"
IMPORTED=$(node -e "process.stdout.write(String(require('$TMP/import.json').imported.length))")
check "two imported games" "$IMPORTED" "2"

STATUS=$(code "$BASE" "$TMP/reimport.json" -b "$JAR_A" -X POST "$BASE/api/import" \
  -H 'Content-Type: application/json' -d "$IMPORT_BODY")
SKIPPED=$(node -e "process.stdout.write(String(require('$TMP/reimport.json').skipped))")
check "re-import is skipped in full" "$SKIPPED" "2"

step "Bad PGN is refused with a reason"
STATUS=$(code "$BASE" "$TMP/bad.json" -b "$JAR_A" -X POST "$BASE/api/import" \
  -H 'Content-Type: application/json' -d '{"pgn":"1. e4 e5 2. Ke3 1-0"}')
check "illegal move refused" "$STATUS" "400"
grep -q 'Move 3' "$TMP/bad.json" && BAD_OK="1" || BAD_OK="0"
check "the error names the move" "$BAD_OK" "1"

step "Anonymous import is rejected"
STATUS=$(code "$BASE" "$TMP/anonimp.json" -X POST "$BASE/api/import" \
  -H 'Content-Type: application/json' -d '{"pgn":"1. e4 e5 2. Nc6 1-0"}')
check "anonymous import" "$STATUS" "401"

step "Imported games show up atuned to profiles"
STATUS=$(code "$BASE" "$TMP/profile.html" "$BASE/players/$PLAYER_A")
check "GET /players/:username" "$STATUS" "200"
STATUS=$(code "$BASE" "$TMP/history.html" "$BASE/players/$PLAYER_A/games?result=w")
check "GET /players/:username/games?result=w" "$STATUS" "200"
STATUS=$(code "$BASE" "$TMP/nobody.html" "$BASE/players/definitely-not-here")
check "an unknown profile is a 404" "$STATUS" "404"

printf '\n'
if [ "$FAILED" -eq 0 ]; then
  printf '\033[32mAll smoke checks passed.\033[0m\n'
else
  printf '\033[31mSome smoke checks failed.\033[0m\n'
fi
exit "$FAILED"
