-- 202614240000_invoices_delivery_evidence_source.sql
--
-- Lead ruling, item 2 P0 (2026-09-22, "A CLOSED SETTLEMENT IS DELIVERY EVIDENCE"): the
-- delivery-evidence gate (accounting/invoice-send.service.ts, ACCT-F61) is right for live
-- dispatch and wrong for backfill -- every historical load being fed carries no stop actuals
-- (never captured in the app) but IS real, delivered, settled, and driver-paid. Mode-aware
-- fix: in mode='historical_backfill', a closed/locked settlement carrying the load, OR a Faro
-- invoice line against it, also counts as evidence -- and gets RECORDED here, queryably, not
-- just pass/fail.
DO $$
BEGIN
  IF to_regclass('accounting.invoices') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='accounting' AND table_name='invoices' AND column_name='delivery_evidence_source'
  ) THEN
    ALTER TABLE accounting.invoices ADD COLUMN delivery_evidence_source text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='accounting' AND table_name='invoices' AND column_name='delivery_evidence_recorded_at'
  ) THEN
    ALTER TABLE accounting.invoices ADD COLUMN delivery_evidence_recorded_at timestamptz;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_delivery_evidence_source_check'
  ) THEN
    ALTER TABLE accounting.invoices ADD CONSTRAINT invoices_delivery_evidence_source_check
      CHECK (delivery_evidence_source IS NULL OR delivery_evidence_source IN (
        'stop_actual_departure', 'closed_settlement', 'faro_invoice_line'
      ));
  END IF;
END $$;
