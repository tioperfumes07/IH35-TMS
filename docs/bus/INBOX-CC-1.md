# INBOX-CC-1 · SYNC 2026-08-16 20:55 CT · NO-STALL FULL QUEUE

Chrome **9222** · USMCA · **READ STANDING QUEUE:** `docs/bus/CONTINUOUS-LIVE-NO-STALL.md` §3

## FORBIDDEN
`awaiting next FO` · standing by · empty OUTBOX next · finishing a wave without claiming the next.

## START NOW → WAVE A1 (accounting Box4 0%)
Claim: `LIVE CLAIM accounting · Wave A1`
Leaves: `home` · `bills.list` · `bills.detail` · `expenses.list` · `expenses.detail` · `bill_payments.list` · `invoices.list` · `chrome.toolbar_search` · `chrome.toolbar_range` · `chrome.toolbar_gear` · `chrome.toolbar_filter`
Then: APPEND `PROD-VERIFIED` + Leaves backticks + `audit-coverage-scoreboard --write` + FAST-MERGE
OUTBOX next line **must** claim **Wave A2** (or B1 only after A1+ merged and A-chain progressing).

## AUTO-CHAIN (do not wait for lead)
`A1→A2→A3→A4` (accounting 84) → `B1→B2→B3` (banking 33) → `C1→C2→C3` (factoring 29) → `D1→D2` (settlements 22) → re-measure matrix → unpaid money leaves → FO interrupts from board (`LV-INVENTORY-PARTS-DEACTIVATED-VENDOR-HISTORICAL-LABEL` between waves OK).

Full leaf tables + Neon uuids + keyword rules: **CONTINUOUS-LIVE-NO-STALL.md**.
FE FAIL → HANDOFF=Cursor + continue next leaf same turn.
Flags OFF until owner says turn on. No invented GL.

0 PRs while leaves remain = defect.
