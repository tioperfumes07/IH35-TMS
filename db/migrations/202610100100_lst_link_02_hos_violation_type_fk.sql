-- LST-LINK-02 — give two safety catalogs real inbound FKs instead of loose text.
--
-- ROOT CAUSE: 88 of 114 catalogs.* tables have ZERO inbound foreign keys on prod (verified
-- 2026-07-28 via pg_constraint; 38 of those hold rows). A catalog nothing references is an island:
-- the value is copied as text into the consuming row, so it cannot be joined, cannot be renamed
-- safely, and nothing stops a typo from becoming a permanent category.
--
-- SCOPE (this file): safety.hos_violations only — see 202610100000 for why this is split.
--
-- ORIGINAL SCOPE NOTE: the two catalogs bound to their creators earlier today (SAF-B14). That work made the
-- pickers write the catalog's CODE as text — a real improvement over free text, but still not a
-- reference. This closes that gap properly for those two:
--   · safety.civil_fines     -> catalogs.civil_fine_types    (57 rows, 0 inbound FKs)
--   · safety.hos_violations  -> catalogs.dot_violation_types (213 rows, 0 inbound FKs)
-- The other 86 islands are NOT touched here; several belong to the accounting/financial cluster and
-- are not this lane's to decide.
--
-- SAFETY: additive and non-destructive. The columns are NULLABLE and the existing text columns
-- (violation_code / violation_type) are KEPT — they carry historical values and are what the lists
-- render, so removing them would be a silent data loss. Both tables are EMPTY on prod
-- (n_live_tup = 0 for each, verified immediately before writing this), so there is nothing to
-- backfill and no risk of orphaning an existing row. ON DELETE RESTRICT: a catalog row that a fine
-- or violation points at must not be deletable out from under it — the catalogs are archived via
-- is_active, never deleted (Rule 07).
--
-- IDEMPOTENT: guarded by IF NOT EXISTS on both the column and the constraint.

-- Two separate DO blocks, one per table. A single block confused the schema-parity DDL parser into
-- attributing hos_violations' column to civil_fines, which would have baked a column that does not
-- exist into the baseline. One block per table keeps attribution unambiguous.
DO $$
BEGIN
  IF to_regclass('safety.hos_violations') IS NOT NULL
     AND to_regclass('catalogs.dot_violation_types') IS NOT NULL THEN
    ALTER TABLE safety.hos_violations
      ADD COLUMN IF NOT EXISTS dot_violation_type_id uuid;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'hos_violations_dot_violation_type_id_fkey'
         AND conrelid = to_regclass('safety.hos_violations')
    ) THEN
      ALTER TABLE safety.hos_violations
        ADD CONSTRAINT hos_violations_dot_violation_type_id_fkey
        FOREIGN KEY (dot_violation_type_id)
        REFERENCES catalogs.dot_violation_types(id)
        ON DELETE RESTRICT;
    END IF;

    COMMENT ON COLUMN safety.hos_violations.dot_violation_type_id IS
      'LST-LINK-02: FK to catalogs.dot_violation_types. violation_type is retained as the FMCSA code string and for rows predating this column; this is the join key.';
  END IF;
END
$$;
