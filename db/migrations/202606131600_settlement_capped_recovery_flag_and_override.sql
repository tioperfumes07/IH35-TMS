-- A3-2 (FEAT-SETTLEMENT-RECOVERY-CAPPED-PAYROLL): cutover flag + override columns.
--
-- Additive, idempotent, portable. ZERO behavior change at OFF: the new capped-recovery path is
-- gated behind SETTLEMENT_CAPPED_RECOVERY_ENABLED (DEFAULT false) — flag OFF = existing blunt path,
-- byte-identical (proven by the flag-off-identical test). No real driver is paid from the new path
-- until the A3-3 shadow-run proves agreement and the flag is flipped.

BEGIN;

-- 1) Cutover flag — default OFF.
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'SETTLEMENT_CAPPED_RECOVERY_ENABLED',
  'A3 cutover: when ON, driver settlements recover cash advances via the capped net-floor ledger engine (cash_advance_repayment only). OFF = legacy blunt direct-sum path. Do NOT enable until the A3-3 shadow-run proves old vs new agree.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

-- 2) Manual per-settlement override (owner/admin only, audited at the route layer).
--    Default = auto safe amount (NULL here); cannot exceed floor room unless recover_override_reason
--    records an explicit owner below-floor override. recover_override_by is the acting user.
ALTER TABLE payroll.driver_settlements
  ADD COLUMN IF NOT EXISTS recover_override_cents bigint;
ALTER TABLE payroll.driver_settlements
  ADD COLUMN IF NOT EXISTS recover_override_by uuid;
ALTER TABLE payroll.driver_settlements
  ADD COLUMN IF NOT EXISTS recover_override_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'payroll.driver_settlements'::regclass
      AND conname = 'fk_driver_settlements_recover_override_by'
  ) THEN
    ALTER TABLE payroll.driver_settlements
      ADD CONSTRAINT fk_driver_settlements_recover_override_by
      FOREIGN KEY (recover_override_by) REFERENCES identity.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'payroll.driver_settlements'::regclass
      AND conname = 'chk_driver_settlements_recover_override_nonneg'
  ) THEN
    ALTER TABLE payroll.driver_settlements
      ADD CONSTRAINT chk_driver_settlements_recover_override_nonneg
      CHECK (recover_override_cents IS NULL OR recover_override_cents >= 0);
  END IF;
END $$;

COMMIT;
