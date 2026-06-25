# Prod Catalog-Schema Drift — Reconcile (evidence-driven) — [HOLD-FOR-JORGE]

**Date:** 2026-06-24 (Central) · **Migration:** `db/migrations/202606241800_reconcile_prod_catalog_schema_drift.sql`
**Gate:** §1.4 financial cluster (`catalogs.*` schema) → **NEVER self-merge.** Coder branch-tests; **Jorge applies to prod.**

---

## 1. What was asked
After the W-2 diagnosis exposed that prod's live schema ≠ the migration set, build **ONE comprehensive
idempotent reconcile migration**: re-apply the 24 checksum-drifted migrations' current SQL idempotently,
create `civil_fine_types`, and investigate/resolve the 4 ghost ledger rows.

## 2. What I did instead of a blind re-run (and why)
A blind 4,000-line re-run of all 24 files' current SQL would **needlessly re-install accounting posting /
recompute triggers, COA role bindings, and the driver-bills backfill** — heavy financial churn, hard review.
Per the *never-guess / surface-the-fork* mandate I first got **ground truth** on what is actually missing on
prod, via three **read-only, API-endpoint-verified** audits against `br-fancy-credit-akjnd07a`:

1. **Per-file safety audit** of all 24 drifted files (idempotency + data/destructive statements). Result:
   **0 unsafe, 0 destructive**; every file is idempotent on re-run. The only financial-cluster re-assertions
   are 0124 (recompute triggers), `202606080937` (COA role bindings), 0062/0123 (`catalogs.accounts` seed),
   0141 (driver-bills backfill).
2. **Missing-table diff** — every `CREATE TABLE` target across the 24 files vs prod `information_schema`:
   **24 missing tables, ALL `catalogs.*` generics** from 0062's FOREACH. **No `accounting.*`/`banking.*`
   table is missing.**
3. **Missing-column diff** — every `ADD COLUMN` target vs prod: **2 genuinely missing**
   (`safety.company_violations.severity`, `.evidence_doc_ids`). The 7 `driver_pay.settlements.*` hits are a
   `to_regclass`-guarded block for a legacy table absent on prod (intentionally skipped — not a gap).

**Conclusion:** the entire real prod gap is **24 additive empty reference catalogs + 2 columns.** All
financial posting logic is already present. So the reconcile is scoped to exactly that — zero accounting churn.

## 3. The 24 missing catalog tables (created by the migration)
`accident_types, air_bag_catalog, battery_catalog, cash_advance_types, civil_fine_types, def_stations,
expensive_states, fuel_stations, ifta_states, leave_types, load_trailer_equipment, lumper_providers,
mx_customs_brokers, pm_intervals, qbo_categories, relay_accounts, repair_locations, settlement_templates,
tire_catalog, toll_providers, trailer_parts, truck_parts, work_order_templates, workplace_incident_types`

The migration re-asserts 0062's **full 33-name** array (`CREATE TABLE IF NOT EXISTS`), so the 9 already-present
catalogs are a no-op and a missed-in-read table would self-heal. Each table gets 0062's exact shape: company
PK, `operating_company_id` FK, `code/display_name/description/metadata/is_active/sort_order`, unique
`(operating_company_id, code)`, `idx_<t>_company_active`, RLS ON, `GRANT … TO ih35_app`, `company_scope`
policy. Identical pattern to the GUARD-cleared #1460. **`lumper_providers` unblocks wizard W-5/W-6.**

## 4. Branch-test result (Neon test branch `w2-catalog-test` / `br-sparkling-cloud-ak0g8f5c`)
Applied via the **Neon-API-verified** endpoint `ep-muddy-unit-ak81synm` (see incident note below — neonctl
returned prod's endpoint, the `assert-neon-branch` guard ABORTED, I corrected via the API):
- catalogs tables after apply: **33/33** present.
- `civil_fine_types` → `company_scope` policy present; `lumper_providers` → RLS enabled.
- `safety.company_violations.severity` → `smallint`; `evidence_doc_ids` → `ARRAY` (uuid[]).
- **Second run idempotent** (no error).
- **Prod re-checked read-only after the test: tables STILL missing** → the write went to TEST, not prod.

## 5. The 4 ghosts — RESOLVED (benign rename artifacts)
`0408_search_universal_index`, `0408_feature_flags`, `0408_geofence_state_transitions`,
`0408_damage_photo_exif_chain` are in prod's ledger but not the repo. Each was **renamed to timestamp format**
(`202606071000/1200/1500/1630_*`, commits "use timestamp migration format"). The renamed twins are applied
(audit shows 0 unapplied), so the objects exist — the `0408_*` rows are harmless duplicate ledger entries.

**Deliberately NOT mutated by the migration.** `_system._schema_migrations` is guarded by
`verify-applied-migrations-immutable.mjs`; mutating it from inside a migration risks that guard and the runner
checksum checks for zero functional gain. If Jorge wants the ledger tidy, run this **separately, by hand**
(it only deletes a ghost when its timestamp twin is present):

```sql
-- OPTIONAL ledger hygiene — run by Jorge only, not part of the schema migration.
DELETE FROM _system._schema_migrations g
WHERE g.filename = ANY (ARRAY[
  '0408_search_universal_index.sql','0408_feature_flags.sql',
  '0408_geofence_state_transitions.sql','0408_damage_photo_exif_chain.sql'])
AND EXISTS (SELECT 1 FROM _system._schema_migrations t
  WHERE t.filename = replace(g.filename, '0408_',
    CASE g.filename
      WHEN '0408_search_universal_index.sql'     THEN '202606071000_'
      WHEN '0408_feature_flags.sql'              THEN '202606071200_'
      WHEN '0408_geofence_state_transitions.sql' THEN '202606071500_'
      WHEN '0408_damage_photo_exif_chain.sql'    THEN '202606071630_'
    END));
-- mirror (if present): DELETE FROM ih35_migrations.applied_migrations WHERE name = ANY (ARRAY[... same 4 ...]);
```

## 6. Apply ceremony (Jorge)
1. Review `git diff` + the full SQL of `202606241800_*`.
2. Apply on a Neon branch first — **verify endpoint→branch via the Neon API** (`assert-neon-branch
   --expect-branch <branch>`) before any write; do **not** trust `neonctl connection-string`'s host.
3. Then apply to prod (same API-verified gate). The migration is idempotent; no data writes; no GL touch.
4. Backend re-checks: `GET /api/v1/catalogs/dispatch/*` already work; the new catalogs back safety/fuel/WO/
   driver-pay reference dropdowns and wizard lumper.

## 7. Related
- `docs/specs/incidents/INCIDENT-2026-06-24-prod-write-misroute.md` — the neonctl misroute + the
  `assert-neon-branch` control (which ABORTED the misroute again during this build).
- Memory: `prod-migration-deployment-drift`.
