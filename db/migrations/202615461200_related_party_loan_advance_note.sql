-- 202615461200_related_party_loan_advance_note.sql
-- Cursor · ROUND 443.22-2c — a numbered loan advance note on every advance.
--
-- Owner (2026-10-10): every time we loan to the company it should create a document.
-- Each funding advance mints a note (lender, borrower USMCA, principal, date, rate, facility,
-- signature blocks), stores it through docs.files, and links it both ways on the advance and
-- the facility. A facility with an advance and no note is a defect.
--
-- Additive, idempotent, CREATE-only. No DROP of data. No existing row rewritten.

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── entry → filed note (docs.files) ───────────────────────────────────────────────────────────────
ALTER TABLE accounting.related_party_loan_entries
  ADD COLUMN IF NOT EXISTS note_file_id uuid;
ALTER TABLE accounting.related_party_loan_entries
  ADD COLUMN IF NOT EXISTS note_html text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'related_party_loan_entries_note_file_id_fkey'
      AND conrelid = 'accounting.related_party_loan_entries'::regclass
  ) THEN
    ALTER TABLE accounting.related_party_loan_entries
      ADD CONSTRAINT related_party_loan_entries_note_file_id_fkey
      FOREIGN KEY (note_file_id) REFERENCES docs.files(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rpl_entries_note_file_id
  ON accounting.related_party_loan_entries (note_file_id)
  WHERE note_file_id IS NOT NULL;

COMMENT ON COLUMN accounting.related_party_loan_entries.note_file_id IS
  'ROUND 443.22-2c: docs.files id of the numbered loan advance note minted with this advance.';
COMMENT ON COLUMN accounting.related_party_loan_entries.note_html IS
  'ROUND 443.22-2c: canonical HTML body of the advance note (owner template; printable).';

-- ── docs.file_links: advance + facility as first-class link targets ───────────────────────────────
-- Same widen pattern as 202615430900 (drop prior tip constraint, add superseding set). Never narrow.
ALTER TABLE docs.file_links DROP CONSTRAINT IF EXISTS chk_file_links_entity_type_widened_contract_instance;
ALTER TABLE docs.file_links DROP CONSTRAINT IF EXISTS chk_file_links_entity_type_widened_related_party_loan;
ALTER TABLE docs.file_links ADD CONSTRAINT chk_file_links_entity_type_widened_related_party_loan CHECK (entity_type = ANY (ARRAY[
  'driver'::text, 'customer'::text, 'vendor'::text, 'unit'::text, 'equipment'::text, 'load'::text, 'settlement'::text,
  'invoice'::text, 'tax_document'::text, 'medical_card'::text, 'background_check'::text, 'fine'::text,
  'company_violation'::text, 'drug_test'::text, 'hos_violation'::text, 'dot_inspection'::text, 'fuel_transaction'::text,
  'expense'::text, 'bill'::text, 'cash_advance'::text, 'broker_advance'::text, 'invoice_dispute'::text, 'work_order'::text,
  'load_stop'::text, 'contract_instance'::text,
  'related_party_loan'::text, 'related_party_loan_facility'::text]));

COMMIT;
