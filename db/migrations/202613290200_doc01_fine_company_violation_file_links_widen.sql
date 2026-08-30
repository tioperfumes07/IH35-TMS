-- DOC-01 D2, slice 2 (owner APP-DEFECT-REGISTER-2026-08-29 Root 1) — 'fine' and
-- 'company_violation' entity types for docs.file_links. Unlike the medical_card/background_check
-- slice, BOTH target tables already carry a document column (safety.civil_fines.source_doc_id --
-- the reference implementation every other D3 table is copied from; safety.company_violations.
-- source_doc_id, added independently) -- so this migration is schema-narrower than the prior
-- slice: only the docs.file_links CHECK widen, no new ADD COLUMN.
--
-- WHY WIDEN AT ALL IF source_doc_id ALREADY WORKS: source_doc_id is a one-to-one shortcut FK
-- (one fine/violation -> one file). Adding these types to docs.file_links's polymorphic junction
-- is a SEPARATE, additive capability -- a fine or violation can have MORE THAN ONE supporting
-- document (e.g. the citation photo AND a police report), discoverable via "documents for this
-- fine" the same way every other entity type already is. The two mechanisms do not conflict:
-- source_doc_id stays the primary/first-citation shortcut, file_links becomes the full multi-
-- document history. Confirmed live before writing this (Neon br-fancy-credit-akjnd07a,
-- bypass_rls=lucia, je_control=2214): both tables carry operating_company_id directly.
--
-- LESSON APPLIED FROM DOC-F10063 (self-caught in the prior slice): this migration alone is not
-- sufficient -- apps/backend/src/docs/files.routes.ts's ensureLinkEntityExists() MUST also gain a
-- real branch for each type in the SAME commit as this migration, not as a follow-up. That code
-- change ships alongside this file, not separately.
--
-- IDEMPOTENT: DO-block guarded drop-and-readd of the CHECK constraint, matching the exact
-- established convention (202607130100 tax_document, 202613290000 medical_card/background_check).
-- No DROP of data, no grant change.

BEGIN;

DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT con.conname INTO v_conname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'docs'
    AND rel.relname = 'file_links'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%entity_type%'
    AND pg_get_constraintdef(con.oid) NOT ILIKE '%company_violation%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE docs.file_links DROP CONSTRAINT %I', v_conname);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'docs' AND rel.relname = 'file_links'
      AND con.conname = 'chk_file_links_entity_type_widened_fine_cv'
  ) THEN
    ALTER TABLE docs.file_links
      ADD CONSTRAINT chk_file_links_entity_type_widened_fine_cv
      CHECK (entity_type IN (
        'driver', 'customer', 'vendor', 'unit', 'equipment', 'load', 'settlement', 'invoice',
        'tax_document', 'medical_card', 'background_check', 'fine', 'company_violation'
      ));
  END IF;
END
$$;

COMMIT;
