-- 202610011200 — docs.file_links.entity_type admits work_order (Maintenance WO documents).
-- Owner ORDERS-2026-10-01 MAINTENANCE: WO detail Documents both-way via docs.file_links.
-- Lead ruling 2026-10-01: Cursor builds own engine end to end (claim HH12 → author).
--
-- IDEMPOTENT: loop-drops every entity_type CHECK on docs.file_links, then re-adds the FULL
-- prior set (including cash_advance restored — invoice_dispute widen had dropped it) plus
-- work_order. No data touched. No new columns.

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
    ADD CONSTRAINT chk_file_links_entity_type_widened_work_order
    CHECK (entity_type IN (
      'driver', 'customer', 'vendor', 'unit', 'equipment', 'load', 'settlement', 'invoice',
      'tax_document', 'medical_card', 'background_check', 'fine', 'company_violation',
      'drug_test', 'hos_violation', 'dot_inspection', 'fuel_transaction', 'expense', 'bill',
      'cash_advance', 'broker_advance', 'invoice_dispute', 'work_order'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

COMMIT;
