-- DOC-01 D2+D3 (owner APP-DEFECT-REGISTER-2026-08-29 Root 1, BLOCK-CC-1-schema.txt) — the
-- document-attachment architectural gap. docs/lockdown/DOC-01-CANONICAL-STACK-DECISION-
-- 2026-08-29.md picked docs.files + docs.file_links canonical (109 real rows today vs
-- documents.attachments' 3). This migration is the first, narrowly-scoped schema slice of that
-- decision: the two tables the owner's own audit named as having NO document column at all —
-- safety.medical_cards and safety.background_checks — which is exactly why the DOT medical card
-- and background-check upload buttons have nowhere to save to.
--
-- PATTERN: copied verbatim from safety.civil_fines.source_doc_id (live-confirmed pattern:
-- `FOREIGN KEY (source_doc_id) REFERENCES docs.files(id) ON DELETE SET NULL`, nullable uuid) —
-- the one place in the codebase this already works (FineCreateModal.tsx:150-174). Same column
-- name, same FK target, same ON DELETE behavior (a file being soft-deleted must not cascade-
-- delete the medical card / background check row it was evidence for — it just un-links).
--
-- D2: widens docs.file_links.entity_type to add 'medical_card' and 'background_check', following
-- the exact drop-all/add-superset convention 202607130100 already established for this same
-- constraint (the live CHECK today is chk_file_links_entity_type_widened_taxdoc, 9 members —
-- confirmed live before writing this, not assumed from the packet's stale "8 types" claim).
--
-- SCOPE NOTE (honest, not silently expanded): the owner's packet named 15 candidate entity types
-- for D2 and 5 more tables for D3 (drug_alcohol_tests, dot_inspections, company_violations,
-- hos_violations, border credentials on mdata.drivers). Only medical_card/background_check are
-- built here — Rule 14 requires a real target table and a real FK path declared for EVERY added
-- type, and doing all 15+5 in one migration risks exactly the kind of half-verified sweep this
-- module-completion cleanup exists to catch. The remaining types are each their own follow-up
-- slice, filed on the board, not silently deferred.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + DO-block guarded FK add + the established drop-and-
-- readd pattern for the CHECK constraint. No DROP of data, no grant change (new columns on an
-- existing table inherit migration 0065's DEFAULT PRIVILEGES on the safety schema).

BEGIN;

ALTER TABLE safety.medical_cards
  ADD COLUMN IF NOT EXISTS source_doc_id uuid;

ALTER TABLE safety.background_checks
  ADD COLUMN IF NOT EXISTS source_doc_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'medical_cards_source_doc_id_fkey'
       AND conrelid = 'safety.medical_cards'::regclass
  ) THEN
    ALTER TABLE safety.medical_cards
      ADD CONSTRAINT medical_cards_source_doc_id_fkey
      FOREIGN KEY (source_doc_id) REFERENCES docs.files(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'background_checks_source_doc_id_fkey'
       AND conrelid = 'safety.background_checks'::regclass
  ) THEN
    ALTER TABLE safety.background_checks
      ADD CONSTRAINT background_checks_source_doc_id_fkey
      FOREIGN KEY (source_doc_id) REFERENCES docs.files(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Widen docs.file_links.entity_type: medical_card + background_check, on top of the live
-- 9-member set (driver, customer, vendor, unit, equipment, load, settlement, invoice,
-- tax_document) — never narrow, matching this constraint's own established convention.
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
    AND pg_get_constraintdef(con.oid) NOT ILIKE '%medical_card%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE docs.file_links DROP CONSTRAINT %I', v_conname);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'docs' AND rel.relname = 'file_links'
      AND con.conname = 'chk_file_links_entity_type_widened_medcard_bgcheck'
  ) THEN
    ALTER TABLE docs.file_links
      ADD CONSTRAINT chk_file_links_entity_type_widened_medcard_bgcheck
      CHECK (entity_type IN (
        'driver', 'customer', 'vendor', 'unit', 'equipment', 'load', 'settlement', 'invoice',
        'tax_document', 'medical_card', 'background_check'
      ));
  END IF;
END
$$;

COMMIT;
