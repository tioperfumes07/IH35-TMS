# P6-HOTFIX 0124 — Active drift reconciliation (23 objects) + canonical driver_settlements DDL + compatibility-rewritten triggers + verifier tuning (10 B items)

## Summary
- Completes HOTFIX 0124 by reconciling active schema drift and replay-safe compatibility rewrites required by live backend contracts.
- Restores canonical `driver_finance.driver_settlements`, rewrites 0095/0109 trigger logic against current production schema, and hardens predeploy verification with migration-content checks.
- Drives migration content drift from residual findings to zero using audit-friendly, scoped verifier tuning for Class B items only.

## Drift: 38 -> 0
- Post-0123 residual drift: 38.
- HOTFIX 0124 active reconciliation objects: implemented.
- Remaining verifier-only B items after runtime reconciliation: 10.
- Final state after verifier tuning: `missing=0`.

## Key Decisions
1. **Money type decision (kept):** `driver_finance.driver_settlements` monetary columns use `numeric(14,2)` (Phase 8 conversion to bigint cents deferred).
2. **Status check decision (kept):** permissive `driver_settlements.status` CHECK retained to avoid rejecting observed active states; narrowing deferred to Phase 8.
3. **Kept columns decision (Jorge approved):** retained/restored `safety.company_violations` columns:
   - `outcome` (text + CHECK)
   - `violation_type_uuid` (uuid FK)
   - `violation_type_id` (uuid FK)
   These are used by active backend service code.
4. **0095 semantic mapping decision (Jorge approved):**
   - OLD: `work_orders.severity IN ('severe','out_of_service','total_loss')`
   - NEW: `work_orders.wo_type IN ('repair','accident')`
5. **`related_drivers` handling decision:** 0109 auto-fine compatibility rewrite extracts driver from `related_drivers` JSON defensively (supports UUID array and object forms), preserving existing status/outcome resolve semantics.

## Schema Additions / Reconciliations by Source Migration

### 0052 (factoring views)
- Recreated factoring views with compatibility-safe drop/recreate ordering:
  - `views.factoring_summary`
  - `views.factoring_recourse_at_risk`
  - `views.factoring_chargebacks_fees`
  - `views.factoring_statements_settings`

### 0095 (severe repair workflow, compatibility rewrite)
- Rewrote and installed:
  - `maintenance.upsert_severe_repair_estimate()`
  - `maintenance.refresh_severe_repair_estimate_from_line()`
  - `maintenance.unit_back_in_service_check()`
  - `trg_upsert_severe_repair_estimate` on `maintenance.work_orders`
  - `trg_refresh_severe_repair_estimate_from_line` on `maintenance.work_order_lines`
  - `trg_unit_back_in_service_check` on `maintenance.work_orders`
- Updated checks:
  - `severe_repair_estimates_damage_severity_check` (adds `unspecified`)
  - `severe_repair_estimates_estimate_status_check` (adds `draft`, `cancelled`)
- Enforced conflict target:
  - full unique index on `maintenance.severe_repair_estimates(trigger_wo_id)`.

### 0096 (settlement disputes)
- Reconciled `driver_finance.driver_settlement_disputes` and indexes (active object set).

### 0097 (team split)
- Reconciled `driver_finance.team_settlement_splits` and indexes (active object set).

### 0109 (company violation auto-fine, compatibility rewrite)
- Reconciled function + trigger:
  - `safety.auto_create_internal_fine_from_violation()`
  - `trg_auto_fine_on_violation_resolve`
- Keeps original status/outcome guard:
  - `NEW.status='closed' AND NEW.outcome='monetary_fine'`
- Uses `COALESCE(violation_type_uuid, violation_type_id)` lookup against `catalogs.company_violation_types`.
- Adapts missing direct `driver_id` by extracting from `related_drivers` JSON.

### 0111 (is_extra_stop refresh)
- Reconciled:
  - `mdata.refresh_is_extra_stop(uuid)`
  - `mdata.trg_refresh_is_extra_stop()`
  - `trg_refresh_is_extra_stop`
- Added recursion guard (see Bonus Fixes).

### Canonical settlement contract (reconstructed)
- Added canonical `driver_finance.driver_settlements` DDL from active backend contract:
  - core columns + checks + RLS policy
  - required indexes
  - `driver_finance.next_settlement_display_id(...)`.

## 10 B Items Verifier-Tuned

| item | source_migration | category | tuning_reason |
|---|---|---|---|
| `audit.allowed_event_classes` | `0051_arriving_soon_views.sql` | B: seed-data/transient | seed_rows expectation only; runtime-safe when empty/transient |
| `public.catalogs` | `0062_p3_t11_21_0_catalog_seed_data.sql` | B: parser artifact/non-runtime seed target | legacy seed_rows parse artifact; not active runtime contract |
| `public.tmp_void_customers` | `0069_p3_t11_20_test_data_cleanup.sql` | B: temp artifact | one-time cleanup temp table |
| `public.tmp_deactivated_identity_users` | `0069_p3_t11_20_test_data_cleanup.sql` | B: temp artifact | one-time cleanup temp table |
| `public.tmp_void_drivers` | `0069_p3_t11_20_test_data_cleanup.sql` | B: temp artifact | one-time cleanup temp table |
| `public.tmp_void_internal_fines` | `0069_p3_t11_20_test_data_cleanup.sql` | B: temp artifact | one-time cleanup temp table |
| `public.tmp_void_loads` | `0069_p3_t11_20_test_data_cleanup.sql` | B: temp artifact | one-time cleanup temp table |
| `public.tmp_void_work_orders` | `0069_p3_t11_20_test_data_cleanup.sql` | B: temp artifact | one-time cleanup temp table |
| `public.tmp_driver_phone_reconciled` | `0071_p3_cleanup_6_driver_phone_reconciliation.sql` | B: temp artifact | one-time reconciliation temp table |
| `maintenance.severe_repair_estimates.trg_unit_back_in_service_check` | `0095_p5_e5_severe_repair_oos_estimate.sql` | B: intentionally moved object | trigger moved to `maintenance.work_orders` in compatibility rewrite |

