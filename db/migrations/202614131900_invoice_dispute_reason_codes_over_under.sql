-- Widen accounting.invoice_disputes.reason_code CHECK to add 'over_payment' + 'under_billing'.
--
-- Owner ruling 2026-09-13 (verbatim): "when there is an over payment or underpayment, it must also go to
-- dispute, so we can know there is or was an issue with a load." Both directions were escalated CC-2 -> CC-1
-- (docs/bus/INBOX-CC-1.md) with this exact draft DDL; Cursor authors it in the 12-23 UTC Cursor migration
-- window (Rule: one author per migration; CC-1 window is 00-11 UTC) to unblock CC-2's already-staged
-- INVOICE_DISPUTE_REASONS + validation relax and the two under-billings already open (13578 +$560 /
-- 13589 +$30), which were filed under the stopgap 'mis_entry' and are reclassified to 'under_billing'
-- by the accompanying ops step (scripts/ops/cursor-2026-09-13-reclassify-underbilling-reason-codes.mts).
--
-- FINDING: BANK-F30120 (ROUND 23.3 DELTA — reason-code expansion)
-- Additive-only + idempotent: DROP CONSTRAINT IF EXISTS + ADD (the standard CHECK-widen pattern in this
-- tree, 122 precedents). No column dropped, no row deleted, no RLS change, no GL math. Every existing code
-- ('mis_entry','customer_discount','late_fine','driver_no_answer','short_pay','chargeback','other') is
-- RETAINED — this only ADMITS two more values, so re-validation of existing rows passes with 0 rows changed.

ALTER TABLE accounting.invoice_disputes
  DROP CONSTRAINT IF EXISTS chk_invoice_disputes_reason;

ALTER TABLE accounting.invoice_disputes
  ADD CONSTRAINT chk_invoice_disputes_reason
  CHECK (reason_code = ANY (ARRAY[
    'mis_entry',
    'customer_discount',
    'late_fine',
    'driver_no_answer',
    'short_pay',
    'chargeback',
    'other',
    'over_payment',
    'under_billing'
  ]));
