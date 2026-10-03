-- 202615350500_journal_entry_postings_load_id_stamp.sql
-- CC-1 · ROUND 363-CC1-A · LAW 363.2 — load_id IS STAMPED ON THE POSTING, BY THE POSTER, AT POSTING TIME. OWNER APPROVED.
--
-- Today the load a GL line belongs to lives only on the DOCUMENT: posting -> document -> load. Delete the document and
-- the middle hop is gone — the AUTH-177 purge left 2,074 reversal lines unable to name their load. This adds the load
-- to the posting itself.
--
--   * accounting.journal_entry_postings.load_id — nullable FK to mdata.loads(id). LINEAGE, NOT A BALANCE: nothing is
--     derived from it and it never takes part in a sum. NOT A LOCK: a reclassify by load re-stamps it (LAW 363.3).
--   * accounting.posting_source_load_id(type, source id, source line id, reversal_of_line_id) — the ONE definition of
--     "which load does this posting belong to", read from the source document (the line first, then the header). Every
--     poster writes `load_id = accounting.posting_source_load_id(...)` IN ITS OWN INSERT, same statement, same
--     transaction. No trigger writes the column, no backfill job, no second writer.
--   * A reversal line carries the load of the line it reverses (its source document may already be gone — that is
--     exactly the 363.1 orphan).
--   * NULL means "this document has no load" — overhead, intercompany, a customer payment across invoices, a manual JE,
--     an escrow account, a driver settlement that spans several loads (one posting aggregates them) — never "we did not
--     look". The database refusal of a load-bearing posting with a NULL stamp, the provable backfill of existing rows and
--     the trace guard are CC-3's (363-CC3-A, ruling 00-LEAD-RULING-2026-10-03-LANE-CROSS-ACCT-F9855-AND-POSTING-LOAD-ID).
--
-- Single-column FK on purpose: a composite FK with a nullable partner is satisfied by MATCH SIMPLE without checking.
-- No data change: every existing row stays NULL here.
BEGIN;
SET LOCAL lock_timeout = '10s';

ALTER TABLE accounting.journal_entry_postings
  ADD COLUMN IF NOT EXISTS load_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entry_postings_load_id_fkey'
                   AND conrelid = 'accounting.journal_entry_postings'::regclass) THEN
    ALTER TABLE accounting.journal_entry_postings
      ADD CONSTRAINT journal_entry_postings_load_id_fkey FOREIGN KEY (load_id) REFERENCES mdata.loads (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_journal_entry_postings_load_id
  ON accounting.journal_entry_postings (load_id) WHERE load_id IS NOT NULL;

COMMENT ON COLUMN accounting.journal_entry_postings.load_id IS
  'ROUND 363-CC1-A: the load this GL line belongs to, stamped by the poster in the same INSERT via '
  'accounting.posting_source_load_id(). Lineage only — never summed. NULL = the source document has no load.';

-- The one resolver. SECURITY INVOKER + STABLE: it reads the source document as the poster's own role, under the poster's
-- own company scope (RLS), inside the poster's own transaction — so it sees the document the poster just wrote.
CREATE OR REPLACE FUNCTION accounting.posting_source_load_id(
  p_source_type       text,
  p_source_id         text,
  p_source_line_id    text DEFAULT NULL,
  p_reversal_of_line  uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE sql
STABLE
AS $fn$
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
    WHEN p_source_type = 'insurance_claim' THEN
      (SELECT d.load_id FROM insurance.claim d WHERE d.id::text = p_source_id)
    -- A settlement that covers exactly one load carries it; one posting that aggregates several loads carries none.
    WHEN p_source_type IN ('driver_settlement', 'settlement') THEN
      (SELECT d.first_load_id FROM driver_finance.driver_settlements d
        WHERE d.id::text = p_source_id AND d.first_load_id IS NOT NULL AND d.first_load_id = d.last_load_id)
    ELSE NULL
  END
$fn$;

COMMENT ON FUNCTION accounting.posting_source_load_id(text, text, text, uuid) IS
  'ROUND 363-CC1-A: the load a posting belongs to, from its source document (line, then header) or, for a reversal, '
  'from the line it reverses. Called by every poster inside its INSERT. NULL = the document has no single load.';

GRANT EXECUTE ON FUNCTION accounting.posting_source_load_id(text, text, text, uuid) TO ih35_app;

COMMIT;
