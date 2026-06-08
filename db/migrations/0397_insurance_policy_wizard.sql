-- Insurance policy create wizard: persist allocation method + per-unit monthly cost.
-- Additive only. No new tables; existing RLS + grants on insurance.policy / insurance.policy_unit
-- already cover these columns (column-level grants are not separate in Postgres).
BEGIN;

ALTER TABLE insurance.policy
  ADD COLUMN IF NOT EXISTS allocation_method text NOT NULL DEFAULT 'equal_split';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'insurance_policy_allocation_method_check'
  ) THEN
    ALTER TABLE insurance.policy
      ADD CONSTRAINT insurance_policy_allocation_method_check
      CHECK (allocation_method IN ('equal_split', 'pro_rata', 'weighted'));
  END IF;
END $$;

COMMENT ON COLUMN insurance.policy.allocation_method IS
  'Premium allocation across covered units for the create wizard: equal_split (default), pro_rata (by insured value), weighted (manual %).';

ALTER TABLE insurance.policy_unit
  ADD COLUMN IF NOT EXISTS cost_per_month_cents bigint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'insurance_policy_unit_cost_per_month_nonneg'
  ) THEN
    ALTER TABLE insurance.policy_unit
      ADD CONSTRAINT insurance_policy_unit_cost_per_month_nonneg
      CHECK (cost_per_month_cents >= 0);
  END IF;
END $$;

COMMENT ON COLUMN insurance.policy_unit.cost_per_month_cents IS
  'Per-vehicle insured cost per month set at policy-create time (monthly_premium allocated by allocation_method). Feeds per-load P&L.';

COMMIT;
