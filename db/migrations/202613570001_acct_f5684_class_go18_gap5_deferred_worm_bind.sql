-- ACCT-F5684-class deferred WORM bind — completes 202609022351's job on a fresh-DB CI replay.
--
-- 202609022351 (go18_gap5_worm_expenses_factoring_advances) is numerically BEHIND its own
-- dependency, 202612220000 (ACCT-F141, defines accounting.refuse_financial_row_delete()) -- on
-- PROD it applied incrementally AFTER 202612220000 already existed (fine), but a fresh
-- sequential replay always reaches 202609022351 first and the function is not there yet.
-- 202609022351 now fails SOFT in that case (checksum-overridden; see
-- scripts/lib/migration-checksum-overrides.json) instead of RAISE EXCEPTION. This migration is
-- the deferred completion: by the time it runs (numbered after 202612220000), the function is
-- guaranteed to exist, so it idempotently attaches the two trg_worm_refuse_delete triggers if
-- 202609022351 skipped them. On PROD both triggers are already live (verified), so this is a
-- pure no-op there.
--
-- Same precedent as ACCT-F5685 (202612880000_acct_f5685_usmca_fixed_asset_coa_roles_deferred_bind.sql).
--
-- Also completes 202609022351's paired COMMENT ON COLUMN for bills.driver_id <-> expenses.driver_uuid
-- -- accounting.bills.driver_id is itself only added by the later-numbered
-- 202613360001_go18_bill_driver_trailer_load_required.sql, a second instance of the same
-- fresh-replay ordering bug. By this migration's numeric position both columns are guaranteed to
-- exist, so the comments are set unconditionally (idempotent -- COMMENT ON COLUMN always replaces).
--
-- CANONICAL-CHECK: no new money concept, no new table, no duplicate ledger -- reuses
-- accounting.refuse_financial_row_delete() verbatim, same as 202609022351 intended.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('accounting.refuse_financial_row_delete()') IS NULL THEN
    RAISE EXCEPTION
      'ACCT-F5684-CLASS: accounting.refuse_financial_row_delete() still absent at 202613570001 -- ACCT-F141 (202612220000) must exist by now in any correct migration chain';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'accounting' AND c.relname = 'expenses' AND c.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'accounting' AND c.relname = 'expenses'
       AND t.tgname = 'trg_worm_refuse_delete' AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.expenses
      FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
    RAISE NOTICE 'ACCT-F5684-CLASS: deferred WORM delete-refusal trigger attached to accounting.expenses';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'accounting' AND c.relname = 'factoring_advances' AND c.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'accounting' AND c.relname = 'factoring_advances'
       AND t.tgname = 'trg_worm_refuse_delete' AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.factoring_advances
      FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
    RAISE NOTICE 'ACCT-F5684-CLASS: deferred WORM delete-refusal trigger attached to accounting.factoring_advances';
  END IF;
END
$$;

COMMENT ON COLUMN accounting.bills.driver_id IS
  'Driver FK twin of accounting.expenses.driver_uuid. Same hub, two names — historical only. Do not rename; expenses side keeps driver_uuid this pass (owner 2026-09-02 comments-only).';

COMMENT ON COLUMN accounting.expenses.driver_uuid IS
  'Driver FK twin of accounting.bills.driver_id. Naming differs for historical reasons only. Owner 2026-09-02: leave column name; do not rename in this pass.';

COMMIT;
