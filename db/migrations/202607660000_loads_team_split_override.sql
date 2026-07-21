-- P2b/P2f team-split convergence (owner ruling DECISION 2, Option A — 2026-07-21):
-- per-load team-split override storage moves off RETIRE settlements.team_split_load_overrides
-- onto ADDITIVE columns on mdata.loads. The plural facade endpoint
-- POST /api/v1/loads/:id/team-split writes these; settlements/team-splits/apply.ts reads them
-- ahead of the active mdata.driver_teams row. Additive-only: no drops, no data change.
-- Idempotent: safe to apply twice (ADD COLUMN IF NOT EXISTS + guarded constraints).

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS team_split_override_primary_driver_id uuid REFERENCES mdata.drivers(id),
  ADD COLUMN IF NOT EXISTS team_split_override_secondary_driver_id uuid REFERENCES mdata.drivers(id),
  ADD COLUMN IF NOT EXISTS team_split_override_primary_ratio numeric(6,4),
  ADD COLUMN IF NOT EXISTS team_split_override_secondary_ratio numeric(6,4),
  ADD COLUMN IF NOT EXISTS team_split_override_reason text,
  ADD COLUMN IF NOT EXISTS team_split_override_set_by_user_id uuid REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS team_split_override_set_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_loads_team_split_override_coherent'
      AND conrelid = 'mdata.loads'::regclass
  ) THEN
    ALTER TABLE mdata.loads
      ADD CONSTRAINT chk_loads_team_split_override_coherent CHECK (
        (
          team_split_override_primary_driver_id IS NULL
          AND team_split_override_secondary_driver_id IS NULL
          AND team_split_override_primary_ratio IS NULL
          AND team_split_override_secondary_ratio IS NULL
        )
        OR (
          team_split_override_primary_driver_id IS NOT NULL
          AND team_split_override_secondary_driver_id IS NOT NULL
          AND team_split_override_primary_driver_id <> team_split_override_secondary_driver_id
          AND team_split_override_primary_ratio > 0
          AND team_split_override_primary_ratio < 1
          AND team_split_override_secondary_ratio > 0
          AND team_split_override_secondary_ratio < 1
          AND round((team_split_override_primary_ratio + team_split_override_secondary_ratio)::numeric, 4) = 1.0000
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_loads_team_split_override_reason'
      AND conrelid = 'mdata.loads'::regclass
  ) THEN
    ALTER TABLE mdata.loads
      ADD CONSTRAINT chk_loads_team_split_override_reason CHECK (
        team_split_override_reason IS NULL
        OR team_split_override_reason IN ('one_off_team', 'config_override')
      );
  END IF;
END
$$;

COMMENT ON COLUMN mdata.loads.team_split_override_primary_ratio IS
  'Per-load team-split override (P2b convergence). Set via POST /api/v1/loads/:id/team-split facade; read by settlements/team-splits/apply.ts ahead of the active mdata.driver_teams row. Immutability vs posted splits enforced in the route (driver_finance.team_settlement_splits.applied_to_settlement_id latch).';
