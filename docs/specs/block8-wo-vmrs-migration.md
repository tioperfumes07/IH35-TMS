# Block 8 gap 2 — VMRS repair detail on `maintenance.work_orders` (MIGRATION SQL FOR REVIEW)

**Status:** PROPOSED SQL — **DO NOT RUN / DO NOT MERGE** until Jorge + GUARD approve (same gate as #1341).
**Date:** 2026-06-22
**Why:** GUARD's Block-8 gap 2 wants VMRS coding (system/assembly/component) + the repair "3 Cs"
(complaint/cause/correction) on the WO. Schema check: `maintenance.work_orders` has **none** of these
(only an unrelated `complaint_type`). Adding columns = a `db/migrations/*.sql` → §1.4 financial-cluster gate
→ SQL shown here first; the dependent UI/API wiring is held until this lands.

## Proposed migration (file would be `db/migrations/<next-timestamp>_block8_wo_vmrs.sql`)

```sql
-- Block 8 — VMRS repair coding + the repair "3 Cs" on the work order. Additive, idempotent, nullable.
-- No backfill. New columns inherit maintenance.work_orders' existing grants to ih35_app (schema-wide
-- GRANT ... ON ALL TABLES IN SCHEMA maintenance TO ih35_app), so no new GRANT is required. Row-level
-- audit is captured by the existing maintenance.work_orders audit trigger (drift-capture automatic).
-- Reversible: every column is additive/nullable. Entity scoping is unchanged (rows already carry
-- operating_company_id; these are per-WO attributes, no RLS change).
BEGIN;

ALTER TABLE maintenance.work_orders
  -- VMRS three-level coding (text codes; the catalog/validation picker is a later UI-only layer).
  ADD COLUMN IF NOT EXISTS vmrs_system_code    text NULL,
  ADD COLUMN IF NOT EXISTS vmrs_assembly_code  text NULL,
  ADD COLUMN IF NOT EXISTS vmrs_component_code text NULL,
  -- Repair narrative — the "3 Cs".
  ADD COLUMN IF NOT EXISTS repair_complaint    text NULL,
  ADD COLUMN IF NOT EXISTS repair_cause        text NULL,
  ADD COLUMN IF NOT EXISTS repair_correction   text NULL;

COMMIT;
```

### Notes for review
- **Idempotent:** `ADD COLUMN IF NOT EXISTS` → safe to re-run.
- **Grants:** inherit the table's schema-wide grant to `ih35_app` (verified present). No `ih35_app` 500 risk.
- **Naming:** `repair_complaint/cause/correction` avoids colliding with the existing unrelated `complaint_type`.
  VMRS codes are stored as free text now; a VMRS code **picker/validation** is a later UI layer (no schema
  change) — same staging as the parts catalog (gap 4).
- **Per-entity-safe:** per-WO attributes; no `operating_company_id`/RLS interaction.
- **Number:** repo uses timestamp filenames (latest `202606211400_…`); re-checked vs `origin/main` max at push.

### After approval — the wiring (held until this merges)
Add a **VMRS Repair Detail** section to `CreateWorkOrderModal` (3 VMRS code fields + complaint/cause/correction
textareas), extend the `createWorkOrder` body + the WO create/update services + the detail read, and round-trip
on Edit. Additive; §7 navy; "+ Create" vocab.
