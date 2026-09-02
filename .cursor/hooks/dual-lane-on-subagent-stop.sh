#!/usr/bin/env bash
# GO-20 follow-up when any subagent stops — queue is INBOX, not GUARD sweep.
set -euo pipefail

read -r _input || true

MSG='GO-20 HOOK: Subagent finished. Before any user-facing reply: (1) git pull --ff-only origin main; (2) read docs/bus/INBOX-<SEAT>.md TOP + docs/lockdown/GO-20-EIGHT-FEATURES.txt; (3) Cursor lead coordinates from docs/bus/INBOX-CURSOR.md — do NOT sweep docs/audit/GUARD-WORKORDERS.md or Downloads/abb; (4) continue next INBOX item or seat coordination. USMCA only. Never POST Book Load.'

if command -v jq >/dev/null 2>&1; then
  jq -n --arg msg "$MSG" '{followup_message: $msg}'
else
  printf '%s\n' "{\"followup_message\":$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$MSG")}"
fi
