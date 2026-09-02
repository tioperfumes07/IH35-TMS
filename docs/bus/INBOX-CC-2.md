# INBOX-CC-2 · LEAD TOP 2026-09-01 21:40 CT · GO-18 VERIFY

`git pull --ff-only origin main`

**Paste:** `docs/bus/PASTE-ALL-SEATS-GO-18-LOAD-COSTS-2026-09-01.md`

## VOID
- Re-diagnosing verify-static dead-port **without grepping #19428**. Unset DATABASE_URL + dead-port selftest already in `scripts/verify-static.mjs` on that merge.
- Inventing 24 guards. Crash class = **2**.
- Repair/zero escrow. `--watch`. `trigger_deploy`. Seat fixtures.

## NOW
1. After CC-1 escrow report: **verify-live only**.
2. Grep `#19428` / `verify-static.mjs` UNSET DATABASE_URL **before** any new static card.
3. Then GO-18: verify F+R load↔expense↔bill↔JE↔bank match after CC-1 schema. Empty TMS expected.

ACK `CC-2 | ACK | NOW=verify-live escrow AFTER CC-1 · grep #19428 BEFORE re-diagnose dead-port · THEN GO-18 F+R · NEVER repair/zero · NEVER --watch | GO`
