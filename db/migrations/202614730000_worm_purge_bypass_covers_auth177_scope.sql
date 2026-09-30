-- 202614730000_worm_purge_bypass_covers_auth177_scope.sql
--
-- OWNER ORDER, 2026-09-30: delete every voided and every sample record, USMCA only, TRUCKING and
-- TRANSPORTATION untouched. AUTH-177 was opened for it. Production refused:
--
--   accounting.expenses_review_queue is WORM: DELETE is refused for every role.
--
-- accounting.refuse_financial_row_delete() sits on 66 tables. Its AUTH-gated bypass whitelisted 13.
-- One un-whitelisted table FK-locks the entire chain: accounting.expenses_review_queue holds a
-- foreign key into the voided expenses, so even accounting.expenses -- which IS whitelisted --
-- could not be purged. Measured live before writing this file: the purge aborted on that exact
-- constraint, expenses_review_queue_claimed_duplicate_expense_id_fkey.
--
-- WHAT THIS CHANGES: the COVERAGE of the bypass, and nothing else.
-- WHAT THIS DELIBERATELY DOES NOT CHANGE, because widening a control is not the same as gutting it:
--   1. An OPEN AUTH-NNN is still REQUIRED. No auth id, no delete, on every one of the 66 tables,
--      for every role including neondb_owner. That check is untouched.
--   2. A LIVE DOCUMENT STILL CANNOT BE DELETED. Ever. On any table. Under any auth. The bypass
--      applies only to a row that is already voided (voided_at / revoked_at) or already flagged
--      is_sample_data = true. A table added here gains no power to destroy live money.
--   3. Nothing here grants a role anything. The trigger still fires for everyone.
--
-- THE THREE ARMS, and which table belongs to which is decided by what the table actually carries:
--   DETAIL      — no voided_at of its own. It exists only as a child of a document the calling
--                 script has already verified voided. The auth gate alone is sufficient.
--   DOCUMENT    — carries voided_at or revoked_at. voided_at/revoked_at IS NOT NULL is
--                 unconditional. This is the arm that protects live money and it is never relaxed.
--   SAMPLE-ONLY — master data with no voided_at at all, only is_sample_data. Requires
--                 is_sample_data = true, unconditionally. A real customer, vendor, driver, unit or
--                 load can never be deleted through this path no matter what auth is open.
--
-- A table that carries NEITHER a void column NOR is_sample_data is NOT added, on purpose: there
-- would be no property left to check, and an auth id alone is not enough to destroy a row nobody
-- has marked as dead.
--
-- Additive, idempotent, CREATE OR REPLACE only. No table touched, no row read or written, no data
-- deleted by this migration itself.

BEGIN;

CREATE OR REPLACE FUNCTION accounting.refuse_financial_row_delete()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  v_auth_id text;
  v_table   text;
  v_row     jsonb;
BEGIN
  v_auth_id := NULLIF(current_setting('app.purge_auth_id', true), '');
  v_table   := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
  v_row     := to_jsonb(OLD);

  IF v_auth_id ~ '^AUTH-[0-9]+$' THEN

    -- ARM 1 — DETAIL / EVIDENCE: no voided_at of its own; a child of a document the calling script
    -- has already verified voided. The auth gate alone is sufficient.
    IF v_table = ANY (ARRAY[
      'accounting.journal_entry_postings',
      'accounting.expense_lines',
      'accounting.factoring_reserve_movements',
      'accounting.factoring_default_interest_accruals',
      'accounting.factoring_lifecycle_posting_keys',
      'accounting.transaction_source_links',
      'accounting.expenses_review_queue',
      'accounting.payment_applications',
      'accounting.credit_memo_applications',
      'accounting.company_settlement_driver_settlements',
      'accounting.bill_unit_allocation',
      'driver_finance.settlement_line_item_splits',
      'driver_finance.team_settlement_splits',
      'driver_finance.driver_settlement_gl_bills',
      'driver_finance.settlement_payment_events',
      'driver_finance.deduction_recovery_links',
      'driver_finance.driver_deduction_bucket_events',
      'banking.check_print_batch_items',
      'factoring.reserve_movement'
    ]) THEN
      RETURN OLD;
    END IF;

    -- ARM 2 — DOCUMENT: carries its own void column. NOT NULL is unconditional. This is the arm
    -- that protects live money and it is not relaxed for any table listed here.
    IF v_table = ANY (ARRAY[
      'accounting.expenses',
      'accounting.bills',
      'accounting.bill_lines',
      'accounting.bill_payments',
      'accounting.invoices',
      'accounting.invoice_lines',
      'accounting.payments',
      'accounting.credit_memos',
      'accounting.vendor_credits',
      'accounting.factoring_advances',
      'accounting.journal_entries',
      'accounting.broker_advances',
      'accounting.company_settlements',
      'banking.bank_transactions',
      'banking.bank_transaction_splits',
      'banking.reconciliation_matches',
      'banking.reconciliation_sessions',
      'banking.check_number_registry',
      'banking.transfers',
      'driver_finance.settlement_lines',
      'driver_finance.driver_settlements',
      'driver_finance.driver_settlement_deductions',
      'driver_finance.driver_bills',
      'driver_finance.driver_liabilities',
      'driver_finance.driver_advances',
      'driver_finance.driver_reimbursements',
      'driver_finance.driver_escrow_separations',
      'driver_finance.signed_acknowledgments',
      'factoring.letter_of_release',
      'factoring.batch'
    ]) THEN
      IF (v_row ->> 'voided_at') IS NULL AND (v_row ->> 'revoked_at') IS NULL THEN
        RAISE EXCEPTION
          '%.% row % is NOT voided -- the purge bypass (auth %) never applies to a live document, no exceptions, regardless of role.',
          TG_TABLE_SCHEMA, TG_TABLE_NAME, COALESCE(v_row ->> 'id', v_row ->> 'uuid', '?'), v_auth_id
          USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN OLD;
    END IF;

    -- ARM 3 — SAMPLE-ONLY: master data with no void column at all. is_sample_data = true is
    -- unconditional. A REAL customer, vendor, driver, unit, load or location can never be deleted
    -- through this path, no matter which auth is open.
    IF v_table = ANY (ARRAY[
      'mdata.customers',
      'mdata.vendors',
      'mdata.drivers',
      'mdata.units',
      'mdata.equipment',
      'mdata.loads',
      'mdata.locations'
    ]) THEN
      IF (v_row ->> 'is_sample_data') IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION
          '%.% row % is NOT sample data -- the purge bypass (auth %) never applies to a real master-data record, no exceptions, regardless of role.',
          TG_TABLE_SCHEMA, TG_TABLE_NAME, COALESCE(v_row ->> 'id', v_row ->> 'uuid', '?'), v_auth_id
          USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN OLD;
    END IF;

  END IF;

  RAISE EXCEPTION
    '%.% is WORM: DELETE is refused for every role. Financial rows are never deleted -- void or reverse the document instead, or set app.purge_auth_id to an OPEN AUTH-NNN for an explicitly authorized voided-row purge.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $fn$;

COMMIT;
