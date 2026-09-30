# CC-1 lane cross: apps/backend/src/fuel/fuel-expense-document.service.ts (CC-3's lane) — AUTH-157

2026-09-30, CC-1.

## Why this crosses

`apps/backend/src/fuel/fuel-expense-document.service.ts` is CC-3's lane. This cross is to fix a
real code defect in it: `createExpenseFromFuelTransaction` reads
`fuel.fuel_transactions.driver_id`/`unit_id` into a local variable and uses them ONLY in an
audit-log payload — never writes them onto the `accounting.expenses` row it inserts — and never
selects `trailer_id` from the fuel row at all.

## Why CC-1, not CC-3

`docs/bus/NOW-CC-1.md`'s own standing entry, written before this session started work on it,
explicitly assigns the whole `verify-fuel-cost-posts-exactly-once.mjs` failure to CC-1:

> URGENT NEW — verify-fuel-cost-posts-exactly-once.mjs LIVE FAIL, severe, always-run, blocks every
> push (CC-1 money/GL lane, not touched -- too large/risky for me to attempt)

That note already ceded this exact area to CC-1. This defect is the direct root cause of that
same guard's check D failure (the "any field null" count went 7 -> 42 from two of CC-1's own
earlier backfill passes hitting this bug), so fixing it in the same file it was found is a
continuation of that already-assigned work, not a new incursion into CC-3's lane. CC-3 was
messaged directly for awareness alongside this PR.

## Scope

- `apps/backend/src/fuel/fuel-expense-document.service.ts` — add `trailer_id` to the fuel-row
  SELECT, write `driver_uuid`/`unit_id`/`trailer_id` onto the `accounting.expenses` INSERT. No
  other change to this file.

Nothing else in CC-3's lane is touched by this PR.

LANE_CROSS=docs/bus/2026-09-30-CC1-LANE-CROSS-FUEL-EXPENSE-LINKAGE-AUTH-157.md
