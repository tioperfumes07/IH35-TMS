# IH35-TMS — Prod ↔ Migration Drift Ledger (DISPATCH-2, investigation)

> **2026-06-27.** P0 gate-opener for AF-1. Investigation phase (read-only on prod, authorized). Method:
> diff the **live prod Neon DB** (`br-fancy-credit-akjnd07a`, read-only) against the migration set on
> `origin/main` + the backend code. Fixes are gated migrations (separate, owner-gated).

## Summary of drift

| Drift class | Finding | Action |
|-------------|---------|--------|
| Table-count gap | Live prod = **619 tables**; `CREATE TABLE` grep in migrations = **478 distinct**; **147 prod tables unmatched** | Mostly benign (partitions + seed tables); finalize with a fresh-DB migrate count |
| Ledger orphans | **4 migrations in prod ledger not on main** (all `0408_*`) | Benign — renamed equivalents applied; document |
| Confirmed schema drift | **`mdata.loads.trailer_type` exists on prod, NOT created by any migration** (8 backend callers) | **Capture migration needed** (gated) |
| Phantom columns | `work_orders.completed_at` / `hub_meter_at_completion` don't exist on prod | **Already fixed** (#1532) — no remaining callers |
| Schema fragmentation | duplicate-domain schemas (mdata/master_data, maintenance/maint, …) | Document or consolidate (owner-gated; never drop without approval) |

---

## 1. The 619-vs-478 table gap (147 unmatched) — mostly benign

147 prod base tables are not matched by a `CREATE TABLE schema.table` statement in migrations. By schema:

| Schema | Unmatched | Almost certainly |
|--------|----------:|------------------|
| `catalogs` | 72 | factory/reference catalog tables created by **seed migrations** (INSERT/dynamic DDL the grep can't see) |
| `public` | 48 | the `audit_log_2024_01 … 2027_12` **partition tables** (created by partition DDL/function) |
| `safety` | 7 | created later / dynamic |
| `reference` | 5 | reference data schema (not in grep's CREATE pattern) |
| `migration` | 5 | internal test-seed ledgers |
| `compliance` | 5 | dynamic |
| `integrity` / `_system` / `ih35_migrations` | 5 | framework |

**This 147 is an UPPER BOUND on drift** — the grep undercounts partitions and seed/function-created tables,
so most of these *are* produced by a clean migrate; they just aren't visible to a regex.
**Definitive measurement (recommended next step):** run `db:migrate` from `0001` on a fresh empty database
and count `information_schema` tables; subtract from 619 to get the *true* prod-only set. CI's
`build-typecheck` already runs a fresh migrate (green), which indicates the migration set applies cleanly —
but it does not count tables, so the exact prod-only list needs this run.

## 2. The 4 ledger-only migrations (benign)

In prod `_system._schema_migrations` but **not** files on `origin/main`:
`0408_damage_photo_exif_chain.sql`, `0408_feature_flags.sql`, `0408_geofence_state_transitions.sql`,
`0408_search_universal_index.sql` — a **number collision** from before the 2026-06-15 history re-baseline.
Each has a **renamed equivalent applied on main**, so prod's schema is complete:

| Orphan ledger entry | Renamed equivalent on main (also applied) |
|---------------------|-------------------------------------------|
| `0408_feature_flags` | `202606071200_feature_flags.sql` |
| `0408_geofence_state_transitions` | `202606071500_geofence_state_transitions.sql` |
| `0408_search_universal_index` | `202606071000_search_universal_index.sql` |
| `0408_damage_photo_exif_chain` | `202606071630_damage_photo_exif_chain.sql` |

**0 files on main are unapplied on prod.** The boot-check (every file in the ledger) holds. **Action: document
only** — optionally a note migration recording these as superseded.

## 3. CONFIRMED real drift — `mdata.loads.trailer_type`

- Live prod: `mdata.loads.trailer_type` **exists**.
- Migrations: **no `ALTER TABLE mdata.loads ADD COLUMN … trailer_type`** anywhere (the 4 `trailer_type`
  matches in migrations target other tables — catalogs/lists, not `mdata.loads`).
- Backend callers: **8 files** (`book-load.service.ts`, `loads.routes.ts`, `dispatch-refinements.routes.ts`,
  `driver-optimizer.service.ts`, `profit-per-truck.routes.ts`, `catalogs/fleet/index.ts`,
  samsara cargo ingester, lists count spec).
- **Impact:** works on prod (column present) but a **fresh deploy / CI DB has no `loads.trailer_type` →
  these 8 paths 42703 → 500.** The migration set does not honestly describe prod.
- **Fix (gated):** idempotent capture migration
  `ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS trailer_type text;` (match the prod column type) + a
  db-test asserting the column exists after migrate.

## 4. Phantom columns — status

- `maintenance.work_orders.completed_at` and `.hub_meter_at_completion`: **do not exist on prod** (verified).
  Only caller was `catalogs/maintenance/services.routes.ts`, **already re-sourced to
  `telematics.vehicle_latest_position` + `maintenance.pm_schedules` in #1532 (merged).** No open callers.
- `mdata.loads.trailer_id`: confirmed absent (known landmine; trailer lives in assignment history).

## 5. Schema fragmentation (duplicate-domain schemas in prod)

Live prod carries duplicate-domain schemas — a structural debt, not necessarily a bug:
`mdata`(43)+`master_data`(4); `maintenance`(33)+`maint`(5); `qbo`(5)+`qbo_sync`(2)+`qbo_archive`(6);
`bank`(1)+`banking`(8); `settlement`(3, dead)+`settlements`(1); `driver_finance`(22)+`drivers`(1);
`docs`(2)+`documents`(2); `finance`(2) vs `accounting`(47).
**Action:** for each pair, decide consolidate-or-document. **Do NOT drop anything without explicit owner
approval** (additive / void-not-delete). `settlement.*` appears dead (no live `FROM` query) — candidate to
archive after owner sign-off.

---

## Reconciliation plan (execution = gated migrations, separate PRs)
1. **Definitive gap count** — fresh-DB migrate → table count vs 619 → the exact prod-only table list.
2. **Capture migrations** for confirmed prod-only schema (`mdata.loads.trailer_type` first) so fresh CI
   matches prod, each with a db-test.
3. **Document** the 4 orphan ledger entries + the partition/seed tables as intentional.
4. **Schema-fragmentation decisions** (owner) — consolidate or document each pair.
5. **Fresh-DB drift CI guard** so this class is caught going forward.
6. **Then AF-1 (#1528) may proceed** to live-prod re-verify → owner gate → merge.

_Investigation is read-only; every schema change above is a Tier-1/2 migration via the Neon-branch ceremony,
owner-gated. Nothing applied to prod by this investigation._
