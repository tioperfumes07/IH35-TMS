-- 202614350000_driver_samsara_accounts_map.sql
--
-- ROUND 181.1 (owner order, 2026-09-25): "one driver WILL have more than one Samsara account/username."
-- A single mdata.drivers.samsara_driver_id column cannot hold that. This migration creates
-- mdata.driver_samsara_accounts — a one-to-many map table: one driver → many Samsara ids.
--
-- Backfill: from mdata.drivers.samsara_driver_id (the legacy single-value column) AND from
-- integrations.samsara_drivers.local_driver_id (the Samsara ingestion bridge). Both sources
-- are read-only after backfill; the legacy column stays for compatibility but is never the key.
--
-- The merge tool (ROUND 181.1 step 4) moves ALL of the loser's Samsara ids onto the survivor
-- in this map. Nothing is overwritten — a survivor gains ids, never loses them.
--
-- Idempotent, CREATE-only, RLS-enabled (0065 pattern).

DO $$
BEGIN
  -- 1. Create the map table if it does not exist
  IF to_regclass('mdata.driver_samsara_accounts') IS NULL THEN
    CREATE TABLE mdata.driver_samsara_accounts (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      driver_id uuid NOT NULL,
      samsara_driver_id text NOT NULL,
      samsara_username text,
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      last_login_at timestamptz,
      is_active boolean NOT NULL DEFAULT true,
      created_by_user_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT driver_samsara_accounts_pkey PRIMARY KEY (id),
      CONSTRAINT driver_samsara_accounts_driver_id_fkey FOREIGN KEY (driver_id)
        REFERENCES mdata.drivers(id) ON DELETE CASCADE,
      CONSTRAINT driver_samsara_accounts_samsara_driver_id_key UNIQUE (samsara_driver_id)
    );

    COMMENT ON TABLE mdata.driver_samsara_accounts IS
      'ROUND 181.1 (2026-09-25): one-to-many map — one driver can have multiple Samsara accounts/usernames. '
      'Backfilled from mdata.drivers.samsara_driver_id and integrations.samsara_drivers.local_driver_id. '
      'The legacy column stays read-only; this table is the canonical source for Samsara→driver resolution.';

    COMMENT ON COLUMN mdata.driver_samsara_accounts.driver_id IS
      'FK to mdata.drivers(id). A driver may have multiple rows (one per Samsara account).';
    COMMENT ON COLUMN mdata.driver_samsara_accounts.samsara_driver_id IS
      'The Samsara-assigned driver id (text). UNIQUE across all drivers — one Samsara id maps to exactly one driver.';
    COMMENT ON COLUMN mdata.driver_samsara_accounts.samsara_username IS
      'The Samsara username/display name, if available from the Samsara API.';
    COMMENT ON COLUMN mdata.driver_samsara_accounts.is_active IS
      'true = this Samsara account is actively used by this driver. false = superseded or deactivated.';
  END IF;

  -- 2. Index for driver→Samsara lookup
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_driver_samsara_accounts_driver_id'
  ) THEN
    CREATE INDEX idx_driver_samsara_accounts_driver_id
      ON mdata.driver_samsara_accounts (driver_id)
      WHERE is_active = true;
  END IF;

  -- 3. RLS (0065 pattern)
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'mdata' AND tablename = 'driver_samsara_accounts'
      AND rowsecurity = true
  ) THEN
    ALTER TABLE mdata.driver_samsara_accounts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE mdata.driver_samsara_accounts FORCE ROW LEVEL SECURITY;
  END IF;

  -- 4. Grants
  -- ih35_app: read (Samsara resolution paths run as app)
  GRANT SELECT ON mdata.driver_samsara_accounts TO ih35_app;
  -- ih35_ci_readonly: read (guards). Guarded: the role exists in prod but not in every CI/verify database.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_ci_readonly') THEN
    GRANT SELECT ON mdata.driver_samsara_accounts TO ih35_ci_readonly;
  END IF;
  -- neondb_owner: full (owner)
  -- (already has by default)

  -- 5. RLS policy: entity-scoped via driver's operating_company_id
  DROP POLICY IF EXISTS driver_samsara_accounts_entity_scope ON mdata.driver_samsara_accounts;
  CREATE POLICY driver_samsara_accounts_entity_scope ON mdata.driver_samsara_accounts
    FOR ALL
    USING (
      driver_id IN (
        SELECT id FROM mdata.drivers
        WHERE operating_company_id = current_setting('app.operating_company_id', true)::uuid
      )
    );

  -- 6. Backfill from mdata.drivers.samsara_driver_id (legacy single-value column)
  INSERT INTO mdata.driver_samsara_accounts (driver_id, samsara_driver_id, is_active, created_at, updated_at)
  SELECT d.id, d.samsara_driver_id, true, now(), now()
  FROM mdata.drivers d
  WHERE d.samsara_driver_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM mdata.driver_samsara_accounts m
      WHERE m.samsara_driver_id = d.samsara_driver_id
    )
  ON CONFLICT (samsara_driver_id) DO NOTHING;

  -- 7. Backfill from integrations.samsara_drivers.local_driver_id
  INSERT INTO mdata.driver_samsara_accounts (driver_id, samsara_driver_id, is_active, created_at, updated_at)
  SELECT sd.local_driver_id, sd.samsara_driver_id, true, now(), now()
  FROM integrations.samsara_drivers sd
  WHERE sd.local_driver_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM mdata.driver_samsara_accounts m
      WHERE m.samsara_driver_id = sd.samsara_driver_id
    )
  ON CONFLICT (samsara_driver_id) DO NOTHING;

END $$;
