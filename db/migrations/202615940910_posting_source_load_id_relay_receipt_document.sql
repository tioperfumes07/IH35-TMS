-- CC-3 · 443.136 follow-up (verify-every-load-born-posting-carries-its-load RULE 2 red on main after the 443.134 re-point).
-- WHY: accounting.posting_source_load_id resolves a fuel_event posting's load only from fuel.fuel_transactions (by id, then by
-- Relay fill id). A Relay fill posted ON RECEIPT (443.116 #1 / 443.121 #2 re-point) that was never on a Creator settlement has
-- NO fuel row: its one source document is the expense document that adopted its journal entry, which carries the load the
-- one fuel-to-load rule resolved — the same load the poster stamped on the postings. The resolver could not see it and said
-- NULL (measured on prod 2026-10-12: 31 Relay fills / 101 postings; the guard prints the first 50). The postings are right;
-- the resolver gains the document (prod read-only with the arm: 101 resolved, 0 new mismatches).
-- OLD: fuel_event = fuel row by id, else the Relay fill's fuel rows (aggregated).
-- NEW: + else the Relay fill's adopted expense document (aggregated; NULL on disagreement). A VOIDED document stays the
--      source of the postings it bore (void reverses, never rewrites) — the 443.136 duplicate-purchase repair voids one.
-- Every other branch is byte-for-byte 202615580900. Function body only; no rows.
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
    WHEN p_source_type = 'factoring_advance' THEN
      (SELECT d.source_load_id FROM accounting.factoring_advances d WHERE d.id::text = p_source_id)
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
$function$;


GRANT EXECUTE ON FUNCTION accounting.posting_source_load_id(text, text, text, uuid) TO ih35_app;

COMMIT;
