-- 202615370000_credit_memos_and_vendor_credits_post.sql
-- CC-1 · ROUND 373.4 — CREDIT MEMOS AND VENDOR CREDITS POST.
--
-- Measured on prod 2026-10-03: accounting.credit_memos and accounting.vendor_credits (+ their applications, routes and
-- pages) exist but post NOTHING ("NO GL posting — marks QBO-parity data only") and carry no account — a credit memo
-- reduced the customer's subledger balance while GL A/R never moved; a vendor credit did the same to A/P. USMCA holds
-- 0 of either (the 6 vendor credits on prod are TRANSPORTATION QuickBooks mirrors — frozen, parallel books, untouched).
--
--   * credit_memos.account_id / journal_entry_id — the income (or contra-income) account the credit reduces, and the JE
--     the poster wrote: Dr account / Cr A/R (ar_control), at creation.
--   * vendor_credits.account_id / journal_entry_id — the expense account the credit reduces: Dr A/P (ap_control) /
--     Cr account, at creation. The cash-backed overpay credit (source_bill_payment_id) keeps its own existing post.
--   * A document posts through its own poster EXACTLY when it names its account. The two writers whose GL is owned
--     elsewhere leave it NULL as today: a payment overpayment (the payment already credited A/R in full) and a Faro
--     short-pay write-down (its own JE, sourced to the Faro reserve entry).
--   * accounting.posting_source_load_id learns credit_memo -> its invoice's load (LAW 363.2).
-- Applying a credit to an invoice or bill moves the subledger only — both sides already sit in A/R or A/P.
-- Idempotent. No data change.
BEGIN;
SET LOCAL lock_timeout = '10s';

ALTER TABLE accounting.credit_memos  ADD COLUMN IF NOT EXISTS account_id uuid;
ALTER TABLE accounting.credit_memos  ADD COLUMN IF NOT EXISTS journal_entry_id uuid;
ALTER TABLE accounting.vendor_credits ADD COLUMN IF NOT EXISTS account_id uuid;
ALTER TABLE accounting.vendor_credits ADD COLUMN IF NOT EXISTS journal_entry_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_memos_account_id_fkey') THEN
    ALTER TABLE accounting.credit_memos ADD CONSTRAINT credit_memos_account_id_fkey FOREIGN KEY (account_id) REFERENCES catalogs.accounts (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_memos_journal_entry_id_fkey') THEN
    ALTER TABLE accounting.credit_memos ADD CONSTRAINT credit_memos_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES accounting.journal_entries (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_credits_account_id_fkey') THEN
    ALTER TABLE accounting.vendor_credits ADD CONSTRAINT vendor_credits_account_id_fkey FOREIGN KEY (account_id) REFERENCES catalogs.accounts (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_credits_journal_entry_id_fkey') THEN
    ALTER TABLE accounting.vendor_credits ADD CONSTRAINT vendor_credits_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES accounting.journal_entries (id);
  END IF;
END $$;

COMMENT ON COLUMN accounting.credit_memos.account_id IS 'ROUND 373.4: the income/contra-income account this credit reduces (Dr). NULL only for credits whose GL is owned elsewhere (payment overpayment, Faro short-pay write-down).';
COMMENT ON COLUMN accounting.vendor_credits.account_id IS 'ROUND 373.4: the expense account this vendor credit reduces (Cr). NULL for a cash-backed overpay credit (source_bill_payment_id) or a QBO mirror.';

CREATE OR REPLACE FUNCTION accounting.posting_source_load_id(p_source_type text, p_source_id text, p_source_line_id text DEFAULT NULL::text, p_reversal_of_line uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE
    -- A reversal carries the load of the line it reverses, whatever its own source type says.
    WHEN p_reversal_of_line IS NOT NULL THEN
      (SELECT o.load_id FROM accounting.journal_entry_postings o WHERE o.id = p_reversal_of_line)
    WHEN p_source_type = 'expense' THEN COALESCE(
      (SELECT l.load_id FROM accounting.expense_lines l WHERE l.id::text = p_source_line_id),
      (SELECT d.load_id FROM accounting.expenses d WHERE d.id::text = p_source_id))
    WHEN p_source_type = 'bill' THEN COALESCE(
      (SELECT l.load_id FROM accounting.bill_lines l WHERE l.id::text = p_source_line_id),
      (SELECT d.load_id FROM accounting.bills d WHERE d.id::text = p_source_id))
    WHEN p_source_type = 'invoice' THEN COALESCE(
      (SELECT l.source_load_id FROM accounting.invoice_lines l WHERE l.id::text = p_source_line_id),
      (SELECT d.source_load_id FROM accounting.invoices d WHERE d.id::text = p_source_id))
    WHEN p_source_type = 'load' THEN
      (SELECT d.id FROM mdata.loads d WHERE d.id::text = p_source_id)
    WHEN p_source_type = 'fuel_event' THEN
      (SELECT d.load_id FROM fuel.fuel_transactions d WHERE d.id::text = p_source_id)
    WHEN p_source_type IN ('driver_cash_advance', 'driver_advance', 'cash_advance') THEN
      (SELECT d.load_id FROM driver_finance.driver_advances d WHERE d.id::text = p_source_id)
    WHEN p_source_type = 'driver_reimbursement' THEN
      (SELECT d.load_id FROM driver_finance.driver_reimbursements d WHERE d.id::text = p_source_id)
    WHEN p_source_type = 'bill_payment' THEN
      (SELECT b.load_id FROM accounting.bill_payments d JOIN accounting.bills b ON b.id = d.bill_id
        WHERE d.id::text = p_source_id)
    WHEN p_source_type = 'bank_categorization' THEN COALESCE(
      (SELECT l.load_id FROM banking.bank_transaction_splits l WHERE l.id::text = p_source_line_id),
      (SELECT d.categorization_load_id FROM banking.bank_transactions d WHERE d.id::text = p_source_id))
    WHEN p_source_type = 'factoring_advance' THEN
      (SELECT d.source_load_id FROM accounting.factoring_advances d WHERE d.id::text = p_source_id)
    -- ROUND 373.4: a credit memo against an invoice belongs to that invoice's load.
    WHEN p_source_type = 'credit_memo' THEN
      (SELECT i.source_load_id FROM accounting.credit_memos c JOIN accounting.invoices i ON i.id = c.related_invoice_id
        WHERE c.id::text = p_source_id)
    WHEN p_source_type = 'insurance_claim' THEN
      (SELECT d.load_id FROM insurance.claim d WHERE d.id::text = p_source_id)
    -- A settlement that covers exactly one load carries it; one posting that aggregates several loads carries none.
    WHEN p_source_type IN ('driver_settlement', 'settlement') THEN
      (SELECT d.first_load_id FROM driver_finance.driver_settlements d
        WHERE d.id::text = p_source_id AND d.first_load_id IS NOT NULL AND d.first_load_id = d.last_load_id)
    ELSE NULL
  END
$function$;

GRANT EXECUTE ON FUNCTION accounting.posting_source_load_id(text, text, text, uuid) TO ih35_app;

COMMIT;
