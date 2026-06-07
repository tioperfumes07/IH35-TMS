-- Block C: Settlement deduction cap (net floor + roll-over).
-- Adds per-driver and per-company configuration for the minimum net the driver
-- must take home from a settlement before pending deductions are applied.
--
-- Resolve order (enforced in app code, not SQL):
--   per-driver override -> company default -> env SETTLEMENT_MIN_NET_PCT (50)
-- Fields resolve independently (driver.pct + company.cents may combine).
--
-- Additive-only column adds on existing tables. No new schema/table/sequence,
-- so no GRANT changes are required: org.companies and mdata.drivers already
-- carry SELECT/INSERT/UPDATE grants to ih35_app (migrations 0013 and 0008).
BEGIN;

-- Company default tier: ships with the 50% / $0 default baked in.
ALTER TABLE org.companies
  ADD COLUMN IF NOT EXISTS min_net_settlement_pct integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS min_net_settlement_cents integer DEFAULT 0;

-- Per-driver override tier: NULL means "inherit the company/env value".
ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS min_net_settlement_pct integer NULL,
  ADD COLUMN IF NOT EXISTS min_net_settlement_cents integer NULL;

-- CHECK constraints (idempotent guard so re-runs do not error).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_min_net_settlement_pct_range'
  ) THEN
    ALTER TABLE org.companies
      ADD CONSTRAINT companies_min_net_settlement_pct_range
      CHECK (min_net_settlement_pct IS NULL OR (min_net_settlement_pct BETWEEN 0 AND 100));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_min_net_settlement_cents_nonneg'
  ) THEN
    ALTER TABLE org.companies
      ADD CONSTRAINT companies_min_net_settlement_cents_nonneg
      CHECK (min_net_settlement_cents IS NULL OR min_net_settlement_cents >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'drivers_min_net_settlement_pct_range'
  ) THEN
    ALTER TABLE mdata.drivers
      ADD CONSTRAINT drivers_min_net_settlement_pct_range
      CHECK (min_net_settlement_pct IS NULL OR (min_net_settlement_pct BETWEEN 0 AND 100));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'drivers_min_net_settlement_cents_nonneg'
  ) THEN
    ALTER TABLE mdata.drivers
      ADD CONSTRAINT drivers_min_net_settlement_cents_nonneg
      CHECK (min_net_settlement_cents IS NULL OR min_net_settlement_cents >= 0);
  END IF;
END $$;

COMMENT ON COLUMN org.companies.min_net_settlement_pct IS
  'Block C: minimum % of gross a driver must net before deductions apply. Company default (50).';
COMMENT ON COLUMN org.companies.min_net_settlement_cents IS
  'Block C: absolute minimum net (cents) floor. Company default (0).';
COMMENT ON COLUMN mdata.drivers.min_net_settlement_pct IS
  'Block C: per-driver override of min net % (NULL = inherit company/env).';
COMMENT ON COLUMN mdata.drivers.min_net_settlement_cents IS
  'Block C: per-driver override of absolute min net cents (NULL = inherit company/env).';

COMMIT;
