#!/usr/bin/env bash
# Link Desktop USMCA bus hotfiles → repo docs/bus/ (single channel).
# Safe to re-run. Backs up any non-symlink file once per run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOC="$ROOT/docs/bus"
BUS="${IH35_BUS_DESKTOP:-$HOME/Desktop/IH35-CURSOR-AUDIT/USMCA-WEEKEND-LEAD-2026-08-07}"

if [[ ! -d "$DOC" ]]; then
  echo "FAIL: missing $DOC" >&2
  exit 1
fi
if [[ ! -d "$BUS" ]]; then
  echo "WARN: Desktop bus folder missing: $BUS (repo docs/bus still canonical)" >&2
  exit 0
fi

HOT=(
  STATUS-NOW.md
  INBOX-SYNC-LAW.md
  00-CODER-START-HERE.md
  INBOX-CASCADE.md
  INBOX-CC-1.md
  INBOX-CC-2.md
  INBOX-CC-3.md
  INBOX-CODEX.md
  INBOX-CURSOR.md
  OUTBOX-CASCADE.md
  OUTBOX-CC-1.md
  OUTBOX-CC-2.md
  OUTBOX-CODEX.md
  OUTBOX-CURSOR.md
)

BACKUP="$BUS/.bus-pre-symlink-$(date -u +%Y%m%dT%H%MZ)"
mkdir -p "$BACKUP"
linked=0
for f in "${HOT[@]}"; do
  src="$DOC/$f"
  dst="$BUS/$f"
  [[ -f "$src" ]] || continue
  if [[ -L "$dst" ]]; then
    target="$(readlink "$dst")"
    if [[ "$target" == "$src" ]]; then
      continue
    fi
    rm -f "$dst"
  elif [[ -f "$dst" ]]; then
    cp "$dst" "$BACKUP/$f"
    rm -f "$dst"
  fi
  ln -s "$src" "$dst"
  linked=$((linked + 1))
  echo "symlink $dst -> $src"
done

# Point Desktop START HERE at single-channel law
cat > "$BUS/README-BUS-CHANNEL.md" <<EOF
# Bus channel (locked 2026-08-16)

Canonical = repo \`docs/bus/\`.  
These hotfiles are **symlinks**. Edit either path — same file.

Re-link after clone: \`bash scripts/ops/bus-symlink-desktop.sh\`
EOF

echo "OK: linked=$linked backup=$BACKUP"
echo "CANONICAL=$DOC"
