# LANE_CROSS — CURSOR — ROUND 207 BANK MATCH DATE CASCADE — 2026-09-26

## Authorization

Owner ROUND 207 (Claude-Lead handoff 2026-09-25 ~9:45 PM CT), verbatim:

> "TRY 3 DAYS, AND 90 DAYS I THINK IS TOO MUCH, I THINK IT SHOULD BE 3 DAYS, 7 DAYS,
> AND IF WE NEED MORE DAYS, WE THEN CHANGE THE DATES TO FROM, ETC."

Project doc: `claude/09-23-2026-OWNER-DECISION-BANK-MATCH-WINDOW-DATE-CASCADE.md` (LOCKED).
Build assigned to **CURSOR** in the ROUND 207 packet: one PR, hooks on, normal push.

## Files touched outside CURSOR's default lane map

1. `apps/backend/src/accounting/bank-recon/match.service.ts` — CC-1 filename; MATCH_WINDOW_STEPS + cascade
2. `apps/backend/src/accounting/bank-recon/__tests__/match-*.ts` — CC-1 tests (cascade + caller unwrap)
3. `apps/backend/src/banking/p7-wave2.routes.ts` — CC-2 filename; window_step; drop search_all→365
4. `scripts/verify-banking-match-qbo-engine.mjs` — CC-1 guard re-pin (same file, not a new orphan)

FE MatchDrawer / DesignView / banking API are in CURSOR's normal surface.

## What is NOT claimed

- Two-surface amount gate / Loves collapse / materiality thresholds (owner has NOT ruled)
- No writes to `banking.bank_transactions`, no QBO write-back, no USMCA fixtures

## Gate wire

```
LANE_CROSS=docs/bus/09-26-2026-LEAD-RULING-CURSOR-R207-BANK-MATCH-DATE-CASCADE-LANE-CROSS.md
```
