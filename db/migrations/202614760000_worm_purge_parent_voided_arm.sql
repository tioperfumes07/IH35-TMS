-- 202614760000_worm_purge_parent_voided_arm.sql
--
-- FOUND BY RUNNING THE PURGE, not by reading the code. Executing AUTH-177 against production, the
-- invoice step refused:
--
--   accounting.invoice_lines row b535fd77-... is NOT voided -- the purge bypass (auth AUTH-177)
--   never applies to a live document, no exceptions, regardless of role.
--
-- The refusal was CORRECT and my classification was wrong. In 202614730000 I put
-- accounting.invoice_lines in the DOCUMENT arm, which demands the ROW carry voided_at. An invoice
-- line does not get voided on its own -- the INVOICE is voided and the lines go with it, so the
-- column sits NULL on a line whose parent is long dead.
--
-- The lazy fix is to move it to the DETAIL arm, where an auth id alone is enough. I am not doing
-- that: the detail arm asks no question about the parent at all, so with any auth open it would
-- permit deleting the lines out from under a LIVE invoice, silently changing that invoice's total
-- with no void anywhere. That is a worse hole than the one being fixed.
--
-- THIRD ARM instead, and it is STRICTER than both: a true child row is deletable only when its OWN
-- PARENT DOCUMENT IS VOIDED. The trigger looks the parent up. No auth id substitutes for it.
--
--   accounting.invoice_lines        -> accounting.invoices.voided_at IS NOT NULL
--   accounting.payment_applications -> the payment OR the invoice it applies to is voided
--
-- Additive, idempotent, CREATE OR REPLACE only. No table touched, no row deleted by this migration.

BEGIN;

CREATE OR REPLACE FUNCTION accounting.parent_document_is_voided(p_table text, p_row jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_ok boolean := false;
BEGIN
  IF p_table = 'accounting.invoice_lines' THEN
    SELECT (i.voided_at IS NOT NULL) INTO v_ok
      FROM accounting.invoices i
     WHERE i.id = (p_row ->> 'invoice_id')::uuid;
  ELSIF p_table = 'accounting.payment_applications' THEN
    SELECT COALESCE(
             (SELECT p.voided_at IS NOT NULL FROM accounting.payments p WHERE p.id = (p_row ->> 'payment_id')::uuid),
             false)
           OR COALESCE(
             (SELECT i.voided_at IS NOT NULL FROM accounting.invoices i WHERE i.id = (p_row ->> 'invoice_id')::uuid),
             false)
      INTO v_ok;
  END IF;
  RETURN COALESCE(v_ok, false);
END $fn$;

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

    -- ARM 0 — TRUE CHILD: deletable only when its OWN PARENT DOCUMENT is voided. Stricter than the
    -- detail arm below, which asks nothing about the parent. Checked FIRST so a table listed here
    -- can never fall through to a weaker arm.
    IF v_table = ANY (ARRAY['accounting.invoice_lines', 'accounting.payment_applications']) THEN
      IF NOT accounting.parent_document_is_voided(v_table, v_row) THEN
        RAISE EXCEPTION
          '%.% row % belongs to a LIVE parent document -- the purge bypass (auth %) never deletes a child out from under a live document, no exceptions, regardless of role.',
          TG_TABLE_SCHEMA, TG_TABLE_NAME, COALESCE(v_row ->> 'id', '?'), v_auth_id
          USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN OLD;
    END IF;

    IF v_table = ANY (ARRAY[
      'accounting.journal_entry_postings',
      'accounting.expense_lines',
      'accounting.factoring_reserve_movements',
      'accounting.factoring_default_interest_accruals',
      'accounting.factoring_lifecycle_posting_keys',
      'accounting.transaction_source_links',
      'accounting.expenses_review_queue',
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

    IF v_table = ANY (ARRAY[
      'accounting.expenses', 'accounting.bills', 'accounting.bill_lines', 'accounting.bill_payments',
      'accounting.invoices', 'accounting.payments', 'accounting.credit_memos',
      'accounting.vendor_credits', 'accounting.factoring_advances', 'accounting.journal_entries',
      'accounting.broker_advances', 'accounting.company_settlements',
      'banking.bank_transactions', 'banking.bank_transaction_splits',
      'banking.reconciliation_matches', 'banking.reconciliation_sessions',
      'banking.check_number_registry', 'banking.transfers',
      'driver_finance.settlement_lines', 'driver_finance.driver_settlements',
      'driver_finance.driver_settlement_deductions', 'driver_finance.driver_bills',
      'driver_finance.driver_liabilities', 'driver_finance.driver_advances',
      'driver_finance.driver_reimbursements', 'driver_finance.driver_escrow_separations',
      'driver_finance.signed_acknowledgments',
      'factoring.letter_of_release', 'factoring.batch'
    ]) THEN
      IF (v_row ->> 'voided_at') IS NULL AND (v_row ->> 'revoked_at') IS NULL THEN
        RAISE EXCEPTION
          '%.% row % is NOT voided -- the purge bypass (auth %) never applies to a live document, no exceptions, regardless of role.',
          TG_TABLE_SCHEMA, TG_TABLE_NAME, COALESCE(v_row ->> 'id', v_row ->> 'uuid', '?'), v_auth_id
          USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN OLD;
    END IF;

    IF v_table = ANY (ARRAY[
      'mdata.customers', 'mdata.vendors', 'mdata.drivers', 'mdata.units',
      'mdata.equipment', 'mdata.loads', 'mdata.locations'
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
