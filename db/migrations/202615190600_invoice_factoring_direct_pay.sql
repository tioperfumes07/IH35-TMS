-- 202615190600_invoice_factoring_direct_pay.sql
-- ROUND 315 (FINAL) step 3 (owner, 2026-10-01): the Submit to Factor tab lists EVERY open invoice (sent / partial, not
-- voided, not factored, not on a live purchase). Some customers pay IH35 directly and are never sold to Faro; the owner
-- marks those invoices "Customer direct pay" on the tab, and they leave the candidate list. The mark is reversible
-- ("undo direct pay") and every set/undo writes one audit row (appendCrudAudit) — nothing here posts to the GL.
--   factoring_direct_pay_at            when the owner marked it (NULL = still a factoring candidate)
--   factoring_direct_pay_by_user_id    who marked it (identity.users)
--   factoring_direct_pay_reason        why (free text, required by the route)
-- Owner-only write (factoring/owner-only-purchase.ts, same gate as every purchase write). Additive, nullable, idempotent.
-- No backfill, no hardcoded UUID. accounting.invoices already carries FORCED RLS; new columns inherit it.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE accounting.invoices ADD COLUMN IF NOT EXISTS factoring_direct_pay_at timestamptz;
ALTER TABLE accounting.invoices ADD COLUMN IF NOT EXISTS factoring_direct_pay_by_user_id uuid REFERENCES identity.users(id);
ALTER TABLE accounting.invoices ADD COLUMN IF NOT EXISTS factoring_direct_pay_reason text;

COMMENT ON COLUMN accounting.invoices.factoring_direct_pay_at IS
  'ROUND 315 step 3: owner marked this invoice Customer direct pay (never sold to the factor); NULL = factoring candidate.';
COMMENT ON COLUMN accounting.invoices.factoring_direct_pay_by_user_id IS
  'ROUND 315 step 3: identity.users id of the owner who marked Customer direct pay.';
COMMENT ON COLUMN accounting.invoices.factoring_direct_pay_reason IS
  'ROUND 315 step 3: reason given when marking Customer direct pay.';

COMMIT;
