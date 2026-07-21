-- Settlement disputes convergence — additive columns (FOUNDATION-FIRST Priority 2 / P2e)
--
-- WHY: the CLOSURE-5 plural dispute routes (settlements/disputes/disputes.routes.ts) still live-write
-- the RETIRE table settlements.settlement_disputes. Repointing them onto the canonical
-- driver_finance.driver_settlement_disputes must not drop any field the plural API carries.
-- Two plural fields have no canonical home today:
--   1. evidence_doc_ids uuid[]  — driver-uploaded evidence document ids (docs service)
--   2. dispute_type             — the CLOSURE-5 vocabulary (missing_line / incorrect_rate /
--                                 duplicate_deduction / wrong_unit / other), which is mapped to the
--                                 canonical dispute_category but preserved verbatim for auditability.
--
-- All three dispute tables are 0 rows on prod (verified 2026-07-21 under app.bypass_rls='lucia'),
-- so this is purely additive; no backfill.
--
-- Idempotent: safe to apply twice. RLS/grants on the table are untouched (FORCED RLS stays).

BEGIN;

ALTER TABLE driver_finance.driver_settlement_disputes
  ADD COLUMN IF NOT EXISTS evidence_doc_ids uuid[];
COMMENT ON COLUMN driver_finance.driver_settlement_disputes.evidence_doc_ids IS
  'Evidence document ids (docs service) attached when the dispute was opened. Populated by both the canonical dispute surface and the converged CLOSURE-5 plural routes. NULL = no evidence attached.';

ALTER TABLE driver_finance.driver_settlement_disputes
  ADD COLUMN IF NOT EXISTS legacy_dispute_type text;
COMMENT ON COLUMN driver_finance.driver_settlement_disputes.legacy_dispute_type IS
  'CLOSURE-5 plural-API dispute_type preserved verbatim on convergence (missing_line | incorrect_rate | duplicate_deduction | wrong_unit | other). The canonical field is dispute_category; this column keeps the original vocabulary so the plural API contract round-trips losslessly. NULL for disputes opened through the canonical surface.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'driver_finance.driver_settlement_disputes'::regclass
      AND conname = 'driver_settlement_disputes_legacy_type_check'
  ) THEN
    ALTER TABLE driver_finance.driver_settlement_disputes
      ADD CONSTRAINT driver_settlement_disputes_legacy_type_check
      CHECK (
        legacy_dispute_type IS NULL
        OR legacy_dispute_type IN ('missing_line', 'incorrect_rate', 'duplicate_deduction', 'wrong_unit', 'other')
      );
  END IF;
END $$;

COMMIT;
