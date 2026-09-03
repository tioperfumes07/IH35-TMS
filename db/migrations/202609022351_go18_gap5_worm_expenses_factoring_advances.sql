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

-- ACCT-F5684-CLASS FIX (2026-09-03): this filename is numerically BEHIND 202612220000
-- (ACCT-F141, which defines refuse_financial_row_delete()) even though on PROD it applied
-- AFTER it (incremental apply order != filename order once a low-numbered file merges late).
-- A fresh CI replay applies strictly in filename order and always hits this file first, so the
-- original RAISE EXCEPTION here unconditionally aborted every fresh-DB migration run -- the
-- exact "Never RAISE on absent runtime/synced data" landmine the migration-authoring skill warns
-- about. Fixed the same way ACCT-F5684/5685 fixed the identical class of bug for
-- 202608180900/chart_of_accounts_roles: fail SOFT here (skip, don't abort) when the function
-- isn't there yet; a later, idempotent deferred-bind migration
-- (202613570001_acct_f5684_class_go18_gap5_deferred_worm_bind.sql) completes the two triggers
-- once the function is guaranteed to exist. Checksum-overridden in
-- scripts/lib/migration-checksum-overrides.json — this content differs from what's recorded as
-- applied on prod, but prod already has both triggers live (verified), so this file is a no-op
-- there either way.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('accounting.refuse_financial_row_delete()') IS NULL THEN
    RAISE NOTICE
      'GO18-GAP5: accounting.refuse_financial_row_delete() not yet present (ACCT-F141 / 202612220000 applies later in this run) — skipping trigger attach here; 202613570001 completes it once the function exists.';
    RETURN;
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

-- accounting.bills.driver_id doesn't exist yet at this filename's numeric position either (it's
-- added by the later-numbered 202613360001_go18_bill_driver_trailer_load_required.sql) -- same
-- fresh-replay ordering class as the trigger fix above. Comment only when both columns already
-- exist; 202613570001 sets both unconditionally once they're guaranteed to.
DO $$
BEGIN
  IF to_regprocedure('accounting.refuse_financial_row_delete()') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'accounting' AND table_name = 'bills' AND column_name = 'driver_id'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN accounting.bills.driver_id IS ' || quote_literal(
      'Driver FK twin of accounting.expenses.driver_uuid. Same hub, two names — historical only. Do not rename; expenses side keeps driver_uuid this pass (owner 2026-09-02 comments-only).'
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'accounting' AND table_name = 'expenses' AND column_name = 'driver_uuid'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN accounting.expenses.driver_uuid IS ' || quote_literal(
      'Driver FK twin of accounting.bills.driver_id. Naming differs for historical reasons only. Owner 2026-09-02: leave column name; do not rename in this pass.'
    );
  END IF;
END
$$;

COMMIT;
