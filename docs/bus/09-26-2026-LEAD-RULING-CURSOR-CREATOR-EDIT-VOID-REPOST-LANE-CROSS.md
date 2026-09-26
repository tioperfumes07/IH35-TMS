# LANE_CROSS — CURSOR — Settlement Creator Edit = void + repost — 2026-09-26

## Authorization

Owner, verbatim: "OK FINISH YOU PENDING WORK" after Creator invoice+Faro Post shipped (#22843).

ROUND 180 §14 (always on the Creator board): "Idempotent. Entering the same Settlement No. again
opens it for EDIT. Edit = void and repost. No duplicates." — was left open as "next slice" on
MEMORY_BANK / NOW-CURSOR after AlwaysTrack numbers + invoice/Faro.

## Files

1. `settlement-creator.service.ts` — `edit_void_repost` → voidPriorCreatorSettlementForEdit
2. `settlement-creator.routes.ts` / `.types.ts` — flag + 409 codes
3. `SettlementCreatorDrawer.tsx` + FE api — confirm then retry
4. `scripts/verify-settlement-creator-ties-document.mjs` — guard
5. `docs/MEMORY_BANK.md`

## Engines (no new GL math)

voidDocument (expense / invoice / factoring_advance) · reverseDriverAdvanceInClientTx ·
reverseSettlementForVoid · fuel.fuel_transactions void stamp

## Gate

```
LANE_CROSS=docs/bus/09-26-2026-LEAD-RULING-CURSOR-CREATOR-EDIT-VOID-REPOST-LANE-CROSS.md
```
