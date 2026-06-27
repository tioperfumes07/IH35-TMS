# IH35-TMS — Prod ↔ Migration Drift Ledger (DISPATCH-2, investigation)

> **2026-06-27.** P0 gate-opener for AF-1. Investigation phase (read-only on prod, authorized). Method:
> diff the **live prod Neon DB** (`br-fancy-credit-akjnd07a`, read-only) against the migration set on
> `origin/main` + the backend code. Fixes are gated migrations (separate, owner-gated).

## Summary of drift (DEFINITIVE — fresh-DB build vs live prod)

Method (the real one, not grep): created an **empty Neon DB**, ran `db:migrate` from `0001` (all 508 applied
clean), then diffed its `information_schema` against the **live prod** DB.

| Metric | Clean build (migrations) | Live prod | Gap |
|--------|------------------------:|----------:|----:|
| Schemas | 72 | 72 | 0 |
| Base tables | **605** | **619** | **14** (prod-only) |
| Views | 47 | 47 | 0 |
| Columns (shared tables) | — | — | **23** (prod-only) |

| Drift class | Finding | Action |
|-------------|---------|--------|
| Prod-only TABLES | **14** — all **orphan (0 backend references)** | Benign (legacy/pre-rebaseline); document, optionally archive |
| Prod-only COLUMNS | **23** on shared tables — the real gap | **21 captured** by migration `202606271520` (PR #1542); 2 documented exceptions |
| Ledger orphans | **4** prod-ledger migrations not on main (all `0408_*`) | Benign — renamed equivalents applied; document |
| Phantom columns | `work_orders.completed_at`/`hub_meter_at_completion` absent on prod | **Already fixed** (#1532) |
| Schema fragmentation | duplicate-domain schemas (mdata/master_data, maintenance/maint, …) | Document or consolidate (owner-gated; never drop without approval) |

---

## 1. Prod-only TABLES — 14, all orphan (benign)

The clean migrate produces **605 of prod's 619** tables (including the 48 `audit_log` partitions + the
`catalogs` factory tables — the earlier "147" was a grep artifact; regex can't see partition/seed DDL). The
**14** genuinely prod-only tables are **all unreferenced by backend code** (verified) — legacy/orphan, almost
certainly left over from before the 2026-06-15 history re-baseline:

| Schema | Prod-only tables (0 code refs) |
|--------|-------------------------------|
| `safety` | `accidents`, `citations`, `event_documents`, `fmcsa_events`, `roadside_inspections`, `violations` (code uses `safety.accident_reports` etc., not these) |
| `catalogs` | `cdl_endorsements`, `cdl_restrictions`, `employment_statuses`, `license_classes`, `medical_card_statuses` |
| `integrity` | `anomaly`, `driver_metric`, `metric` |

**Action:** benign — document; archive only with owner approval (additive/void-not-delete). They do not block
a fresh deploy (no code path uses them).

## 1b. Prod-only COLUMNS — 23 (the real gap; 21 captured)

The table diff looked benign, but the **column** diff is what would break a fresh deploy: 23 columns exist on
prod but the clean build's `CREATE TABLE` produces older shapes (notably `qbo.sync_alerts`, `sms.queue`,
`whatsapp.queue`). **Migration `202606271520` (PR #1542, HOLD) captures 21** — matched to exact prod
type/nullability/default — so a clean migrate reproduces prod; verified on the fresh branch (23 → 2).

| Table | Prod-only columns |
|-------|-------------------|
| `mdata.loads` | `trailer_type` |
| `accounting.journal_entries` | `idempotency_key` |
| `compliance.drug_alcohol_test_results` | `clearinghouse_reference`, `created_by`, `selection_id` |
| `qbo.sync_alerts` | `kind`, `message`, `payload`, `sync_run_id` |
| `sms.queue` | `attempts`, `error`, `provider_message_id`, `sent_at`, `status`, `to_number` |
| `whatsapp.queue` | `attempts`, `body`, `error`, `provider_message_id`, `sent_at`, `status` |

**2 documented exceptions (not in the capture migration):**
`maintenance.v_arriving_soon.final_destination_location_id` (a **view** column — view-definition drift) and
`ih35_migrations.applied_migrations.applied_by` (the migrate runner's internal mirror ledger). Both need
separate, non-`ADD COLUMN` handling.

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

## 3. Column-drift capture — STATUS (§1b detail)

The 23 prod-only columns (incl. the originally-flagged `mdata.loads.trailer_type`, 8 callers) are captured by
migration `202606271520` (**PR #1542, HOLD**) — 21 via idempotent `ADD COLUMN IF NOT EXISTS` matched to exact
prod types, + a `prod-column-drift-capture.db.test.ts` guard. **Branch-verified**: after the capture, the
fresh-DB column drift drops **23 → 2** (only the view + internal-ledger exceptions). 2 exceptions need
separate handling (view-def + mirror ledger). Awaiting GUARD prod-branch verify + owner gate.

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
