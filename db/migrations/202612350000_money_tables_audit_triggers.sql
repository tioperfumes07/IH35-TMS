-- ACCT-F178 — the ledger header is audited; the debits and credits are not. Attach the WORM trigger
-- to the money-of-record tables.
--
-- MEASURED ON PROD br-fancy-credit-akjnd07a 2026-08-07 (RLS-bypassed, RESET ROLE as its own statement,
-- from pg_trigger / pg_proc / pg_stat_all_tables):
--
--   accounting.journal_entries        (the HEADER)   -> HAS an audit trigger
--   accounting.journal_entry_postings (every debit,
--     credit, account and amount, 3,647 rows)        -> ZERO audit triggers
--
-- An entry's existence is audited; its money is not. A posting's amount or account can be altered with
-- no `audit.row_changes` record at all, while the header's audit row reads as though nothing changed.
-- For a double-entry system that is the wrong half to protect.
--
-- ★ THE GAP IS NOT THEORETICAL — IT HAS ALREADY LOST HISTORY, and this is the fact that decided the
-- scope below. pg_stat_all_tables reports `driver_finance.driver_settlement_deductions` n_tup_del = 14
-- and `driver_finance.driver_settlements` n_tup_del = 7: twenty-one driver-pay records were HARD
-- DELETED. `audit.row_changes` contains exactly 27 DELETE rows in total and every one of them is
-- `mdata.*` or `maintenance.*` — load_stops 10, units 6, loads 5, drivers 4, work_orders 2. Not one is
-- from driver_finance. The audit trail does not know those 21 records ever existed. For a carrier in
-- Chapter 11 with live litigation, driver-pay records vanishing without trace is the exact evidence an
-- auditor, a lender or a court would ask for and we could not produce.
--
-- WHAT THIS ATTACHES: every table in accounting / driver_finance / banking / factoring carrying a
-- money column (amount_cents, total_cents, balance_cents, debit_or_credit), selected by PREDICATE
-- rather than by a hand-written list — see the note above the DO block for why that distinction cost
-- me a draft. That is the ledger lines, the cash in and out, driver pay and escrow, factoring
-- movements, loan payments and the money lines behind every document.
--
-- WHAT IT DELIBERATELY DOES NOT ATTACH, stated rather than left implicit:
--   * `accounting.ap_import_preview_lines` and `accounting.ob_register_staging_lines` — pre-commit
--     scratch, discarded by design. Auditing a draft is not evidence of anything.
-- That is the WHOLE exclusion list. A long one would mean the rule is wrong.
--
-- CONSIDERED AND LEFT OUT BY THE PREDICATE ITSELF, named so the next reader knows they were not
-- missed: `posting_batches` and `transaction_source_links` carry no money column — they are derived
-- linkage written BY the poster and never edited by a user, and they are covered by the postings they
-- point at. The `accounting.qbo_*` mirrors likewise carry no money column under these names, so they
-- fall outside the predicate without needing an exclusion; auditing a mirror would record
-- QuickBooks' history rather than ours.
--
-- IDEMPOTENT: every trigger is created only when absent, so a re-run is a no-op and this can be
-- replayed on a branch or a fresh database safely. It reuses the EXISTING `audit.tg_audit_row` — no new
-- audit logic is written here, and ACCT-F177's actor fix applies to these tables automatically because
-- they share that one function.

BEGIN;

-- Driven by the SAME PREDICATE the guard uses (money column present, in a money schema, minus a short
-- stated exclusion list) rather than a hand-written table list.
--
-- THIS IS NOT A STYLE CHOICE — MY FIRST DRAFT WAS A HAND LIST OF 17 TABLES AND IT WAS WRONG. Running
-- the ratcheting db-test against a fork with that migration applied showed SIXTEEN money-bearing
-- tables still unaudited: civil_fine_postings, escrow_postings, parts_purchase_postings,
-- warranty_reimburse_postings, insurance_claim_recovery_postings, factoring_reserve_movements,
-- factoring.reserve_movement, cash_flow_adjustments, prepaid_amortization_rows,
-- equipment_loan_payments, equipment_loan_attributions, driver_deduction_bucket_events,
-- driver_reimbursements, settlement_contract_lines and the two staging tables. Every one of the first
-- fourteen is money of record. A hand list encodes what the author happened to think of; a predicate
-- encodes the rule, and a table added next month is covered without anyone remembering.
DO $$
DECLARE
  r record;
  v_excluded text[] := ARRAY[
    -- PRE-COMMIT SCRATCH, discarded by design. Auditing a draft is not evidence of anything.
    'accounting.ap_import_preview_lines',
    'accounting.ob_register_staging_lines'
  ];
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND n.nspname IN ('accounting', 'driver_finance', 'banking', 'factoring')
       AND EXISTS (
         SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = c.oid AND NOT a.attisdropped
            AND a.attname IN ('amount_cents', 'total_cents', 'balance_cents', 'debit_or_credit')
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
    -- Trigger name is derived from the table, so a re-run finds the existing trigger via the NOT
    -- EXISTS above and this loop body simply never executes for it. Idempotent by construction.
    EXECUTE format(
      'CREATE TRIGGER tg_audit_row_%s AFTER INSERT OR UPDATE OR DELETE ON %I.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row()',
      r.table_name, r.schema_name, r.table_name
    );
    RAISE NOTICE 'ACCT-F178: audit trigger attached to %.%', r.schema_name, r.table_name;
  END LOOP;
END
$$;

COMMIT;
