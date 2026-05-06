BEGIN;

CREATE TABLE IF NOT EXISTS mdata.driver_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  team_name TEXT NOT NULL,
  primary_driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  secondary_driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  relationship TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID NOT NULL REFERENCES identity.users(id),
  CONSTRAINT chk_driver_teams_no_self_pair CHECK (primary_driver_id <> secondary_driver_id),
  CONSTRAINT chk_driver_teams_effective_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_driver_in_active_team_primary
  ON mdata.driver_teams (primary_driver_id)
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_driver_in_active_team_secondary
  ON mdata.driver_teams (secondary_driver_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_driver_teams_company_active
  ON mdata.driver_teams (operating_company_id, is_active);

CREATE OR REPLACE FUNCTION mdata.enforce_active_driver_team_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_active THEN
    IF EXISTS (
      SELECT 1
      FROM mdata.driver_teams t
      WHERE t.id <> NEW.id
        AND t.is_active = true
        AND (
          t.primary_driver_id = NEW.primary_driver_id
          OR t.secondary_driver_id = NEW.primary_driver_id
          OR t.primary_driver_id = NEW.secondary_driver_id
          OR t.secondary_driver_id = NEW.secondary_driver_id
        )
    ) THEN
      RAISE EXCEPTION 'driver already belongs to an active team'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_driver_teams_active_membership ON mdata.driver_teams;
CREATE TRIGGER trg_driver_teams_active_membership
BEFORE INSERT OR UPDATE ON mdata.driver_teams
FOR EACH ROW
EXECUTE FUNCTION mdata.enforce_active_driver_team_membership();

ALTER TABLE mdata.driver_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_teams_select_office ON mdata.driver_teams;
CREATE POLICY driver_teams_select_office ON mdata.driver_teams
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id IN (
      SELECT company_id FROM org.user_company_access
      WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
    )
  );

DROP POLICY IF EXISTS driver_teams_select_driver ON mdata.driver_teams;
CREATE POLICY driver_teams_select_driver ON mdata.driver_teams
  FOR SELECT TO ih35_app
  USING (
    EXISTS (
      SELECT 1 FROM mdata.drivers d
      WHERE d.identity_user_id = identity.current_user_id()
        AND (d.id = mdata.driver_teams.primary_driver_id OR d.id = mdata.driver_teams.secondary_driver_id)
    )
  );

DROP POLICY IF EXISTS driver_teams_insert ON mdata.driver_teams;
CREATE POLICY driver_teams_insert ON mdata.driver_teams
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum,
        'Dispatcher'::identity.role_enum
      ]
    )
  );

DROP POLICY IF EXISTS driver_teams_update ON mdata.driver_teams;
CREATE POLICY driver_teams_update ON mdata.driver_teams
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum,
        'Dispatcher'::identity.role_enum
      ]
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum,
        'Dispatcher'::identity.role_enum
      ]
    )
  );

GRANT SELECT, INSERT, UPDATE ON mdata.driver_teams TO ih35_app;

DROP TRIGGER IF EXISTS trg_driver_teams_updated_at ON mdata.driver_teams;
CREATE TRIGGER trg_driver_teams_updated_at
  BEFORE UPDATE ON mdata.driver_teams
  FOR EACH ROW EXECUTE FUNCTION mdata.set_updated_at();

COMMIT;
