#!/usr/bin/env bash
# Session start — bind Rule 16: fix don't patch, evidence before done.
set -euo pipefail

read -r _input || true

MSG='RULE 16 (owner law): Fix root cause — never patch, never defer without written tracker+block id. Before "done": ROOT CAUSE + FIX + GUARD + LIVE PROOF (or UNVERIFIED). Load .claude/skills/ih35-evidence-before-done. Every bug fix needs scripts/verify-*.mjs in CI.'

if command -v jq >/dev/null 2>&1; then
  jq -n --arg msg "$MSG" '{additional_context: $msg}'
else
  printf '%s\n' "{\"additional_context\":$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$MSG")}"
fi
