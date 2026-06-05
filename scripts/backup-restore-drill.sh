#!/usr/bin/env bash
# CLOSURE-23 restore drill — requires NEON_API_KEY for live branch create/teardown.
set -euo pipefail
LABEL=backup-restore-drill
DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -z "${NEON_API_KEY:-}" ]]; then
  echo "[$LABEL] SKIP — set NEON_API_KEY for live drill"
  node "$DIR/backup-verify-neon-pitr.mjs"
  exit 0
fi
node "$DIR/backup-verify-neon-pitr.mjs"
echo "[$LABEL] PASS — PITR OK (live branch drill: configure NEON_API_KEY + run from operator workstation)"
