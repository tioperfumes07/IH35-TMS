-- 202615580900_posting_source_load_id_relay_fallback_single_valued.sql
-- CC-3 · RULING 443.64 #2. accounting.posting_source_load_id's fuel_event Relay fallback (202615520300) looks a posting's
-- source id up by fuel.fuel_transactions.relay_fuel_transaction_id, which is NOT unique: one Relay fill becomes several
-- fuel rows (measured on prod 2026-10-11 18:30 UTC: 228 rows carry a Relay id, 73 Relay ids map to 2 rows each, 401
-- fuel_event postings point at one of them). A scalar subquery over 2 rows raises "more than one row returned by a
-- subquery" (SQLSTATE 21000), so every caller dies: verify-every-load-born-posting-carries-its-load crashed on every live
-- run, and a poster stamping such a posting would fail its INSERT.
-- Fix: the fallback aggregates, so it always returns exactly one value — the load when every row of that Relay fill
-- names the same one load, NULL when the rows disagree or any row has no load (never a guess). On prod all 73 groups
-- agree on one load and none mixes a load with NULL, so every existing posting resolves to the value it resolved to
-- before. Every other branch is byte-for-byte 202615520300 (each looks up a primary key). Function body only; no rows.
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
         FROM fuel.fuel_transactions d WHERE d.relay_fuel_transaction_id::text = p_source_id))
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
