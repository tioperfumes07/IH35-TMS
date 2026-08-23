#!/usr/bin/env bash
# Keep Cursor lead on U14 certify → leftover. Idle is a defect.
set -euo pipefail
read -r _input || true
MSG='U14 CERTIFY LOOP: Do not stop. (1) curl https://api.ih35dispatch.com/api/v1/healthz/shallow (2) stamp at most one OPEN U14 module if OUTBOX CERTIFIED LIVE_SHA matches that curl (3) never recertify 1-6 11-13 lists legal-after-stamp (4) Codex customers then drivers then fleet reverse SQL/GET (5) leftover /425c unique 500/dead/silent (6) after all 14 CERTIFIED continue POST leftover table. FAST-MERGE. Never idle. Law: docs/bus/LOOP-U14-CERTIFY-THEN-LEFTOVER.md'
if command -v jq >/dev/null 2>&1; then
  jq -n --arg msg "$MSG" '{followup_message: $msg}'
else
  python3 -c 'import json,sys; print(json.dumps({"followup_message": sys.argv[1]}))' "$MSG"
fi
