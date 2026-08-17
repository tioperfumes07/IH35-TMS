#!/usr/bin/env bash
# Cursor lead: rewrite seat INBOXes after merges. Edit the heredocs or pass env NEXT_*.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOC="$ROOT/docs/bus"
CT=$(TZ=America/Chicago date +'%Y-%m-%d %H:%M CT')
NOW=$(date -u +%Y-%m-%dT%H:%MZ)
: "${CC1_CLAIM:=accounting:expenses-create-drawer}"
: "${CASCADE_CLAIM:=continuous-verify}"

cat > "$DOC/INBOX-CC-1.md" <<EOC
# INBOX-CC-1 · SYNC $CT · Cursor lead

**Banner:** Cursor re-syncs this after merges. CC-1 = OUTBOX only.

## CLAIM NOW
\`CC-1 | WORKING · LIVE CLAIM $CC1_CLAIM\`

Then: invoices-create-drawer · journal-entries-list-create-chrome · settlements:list-toolbar-create-chrome · factoring:home-surfaces

Method: FAST-MERGE-4MIN-LAW
Law: docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md · Live=BLOCKED until certified
EOC

cat > "$DOC/INBOX-CASCADE.md" <<EOC
# INBOX-CASCADE · SYNC $CT · Cursor lead

**Banner:** Cursor re-syncs this after merges. Cascade = OUTBOX only.

## NOW
1. \`Cascade | WORKING · LIVE CLAIM $CASCADE_CLAIM\`
2. FAST-MERGE green open PRs (admin)
3. LIVE VERIFY latest Codex/CC-1/Cursor ships
4. Never idle at 0 open PRs — VERIFY + re-poll

Method: FAST-MERGE-4MIN-LAW
Law: docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md · Live=BLOCKED until certified
EOC

printf '%s\n' "$NOW Cursor LEAD | bus-sync-inboxes · CC-1=$CC1_CLAIM · Cascade=$CASCADE_CLAIM" >> "$DOC/OUTBOX-CURSOR.md"
echo "Synced INBOX-CC-1 + INBOX-CASCADE @ $CT"
