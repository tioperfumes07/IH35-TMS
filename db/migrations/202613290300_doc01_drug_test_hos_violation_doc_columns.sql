-- DOC-01 D2/D3 slice 3 (owner APP-DEFECT-REGISTER-2026-08-29 Root 1) — safety.drug_test and
-- safety.hos_violations, another two of the packet's D3 candidates, confirmed live before writing
-- this (Neon br-fancy-credit-akjnd07a, bypass_rls=lucia, je_control=2214) to have NO document
-- column at all. NOTE the real table name is `safety.drug_test` (singular) -- the packet's own
-- prose said `drug_alcohol_tests`, which does not exist; verified against
-- information_schema.tables before writing rather than trusting the packet's naming.
--
-- LIVE DRIFT FOUND AND FIXED WHILE PREPARING THIS MIGRATION: docs.file_links carried TWO
-- overlapping entity_type CHECK constraints (chk_file_links_entity_type_widened_medcard_bgcheck,
-- 11 members, AND chk_file_links_entity_type_widened_fine_cv, 13 members, its own genuine
-- superset) -- the earlier slice's DO block should have dropped the older one when the newer one
-- was added, and briefly did (confirmed at the time), but the narrower constraint was back by the
-- time this slice started. Root mechanism not fully determined (candidate: the per-migration
-- convention's DO block only ever checks for the existence of ITS OWN named constraint before
-- re-adding it, so any process re-applying an EARLIER migration after a LATER one has already
-- superseded it will silently resurrect the narrower constraint -- a latent gap in the drop-and-
-- readd convention itself, not unique to this migration). Practical effect while both existed:
-- Postgres ANDs multiple CHECK constraints on the same table, so the pair together silently
-- enforced only the NARROWER 11-member set -- 'fine' and 'company_violation' would have been
-- rejected despite the wider constraint's own definition claiming to allow them. Fixed directly
-- (DROP CONSTRAINT chk_file_links_entity_type_widened_medcard_bgcheck) before writing this file.
-- HARDENED HERE: this migration's own widen step drops EVERY constraint matching entity_type (a
-- loop, not a single best-guess SELECT), so this exact class of drift cannot recur from this
-- migration's own execution, however many prior widen-constraints happen to coexist when it runs.
--
-- PATTERN: source_doc_id copied verbatim from safety.civil_fines (the reference implementation),
-- FK -> docs.files(id) ON DELETE SET NULL.
--
-- LESSON FROM DOC-F10063 APPLIED: apps/backend/src/docs/files.routes.ts's ensureLinkEntityExists()
-- ships its branches for both types in the SAME commit as this migration, not as a follow-up.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + DO-block guarded FK adds; the file_links widen loop-drops
-- and re-adds unconditionally on the constraint NAME this migration owns, safe to re-run. No DROP
-- of data, no grant change.

BEGIN;

ALTER TABLE safety.drug_test
  ADD COLUMN IF NOT EXISTS source_doc_id uuid;

ALTER TABLE safety.hos_violations
  ADD COLUMN IF NOT EXISTS source_doc_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'drug_test_source_doc_id_fkey'
       AND conrelid = 'safety.drug_test'::regclass
  ) THEN
    ALTER TABLE safety.drug_test
      ADD CONSTRAINT drug_test_source_doc_id_fkey
      FOREIGN KEY (source_doc_id) REFERENCES docs.files(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hos_violations_source_doc_id_fkey'
       AND conrelid = 'safety.hos_violations'::regclass
  ) THEN
    ALTER TABLE safety.hos_violations
      ADD CONSTRAINT hos_violations_source_doc_id_fkey
      FOREIGN KEY (source_doc_id) REFERENCES docs.files(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Widen docs.file_links.entity_type: drug_test + hos_violation, on top of the live 13-member set
-- (driver, customer, vendor, unit, equipment, load, settlement, invoice, tax_document,
-- medical_card, background_check, fine, company_violation). HARDENED: drops every entity_type
-- CHECK constraint found (loop), not just the first non-matching one.
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
    ADD CONSTRAINT chk_file_links_entity_type_widened_drugtest_hos
    CHECK (entity_type IN (
      'driver', 'customer', 'vendor', 'unit', 'equipment', 'load', 'settlement', 'invoice',
      'tax_document', 'medical_card', 'background_check', 'fine', 'company_violation',
      'drug_test', 'hos_violation'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

COMMIT;
