# Q35 REPORT — Module Walk (API + Database, USMCA)

**Measured:** 2026-09-24 01:40 UTC
**Method:** Neon live (bypass_rls='lucia', operating_company_id=USMCA), production API healthz, route file audit.
**Production sha:** 6fdbd98 (api.ih35dispatch.com healthz/shallow)
**Note:** Chrome walk not available from this seat; report covers API + DB state + route registration.

## Module Population (USMCA, is_sample_data excluded where column exists)

| Module | Table | Count |
|--------|-------|-------|
| dispatch | mdata.loads | 10 |
| accounting_invoices | accounting.invoices | 10 |
| accounting_bills | accounting.bills | 0 |
| fleet_units (all leased) | mdata.units | 42 |
| fleet_drivers (all) | mdata.drivers | 161 |
| maintenance_wos | maintenance.work_orders | 17 |
| safety_incidents | safety.incidents | 6 |
| factoring_advances | accounting.factoring_advances | 9 |
| fuel_transactions | integrations.relay_fuel_transactions | 76 |
| journal_entries | accounting.journal_entries | 49 |
| banking_txns | banking.bank_transactions | 1133 |
| driver_settlements | driver_finance.driver_settlements | 0 |

## Findings

### FINDING 1: accounting_bills = 0 (expected during feed)
- **Module:** Accounting
- **Measured:** 0 bills in accounting.bills for USMCA
- **Status:** Expected — Cursor is feeding 8/13 → 9/21. Bills appear as the feed progresses.
- **Action:** None (feed in progress).

### FINDING 2: driver_settlements = 0 (expected during feed)
- **Module:** Driver Finance
- **Measured:** 0 settlements in driver_finance.driver_settlements for USMCA
- **Status:** Expected — first settlement posts when a tour's full load set lands (5769 waits on 13498, etc.).
- **Action:** None (feed in progress).

### FINDING 3: fleet_units = 42 vs Rule 49 in-service = 16
- **Module:** Fleet
- **Measured:** 42 units leased to USMCA (currently_leased_to_company_id), 16 in-service per Rule 49
- **Status:** The 42 count includes ALL units leased to USMCA (including sold/disposed/OOS). Rule 49 says only 16 are in-service. The default fleet list must filter to in-service only.
- **Action:** Verify the fleet list default view filters to in-service (Rule 49). If it shows 42, it's a regression.

### FINDING 4: fleet_drivers = 161 vs Rule 49 active = 20
- **Module:** Fleet / Drivers
- **Measured:** 161 drivers in mdata.drivers for USMCA, 20 active per Rule 49 (15-day Samsara movement window)
- **Status:** The 161 count includes ALL drivers (inactive, terminated, etc.). Rule 49 says only 20 are active. The default driver list must filter to active only.
- **Action:** Verify the driver list default view filters to active (Rule 49). If it shows 161, it's a regression.

### FINDING 5: Production API healthy at sha 6fdbd98
- **Module:** All
- **Measured:** GET /api/v1/healthz/shallow returns 200 with git_sha=6fdbd98, uptime=293s
- **Status:** API is live and healthy.
- **Action:** None.

## Route Registration (verified via file audit)

All 608 route files exist in apps/backend/src/. Key modules confirmed:
- dispatch/loads.routes.ts — present
- accounting/bills.routes.ts — present
- accounting/invoices.routes.ts — present
- banking/banking.routes.ts — present
- maintenance/work-orders.routes.ts — present
- safety/incidents.routes.ts — present
- factoring/factoring.routes.ts — present

## Summary

The book is ~6% fed (10 loads, 10 invoices, 0 bills, 0 settlements). Most modules have data. The key findings are:
1. Bills and settlements are 0 (expected during feed).
2. Fleet units (42) and drivers (161) counts include all records — the default views must filter to in-service/active per Rule 49.
3. Production API is healthy at sha 6fdbd98.

No defects filed outside DEVIN-A's lane. Findings 3 and 4 are potential Rule 49 regressions that should be verified in Chrome by a seat with Chrome access.
