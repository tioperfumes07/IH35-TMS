-- DISPATCH-LOAD-CANCELLATIONS-CHARGED-BY-USER-ID-NO-FK — dispatch.load_cancellations.charged_by_user_id
-- (added by 202612950000, ACCT-F5701) is a genuinely-written, actively-used actor-audit column
-- (apps/backend/src/dispatch/cancellation.service.ts, stamped with the acting userId when a TONU
-- cancellation charge is turned into an invoice) but had no foreign-key constraint to
-- identity.users(id) — unlike every sibling actor column in this codebase's convention
-- (uploaded_by_user_id, applied_by_user_id, voided_by_user_id, created_by_user_id/updated_by_user_id
-- all correctly REFERENCES identity.users(id)), including its own sibling columns on the SAME
-- ALTER TABLE statement (charge_invoice_id/charge_invoice_line_id, which both correctly reference
-- accounting.invoices/accounting.invoice_lines).
--
-- Live-verified before adding (Neon prod, tiny-field-89581227): 0 of 0 rows in
-- dispatch.load_cancellations currently have a non-null charged_by_user_id (the feature is
-- early-stage) — safe to add a plain FK with no orphan cleanup needed. Idempotent: DO block
-- guards on the constraint not already existing.

BEGIN;

DO $$
BEGIN
  IF to_regclass('dispatch.load_cancellations') IS NULL THEN
    RAISE NOTICE 'DISPATCH-LOAD-CANCELLATIONS-CHARGED-BY-USER-ID-NO-FK: dispatch.load_cancellations absent — skip';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'dispatch.load_cancellations'::regclass
      AND conname = 'load_cancellations_charged_by_user_id_fkey'
  ) THEN
    ALTER TABLE dispatch.load_cancellations
      ADD CONSTRAINT load_cancellations_charged_by_user_id_fkey
      FOREIGN KEY (charged_by_user_id) REFERENCES identity.users(id);
  END IF;
END
$$;

COMMIT;
