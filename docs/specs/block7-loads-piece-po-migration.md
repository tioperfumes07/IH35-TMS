# Block 7 — `mdata.loads` piece_count + customer_po_number (MIGRATION SQL FOR REVIEW)

**Status:** PROPOSED SQL — **DO NOT RUN / DO NOT MERGE** until Jorge + GUARD approve.
**Date:** 2026-06-22
**Why:** Block 7 wants `piece_count` and `customer_po_number` to round-trip in the load wizard, but neither
column exists on `mdata.loads` (confirmed: no `piece*`/`po_number`/`purchase_order` column in any migration).
Adding columns to `mdata.*` is a §1.3 / §2 gated change → SQL is shown here first; the other 4 Block-7 fields
(`commodity`, `trip_type`, `reefer_setpoint`, `cargo_weight_lbs`) already have columns and are wired without a
migration in a separate PR.

## Proposed migration (file would be `db/migrations/<next-timestamp>_block7_loads_piece_po.sql`)

```sql
-- Block 7 — persist load piece count + customer PO number so they round-trip in the Edit wizard.
-- Additive, idempotent, nullable. No data backfill. New columns inherit mdata.loads' existing grants
-- to ih35_app (schema-wide `GRANT ... ON ALL TABLES IN SCHEMA mdata TO ih35_app` + the table grant), so
-- no new GRANT is required — column adds on an existing granted table do not need re-granting. Row-level
-- audit is captured by the existing mdata.loads audit trigger (drift-capture automatic for new columns).
-- Reversible: both columns are additive/nullable.
BEGIN;

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS piece_count        integer NULL,
  ADD COLUMN IF NOT EXISTS customer_po_number text    NULL;

-- Guard rails (cheap, idempotent): piece_count is a non-negative count when present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loads_piece_count_nonneg'
  ) THEN
    ALTER TABLE mdata.loads
      ADD CONSTRAINT loads_piece_count_nonneg
      CHECK (piece_count IS NULL OR piece_count >= 0) NOT VALID;
  END IF;
END $$;

COMMIT;
```

### Notes for review
- **Idempotent:** `ADD COLUMN IF NOT EXISTS` + a `pg_constraint` existence guard → safe to re-run.
- **Grants:** new columns inherit `mdata.loads`' table grants to `ih35_app`; verified the schema-wide grant
  exists. No `ih35_app` 500 risk. (If you want it belt-and-suspenders, I can append an explicit
  `GRANT SELECT, INSERT, UPDATE ON mdata.loads TO ih35_app;` — redundant but harmless.)
- **Per-entity-safe:** these are per-load attributes, not entity-partitioned; no `operating_company_id`
  interaction, no RLS change.
- **`NOT VALID` check:** avoids a full-table validation lock on add; existing NULLs are fine. Can be
  `VALIDATE CONSTRAINT` later if desired.
- **Migration number:** the repo uses timestamp filenames (latest is `202606211400_…`); the real number is
  re-checked against `origin/main`'s max at push time per §2.

### After approval — the wiring (held until migration merges)
`piece_count` → wizard `pieces`; `customer_po_number` → wizard `customer_po_number`. Wire into create INSERT
+ detail GET + PATCH + `editLoadMapping` (prefill + dirtyFields-gated patch), same pattern as the 4
no-migration fields. **Hazmat stays OUT (§4 ruling 2026-06-22).**
