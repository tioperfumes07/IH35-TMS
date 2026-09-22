# Lead ruling — CC-3 lane cross, P0-A IFTA DEF/reefer exclusion

**Date:** 2026-09-22
**Seat:** CC-3
**Files crossed:** `apps/backend/src/ifta/ifta-state-gallons-aggregator.ts`, and the new
`scripts/verify-ifta-excludes-non-highway-fuel-types.mjs` / `scripts/verify-steps/11541-*.mjs`

`docs/bus/LANES.md` does not list `apps/backend/src/ifta/**` under any seat. This ruling documents
the Lead's own direct, same-session assignment of this exact fix to CC-3, verbatim from the
session transcript:

> "P0-A — DEF IS IN THE IFTA TAXABLE-GALLON BASE. THIS IS FIRST, AHEAD OF EVERYTHING. I traced
> apps/backend/src/ifta/ifta-state-gallons-aggregator.ts. All three CTEs (relay, loves, dispatch)
> read fuel.fuel_transactions and COALESCE(SUM(gallons),0) grouped by location_state, and there is
> NO fuel_type filter anywhere in that file. ... FIX IN THIS ORDER: ... 2. Exclude DEF AT THE
> AGGREGATOR, where the defect actually is. ... 5. Guard it:
> verify-ifta-excludes-non-highway-fuel-types.mjs, with a deliberate-failure proof ... Wire into CI
> under a claimed verify-step."

The fuel data this defect concerns (fuel.fuel_transactions, fuel_type taxonomy) is squarely CC-3's
own fuel lane; the aggregator file itself just happens to live under `ifta/` rather than `fuel/`.
This file satisfies `verify-lane-ownership.mjs`'s `LANE_CROSS` requirement.
