-- 202615350100_no_row_escapes_its_company.sql
-- CC-1 · Lead 10-03 "THE ORPHANS ARE NOT FIXED, THEY ARE INVISIBLE" + "THE 534 ARE DEADLOCKED BY THE DERIVE TRIGGER".
--
-- MEASURED ON PROD 2026-10-03, NO company filter, under the bypass:
--   accounting.expense_lines     35,048 rows   506 operating_company_id NULL — all 506 also expense_id NULL (no parent),
--                                              expense_account_uuid on 506/506, resolving to exactly ONE company (USMCA)
--   accounting.bill_lines       155,392 rows    28 NULL — all 28 voided, each naming a bill that no longer exists
--   dispatch.load_charge_lines      284 rows   136 NULL — each naming a load that no longer exists (132 loads)
--     (CC-3 asked: re-measured under a verified bypass — 284 rows / 136 NULL is the true reading)
-- A NULL company hides a row from every company-scoped query, guard, trial balance and the purge, and disarms every
-- MATCH SIMPLE composite same-entity FK on that row (a NULL in any key column skips the check).
--
-- (The derive-trigger repair the Lead first ordered was WITHDRAWN in ROUND 359: these rows are purge population.)
--
-- ROUND 359 (Lead, owner "MAKE SURE THE COMPANY IS NOT NULL"): the 670 company-less rows are NOT stamped or repaired —
-- never repair a row about to be deleted. The zero-reset collects them (#24513) and proves zero left. This migration
-- arms everything that is already clean and closes the three dirty tables to NEW rows:
--   (3) SET NOT NULL operating_company_id on every company-owned table that is nullable and carries zero company-less
--       rows today — settlement_lines (the Settlement Creator path), credit_memo_applications, the three factoring tables,
--       unit_border_crossings, accident_reports, work_orders, intransit_issues. One SET NOT NULL arms every MATCH SIMPLE
--       composite same-entity FK on the table.
--   (4) bill_lines / load_charge_lines: CHECK (operating_company_id IS NOT NULL) NOT VALID, and the missing single-column
--       FKs bill_lines.bill_id -> bills(id) and load_charge_lines.load_id -> mdata.loads(id), NOT VALID — enforced on every
--       new write; the dangling rows are what NOT VALID tolerates until the purge removes them.
--   (5) expense_lines: CHECK company NOT NULL and CHECK expense_id NOT NULL, NOT VALID — no company-less or parentless
--       line can be written again by any path.
-- AFTER the owner's APPLY empties them: SET NOT NULL on expense_lines / bill_lines / load_charge_lines and VALIDATE the
-- NOT VALID constraints — a follow-up migration, claimed then.
-- Guard: scripts/verify-no-row-escapes-its-company.mjs (verify-step 12341), run UNSCOPED.
BEGIN;
SET LOCAL lock_timeout = '15s';
SELECT set_config('app.bypass_rls', 'lucia', true);

-- (3) NOT NULL wherever a company-owned table is clean
DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'driver_finance.settlement_lines', 'accounting.credit_memo_applications',
    'accounting.factoring_lifecycle_posting_keys', 'accounting.factoring_default_interest_accruals',
    'accounting.factoring_reserve_movements', 'mdata.unit_border_crossings', 'safety.accident_reports',
    'maintenance.work_orders', 'dispatch.intransit_issues'
  ] LOOP
    IF to_regclass(t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT count(*) FROM %s WHERE operating_company_id IS NULL', t) INTO n;
    IF n <> 0 THEN
      RAISE EXCEPTION '202615350100: % still has % row(s) with no company — refusing to arm NOT NULL on a guess', t, n;
    END IF;
    EXECUTE format('ALTER TABLE %s ALTER COLUMN operating_company_id SET NOT NULL', t);
  END LOOP;
END $$;

-- (4) bill_lines / load_charge_lines: closed for new rows; the dangling rows wait for the purge
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bill_lines_company_required' AND conrelid = 'accounting.bill_lines'::regclass) THEN
    ALTER TABLE accounting.bill_lines ADD CONSTRAINT bill_lines_company_required CHECK (operating_company_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bill_lines_bill_id_fkey' AND conrelid = 'accounting.bill_lines'::regclass) THEN
    ALTER TABLE accounting.bill_lines ADD CONSTRAINT bill_lines_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES accounting.bills (id) NOT VALID;
  END IF;
  IF to_regclass('dispatch.load_charge_lines') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'load_charge_lines_company_required' AND conrelid = 'dispatch.load_charge_lines'::regclass) THEN
      ALTER TABLE dispatch.load_charge_lines ADD CONSTRAINT load_charge_lines_company_required CHECK (operating_company_id IS NOT NULL) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'load_charge_lines_load_id_fkey' AND conrelid = 'dispatch.load_charge_lines'::regclass) THEN
      ALTER TABLE dispatch.load_charge_lines ADD CONSTRAINT load_charge_lines_load_id_fkey FOREIGN KEY (load_id) REFERENCES mdata.loads (id) NOT VALID;
    END IF;
  END IF;
END $$;

-- (5) no parentless / company-less expense line, ever again (expense_lines_company_required already exists on prod;
--     declared here too so a fresh database carries it)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_lines_company_required' AND conrelid = 'accounting.expense_lines'::regclass) THEN
    ALTER TABLE accounting.expense_lines ADD CONSTRAINT expense_lines_company_required CHECK (operating_company_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_lines_parent_required' AND conrelid = 'accounting.expense_lines'::regclass) THEN
    ALTER TABLE accounting.expense_lines ADD CONSTRAINT expense_lines_parent_required CHECK (expense_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

COMMIT;
