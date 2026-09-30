-- 202614780000_invoice_must_have_lines_constraint.sql
-- B-26 (Lead order, ROUND 294; spec authored by CC-2 in
-- docs/bus/2026-09-30-CC2-B26-LINELESS-INVOICE-CONSTRAINT-SPEC.md -- CC-2 is hard-barred from
-- authoring migrations by verify-migration-lane-band.mjs, so CC-1 (schema/migrations lane) authors
-- this exact spec, unchanged). "A lineless invoice header impossible AT THE TABLE (migration +
-- constraint, not call-site)."
--
-- WHY A CONSTRAINT TRIGGER, NOT A CHECK: a plain CHECK constraint cannot reference another table
-- (accounting.invoice_lines), so "at least one line exists" cannot be expressed as a CHECK on
-- accounting.invoices directly.
--
-- DESIGN, live-verified in a throwaway rolled-back transaction before this file was written:
--   (a) AFTER INSERT only, never UPDATE -- this stops the NEXT zero-line header, it does not
--       retroactively enforce on the 5 known-existing zero-line invoices (13616/13618/13620/13621/
--       13622, see docs/bus/2026-09-30-CC2-B26-EVIDENCE-TABLE-THE-5.md) or block any future
--       status change/void on them.
--   (b) DEFERRABLE INITIALLY DEFERRED -- fires at COMMIT, not on the INSERT statement itself. Every
--       writer this session found (buildInvoiceFromLoad and others) inserts the header first, then
--       the line(s), in the same transaction; an immediate trigger would refuse the header before
--       the line insert ever runs.
--   (c) WHEN (NEW.voided_at IS NULL) -- a header created already-voided is not this constraint's
--       target.
-- Verified live: a header inserted with zero lines is correctly refused when the constraint is
-- checked (PASS); a header inserted together with a real line in the same transaction commits
-- clean (PASS); a voided zero-line header is not blocked (PASS, WHEN clause works). All three
-- checks run in a transaction that was rolled back -- no data was written by that verification.
--
-- Additive, idempotent (guarded by pg_trigger existence check), CREATE-only. No existing data
-- touched -- this is a schema/engine change, not a money/accounting/load DATA write, and does not
-- fall under the 2026-09-30 owner freeze on production data writes.

BEGIN;

CREATE OR REPLACE FUNCTION accounting.enforce_invoice_has_lines() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM accounting.invoice_lines WHERE invoice_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'invoice % has no invoice_lines rows -- an invoice header may not be created without at least one line', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'invoice_must_have_lines' AND tgrelid = 'accounting.invoices'::regclass
  ) THEN
    CREATE CONSTRAINT TRIGGER invoice_must_have_lines
      AFTER INSERT ON accounting.invoices
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      WHEN (NEW.voided_at IS NULL)
      EXECUTE FUNCTION accounting.enforce_invoice_has_lines();
  END IF;
END $$;

COMMIT;
