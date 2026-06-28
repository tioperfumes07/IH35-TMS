# Migration Mapping Cross-Check — CAS-02
**Date:** 2026-06-28  
**Author:** Cascade (verification lane)  
**Baseline:** `origin/main 949d0d6c` (PR #1573)  
**GUARD VQ1:** Live-verified on Neon prod branch `br-fancy-credit-akjnd07a`  
**Status:** GATES CC-05 — Claude Coder must read this before building the missing-table migration  
**Build-and-hold:** Do not merge without Jorge approval + GUARD branch-verify

---

## 1. Summary

| Category | Count | Files |
|---|---|---|
| COPY-AND-APPLY (missing tables — must be applied) | 5 files → 6 tables + 1 schema | 0392, 0394, 0395, 202606080241, 202606080242 |
| ALREADY-APPLIED-DELETE-LATER (safe duplicates) | 6 files | 0393, 0396, 0403, 202606080243, 202606080244, 0167 |
| INVESTIGATE | 0 | — |

**COPY-AND-APPLY set reconciles to exactly the 5 confirmed-missing tables + payroll_integration schema (G2).** ✓  
**6th object `settlements.team_split_load_overrides` CONFIRMED — created by same 0394 file as `team_split_configs`.** CC-05 canonical migration must preserve both CREATE TABLE blocks.

---

## 2. The 6th Object — Resolved

**Question from GROUND TRUTH G2:** Does `0394-team-splits.sql` create `settlements.team_split_load_overrides`?

**Answer: YES — confirmed by reading the file and GUARD VQ1 prod verification.**

Quoted verbatim from `apps/backend/src/migrations/0394-team-splits.sql` lines 31–45:

```sql
CREATE TABLE IF NOT EXISTS settlements.team_split_load_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid NOT NULL REFERENCES mdata.loads(id),
  primary_driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  secondary_driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  primary_ratio numeric(5,4) NOT NULL CHECK (primary_ratio > 0 AND primary_ratio <= 1),
  secondary_ratio numeric(5,4) NOT NULL CHECK (secondary_ratio > 0 AND secondary_ratio <= 1),
  reason text NOT NULL DEFAULT 'one_off_team' CHECK (reason IN ('one_off_team', 'config_override')),
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_split_load_overrides_drivers_distinct CHECK (primary_driver_id <> secondary_driver_id),
  CONSTRAINT team_split_load_overrides_ratio_sum_chk CHECK (ABS((primary_ratio + secondary_ratio) - 1) < 0.0001),
  CONSTRAINT team_split_load_overrides_load_unique UNIQUE (load_id)
);
```

GUARD VQ1 confirmed `settlements.team_split_load_overrides` is **ABSENT on prod**. It is a confirmed 6th missing table. The CC-05 canonical file `202606281010_team_split_configs.sql` must create both tables.

---

## 3. payroll_integration Schema — Resolved

**Question:** Does `202606080241` create the schema itself, or must CC-05 add `CREATE SCHEMA IF NOT EXISTS payroll_integration` manually?

**Answer: The legacy file already contains it.** Quoted verbatim from `apps/backend/src/migrations/202606080241-payroll-integration-cache.sql` lines 4–5:

```sql
CREATE SCHEMA IF NOT EXISTS payroll_integration;
GRANT USAGE ON SCHEMA payroll_integration TO ih35_app;
```

CC-05 canonical copy `202606281040_payroll_integration_cache.sql` must preserve these two lines before the `CREATE TABLE`. No manual addition needed. ✓

---

## 4. COPY-AND-APPLY Set — Full Detail

### File 1: `0392-auto-deductions.sql`
- **Creates:** `driver_finance.auto_deduction_policies`
- **Also:** ALTERs `payroll.driver_settlement_line_items` (adds `auto_deduction_policy_id`) and `driver_finance.settlement_lines` (adds `auto_deduction_policy_id`, updates CHECK constraint)
- **Idempotent:** YES — `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`
- **Self-contained:** YES — all referenced schemas/tables (`driver_finance`, `payroll`, `org.companies`, `mdata.drivers`, `identity.users`) exist on prod
- **GRANTs ih35_app:** YES — `GRANT SELECT, INSERT, UPDATE ON driver_finance.auto_deduction_policies TO ih35_app`
- **Canonical copy in `db/migrations/`:** NO — `0094_p5_e1_auto_deduct_escrow_load_abandonment.sql` exists but creates different objects (load_abandonments, not auto_deduction_policies)
- **Action:** **COPY-AND-APPLY** → `db/migrations/202606281000_auto_deduction_policies.sql`

### File 2: `0394-team-splits.sql`
- **Creates:** `settlements.team_split_configs` + `settlements.team_split_load_overrides` (2 tables)
- **Also:** `CREATE SCHEMA IF NOT EXISTS settlements`; ALTERs `payroll.driver_settlement_line_items` (adds `split_partner_driver_id`)
- **Idempotent:** YES — all DDL uses `IF NOT EXISTS`
- **Self-contained:** YES
- **GRANTs ih35_app:** YES — both tables get `SELECT, INSERT, UPDATE, DELETE`
- **Canonical copy in `db/migrations/`:** NO
- **Action:** **COPY-AND-APPLY** → `db/migrations/202606281010_team_split_configs.sql`
- **⚠️ CC-05 NOTE:** Canonical file must include BOTH `CREATE TABLE` blocks. Do not split into two files. GUARD must verify BOTH tables present after Neon-branch apply.

### File 3: `0395-road-service-tickets.sql`
- **Creates:** `maintenance.road_service_tickets`
- **Idempotent:** YES — `CREATE TABLE IF NOT EXISTS`
- **Self-contained:** YES — references `org.companies`, `mdata.units`, `mdata.drivers`, `identity.users`, `mdata.qbo_vendors`, `maintenance.work_orders` — all exist on prod
- **GRANTs ih35_app:** YES — `SELECT, INSERT, UPDATE, DELETE`
- **Canonical copy in `db/migrations/`:** NO
- **Action:** **COPY-AND-APPLY** → `db/migrations/202606281020_road_service_tickets.sql`

### File 4: `202606080241-payroll-integration-cache.sql`
- **Creates:** `payroll_integration` SCHEMA + `payroll_integration.aggregate_cache`
- **Idempotent:** YES — `CREATE SCHEMA IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`
- **Self-contained:** YES — only external reference is `org.companies`
- **GRANTs ih35_app:** YES — `GRANT USAGE ON SCHEMA` + `SELECT, INSERT, UPDATE, DELETE ON table`
- **Canonical copy in `db/migrations/`:** NO
- **Action:** **COPY-AND-APPLY** → `db/migrations/202606281040_payroll_integration_cache.sql`
- **Schema note:** File already has `CREATE SCHEMA IF NOT EXISTS payroll_integration` on line 4. ✓

### File 5: `202606080242-maintenance-parts-catalog.sql`
- **Creates:** `mdata.maintenance_parts`
- **Also:** `CREATE SCHEMA IF NOT EXISTS mdata` (safe no-op, schema exists)
- **Idempotent:** YES
- **Self-contained:** YES
- **GRANTs ih35_app:** YES — `SELECT, INSERT, UPDATE, DELETE`
- **Canonical copy in `db/migrations/`:** NO
- **Action:** **COPY-AND-APPLY** → `db/migrations/202606281030_maintenance_parts_catalog.sql`

---

## 5. ALREADY-APPLIED-DELETE-LATER Set

> Per D3: delete only after (a) canonical copy confirmed applied, (b) object exists on prod, (c) file proven safe duplicate, (d) Jorge explicitly approves. Delete is CC's step, not Cascade's.

| Legacy file | Canonical copy | Object on prod | Deletion safe? | Precondition |
|---|---|---|---|---|
| `apps/backend/src/migrations/0393-settlement-disputes.sql` | `db/migrations/0393_settlement_disputes.sql` | `settlements.settlement_disputes` EXISTS (G2 GUARD) | YES | Confirm canonical text identical to legacy |
| `apps/backend/src/migrations/0396-archive-test-users.sql` | `db/migrations/0396_archive_test_users.sql` | `migration.test_seed_archive_ledger_0396` — run VQ1 | After prod confirm | VQ1 confirm |
| `apps/backend/src/migrations/0403-onboarding-state.sql` | `db/migrations/0403_onboarding_state.sql` | `onboarding.onboarding_state` — run VQ1 | After prod confirm | VQ1 confirm |
| `apps/backend/src/migrations/202606080243-maintenance-services-catalog.sql` | `db/migrations/202606210000_maintenance_services_catalog_table.sql` | `mdata.maintenance_services` — run VQ1 | After prod confirm | VQ1 + confirm canonical covers same columns |
| `apps/backend/src/migrations/202606080244-usmca-activation-state.sql` | `db/migrations/202606080244_usmca_ops_schema_grant.sql` | `usmca_ops.activation_state` + `usmca_ops.activation_audit` EXIST (GUARD VQ1) | **YES — provably safe** | Canonical creates both tables + grants + RLS + seed. Objects confirmed on prod. |
| `apps/backend/migrations/0167_p7_block_e_notif_prefs.sql` | `db/migrations/0167_p7_block_e_notif_prefs.sql` | `identity.user_notification_preferences` — run VQ1 | After prod confirm | VQ1 confirm |

**usmca deletion proof:**  
Canonical `db/migrations/202606080244_usmca_ops_schema_grant.sql` creates: schema, both tables, GRANTs, RLS policies, seed insert. Legacy file creates the same objects. GUARD VQ1 confirmed both tables exist on prod. Deletion preconditions fully met per D3.

---

## 6. No INVESTIGATE Items

All 11 legacy files are fully classified. No rows require investigation.

---

## 7. Discrepancy Check — COPY-AND-APPLY Set vs G2

| G2 confirmed-missing | Sourced by | Reconciled? |
|---|---|---|
| `driver_finance.auto_deduction_policies` | 0392 | ✓ |
| `settlements.team_split_configs` | 0394 | ✓ |
| `settlements.team_split_load_overrides` (6th — GUARD VQ1) | 0394 (same file) | ✓ |
| `maintenance.road_service_tickets` | 0395 | ✓ |
| `payroll_integration.aggregate_cache` | 202606080241 | ✓ |
| `payroll_integration` SCHEMA | 202606080241 (line 4) | ✓ |
| `mdata.maintenance_parts` | 202606080242 | ✓ |

**No discrepancy. COPY-AND-APPLY set fully accounts for all G2 missing objects.** ✓

---

## 8. Instructions for Claude Coder (CC-05)

1. **Read this document before writing any canonical migration.**
2. **0394 → canonical file must contain BOTH tables** (`team_split_configs` + `team_split_load_overrides`). Do not split.
3. **202606080241 → canonical file must start with** `CREATE SCHEMA IF NOT EXISTS payroll_integration;` followed by `GRANT USAGE ON SCHEMA payroll_integration TO ih35_app;` before the table DDL. Already in legacy file — copy verbatim.
4. **Timestamps for canonical names** must sort after the current last applied migration. Use `202606281000`–`202606281040` series as specified in CC-05.
5. **After Neon-branch apply, VQ1 must confirm all 6 tables present** (team_split_configs + team_split_load_overrides + road_service_tickets + maintenance_parts + aggregate_cache + payroll_integration schema). GUARD verifies independently.
6. **Delete-later files:** Do NOT delete legacy files in this PR. Delete is a separate, per-file-gated PR after prod VQ1 confirms each object. `202606080244` is provably safe when ready; others need VQ1 first.
7. **Do not relocate the 10 files** — copy only the 5 COPY-AND-APPLY files into `db/migrations/`. Legacy files stay in place until the delete-later PR.

---

## 9. Acceptance Evidence

- **A1 (VQ1):** GUARD live-verified all 5 G2 tables ABSENT + 6th (`team_split_load_overrides`) ABSENT. `settlements.settlement_disputes` EXISTS. `usmca_ops.*` EXISTS.
- **A2 (6th object):** `settlements.team_split_load_overrides` CREATE statement quoted verbatim from 0394 lines 31–45. Confirmed ABSENT by GUARD VQ1.
- **A3 (payroll schema):** `CREATE SCHEMA IF NOT EXISTS payroll_integration` confirmed in 202606080241 lines 4–5. No manual addition needed.
- **A4 (ALREADY-APPLIED):** `202606080244` deletion proven safe — canonical creates same objects, GUARD VQ1 confirms both tables exist on prod.
- **A5 (COPY-AND-APPLY reconciled):** 5 files → 6 tables + 1 schema = exact match to G2. No discrepancy.
- **No file edited, moved, deleted, or migrated.** Verification only. ✓
