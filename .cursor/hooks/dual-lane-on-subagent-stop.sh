#!/usr/bin/env bash
# Injects coordinator follow-up when any subagent stops — keeps dual lanes moving.
set -euo pipefail

read -r _input || true

MSG='DUAL-LANE HOOK: Subagent finished. Before any user-facing reply: (1) git fetch both IH35 worktrees; (2) STATUS both lanes with Live ETA; (3) for each lane without a running worker and without PR CI wait — dispatch/resume the NEXT block from /Users/jorgemunoz/Downloads/abb/00-TIER-2-3-DISPATCH-INDEX.txt (Lane A=IH35-TMS, Lane B=IH35-TMS-agent2); (4) never end with both lanes idle if abb queue has work. Skip ON HOLD: A23-11, A23-14, B19, B20.'

if command -v jq >/dev/null 2>&1; then
  jq -n --arg msg "$MSG" '{followup_message: $msg}'
else
  printf '%s\n' "{\"followup_message\":$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$MSG")}"
fi
