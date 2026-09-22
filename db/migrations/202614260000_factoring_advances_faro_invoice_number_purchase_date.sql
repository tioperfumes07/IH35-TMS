-- 202614260000_factoring_advances_faro_invoice_number_purchase_date.sql
--
-- Lead ruling (2026-09-22): accounting.factoring_advances stores NOTHING of Faro's own
-- invoice number today -- we carry load numbers as display_id, Faro carries its own
-- sequential invoice numbers ("2", "3", "92"). No common join key exists between our book
-- and Faro's, which is why the $80,289.59 A/R gap took three days to decompose, and why the
-- day-by-day feed-control gate cannot match by invoice number today: on 8/10/26 Faro
-- purchased invoices "2" and "3"; our book has loads "13508" and "13510" -- same two loads,
-- no common key.
--
-- WHY on factoring_advances, not accounting.invoices (decided, do not move it): the Faro
-- invoice number identifies FARO'S PURCHASE EVENT, not our invoice. One Faro invoice = one
-- advance = one of our invoices, and the invoice already reaches the advance through
-- accounting.invoices.factoring_advance_id. Putting it on the advance keeps it on the row
-- it actually describes.
--
-- WHY faro_purchase_date is separate from advanced_at (measured live, not assumed): our
-- advances span 20 distinct advanced_at dates; Faro's own book spans 23 purchase days --
-- they do not align. The feed-control gate closes one FARO day at a time, so it must group
-- by Faro's date, not ours.
--
-- Nullable, no backfill: the 5 self-carried (unfactored) invoices have no Faro number and
-- never will. The purge (separately gated, not run by this migration) deletes all 120
-- current advances; the settlement-refeed feeder populates both columns at CREATION time
-- from PURCHASE REPORT ALL.csv, per the standing law (source_row_hash/every natural key
-- populated at creation, never backfilled later).
DO $$
BEGIN
  IF to_regclass('accounting.factoring_advances') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='accounting' AND table_name='factoring_advances' AND column_name='faro_invoice_number'
  ) THEN
    ALTER TABLE accounting.factoring_advances ADD COLUMN faro_invoice_number text;
    COMMENT ON COLUMN accounting.factoring_advances.faro_invoice_number IS
      'Faro''s own invoice number as printed on PURCHASE REPORT ALL.csv (e.g. "2", "3", "92") '
      '-- identifies FARO''S PURCHASE EVENT, not our invoice. Nullable: the self-carried '
      '(unfactored) invoices have no Faro number and never will. Populated at advance creation '
      'only, never backfilled.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='accounting' AND table_name='factoring_advances' AND column_name='faro_purchase_date'
  ) THEN
    ALTER TABLE accounting.factoring_advances ADD COLUMN faro_purchase_date date;
    COMMENT ON COLUMN accounting.factoring_advances.faro_purchase_date IS
      'The date on Faro''s own PURCHASE REPORT row for this advance. Deliberately NOT the same '
      'as advanced_at -- measured live: our advances span 20 distinct advanced_at dates while '
      'Faro''s book spans 23 purchase days, and they do not align. The day-by-day feed-control '
      'gate closes one FARO day at a time and must group by this field, not advanced_at.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_factoring_advances_faro_invoice_number'
  ) THEN
    CREATE UNIQUE INDEX uq_factoring_advances_faro_invoice_number
      ON accounting.factoring_advances (operating_company_id, faro_invoice_number)
      WHERE faro_invoice_number IS NOT NULL;
  END IF;
END $$;
