-- E2-2 integrity fix: dispatch.driver_layovers
-- Original migration (202606080113_driver_layovers.sql) created the table with:
--   * operating_company_id stored as TEXT (should be uuid, RLS-scoped like every other entity table)
--   * NO foreign keys on driver_uuid / previous_load_uuid / next_load_uuid / operating_company_id
-- This migration:
--   1. Converts operating_company_id TEXT -> uuid IN PLACE, guarded by a castability pre-check
--      (raises a clear, actionable error ONLY if a non-castable value is actually present; on a
--      fresh CI DB the table is empty, so this is a clean no-op-safe conversion). This is NOT a
--      blind UPDATE -- it validates first and refuses rather than corrupt.
--   2. Adds the four missing FOREIGN KEYs (idempotent, guarded by pg_constraint catalog checks).
--   3. Re-states RLS with the canonical predicate + FORCE + ih35_app grants.
-- Non-financial integrity/structural fix. No amount math, no behavior flags.
BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Drop EVERY RLS policy that references operating_company_id BEFORE the
--    ALTER COLUMN ... TYPE uuid below. Postgres refuses to alter the type of a
--    column that is referenced by a policy definition
--    ("cannot alter type of a column used in a policy definition"), which was
--    failing build-typecheck + security-audit. The original table (migration
--    202606080113) created `driver_layovers_tenant_isolation`; we also drop the
--    canonical `driver_layovers_tenant_scope` name in case an earlier run of
--    this migration already created it. Both are recreated in step 3 with the
--    correct uuid-aware predicate. Idempotent (DROP ... IF EXISTS).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS driver_layovers_tenant_isolation ON dispatch.driver_layovers;
DROP POLICY IF EXISTS driver_layovers_tenant_scope ON dispatch.driver_layovers;

-- ---------------------------------------------------------------------------
-- 1. operating_company_id: TEXT -> uuid (guarded, in-place)
--    Safe because the existing RLS policy already casts operating_company_id::uuid,
--    so any value that currently survives a read is provably uuid-castable. The
--    pre-check makes the conversion refuse (with a readable message) rather than
--    corrupt, if dirty data is ever present. If Jorge knows prod carries non-uuid
--    text here, request the additive (new-column + backfill) variant instead.
-- ---------------------------------------------------------------------------
DO $convert$
DECLARE
  v_type text;
  v_bad  bigint;
BEGIN
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'dispatch'
    AND table_name  = 'driver_layovers'
    AND column_name = 'operating_company_id';

  IF v_type = 'text' THEN
    -- Refuse only if PRESENT data is non-castable (empty table -> 0 -> proceeds).
    SELECT count(*) INTO v_bad
    FROM dispatch.driver_layovers
    WHERE operating_company_id IS NOT NULL
      AND operating_company_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

    IF v_bad > 0 THEN
      RAISE EXCEPTION 'E2-2: % row(s) in dispatch.driver_layovers have a non-uuid operating_company_id; clean/backfill before converting (owner action required).', v_bad;
    END IF;

    ALTER TABLE dispatch.driver_layovers
      ALTER COLUMN operating_company_id TYPE uuid
      USING operating_company_id::uuid;
  END IF;
END
$convert$;

-- ---------------------------------------------------------------------------
-- 2. Missing FOREIGN KEYs (idempotent via pg_constraint catalog checks).
--    operating_company_id FK is added AFTER the type conversion above so it can
--    reference org.companies(id) (uuid PK).
-- ---------------------------------------------------------------------------
DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_driver_layovers_company'
  ) THEN
    ALTER TABLE dispatch.driver_layovers
      ADD CONSTRAINT fk_driver_layovers_company
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_driver_layovers_driver'
  ) THEN
    ALTER TABLE dispatch.driver_layovers
      ADD CONSTRAINT fk_driver_layovers_driver
      FOREIGN KEY (driver_uuid) REFERENCES mdata.drivers(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_driver_layovers_previous_load'
  ) THEN
    ALTER TABLE dispatch.driver_layovers
      ADD CONSTRAINT fk_driver_layovers_previous_load
      FOREIGN KEY (previous_load_uuid) REFERENCES mdata.loads(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_driver_layovers_next_load'
  ) THEN
    ALTER TABLE dispatch.driver_layovers
      ADD CONSTRAINT fk_driver_layovers_next_load
      FOREIGN KEY (next_load_uuid) REFERENCES mdata.loads(id);
  END IF;
END
$fk$;

-- ---------------------------------------------------------------------------
-- 3. Canonical RLS (FORCE) + grants. Replaces the older
--    user_accessible_company_ids() policy with the standard tenant predicate.
-- ---------------------------------------------------------------------------
ALTER TABLE dispatch.driver_layovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch.driver_layovers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_layovers_tenant_isolation ON dispatch.driver_layovers;
DROP POLICY IF EXISTS driver_layovers_tenant_scope ON dispatch.driver_layovers;
CREATE POLICY driver_layovers_tenant_scope
  ON dispatch.driver_layovers
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT USAGE ON SCHEMA dispatch TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON dispatch.driver_layovers TO ih35_app;

COMMIT;
