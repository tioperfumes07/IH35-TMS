-- TASK 8 / FLEET-LEASE-08 D) -- the USMCA fleet is dropping 46 -> ~14-15 units (repossessions,
-- returns-to-lessor, and the 14-unit 2EMS lease). The August $8,890 lease bill was set against 38
-- active units; hardcoding that dollar figure would silently keep charging for units the fleet no
-- longer carries. accounting.lease_contract has no way to express "N dollars PER UNIT PER MONTH"
-- today -- only a flat payment_amount_cents total. This adds the per-unit basis as real columns so
-- a lease can carry a real rate the owner supplies and the total can be recomputed later as the
-- fleet changes, instead of only ever holding one frozen lump sum.
--
-- Additive only: payment_amount_cents remains the column the existing schedule/posting engine
-- reads (lease.service.ts, lease-posting.service.ts) -- unchanged. rate_per_unit_cents /
-- unit_count_basis are nullable, informational-and-recomputation-source columns; a lease created
-- WITHOUT a per-unit rate (e.g. a real flat-fee lease) behaves exactly as before.

BEGIN;

DO $$
BEGIN
  IF to_regclass('accounting.lease_contract') IS NULL THEN
    RAISE NOTICE 'FLEET-LEASE-08: accounting.lease_contract absent -- skipping';
    RETURN;
  END IF;

  ALTER TABLE accounting.lease_contract
    ADD COLUMN IF NOT EXISTS rate_per_unit_cents bigint,
    ADD COLUMN IF NOT EXISTS unit_count_basis integer,
    ADD COLUMN IF NOT EXISTS unit_count_basis_as_of date;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'accounting.lease_contract'::regclass
      AND conname = 'lease_contract_rate_per_unit_cents_check'
  ) THEN
    ALTER TABLE accounting.lease_contract
      ADD CONSTRAINT lease_contract_rate_per_unit_cents_check CHECK (rate_per_unit_cents IS NULL OR rate_per_unit_cents >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'accounting.lease_contract'::regclass
      AND conname = 'lease_contract_unit_count_basis_check'
  ) THEN
    ALTER TABLE accounting.lease_contract
      ADD CONSTRAINT lease_contract_unit_count_basis_check CHECK (unit_count_basis IS NULL OR unit_count_basis >= 0);
  END IF;

  COMMENT ON COLUMN accounting.lease_contract.rate_per_unit_cents IS
    'FLEET-LEASE-08: owner-supplied dollars per unit per payment period. Nullable -- a lease priced as a flat total (not per-unit) leaves this null.';
  COMMENT ON COLUMN accounting.lease_contract.unit_count_basis IS
    'FLEET-LEASE-08: the unit count payment_amount_cents was actually computed against, as of unit_count_basis_as_of. Recorded so a later recompute (as the fleet changes) has a known starting point instead of guessing what the original count was.';
END
$$;

COMMIT;
