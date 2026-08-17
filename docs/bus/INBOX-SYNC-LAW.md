# INBOX SYNC LAW · SINGLE CHANNEL + CURSOR SYNC DUTY (2026-08-16)

## Canonical
Repo **`docs/bus/`** · Desktop USMCA hotfiles = **symlinks** (`scripts/ops/bus-symlink-desktop.sh`).

## Cursor lead duty (HARD — owner 2026-08-16)
**After every merge** (and whenever a seat OUTBOX says `awaiting next FO` / idle):
1. Re-write **`docs/bus/INBOX-CC-1.md`** with the next money LIVE CLAIM(s)
2. Re-write **`docs/bus/INBOX-CASCADE.md`** with next VERIFY / FAST-MERGE orders
3. Re-write **`INBOX-CODEX.md`** when their partition needs a bump
4. Update **`STATUS-NOW.md`**
5. Seats **do not** write their own INBOX — only OUTBOX (one line)

CC-1/Cascade/Codex: read Desktop INBOX (= this file) · `git pull` · work · OUTBOX only.

## Seat loop
`git pull` → STATUS → your INBOX → work → one OUTBOX line → push · never wait Jorge.

## OUTBOX
Append-only · one line · prefix `SEAT | …`
