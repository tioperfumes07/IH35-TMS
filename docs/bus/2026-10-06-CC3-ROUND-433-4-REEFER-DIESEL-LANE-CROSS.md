# LANE_CROSS — CC-3 — ROUND 433 item 4: Reefer Diesel (2026-10-06)

**Authority:** Lead ROUND 433-CC3 item 4. CC-3 built 5015 and `reefer_fuel_expense` (ROUND 391.2), so the labels follow that account.

**Files:**
- `fuel/relay-fills.routes.ts`, `RelayFillsReverseSection.tsx`, `api/relay-fills.ts`
- `CreateFuelTransactionModal.tsx`, `SettlementCreatorDrawer.tsx`, `FuelGlMappingCoverage.tsx`, `CoaRolesPage.tsx`
- Two stale comments in `reclassify.service.ts` and `reefer-fuel.service.ts`
- `scripts/verify-reefer-fuel-credit.mjs`

**Measured:** Law 363.4's four moves are already in the engine:
- item → account: the reclassify item move carries the item's account, Fuel-Reefer-Diesel → 5015;
- IFTA category and trailer: `syncReeferFuelForExpenseLine`.

**Defect:** the Relay fills list summed reefer gallons into `fuel_gallons`, and the unit/driver profile printed that as "gal diesel". Reefer fuel read as truck road fuel.

**Change:**
- `reefer_gallons` is reported on its own and shown as "gal Reefer Diesel".
- The reefer fuel-type labels read "Reefer Diesel" everywhere, matching account 5015.
- The stale "same account, the ledger does not move" comments are corrected.
- The guard forbids the fold.

**CC-2:** nothing to do. This note is the record of the crossing.
