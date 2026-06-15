-- Repair the duplicate-0050 apply-order collision (safety.fines -> civil_fines rename).
--
-- Two migrations share the number 0050:
--   0050_safety_gaps_fill.sql              -> CREATE TABLE safety.fines (+ RLS, grants, indexes)
--   0050_two_section_v5_and_safety_restructure.sql -> guarded ALTER TABLE safety.fines RENAME TO civil_fines
-- On prod, two_section_v5 applied BEFORE safety_gaps_fill, so its guarded rename ran while
-- safety.fines did not yet exist -> the guard was false -> the rename no-op'd, and was never
-- re-run (the migration is already in the ledger). Net prod state (confirmed via the Neon console
-- on br-fancy-credit-akjnd07a): safety.fines EXISTS, safety.civil_fines IS NULL. The application and
-- the verify-canonical-schema-names guard both require safety.civil_fines, so every
-- /api/v1/safety/fines call returns 42P01.
--
-- This forward migration completes the rename idempotently. ALTER ... RENAME preserves the table's
-- RLS policies, grants, indexes, and constraints. It touches ONLY safety.fines -> civil_fines:
--   * No company_violations work — the columns the app uses (violation_severity + existing doc
--     columns) already exist on prod; the no-op'd two_section 'severity'/'evidence_doc_ids' were
--     superseded and are unused by app code (verified; table is empty on prod).
--   * No FK, no catalogs.* dependency -> zero FK-failure risk.
-- Idempotent: no-op if safety.civil_fines already exists (e.g. environments where the original
-- 0050 order applied correctly). No rollback is provided — renaming back to safety.fines would
-- reintroduce the legacy name forbidden by verify-canonical-schema-names.

BEGIN;

DO $$
BEGIN
  IF to_regclass('safety.civil_fines') IS NULL
     AND to_regclass('safety.fines') IS NOT NULL THEN
    ALTER TABLE safety.fines RENAME TO civil_fines;
  END IF;
END
$$;

COMMIT;
