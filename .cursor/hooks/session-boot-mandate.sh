#!/usr/bin/env bash
# Inject SESSION-BOOT-MANDATE on every Cursor sessionStart so agents cannot "forget."
set -euo pipefail
read -r _input || true
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FILE="$ROOT/docs/bus/SESSION-BOOT-MANDATE.md"
if [[ -f "$FILE" ]]; then
  BODY="$(head -n 40 "$FILE")"
else
  BODY="MISSING docs/bus/SESSION-BOOT-MANDATE.md — load CODER-INSTRUCTIONS-NOW.md TOP."
fi
MSG="SESSION BOOT MANDATE (autoload — do not skip):
${BODY}"
if command -v jq >/dev/null 2>&1; then
  jq -n --arg msg "$MSG" '{additional_context: $msg}'
else
  python3 -c 'import json,sys; print(json.dumps({"additional_context": sys.argv[1]}))' "$MSG"
fi
