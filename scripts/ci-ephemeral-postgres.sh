#!/bin/bash
# Provision an EPHEMERAL Postgres for a CI job on a self-hosted runner.
#
# WHY THIS EXISTS. build-typecheck declared `services: postgres`, and GitHub service containers only
# work on Linux runners — they are unsupported on macOS. That single dependency pinned the repo's most
# load-bearing required check to hosted capacity, and when hosted capacity stopped serving this repo
# on 2026-08-06 no money PR could be verified or merged for hours. This provisions the same database
# the service container did, using the runner host's own Postgres binaries, so the check can run
# anywhere.
#
# Contract — identical to the service container it replaces, so DATABASE_URL is unchanged:
#     host localhost   port 54329   user verify   password (trust)   database ih35_verify
#
# EPHEMERAL IS LOAD-BEARING, NOT A CONVENIENCE. The cluster is created fresh in a temp dir and
# destroyed on stop. It never touches an existing cluster and never listens outside localhost, so a CI
# job cannot reach — or corrupt — a developer database on the same machine. This matters more on a
# self-hosted runner than it ever did in a container: here, the host is somebody's actual computer.
#
# Usage:  ci-ephemeral-postgres.sh start | stop
set -euo pipefail

PGPORT=54329
PGUSER_NAME=verify
PGDB=ih35_verify
STATE_DIR="${TMPDIR:-/tmp}/ih35-ci-pg"
DATA_DIR="$STATE_DIR/data"

find_pgbin() {
  # Prefer an explicit override, then Homebrew, then Postgres.app. `postgres` (the server) is the
  # binary that matters — libpq-only installs ship psql without a server and would fail confusingly.
  local candidates=(
    "${PG_BIN_DIR:-}"
    "$(brew --prefix postgresql@16 2>/dev/null)/bin"
    "$(brew --prefix postgresql 2>/dev/null)/bin"
    "/Applications/Postgres.app/Contents/Versions/16/bin"
    "/Applications/Postgres.app/Contents/Versions/latest/bin"
    "/usr/lib/postgresql/16/bin"
    "/usr/pgsql-16/bin"
  )
  for d in "${candidates[@]}"; do
    [ -n "$d" ] && [ -x "$d/postgres" ] && [ -x "$d/initdb" ] && [ -x "$d/pg_ctl" ] && { echo "$d"; return 0; }
  done
  # last resort: whatever is on PATH, but only if it includes a real server
  if command -v postgres >/dev/null 2>&1 && command -v initdb >/dev/null 2>&1; then
    dirname "$(command -v initdb)"; return 0
  fi
  return 1
}

case "${1:-}" in
  start)
    PGBIN="$(find_pgbin)" || {
      echo "ci-ephemeral-postgres: no Postgres SERVER toolchain found (need postgres+initdb+pg_ctl)." >&2
      echo "  Install: brew install postgresql@16   — or set PG_BIN_DIR to a directory containing them." >&2
      exit 1
    }
    echo "ci-ephemeral-postgres: using $PGBIN"
    rm -rf "$STATE_DIR"
    mkdir -p "$DATA_DIR"
    "$PGBIN/initdb" -D "$DATA_DIR" -U "$PGUSER_NAME" -A trust --no-sync -E UTF8 >/dev/null
    # listen_addresses=localhost ONLY — never expose a CI database on the host's network.
    "$PGBIN/pg_ctl" -D "$DATA_DIR" -w -l "$STATE_DIR/server.log" \
      -o "-p $PGPORT -k $STATE_DIR -c listen_addresses=localhost -c fsync=off -c full_page_writes=off" \
      start >/dev/null
    "$PGBIN/createdb" -h localhost -p "$PGPORT" -U "$PGUSER_NAME" "$PGDB"
    # Prove it actually answers on the contract the workflow's DATABASE_URL uses — a started cluster
    # that refuses the expected database is the failure this whole script exists to avoid.
    "$PGBIN/psql" -h localhost -p "$PGPORT" -U "$PGUSER_NAME" -d "$PGDB" -tAc "select 'ready'" \
      | grep -qx ready
    echo "ci-ephemeral-postgres: ready on localhost:$PGPORT/$PGDB as $PGUSER_NAME"
    ;;
  stop)
    PGBIN="$(find_pgbin)" || exit 0
    if [ -d "$DATA_DIR" ]; then
      "$PGBIN/pg_ctl" -D "$DATA_DIR" -w -m immediate stop >/dev/null 2>&1 || true
    fi
    rm -rf "$STATE_DIR"
    echo "ci-ephemeral-postgres: stopped and data dir removed"
    ;;
  *)
    echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
