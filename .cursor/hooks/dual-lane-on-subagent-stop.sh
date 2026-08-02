#!/usr/bin/env bash
# Injects coordinator follow-up when any subagent stops — keeps dual lanes moving.
# Primary dispatch source (2026-08-02): docs/audit/GUARD-WORKORDERS.md (GUARD fix board).
set -euo pipefail

read -r _input || true

MSG='DUAL-LANE HOOK: Subagent finished. Before any user-facing reply: (1) git fetch both IH35 worktrees; (2) STATUS both lanes with Live ETA; (3) for each lane without a running worker and without PR CI wait — dispatch/resume the TOP OPEN item in that coder'\''s lane from docs/audit/GUARD-WORKORDERS.md (Claude Coder = financial/migrations/posting/GL; Cursor = frontend/UI/measurability/docs/non-financial backend). Do not idle while OPEN items remain in your lane. Fall back to /Users/jorgemunoz/Downloads/abb/00-TIER-2-3-DISPATCH-INDEX.txt only when GUARD-WORKORDERS has no OPEN item for that lane; (4) never end with both lanes idle if the GUARD board or abb queue has work. Skip ON HOLD: A23-11, A23-14, B19, B20.'

if command -v jq >/dev/null 2>&1; then
  jq -n --arg msg "$MSG" '{followup_message: $msg}'
else
  printf '%s\n' "{\"followup_message\":$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$MSG")}"
fi
