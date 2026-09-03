-- 202613612300_company_settlements_worm.sql
--
-- WORM (void-not-delete) on the two company-settlement document tables that
-- 202613560001 created without trg_worm_refuse_delete. verify-worm-coverage-ratchet
-- went 91 -> 93 unprotected; those two tables are the entire delta.
--
-- Same trigger + function as ACCT-F141 / 202613570001:
--   trg_worm_refuse_delete -> accounting.refuse_financial_row_delete()
-- CREATE-only, idempotent. Never DROP. Never DELETE rows.
--
-- CANONICAL-CHECK: no new money concept — binds existing tables.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('accounting.refuse_financial_row_delete()') IS NULL THEN
    RAISE EXCEPTION
      '202613612300: accounting.refuse_financial_row_delete() absent — ACCT-F141 (202612220000) must exist first';
  END IF;

  IF to_regclass('accounting.company_settlements') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'accounting' AND c.relname = 'company_settlements'
          AND t.tgname = 'trg_worm_refuse_delete' AND NOT t.tgisinternal
     ) THEN
    CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.company_settlements
      FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
  END IF;

  IF to_regclass('accounting.company_settlement_driver_settlements') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'accounting' AND c.relname = 'company_settlement_driver_settlements'
          AND t.tgname = 'trg_worm_refuse_delete' AND NOT t.tgisinternal
     ) THEN
    CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.company_settlement_driver_settlements
      FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
  END IF;

  IF to_regclass('accounting.company_settlements') IS NOT NULL THEN
    REVOKE DELETE ON accounting.company_settlements FROM ih35_app;
  END IF;
  IF to_regclass('accounting.company_settlement_driver_settlements') IS NOT NULL THEN
    REVOKE DELETE ON accounting.company_settlement_driver_settlements FROM ih35_app;
  END IF;
END
$$;

COMMIT;
