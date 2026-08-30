-- DOC-01 D2/D3 slice 4 (owner APP-DEFECT-REGISTER-2026-08-29 Root 1) — dot_inspection +
-- fuel_transaction. Confirmed live before writing (Neon br-fancy-credit-akjnd07a,
-- bypass_rls=lucia, je_control=2214): docs.file_links carries exactly 1 entity_type CHECK
-- constraint (15 members) -- the hardened loop-drop from the prior slice is holding.
--
-- DOT INSPECTION IS DIFFERENT FROM THE PRIOR SLICES: safety.dot_inspections already has a
-- pdf_evidence_id uuid column (and inspection_pdf_url text) -- but pdf_evidence_id carries NO FK
-- constraint at all (confirmed live: 0 of 6 live rows have it set, 0 orphans against docs.files).
-- Matches the packet's own finding ("row-action PDF only; the create form has none"). Rather than
-- add a second, redundant source_doc_id column, this migration adds the missing FK directly onto
-- the existing column -- the correct fix is constraining what already exists, not duplicating it.
--
-- FUEL TRANSACTION follows the standard pattern: fuel.fuel_transactions had no document column at
-- all (confirmed live), gains source_doc_id copied from the safety.civil_fines reference shape.
--
-- LESSON FROM DOC-F10063 APPLIED: apps/backend/src/docs/files.routes.ts's ensureLinkEntityExists()
-- ships its branches for both types in the SAME commit as this migration.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + DO-block guarded FK adds; the file_links widen loop-drops
-- every entity_type CHECK constraint found (the hardened pattern from the prior slice) and
-- re-adds unconditionally. No DROP of data, no grant change.

BEGIN;

ALTER TABLE fuel.fuel_transactions
  ADD COLUMN IF NOT EXISTS source_doc_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'dot_inspections_pdf_evidence_id_fkey'
       AND conrelid = 'safety.dot_inspections'::regclass
  ) THEN
    ALTER TABLE safety.dot_inspections
      ADD CONSTRAINT dot_inspections_pdf_evidence_id_fkey
      FOREIGN KEY (pdf_evidence_id) REFERENCES docs.files(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fuel_transactions_source_doc_id_fkey'
       AND conrelid = 'fuel.fuel_transactions'::regclass
  ) THEN
    ALTER TABLE fuel.fuel_transactions
      ADD CONSTRAINT fuel_transactions_source_doc_id_fkey
      FOREIGN KEY (source_doc_id) REFERENCES docs.files(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Widen docs.file_links.entity_type: dot_inspection + fuel_transaction, on top of the live
-- 15-member set. HARDENED: drops every entity_type CHECK constraint found (loop), not just the
-- first non-matching one -- the pattern established in the prior slice after the duplicate-
-- constraint drift.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'docs'
      AND rel.relname = 'file_links'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%entity_type%'
  LOOP
    EXECUTE format('ALTER TABLE docs.file_links DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE docs.file_links
    ADD CONSTRAINT chk_file_links_entity_type_widened_dot_fuel
    CHECK (entity_type IN (
      'driver', 'customer', 'vendor', 'unit', 'equipment', 'load', 'settlement', 'invoice',
      'tax_document', 'medical_card', 'background_check', 'fine', 'company_violation',
      'drug_test', 'hos_violation', 'dot_inspection', 'fuel_transaction'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

COMMIT;
