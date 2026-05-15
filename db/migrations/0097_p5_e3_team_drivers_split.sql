BEGIN;

ALTER TABLE mdata.driver_teams
  ADD COLUMN IF NOT EXISTS split_method text NOT NULL DEFAULT '50_50'
    CHECK (split_method IN ('50_50', '60_40', '70_30', 'mileage_prorated', 'hours_prorated', 'custom')),
  ADD COLUMN IF NOT EXISTS primary_share_pct numeric(5,2) NOT NULL DEFAULT 50.00
    CHECK (primary_share_pct >= 0 AND primary_share_pct <= 100),
  ADD COLUMN IF NOT EXISTS co_share_pct numeric(5,2) NOT NULL DEFAULT 50.00
    CHECK (co_share_pct >= 0 AND co_share_pct <= 100);

ALTER TABLE mdata.driver_teams
  DROP CONSTRAINT IF EXISTS chk_driver_teams_pct_100;
ALTER TABLE mdata.driver_teams
  ADD CONSTRAINT chk_driver_teams_pct_100 CHECK (round((primary_share_pct + co_share_pct)::numeric, 2) = 100.00);

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES mdata.driver_teams(id);

CREATE INDEX IF NOT EXISTS idx_loads_team
  ON mdata.loads (team_id) WHERE team_id IS NOT NULL;

ALTER TABLE mdata.loads
  DROP CONSTRAINT IF EXISTS chk_loads_driver_xor_team;
ALTER TABLE mdata.loads
  ADD CONSTRAINT chk_loads_driver_xor_team
  CHECK (
    (assigned_primary_driver_id IS NOT NULL AND team_id IS NULL)
    OR (assigned_primary_driver_id IS NULL AND team_id IS NOT NULL)
    OR (assigned_primary_driver_id IS NULL AND team_id IS NULL)
  );

-- Self-heal forward-dep: driver_finance.driver_settlements introduced in migration 0124, guarded here for fresh-DB compatibility.

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NULL THEN
    RAISE NOTICE 'Skipping driver_finance.team_settlement_splits: driver_finance.driver_settlements missing';
  ELSE
    CREATE TABLE IF NOT EXISTS driver_finance.team_settlement_splits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      operating_company_id uuid NOT NULL REFERENCES org.companies(id),
      load_id uuid NOT NULL REFERENCES mdata.loads(id),
      team_id uuid NOT NULL REFERENCES mdata.driver_teams(id),
      driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
      pay_role text NOT NULL CHECK (pay_role IN ('primary', 'co')),
      split_method text NOT NULL,
      share_pct numeric(5,2) NOT NULL,
      total_load_pay_cents bigint NOT NULL,
      driver_pay_cents bigint NOT NULL,
      applied_to_settlement_id uuid REFERENCES driver_finance.driver_settlements(id),
      computed_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (load_id, driver_id)
    );

    ALTER TABLE driver_finance.team_settlement_splits ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS rls_team_splits_isolation ON driver_finance.team_settlement_splits;
    CREATE POLICY rls_team_splits_isolation
      ON driver_finance.team_settlement_splits
      FOR ALL TO ih35_app
      USING (
        operating_company_id::text = current_setting('app.operating_company_id', true)
        OR current_setting('app.bypass_rls', true) = 'lucia'
      )
      WITH CHECK (
        operating_company_id::text = current_setting('app.operating_company_id', true)
        OR current_setting('app.bypass_rls', true) = 'lucia'
      );

    CREATE INDEX IF NOT EXISTS idx_team_splits_driver
      ON driver_finance.team_settlement_splits (driver_id, computed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_team_splits_load
      ON driver_finance.team_settlement_splits (load_id);
  END IF;
END
$$;

COMMIT;
