-- 202615370800_posting_source_load_id_index_usable.sql
-- U3 (owner UI register 2026-10-03, CC-2) — "Load costs: the LIVE load set + current cost FROM THE LEDGER".
--
-- accounting.posting_source_load_id() is THE one definition of which load a posting belongs to (CC-1, LAW 363.2;
-- last redefined by 202615370000). It compared every document key as text (d.id::text = p_source_id), which no index
-- can serve: resolving the load of USMCA's 3,523 cost postings took 54 s, so no screen could read the ledger by load,
-- and the backfill of postings.load_id (0 of 3,523 stamped; boarded to CC-3) could not run in reasonable time.
--
-- This changes ONLY how keys are compared: uuid to uuid through accounting.uuid_or_null() (a non-uuid id matches
-- nothing, exactly as the text comparison could never match one). Every branch, its order, and every result are
-- unchanged — proven on a prod fork posting-by-posting (old definition vs new, all postings of every non-frozen
-- company: 0 differences). Signature, volatility and callers unchanged.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION accounting.uuid_or_null(p text) RETURNS uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public AS $fn$
  SELECT CASE WHEN length(p) = 36 AND p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN p::uuid END
$fn$;

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
      (SELECT l.load_id FROM accounting.expense_lines l WHERE l.id = accounting.uuid_or_null(p_source_line_id)),
      (SELECT d.load_id FROM accounting.expenses d WHERE d.id = accounting.uuid_or_null(p_source_id)))
    WHEN p_source_type = 'bill' THEN COALESCE(
      (SELECT l.load_id FROM accounting.bill_lines l WHERE l.id = accounting.uuid_or_null(p_source_line_id)),
      (SELECT d.load_id FROM accounting.bills d WHERE d.id = accounting.uuid_or_null(p_source_id)))
    WHEN p_source_type = 'invoice' THEN COALESCE(
      (SELECT l.source_load_id FROM accounting.invoice_lines l WHERE l.id = accounting.uuid_or_null(p_source_line_id)),
      (SELECT d.source_load_id FROM accounting.invoices d WHERE d.id = accounting.uuid_or_null(p_source_id)))
    WHEN p_source_type = 'load' THEN
      (SELECT d.id FROM mdata.loads d WHERE d.id = accounting.uuid_or_null(p_source_id))
    WHEN p_source_type = 'fuel_event' THEN
      (SELECT d.load_id FROM fuel.fuel_transactions d WHERE d.id = accounting.uuid_or_null(p_source_id))
    WHEN p_source_type IN ('driver_cash_advance', 'driver_advance', 'cash_advance') THEN
      (SELECT d.load_id FROM driver_finance.driver_advances d WHERE d.id = accounting.uuid_or_null(p_source_id))
    WHEN p_source_type = 'driver_reimbursement' THEN
      (SELECT d.load_id FROM driver_finance.driver_reimbursements d WHERE d.id = accounting.uuid_or_null(p_source_id))
    WHEN p_source_type = 'bill_payment' THEN
      (SELECT b.load_id FROM accounting.bill_payments d JOIN accounting.bills b ON b.id = d.bill_id
        WHERE d.id = accounting.uuid_or_null(p_source_id))
    WHEN p_source_type = 'bank_categorization' THEN COALESCE(
      (SELECT l.load_id FROM banking.bank_transaction_splits l WHERE l.id = accounting.uuid_or_null(p_source_line_id)),
      (SELECT d.categorization_load_id FROM banking.bank_transactions d WHERE d.id = accounting.uuid_or_null(p_source_id)))
    WHEN p_source_type = 'factoring_advance' THEN
      (SELECT d.source_load_id FROM accounting.factoring_advances d WHERE d.id = accounting.uuid_or_null(p_source_id))
    -- ROUND 373.4: a credit memo against an invoice belongs to that invoice's load.
    WHEN p_source_type = 'credit_memo' THEN
      (SELECT i.source_load_id FROM accounting.credit_memos c JOIN accounting.invoices i ON i.id = c.related_invoice_id
        WHERE c.id = accounting.uuid_or_null(p_source_id))
    WHEN p_source_type = 'insurance_claim' THEN
      (SELECT d.load_id FROM insurance.claim d WHERE d.id = accounting.uuid_or_null(p_source_id))
    -- A settlement that covers exactly one load carries it; one posting that aggregates several loads carries none.
    WHEN p_source_type IN ('driver_settlement', 'settlement') THEN
      (SELECT d.first_load_id FROM driver_finance.driver_settlements d
        WHERE d.id = accounting.uuid_or_null(p_source_id) AND d.first_load_id IS NOT NULL AND d.first_load_id = d.last_load_id)
    ELSE NULL
  END
$function$;

COMMIT;
