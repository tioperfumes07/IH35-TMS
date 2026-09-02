-- GO-18 Gap 5 (corrected) — WORM delete refusal on the two display-id MAX+1 tables
-- that were live-missing the trigger the other five already carry.
--
-- Live (Neon, SET LOCAL app.bypass_rls = 'lucia', 2026-09-02):
--   trg_worm_refuse_delete → accounting.refuse_financial_row_delete() EXISTS on
--     bills · credit_memos · invoices · payments · vendor_credits
--   MISSING on exactly:
--     accounting.expenses
--     accounting.factoring_advances
--
-- Those two are among the 7 tables apps/backend/src/accounting/display-id.ts MAX(...)+1
-- generators read. MAX+1 is CORRECT under never-delete — do NOT change display-id.ts.
-- One hard DELETE from either table silently frees a document number for reuse on live money.
--
-- Law: a DB constraint beats a guard. Reuse refuse_financial_row_delete verbatim —
-- a second function is a second behavior waiting to diverge. Idempotent, CREATE-only, never DROP.
-- Pattern copied from 202612791800_worm_attach_vendor_payment_methods.sql.
--
-- Also: paired COMMENT ON COLUMN for bills.driver_id ↔ expenses.driver_uuid
-- (owner call 2026-09-02: comments only this pass — do NOT rename).

-- CANONICAL-CHECK: money-event WORM attach; no new money concept; no duplicate ledger.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('accounting.refuse_financial_row_delete()') IS NULL THEN
    RAISE EXCEPTION
      'GO18-GAP5: accounting.refuse_financial_row_delete() absent — ACCT-F141 (202612220000) must be applied first';
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
    RAISE NOTICE 'GO18-GAP5: WORM delete-refusal trigger attached to accounting.expenses';
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
    RAISE NOTICE 'GO18-GAP5: WORM delete-refusal trigger attached to accounting.factoring_advances';
  END IF;
END
$$;

COMMENT ON COLUMN accounting.bills.driver_id IS
  'Driver FK twin of accounting.expenses.driver_uuid. Same hub, two names — historical only. Do not rename; expenses side keeps driver_uuid this pass (owner 2026-09-02 comments-only).';

COMMENT ON COLUMN accounting.expenses.driver_uuid IS
  'Driver FK twin of accounting.bills.driver_id. Naming differs for historical reasons only. Owner 2026-09-02: leave column name; do not rename in this pass.';

COMMIT;
