# LANE_CROSS — DEVIN-A — FEED WRITER LINKAGE AT CREATION (Round 143.3)

**Date:** 2026-09-24 03:35Z
**Ruling seat:** DEVIN-A
**Owning seat:** CC-1 (feed engine), CURSOR (feed writer)
**Files touched:**
- `apps/backend/src/fuel/fuel-expense-document.service.ts` (CC-1 lane)
- `apps/backend/src/feed/seed-settlement-document.service.ts` (CC-1/CURSOR lane)

## Reason

Round 143.3 (owner ruling 2026-09-24 02:44Z) identified four linkage defects in the feed writer:
1. `trailer_id` NULL on 112/112 expenses and 60/60 fuel transactions
2. 10 expenses + 10 fuel transactions carry no driver/unit
3. 0/112 expenses carry `source_fuel_transaction_id`
4. 0/31 loads carry `factoring_company_vendor_id`

The instruction is "Fix the writer — do not queue a backfill." DEVIN-A is feeder #2 (09/06–09/21) and must ensure every new row it writes carries full linkage from row one. The fix lives in CC-1's lane files, so this is a LANE_CROSS.

## Changes

1. `fuel-expense-document.service.ts`: Added `trailer_id` to `FuelRow` type, SELECT, and INSERT. The expense now carries `trailer_id`, `driver_uuid` (from `driver_id`), and `unit_id` from its fuel transaction at creation.

2. `seed-settlement-document.service.ts`:
   - `seedLoad`: Stamps `factoring_company_vendor_id = Faro Factoring (a1f4c2b6...)` on every load at creation (all 89 are Faro purchases).
   - `seedFuel`: Accepts and writes `driver_id`, `unit_id`, `trailer_id` on every fuel transaction.
   - `seedExpense`: Carries `trailer_id` and `unit_id` from the load at creation (driver_uuid was already there via JOIN).
   - Call site: Resolves the load's driver/unit/trailer after `seedLoad` and passes them to `seedFuel`.

## Verification

- `npx tsc --noEmit -p apps/backend/tsconfig.json` — PASS (exit 0, no errors).
- No new GL math. No new posting paths. Only linkage columns added to existing INSERTs.
