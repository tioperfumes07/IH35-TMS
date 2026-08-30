-- DOC-01 D2 slice 5 (owner APP-DEFECT-REGISTER-2026-08-29 Root 1) — expense + bill. Both types
-- already have a WORKING upload path today through a different mechanism (per the packet's own
-- register: Accounting-path expense create via RecordExpenseForm.tsx:568, bills via
-- VendorBillForm.tsx:601) -- confirmed live before writing this that neither
-- accounting.expenses nor accounting.bills carries a doc-shortcut column of its own (unlike
-- civil_fines/company_violations), so that existing upload path is NOT going through a column on
-- these tables at all. This migration does not touch or replace that existing path -- it is
-- schema-narrower than any prior slice: NO new column on either table, ONLY the docs.file_links
-- CHECK widen, giving expense/bill the same additive many-document capability every other entity
-- type already has, entirely additive to whatever the existing upload mechanism already does.
--
-- Confirmed live before writing (Neon br-fancy-credit-akjnd07a, bypass_rls=lucia,
-- je_control=2214): both tables carry operating_company_id + voided_at directly -- exactly 1
-- entity_type CHECK constraint present on docs.file_links (the hardened loop-drop pattern is
-- holding).
--
-- LESSON FROM DOC-F10066 APPLIED FROM THE START: ensureLinkEntityExists() below excludes voided
-- rows for both types (AND voided_at IS NULL), matching the 'invoice'/'dot_inspection' pattern --
-- not discovered as a gap and fixed after the fact this time.
--
-- IDEMPOTENT: the file_links widen loop-drops every entity_type CHECK constraint found and
-- re-adds unconditionally. No DROP of data, no grant change, no new column.

BEGIN;

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
    ADD CONSTRAINT chk_file_links_entity_type_widened_expense_bill
    CHECK (entity_type IN (
      'driver', 'customer', 'vendor', 'unit', 'equipment', 'load', 'settlement', 'invoice',
      'tax_document', 'medical_card', 'background_check', 'fine', 'company_violation',
      'drug_test', 'hos_violation', 'dot_inspection', 'fuel_transaction', 'expense', 'bill'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

COMMIT;