> All ignore entries include: `object`, `source_migration`, `reason`, `added_at`, `added_in_pr`.

## Runtime Probe Results

### 1) Block C Scenario 1 substitute: `bookLoad()` (approved)
HTTP `POST /api/v1/dispatch/loads` could not run locally because dev server boot fails on missing auth env (separate tech debt).
Substitute executed: `bookLoad()` directly against live DB with `booking_mode='single_popup'`.

Result:

```json
{"kind":"ok","row":{"id":"fbddc0fa-d9ce-4dfe-a32e-e82b772ffbf9","operating_company_id":"b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e","load_number":"L-20260512-0001","customer_id":"c93064ae-dff8-407c-9c25-c9f20e5be9d6","status":"draft","booking_mode":"single_popup","wf_044_maintenance_warnings":[]}}
```

### 2) Auto-fine trigger probe
- Inserted `safety.company_violations` test row.
- Updated to `status='closed'`, `outcome='monetary_fine'`.
- Verified `auto_created_internal_fine_uuid` populated and matching `safety.internal_fines` row created.
- Cleanup: deleted test violation and generated fine.

Result excerpt:

```json
{
  "inserted_violation_id": "29b6eb51-faae-43ef-bce7-ee00423b461c",
  "updated_violation": {
    "id": "29b6eb51-faae-43ef-bce7-ee00423b461c",
    "status": "closed",
    "outcome": "monetary_fine",
    "auto_fine_id": "262d223b-a3a7-4c76-af9b-cf7ca2393ef0"
  },
  "created_internal_fine": {
    "id": "262d223b-a3a7-4c76-af9b-cf7ca2393ef0",
    "driver_id": "e3caee0b-846b-472a-8dcd-fc886bbce692",
    "status": "approved",
    "amount": "123.45"
  },
  "violation_type_code_used": "LATE_ARRIVAL"
}
```

### 3) Severe-repair trigger probe
- Inserted `maintenance.work_orders` test row with `wo_type='repair'`.
- Verified `maintenance.severe_repair_estimates` row auto-created.
- Cleanup: deleted test work order + estimate.

Result excerpt:

```json
{
  "inserted_work_order_id": "3839f481-303d-450b-92f6-3bcb0b653dca",
  "severe_repair_estimate": {
    "id": "7fb2fa0f-3421-42e0-b949-858aa4becf36",
    "trigger_wo_id": "3839f481-303d-450b-92f6-3bcb0b653dca",
    "damage_severity": "unspecified",
    "estimate_status": "draft"
  }
}
```

### 4) Factoring views probe
All queried without error:
- `views.factoring_recourse_at_risk` (row_count=0)
- `views.factoring_chargebacks_fees` (row_count=0)
- `views.factoring_statements_settings` (row_count=0)
- `views.factoring_summary` (row_count=0)

## Bonus Fixes
1. Added recursion guard to `mdata.trg_refresh_is_extra_stop()` using `pg_trigger_depth()` to prevent stack-depth recursion.
2. Replaced partial unique index with full unique index on `maintenance.severe_repair_estimates(trigger_wo_id)` so `ON CONFLICT (trigger_wo_id)` works reliably.

## Tech Debt (Tracked)
1. Convert `driver_settlements` money columns from `numeric(14,2)` to bigint cents.
2. Narrow `driver_settlements.status` CHECK constraint.
3. Canonicalize `violation_type_uuid` vs `violation_type_id`, migrate FKs, drop the redundant column.
4. Audit 0095 `severity -> wo_type` mapping against post-MVP production behavior.
5. Fix local dev server auth-env boot crash so direct HTTP Block C probes run locally.
6. Re-evaluate whether `tire` should join severe-repair trigger scope for catastrophic cases.

## Full Verifier Output

### `npm run db:verify:critical-runtime`

```text
> ih35-v3-build@0.0.1 db:verify:critical-runtime
> node scripts/db-verify-critical-runtime.mjs

PASS: required tables present (12)
PASS: required views present (1)
PASS: required columns present (39)
PASS: owner count is 1
PASS: ih35_app schema USAGE present (6)
PASS: ih35_app table SELECT present (6)
PASS: db-verify-critical-runtime
```

### `npm run db:verify:critical-runtime -- --verify-content`

```text
> ih35-v3-build@0.0.1 db:verify:critical-runtime
> node scripts/db-verify-critical-runtime.mjs --verify-content

PASS: required tables present (12)
PASS: required views present (1)
PASS: required columns present (39)
PASS: owner count is 1
PASS: ih35_app schema USAGE present (6)
PASS: ih35_app table SELECT present (6)
PASS: migration content verified (115 files, missing=0)
PASS: db-verify-critical-runtime
```

## Files Changed
- `db/migrations/0123_p6_pre_ledger_drift_reconciliation.sql`
- `db/migrations/0124_p6_active_drift_reconciliation.sql`
- `scripts/db-verify-critical-runtime.mjs`
- `scripts/lib/migration-content-verifier.mjs`
- `scripts/lib/migration-content-verifier-ignore.json`
- `render.yaml`

