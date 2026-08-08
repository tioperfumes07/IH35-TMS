-- ACCT-F261 — 24 money tables have no audit trigger, because the detector that attaches them matches
-- column names by EXACT SPELLING. Board card: `accounting.expenses` has no audit trigger and no actor.
--
-- The card is right and understates it. ACCT-F178 (202612350000) attaches audit.tg_audit_row to every
-- table in accounting/driver_finance/banking/factoring carrying a money column — but it identifies a
-- money column as:
--
--     a.attname IN ('amount_cents', 'total_cents', 'balance_cents', 'debit_or_credit')
--
-- Exact equality. `accounting.expenses` spells its amount `total_amount_cents`, so a 27,082-row money
-- table was skipped on a spelling. Measured live on prod br-fancy-credit-akjnd07a 2026-08-08, the same
-- miss covers 24 tables, and the ones that already hold data are not peripheral:
--
--     accounting.expenses                     27,082 rows   total_amount_cents
--     accounting.invoice_lines                21,233 rows   unit_amount_cents, line_total_cents
--     banking.bank_accounts                       17 rows   current_balance_cents, available_balance_cents
--     accounting.depreciation_schedule_rows       13 rows   depreciation_amount_cents, ...
--     driver_finance.driver_bills                  6 rows   gross_amount_cents  (driver payables)
--     banking.reconciliation_sessions               2 rows   statement_balance_cents, variance_cents, ...
--     accounting.prepaid_assets                     2 rows   total_amount_cents, period_amount_cents
--
-- THE AUDIT SURFACE IS INCOHERENT IN BOTH DIRECTIONS, which is the part that makes this more than a
-- gap: `accounting.expenses` is unaudited while its child `expense_lines` IS audited, and
-- `accounting.invoices` is audited while its child `invoice_lines` IS NOT. Change an expense header's
-- vendor, amount, load link or account and nothing records it; change a line and it is captured. An
-- audit trail that covers the parent or the child depending on the table cannot answer "what changed
-- on this document", which is the only question it exists to answer.
--
-- THIS IS THE SAME ANTI-PATTERN AS ACCT-F259, ONE LAYER OVER. There I fixed a hard-coded noise-key list
-- that was 0.8% effective because `mdata.vendors` spells its sync stamp `qbo_synced_at` rather than
-- `last_qbo_synced_at`. Same shape here: a literal name list used as a semantic detector is correct
-- only for the spellings its author happened to see. So this migration matches the PATTERN
--
--     attname ~ '(amount|total|balance)_cents$'   OR   attname = 'debit_or_credit'
--
-- which covers total_amount_cents, gross_amount_cents, line_total_cents, current_balance_cents and any
-- future compound spelling, without matching unrelated integer columns.
--
-- THE EXISTING EXCLUSIONS ARE PRESERVED DELIBERATELY. ap_import_preview_lines and
-- ob_register_staging_lines are PRE-COMMIT SCRATCH — ACCT-F178 excluded them because auditing a draft
-- is not evidence of anything, and that reasoning is untouched by a wider detector. Both surfaced in my
-- measurement and both stay excluded.
--
-- SAFE ON VOLUME BECAUSE ACCT-F255/F259 LANDED FIRST. Attaching triggers to 22 tables would historically
-- have meant a flood of touch-write audit rows; the no-op UPDATE guard now skips any UPDATE where the
-- document is unchanged once sync stamps are removed. The ordering matters and it is not accidental.
--
-- Additive and idempotent: the NOT EXISTS below means a re-run attaches nothing, and the trigger name is
-- derived from the table so it cannot collide.

DO $$
DECLARE
  r record;
  v_excluded text[] := ARRAY[
    -- PRE-COMMIT SCRATCH, discarded by design. Carried forward verbatim from ACCT-F178.
    'accounting.ap_import_preview_lines',
    'accounting.ob_register_staging_lines'
  ];
  v_count int := 0;
BEGIN
  IF to_regprocedure('audit.tg_audit_row()') IS NULL THEN
    RAISE EXCEPTION 'ACCT-F261: audit.tg_audit_row() is absent — ACCT-F178 (202612350000) must be applied first';
  END IF;

  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND n.nspname IN ('accounting', 'driver_finance', 'banking', 'factoring')
       AND EXISTS (
         SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = c.oid AND NOT a.attisdropped
            AND (a.attname ~ '(amount|total|balance)_cents$' OR a.attname = 'debit_or_credit')
       )
       AND (n.nspname || '.' || c.relname) <> ALL (v_excluded)
       AND NOT EXISTS (
         SELECT 1
           FROM pg_trigger t
           JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE t.tgrelid = c.oid AND p.proname = 'tg_audit_row' AND NOT t.tgisinternal
       )
     ORDER BY 1, 2
  LOOP
    EXECUTE format(
      'CREATE TRIGGER tg_audit_row_%s AFTER INSERT OR UPDATE OR DELETE ON %I.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row()',
      r.table_name, r.schema_name, r.table_name
    );
    v_count := v_count + 1;
    RAISE NOTICE 'ACCT-F261: audit trigger attached to %.%', r.schema_name, r.table_name;
  END LOOP;

  RAISE NOTICE 'ACCT-F261: % money table(s) newly audited', v_count;
END
$$;
