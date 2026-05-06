# P3-RLS-FIX-1: mdata.locations RLS allows driver visibility into 1 cross-company row

## Status
Pre-existing on main. NOT introduced by P3-T11.5. Tracked here so it gets resolved before Phase 4 PWA driver expansion.

## Reproduction
git checkout main
npm run db:migrate
npm run db:verify:mdata-rls

## Expected
locations: driver SELECT succeeds -> rowCount=0

## Actual
locations: driver SELECT succeeds -> rowCount=1

## Suspected cause
All other mdata tables (drivers, units, customers, vendors, equipment, equipment_log) PASS the same assertion pattern. Only mdata.locations FAILS, suggesting a missing or misscoped RLS policy specific to that table. Likely candidates:
- Missing operating_company_id-based RLS policy on mdata.locations
- Policy exists but uses an incorrect column / function reference
- View or join path bypasses RLS

## Priority
P1 — must fix before Phase 4 PWA driver expansion (drivers will hit location-bound endpoints from PWA).

## Owner
TBD. Assign during Phase 3 close (P3-T13).
