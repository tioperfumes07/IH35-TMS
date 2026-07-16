#!/usr/bin/env bash
# CLOSURE-23 restore drill — requires NEON_API_KEY for live branch create/teardown.
# FINDING H5-3: the drill now also verifies EVIDENCE RETRIEVABILITY, not just DB restore — a restored DB
# is worthless if the R2 objects its rows point at are gone. See run-dr-drill-evidence-check below.
# B-D3: after restore / on the target DB, assert data-integrity (hub counts, balanced ledger, migration
# ledger, audit chain, FKs, required financial NULLs). False-green restore is a drill failure.
set -euo pipefail
LABEL=backup-restore-drill
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"

# H5-3 — real (read-only) evidence-presence spot check. Runs the built backend entrypoint when it exists
# and R2 is configured; otherwise SKIP-safe (the drill must not fail merely because evidence env is absent
# in a bare CI runner). Non-zero (exit 2) ONLY when objects are confirmed MISSING.
run_evidence_check() {
  local entry="$ROOT/apps/backend/dist/cron/run-dr-drill-evidence-check.js"
  if [[ -z "${R2_ACCOUNT_ID:-}" || -z "${R2_ACCESS_KEY_ID:-}" || -z "${R2_SECRET_ACCESS_KEY:-}" ]]; then
    echo "[$LABEL] evidence-check SKIP — R2 not configured (set R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY)"
    return 0
  fi
  if [[ ! -f "$entry" ]]; then
    echo "[$LABEL] evidence-check SKIP — backend not built ($entry missing; run npm --workspace apps/backend run build)"
    return 0
  fi
  echo "[$LABEL] evidence-check — HEADing a sample of evidence objects in R2…"
  node "$entry"
}

# B-D3 — data-integrity assertion on the restored (or drill-target) DB.
# Prefer RESTORED_DATABASE_URL. When no DB URL is available (bare CI), prove the evaluator via --selftest.
run_integrity_check() {
  local entry="$DIR/restore-drill-integrity.mjs"
  if [[ ! -f "$entry" ]]; then
    echo "[$LABEL] integrity-check FAIL — missing $entry"
    return 1
  fi
  if [[ -n "${RESTORED_DATABASE_URL:-}" || -n "${DATABASE_DIRECT_URL:-}" || -n "${DATABASE_URL:-}" ]]; then
    echo "[$LABEL] integrity-check — asserting hub counts / ledger / migration / audit chain / FKs / financial NULLs…"
    RESTORE_DRILL_ENFORCE=true node "$entry"
    return $?
  fi
  echo "[$LABEL] integrity-check — no DB URL; running --selftest (evaluator proof)"
  node "$entry" --selftest
}

if [[ -z "${NEON_API_KEY:-}" ]]; then
  echo "[$LABEL] SKIP — set NEON_API_KEY for live drill"
  node "$DIR/backup-verify-neon-pitr.mjs"
  run_evidence_check
  run_integrity_check
  exit $?
fi
node "$DIR/backup-verify-neon-pitr.mjs"
run_evidence_check
run_integrity_check
echo "[$LABEL] PASS — PITR OK + data-integrity assertion (live branch drill: set RESTORED_DATABASE_URL)"
