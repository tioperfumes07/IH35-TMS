-- ACCT-F5756 — INVENTORY-PARTS-ASSIGNMENT-PHYSICAL-DELETE: DELETE /api/v1/maintenance/
-- parts-invoice-links/:id physically removed the append-only work-order parts-consumption record via
-- `DELETE FROM maintenance.parts_invoice_links`, and never restored parts_inventory.on_hand_qty (the
-- stock it decremented on create). Every deletion permanently destroyed history and left stock
-- understated by qty_used. Adds the same void-not-delete columns this codebase's convention already
-- uses elsewhere (banking.reconciliation_matches, accounting.*) so the route can be changed to an
-- atomic void that stamps actor/reason and never loses the row.
--
-- Additive only: 3 new nullable columns + 1 CHECK constraint. No data touched, no existing row
-- changed. Idempotent (IF NOT EXISTS / DO $$ guards).

BEGIN;

DO $$
BEGIN
  IF to_regclass('maintenance.parts_invoice_links') IS NULL THEN
    RAISE NOTICE 'ACCT-F5756: maintenance.parts_invoice_links absent — skip void-column migration';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'maintenance' AND table_name = 'parts_invoice_links' AND column_name = 'voided_at'
  ) THEN
    ALTER TABLE maintenance.parts_invoice_links ADD COLUMN voided_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'maintenance' AND table_name = 'parts_invoice_links' AND column_name = 'void_reason'
  ) THEN
    ALTER TABLE maintenance.parts_invoice_links ADD COLUMN void_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'maintenance' AND table_name = 'parts_invoice_links' AND column_name = 'voided_by_user_id'
  ) THEN
    ALTER TABLE maintenance.parts_invoice_links ADD COLUMN voided_by_user_id uuid REFERENCES identity.users(id);
  END IF;

  -- Same shape as banking.reconciliation_matches's own void_reason_required CHECK: a void must always
  -- carry a non-empty reason, active rows are untouched (NULL passes trivially).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'parts_invoice_links_void_reason_required'
      AND conrelid = 'maintenance.parts_invoice_links'::regclass
  ) THEN
    ALTER TABLE maintenance.parts_invoice_links
      ADD CONSTRAINT parts_invoice_links_void_reason_required
      CHECK ((voided_at IS NULL) OR (btrim(COALESCE(void_reason, '')) <> '')) NOT VALID;
  END IF;
END
$$;

COMMIT;
