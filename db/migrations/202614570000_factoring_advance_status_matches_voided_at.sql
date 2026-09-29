-- ROUND 270 (Lead, P0) — factoring_advances.status can be left 'advanced' after voided_at is
-- stamped, because there is no factoring_advance case in governance/void-cancel-executors.ts's
-- executeVoidCancel: whatever voided these rows used a raw UPDATE that set voided_at/void_reason
-- but never flipped status. MEASURED live on USMCA (5c854333-6ea5-4faa-af31-67cb272fef80): 2 rows
-- (1f09c82c... faro_invoice_number 1013272-2, load 13619; 9667e71c... faro_invoice_number 87,
-- load 13615), both voided 2026-09-28 "ROUND-175 reversal -- load identity unproven, Lead ruling
-- 172-Updated", both still status='advanced'. Two downstream readers are fooled by this: (1)
-- views.factoring_summary's mtd_advances CTE (202613170000) filters `status IS DISTINCT FROM
-- 'voided'`, so these 2 voided rows still count toward mtd_advances_count/mtd_advanced_total; (2)
-- any reader deriving "this invoice is advanced" from accounting.factoring_advances.status='advanced'
-- (via accounting.invoices.factoring_advance_id) sees the same false positive for invoices 13619 and
-- 13615's advances.
--
-- FIX: a permanent, database-level invariant -- voided_at set implies status='voided' -- so this
-- class of drift is IMPOSSIBLE going forward, not just patched for these 2 rows. Added NOT VALID so
-- this migration does not itself fail against the 2 known-bad live rows; a follow-up ops script
-- (scripts/ops/2026-09-30-cc1-round270-factoring-advance-status-fix.ts, AUTH-132) corrects those 2
-- rows, then a follow-up migration VALIDATEs the constraint once live is clean.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factoring_advances_status_matches_voided_at'
      AND conrelid = 'accounting.factoring_advances'::regclass
  ) THEN
    ALTER TABLE accounting.factoring_advances
      ADD CONSTRAINT factoring_advances_status_matches_voided_at
      CHECK (voided_at IS NULL OR status = 'voided') NOT VALID;
  END IF;
END $$;
