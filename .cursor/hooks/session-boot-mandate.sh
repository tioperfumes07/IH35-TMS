#!/usr/bin/env bash
# Inject GO-20 session boot on every Cursor sessionStart.
set -euo pipefail
read -r _input || true
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INBOX="$ROOT/docs/bus/INBOX-CURSOR.md"
if [[ -f "$INBOX" ]]; then
  BODY="$(head -n 25 "$INBOX")"
else
  BODY="MISSING docs/bus/INBOX-CURSOR.md — read .cursor/rules/00-IH35-LAW.mdc"
fi
MSG="GO-20 SESSION BOOT (autoload — do not skip):
Current law: .cursor/rules/00-IH35-LAW.mdc + 03-display-ids.mdc only.
Queue: docs/bus/INBOX-<SEAT>.md + GO-20-EIGHT-FEATURES.txt. Do NOT sweep GUARD-WORKORDERS.
${BODY}"
if command -v jq >/dev/null 2>&1; then
  jq -n --arg msg "$MSG" '{additional_context: $msg}'
else
  python3 -c 'import json,sys; print(json.dumps({"additional_context": sys.argv[1]}))' "$MSG"
fi
