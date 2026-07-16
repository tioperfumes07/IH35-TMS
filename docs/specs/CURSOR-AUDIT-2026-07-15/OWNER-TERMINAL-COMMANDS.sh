#!/usr/bin/env bash
# Owner-run helpers when Cursor "Run" approval is broken.
# Usage (from repo root / this worktree):
#   bash docs/specs/CURSOR-AUDIT-2026-07-15/OWNER-TERMINAL-COMMANDS.sh health
#   bash docs/specs/CURSOR-AUDIT-2026-07-15/OWNER-TERMINAL-COMMANDS.sh push-425c
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"

cmd="${1:-help}"

case "$cmd" in
  health)
    curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow
    echo
    ;;
  main-tip)
    git fetch origin main
    git log -1 --oneline origin/main
    ;;
  push-wip-branch)
    # Pushes current branch as-is (after you commit). Does not merge.
    git push -u origin HEAD
    ;;
  help|*)
    cat <<'EOF'
Owner terminal commands (no Cursor Run card needed):

  health          — print live API version JSON
  main-tip        — show origin/main tip
  push-wip-branch — git push -u origin HEAD (commit first)

After health shows a SHA other than fab6c27:
  1) Render → Manual Restart (if you changed Relay env)
  2) App → Transportation → Fuel → API backfill
  3) Paste health JSON + Neon row count ask back to Cursor
EOF
    ;;
esac
