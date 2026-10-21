-- ROUND 443.213. Claim: PR #27098 (694cfb4980af3c10c839fad65034891266ee9b08).
-- CREATE/ALTER only: no data repair or financial posting belongs in this migration.
-- Deployment prerequisite: canonical settlement marker repair has completed,
-- audited and ledger-invariant. Rehearse that repair on an isolated fork first.
-- Replacement Lead ruling 443.213: validated USMCA-only constraints.
-- Other companies are outside these invariants; no historical data is repaired here.
-- The companion live guard checks the complete USMCA population, without a baseline.
DO $contract$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'driver_finance.driver_settlements'::regclass
      AND conname = 'driver_settlements_void_state_consistent'
  ) THEN
    ALTER TABLE driver_finance.driver_settlements
      ADD CONSTRAINT driver_settlements_void_state_consistent CHECK (
        operating_company_id <> '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
        OR (((status = 'cancelled') = (voided_at IS NOT NULL))
          AND ((voided_at IS NULL) = (reversed_at IS NULL)))
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'driver_finance.driver_bills'::regclass
      AND conname = 'driver_bills_void_state_consistent'
  ) THEN
    ALTER TABLE driver_finance.driver_bills
      ADD CONSTRAINT driver_bills_void_state_consistent CHECK (
        operating_company_id <> '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
        OR ((status IN ('void', 'voided')) = (voided_at IS NOT NULL))
      );
  END IF;
END
$contract$;
