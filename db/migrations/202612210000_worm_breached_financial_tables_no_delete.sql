-- ACCT-F138 — WORM: the three financial tables with CONFIRMED live row loss.
--
-- Prod evidence 2026-08-06 (pg_stat_user_tables, RLS-bypassed, n_live_tup / n_tup_del):
--     accounting.bills                            16,250 / 28
--     banking.bank_transactions                   11,064 / 46
--     driver_finance.driver_settlement_deductions      0 / 14
--
-- These are not hypothetical exposure — 88 financial rows are already gone from these three tables,
-- on top of the 44 lost from accounting.bill_lines (ACCT-F137) and the 7 from
-- driver_finance.driver_settlements (ACCT-F130). accounting.bills is the AP document header and
-- banking.bank_transactions is bank-reconciliation evidence; a deleted row in either is a hole an
-- auditor cannot see, because nothing records that the row ever existed.
--
-- Scoped to the application role ONLY. A trigger that refuses every caller breaks integration-test
-- teardown, and a WORM control that makes the suite red gets weakened within a week. What must be
-- impossible is a DELETE issued by the running application.
--
-- No soft-delete columns are added. All three already carry the right void/soft-delete column where
-- one belongs (bills.voided_at, bank_transactions.voided_at); correction is voiding the document,
-- never erasing the row.
--
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS + to_regclass guard.

CREATE OR REPLACE FUNCTION accounting.refuse_financial_row_delete()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_user <> 'ih35_app' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION
    '%.% is WORM: DELETE is refused by the application role. Financial rows are never deleted — void or reverse the document instead.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $fn$;

DO $$
DECLARE
  t text;
  sch text;
  tbl text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounting.bills',
    'banking.bank_transactions',
    'driver_finance.driver_settlement_deductions'
  ] LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE NOTICE 'ACCT-F138: % absent — skipped', t;
      CONTINUE;
    END IF;
    sch := split_part(t, '.', 1);
    tbl := split_part(t, '.', 2);

    EXECUTE format('DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON %s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete()',
      t
    );
    EXECUTE format('REVOKE DELETE ON %s FROM ih35_app', t);

    RAISE NOTICE 'ACCT-F138: % is now WORM (trigger + REVOKE DELETE)', t;
  END LOOP;
END
$$;
