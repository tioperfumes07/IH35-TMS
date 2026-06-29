-- ============================================================================
-- Tier-1 reconciliation (BUILD-AND-HOLD — do NOT apply without Jorge's OK / §1.4)
-- ----------------------------------------------------------------------------
-- PROD DRIFT (GUARD-verified): accounting.invoices has column `factoring_advance_id`
-- but is MISSING the foreign key `fk_invoices_factoring_advance`. Migration 0061
-- (0061_p3_t11_20_5_factoring_tracking.sql) declares it and a fresh-migrated DB (CI)
-- HAS it — prod alone drifted (its 0061 apply did not leave the FK in place).
--
-- This migration idempotently RE-ADDS exactly the 0061 constraint (same name, same
-- ON DELETE SET NULL). On a fresh DB it no-ops (the FK already exists); on prod it
-- restores the FK.
--
-- PRECONDITION — RUN FIRST, do NOT skip:
--   node scripts/check-orphan-factoring-advance-ids.mjs --database-url=<target>
-- ADD CONSTRAINT FAILS if any invoices.factoring_advance_id has no matching
-- accounting.factoring_advances row. This migration does NOT null-out orphans —
-- modifying financial data is Jorge's decision, not an automatic side effect. If the
-- orphan-check is non-zero, STOP and reconcile the data before applying.
--
-- BUILD-AND-HOLD: financial-cluster migration. Never self-merge / self-apply. Jorge
-- labels after GUARD verifies the orphan-check is clean on prod.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('accounting.invoices') IS NOT NULL
     AND to_regclass('accounting.factoring_advances') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM information_schema.table_constraints
       WHERE constraint_schema = 'accounting'
         AND table_name = 'invoices'
         AND constraint_name = 'fk_invoices_factoring_advance'
     )
  THEN
    ALTER TABLE accounting.invoices
      ADD CONSTRAINT fk_invoices_factoring_advance
      FOREIGN KEY (factoring_advance_id)
      REFERENCES accounting.factoring_advances (id)
      ON DELETE SET NULL;
    RAISE NOTICE 'fk_invoices_factoring_advance restored on accounting.invoices';
  ELSE
    RAISE NOTICE 'fk_invoices_factoring_advance already present (or tables absent) — no-op';
  END IF;
END $$;
