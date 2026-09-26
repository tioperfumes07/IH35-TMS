-- 202614380000_driver_samsara_accounts_operating_company.sql
--
-- Claude-Lead, 2026-09-26. Live finding: mdata.driver_samsara_accounts (202614350000, ROUND 181.1) was created
-- with no operating_company_id. It was walled only indirectly (RLS through driver_id -> mdata.drivers), so
-- verify-entity-isolation reports it as an un-walled business table. Every business table carries its own
-- operating_company_id uuid NOT NULL + FK to org.companies + an opco-scoped FORCE RLS policy.
--
-- What this does (idempotent, additive, no row deleted):
--   1. ADD COLUMN operating_company_id uuid (nullable first).
--   2. Backfill it from the owning driver (mdata.drivers.operating_company_id). Measured before authoring:
--      95 rows, every one joins to a driver, 1 operating company.
--   3. A BEFORE INSERT OR UPDATE OF driver_id, operating_company_id trigger sets it from the driver, so the
--      existing writers (the R-188 re-point script and the driver-merge tool, which only UPDATE driver_id)
--      never need to know about the column and can never store a company that disagrees with the driver.
--   4. SET NOT NULL + FK to org.companies(id) + index.
--   5. The entity policy is rewritten on the direct column (the session's app.operating_company_id, plus
--      the standard Lucia bypass), with a matching WITH CHECK.
--
-- Proven on a throwaway Neon branch of production (br-super-waterfall-akf39qt8, 2026-09-26 01:52Z):
-- 95 rows backfilled, 95/95 equal the driver's company, 1 company, column NOT NULL; an UPDATE that tried
-- to set another company was re-derived by the trigger to the driver's company.
--
-- CANONICAL-CHECK: not a financial table; adds a scoping column to an existing map, no new table.

DO $$
BEGIN
  IF to_regclass('mdata.driver_samsara_accounts') IS NULL THEN
    RAISE NOTICE '202614380000: mdata.driver_samsara_accounts absent — skipped';
    RETURN;
  END IF;

  -- 1. column
  ALTER TABLE mdata.driver_samsara_accounts ADD COLUMN IF NOT EXISTS operating_company_id uuid;

  -- 2. backfill from the driver
  UPDATE mdata.driver_samsara_accounts m
     SET operating_company_id = d.operating_company_id
    FROM mdata.drivers d
   WHERE d.id = m.driver_id
     AND m.operating_company_id IS DISTINCT FROM d.operating_company_id;

  IF EXISTS (SELECT 1 FROM mdata.driver_samsara_accounts WHERE operating_company_id IS NULL) THEN
    RAISE EXCEPTION '202614380000: driver_samsara_accounts rows whose driver has no operating_company_id — refusing to guess';
  END IF;
END $$;

-- 3. derive-from-driver trigger function
CREATE OR REPLACE FUNCTION mdata.driver_samsara_accounts_set_operating_company()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  SELECT d.operating_company_id INTO NEW.operating_company_id
    FROM mdata.drivers d
   WHERE d.id = NEW.driver_id;
  IF NEW.operating_company_id IS NULL THEN
    RAISE EXCEPTION 'driver_samsara_accounts: driver % has no operating_company_id', NEW.driver_id;
  END IF;
  RETURN NEW;
END
$fn$;

DO $$
BEGIN
  IF to_regclass('mdata.driver_samsara_accounts') IS NULL THEN
    RETURN;
  END IF;

  DROP TRIGGER IF EXISTS trg_driver_samsara_accounts_set_operating_company ON mdata.driver_samsara_accounts;
  CREATE TRIGGER trg_driver_samsara_accounts_set_operating_company
    BEFORE INSERT OR UPDATE OF driver_id, operating_company_id ON mdata.driver_samsara_accounts
    FOR EACH ROW EXECUTE FUNCTION mdata.driver_samsara_accounts_set_operating_company();

  -- 4. NOT NULL + FK + index
  ALTER TABLE mdata.driver_samsara_accounts ALTER COLUMN operating_company_id SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'mdata.driver_samsara_accounts'::regclass
       AND conname = 'driver_samsara_accounts_operating_company_id_fkey'
  ) THEN
    ALTER TABLE mdata.driver_samsara_accounts
      ADD CONSTRAINT driver_samsara_accounts_operating_company_id_fkey
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_driver_samsara_accounts_operating_company_id') THEN
    CREATE INDEX idx_driver_samsara_accounts_operating_company_id
      ON mdata.driver_samsara_accounts (operating_company_id);
  END IF;

  -- 5. entity policy on the direct column
  ALTER TABLE mdata.driver_samsara_accounts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE mdata.driver_samsara_accounts FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS driver_samsara_accounts_entity_scope ON mdata.driver_samsara_accounts;
  CREATE POLICY driver_samsara_accounts_entity_scope ON mdata.driver_samsara_accounts
    FOR ALL
    USING (
      identity.is_lucia_bypass()
      OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
    )
    WITH CHECK (
      identity.is_lucia_bypass()
      OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
    );
END $$;
