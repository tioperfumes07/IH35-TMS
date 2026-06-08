-- Block C: Settlement deduction cap (net floor + roll-over).
-- Renamed from 20260607_191000_* — runner requires 12 contiguous digits (YYYYMMDDHHMM).
--
-- Resolve order (enforced in app code, not SQL):
--   per-driver override -> company default -> env SETTLEMENT_MIN_NET_PCT (50)
-- Fields resolve independently (driver.pct + company.cents may combine).
--
-- Additive-only column adds on existing tables. No new schema/table/sequence,
-- so no GRANT changes are required: org.companies and mdata.drivers already
-- carry SELECT/INSERT/UPDATE grants to ih35_app (migrations 0013 and 0008).
BEGIN;

ALTER TABLE org.companies
  ADD COLUMN IF NOT EXISTS min_net_settlement_pct integer DEFAULT 50 CHECK (min_net_settlement_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS min_net_settlement_cents integer DEFAULT 0 CHECK (min_net_settlement_cents >= 0);

ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS min_net_settlement_pct integer NULL CHECK (min_net_settlement_pct IS NULL OR min_net_settlement_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS min_net_settlement_cents integer NULL CHECK (min_net_settlement_cents IS NULL OR min_net_settlement_cents >= 0);

COMMENT ON COLUMN org.companies.min_net_settlement_pct IS
  'Block C: minimum % of gross a driver must net before deductions apply. Company default (50).';
COMMENT ON COLUMN org.companies.min_net_settlement_cents IS
  'Block C: absolute minimum net (cents) floor. Company default (0).';
COMMENT ON COLUMN mdata.drivers.min_net_settlement_pct IS
  'Block C: per-driver override of min net % (NULL = inherit company/env).';
COMMENT ON COLUMN mdata.drivers.min_net_settlement_cents IS
  'Block C: per-driver override of absolute min net cents (NULL = inherit company/env).';

COMMIT;
