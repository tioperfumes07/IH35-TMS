# INBOX SYNC LAW · SINGLE CHANNEL + CURSOR SYNC DUTY (2026-08-16)

## Canonical
Repo **`docs/bus/`** · Desktop USMCA hotfiles = **symlinks** (`scripts/ops/bus-symlink-desktop.sh`).

**Seat-to-seat + stale INBOX:** `docs/bus/SEAT-COMMS-LAW.md` — ping Cursor OUTBOX **and the target seat OUTBOX** (picker FAIL → `OUTBOX-CC-2.md`; money FAIL → `OUTBOX-CC-1.md`). Chat-only starves CC-2. Do not wait for Jorge.

## Cursor lead duty (HARD — owner 2026-08-16)
**After every merge** (and whenever a seat OUTBOX says `awaiting next FO` / idle):
1. Re-write **`docs/bus/INBOX-CC-1.md`** with the next money LIVE CLAIM(s)
2. Re-write **`docs/bus/INBOX-CASCADE.md`** with next VERIFY / FAST-MERGE orders
3. Re-write **`INBOX-CODEX.md`** when their partition needs a bump
4. Update **`STATUS-NOW.md`**
5. Seats **do not** write their own INBOX — only OUTBOX (one line)

CC-1/Cascade/Codex: read Desktop INBOX (= this file) · `git pull` · work · OUTBOX only.

## Seat loop
`git pull` → STATUS → your INBOX → **`docs/bus/CONTINUOUS-LIVE-NO-STALL.md`** → work → one OUTBOX line → push · never wait Jorge.

## NO-STALL (HARD — owner 2026-08-16)
- **`NEXT=awaiting next FO` is FORBIDDEN.** Standing queue = CONTINUOUS-LIVE-NO-STALL.md wave tables.
- OUTBOX LIVE PASS without same-turn ledger `PROD-VERIFIED` + Leaves = incomplete (Box 4 will not move).
- Finishing a Wave without claiming the next Wave in OUTBOX = defect.
- Lead must rewrite INBOX the same turn a seat goes idle — seats must not wait for that rewrite if the standing queue already names the next Wave.

## OUTBOX
Append-only · one line · prefix `SEAT | …`

## HARD — never wipe OUTBOX (2026-08-16 lead defect)
`docs/bus/OUTBOX-*.md` are **append-only working files**. Lead/Cursor must **NEVER**:
- `git checkout -- docs/bus/OUTBOX-*`
- `git restore docs/bus/OUTBOX-*`
- `git reset --hard` while OUTBOX has unpushed seat lines

Doing so destroyed Cascade VERIFY-BATCH evidence and caused false idle. Prefer `git update-index --skip-worktree docs/bus/OUTBOX-*.md` in the lead worktree. Seats: append + push OUTBOX in their own bus PR when needed; lead only **appends** lead lines.
