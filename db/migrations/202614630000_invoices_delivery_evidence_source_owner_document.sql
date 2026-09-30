-- 202614630000_invoices_delivery_evidence_source_owner_document.sql
--
-- ROUND 290 (Lead order, 2026-09-30): widen accounting.invoices.delivery_evidence_source's CHECK
-- to also allow 'owner_source_document' -- the new, narrowly-scoped evidence class added in
-- apps/backend/src/accounting/invoice-send.service.ts for a genuinely load-less, real,
-- self-carried invoice the customer already holds (e.g. invoice 010 SUPPLY CHAIN MANAGEMENT).
-- Additive only: widens the allowed set, never narrows it; the three existing values keep exactly
-- their existing meaning and gate behavior.
DO $$
BEGIN
  IF to_regclass('accounting.invoices') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_delivery_evidence_source_check'
  ) THEN
    ALTER TABLE accounting.invoices DROP CONSTRAINT invoices_delivery_evidence_source_check;
  END IF;
  ALTER TABLE accounting.invoices ADD CONSTRAINT invoices_delivery_evidence_source_check
    CHECK (delivery_evidence_source IS NULL OR delivery_evidence_source IN (
      'stop_actual_departure', 'closed_settlement', 'faro_invoice_line', 'owner_source_document'
    ));
END $$;
