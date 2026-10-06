-- 202615430900 — ROUND 435 (CC-3, 2026-10-06; claimed #25561): every legal contract instance is FILED as a PDF.
--
-- MEASURED (prod): USMCA has 3 contract instances (2 draft, 1 voided) and none has a file to open — the PDF existed
-- only at e-signature, in documents.attachments, outside docs.files and outside every hub's document list. A contract
-- that cannot be opened is not filed.
--
-- 1. docs.file_links accepts entity_type 'contract_instance', so a filed PDF links to its contract (file -> contract)
--    alongside the hub links (driver / customer / vendor / unit / equipment / load / bill).
-- 2. legal.contract_instances.pdf_file_id -> docs.files(id): the contract's current filed PDF (contract -> file).
--    Draft at creation, replaced by the executed PDF at signature; every version stays in docs.files.
--
-- Idempotent. Writes no rows. Same constraint shape as 202615191000 (widened, never narrowed).

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE docs.file_links DROP CONSTRAINT IF EXISTS chk_file_links_entity_type_widened_load_stop;
ALTER TABLE docs.file_links DROP CONSTRAINT IF EXISTS chk_file_links_entity_type_widened_contract_instance;
ALTER TABLE docs.file_links ADD CONSTRAINT chk_file_links_entity_type_widened_contract_instance CHECK (entity_type = ANY (ARRAY[
  'driver'::text, 'customer'::text, 'vendor'::text, 'unit'::text, 'equipment'::text, 'load'::text, 'settlement'::text,
  'invoice'::text, 'tax_document'::text, 'medical_card'::text, 'background_check'::text, 'fine'::text,
  'company_violation'::text, 'drug_test'::text, 'hos_violation'::text, 'dot_inspection'::text, 'fuel_transaction'::text,
  'expense'::text, 'bill'::text, 'cash_advance'::text, 'broker_advance'::text, 'invoice_dispute'::text, 'work_order'::text,
  'load_stop'::text, 'contract_instance'::text]));

ALTER TABLE legal.contract_instances ADD COLUMN IF NOT EXISTS pdf_file_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_instances_pdf_file_id_fkey') THEN
    ALTER TABLE legal.contract_instances
      ADD CONSTRAINT contract_instances_pdf_file_id_fkey FOREIGN KEY (pdf_file_id) REFERENCES docs.files(id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_contract_instances_pdf_file_id ON legal.contract_instances (pdf_file_id) WHERE pdf_file_id IS NOT NULL;
COMMENT ON COLUMN legal.contract_instances.pdf_file_id IS
  'ROUND 435: the contract''s current filed PDF in docs.files (draft at creation, executed at signature). Linked back via docs.file_links entity_type=contract_instance.';

COMMIT;
