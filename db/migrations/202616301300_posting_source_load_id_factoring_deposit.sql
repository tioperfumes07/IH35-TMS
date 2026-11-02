-- ENG-26: posting_source_load_id resolves factoring_advance_deposit (+ sibling lifecycle events)
-- like TS FACTORING_EVENT_SOURCE_TYPES / resolvePostingSourceLoad (source_load_id, else ONE
-- live invoice load). Fixes RULE 2 reds where stamp came from TS invoice fallback but SQL said NULL.
-- Function body only; no row rewrites.
BEGIN;
SET LOCAL lock_timeout = '5s';

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
    WHEN p_source_type = 'fuel_event' THEN COALESCE(
      (SELECT d.load_id FROM fuel.fuel_transactions d WHERE d.id::text = p_source_id),
      -- One Relay fill = several fuel rows: aggregate, so the subquery is single-row by construction.
      (SELECT CASE WHEN count(DISTINCT d.load_id) = 1 AND count(d.load_id) = count(*) THEN (array_agg(d.load_id))[1] END
         FROM fuel.fuel_transactions d WHERE d.relay_fuel_transaction_id::text = p_source_id),
      -- 443.136 follow-up: a Relay fill posted ON RECEIPT with no fuel row (443.116 / 443.121) has ONE source document —
      -- the expense document that adopted its journal entry (adoptRelayFillExpenseDocument). That document carries the load
      -- the one fuel-to-load rule resolved; the posting is expected to carry the same. Aggregated: single-row by construction,
      -- NULL when its documents disagree or any has no load (never a guess).
      (SELECT CASE WHEN count(DISTINCT e.load_id) = 1 AND count(e.load_id) = count(*) THEN (array_agg(e.load_id))[1] END
         FROM accounting.expenses e
        WHERE e.source_fuel_transaction_id IS NULL
          AND EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
                       WHERE p.journal_entry_uuid = e.journal_entry_id AND p.source_transaction_type = 'fuel_event'
                         AND p.source_transaction_id = p_source_id AND p.reversal_of_line_id IS NULL LIMIT 1)))
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
    -- ENG-26 / 443.110 G8 / 443.185 G8: deposit + lifecycle events share the advance id.
    -- Mirror TS resolvePostingSourceLoad: source_load_id, else the ONE load live invoices name.
    WHEN p_source_type IN (
      'factoring_advance',
      'factoring_advance_deposit',
      'factoring_customer_payment',
      'factoring_reserve_release',
      'factoring_chargeback',
      'factoring_default_interest',
      'factoring_funding'
    ) THEN
      (SELECT COALESCE(
                a.source_load_id,
                (SELECT (array_agg(DISTINCT i.source_load_id))[1]
                   FROM accounting.invoices i
                  WHERE i.factoring_advance_id = a.id
                    AND i.operating_company_id = a.operating_company_id
                    AND i.voided_at IS NULL
                    AND i.source_load_id IS NOT NULL
                 HAVING count(DISTINCT i.source_load_id) = 1)
              )
         FROM accounting.factoring_advances a
        WHERE a.id::text = p_source_id)
    WHEN p_source_type = 'credit_memo' THEN
      (SELECT i.source_load_id FROM accounting.credit_memos c JOIN accounting.invoices i ON i.id = c.related_invoice_id
        WHERE c.id::text = p_source_id)
    WHEN p_source_type = 'insurance_claim' THEN
      (SELECT d.load_id FROM insurance.claim d WHERE d.id::text = p_source_id)
    WHEN p_source_type IN ('driver_settlement', 'settlement') THEN
      (SELECT d.first_load_id FROM driver_finance.driver_settlements d
        WHERE d.id::text = p_source_id AND d.first_load_id IS NOT NULL AND d.first_load_id = d.last_load_id)
    ELSE NULL
  END
$function$
;

GRANT EXECUTE ON FUNCTION accounting.posting_source_load_id(text, text, text, uuid) TO ih35_app;

COMMIT;
