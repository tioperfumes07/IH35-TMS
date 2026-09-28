# LANE_CROSS — CURSOR — ROUND 149 SEED + DISPATCH CATCH-UP — 2026-09-28

## Authorization

Owner ROUND 149 (verbatim): SEED 8/10→9/21 document expenses; re-point 326 NULL-item
expense lines; then Addendum C (Faro 094–104 + invoice latch, not settlement); then
Addendum A (16 dispatched loads 13624–13639). Seed is the deadline item.

Owner ROUND 148-00: seats fix their own blockers including guards outside their lane.
FAST MERGE is ON. VERIFY LIVE before executing any order.

## Files touched outside CURSOR's default lane map

1. `scripts/feed/r145-seed-document-expenses.mts` — R149 seed runner (UNASSIGNED path; owner-ordered).
2. `feed-input/**` — workbook + PDF control inputs for the 255/$12,764.27 document-expense seed
   (UNASSIGNED path; owner placed workbooks in checkout).
3. `docs/bus/OWNER-AUTHORIZATIONS.md` — AUTH-076 OPEN for the seed write (LEAD docs/bus; SHARED `docs/**`).
4. `docs/bus/00-CANONICAL-ITEM-AND-ACCOUNT-MAP.md` — item UUID table the seed resolves by id only.

## What is NOT claimed

- No Transportation / TRK writes.
- No Quick Pay posting (print only / Faro discount in 6400).
- No inventing loads 13627/13638 until createLoadWithFullSideEffects runs in Addendum A (after seed).
- No settlement close on the 8 completed-board loads (Addendum C: invoicing ≠ settlement).

## Gate

```
LANE_CROSS=docs/bus/09-28-2026-LEAD-RULING-CURSOR-R149-SEED-DISPATCH-LANE-CROSS.md
```

PR body must carry the same `LANE-CROSS:` line.
