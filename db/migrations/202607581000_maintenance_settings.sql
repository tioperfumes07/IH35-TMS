-- Block 0441-mod2-settings-view-only: company-scoped maintenance module settings (PM defaults, shop, notifications, bay policy).
-- Pattern mirrors safety.safety_settings — operational config, not GL/financial.

BEGIN;

CREATE TABLE IF NOT EXISTS maintenance.maintenance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL UNIQUE REFERENCES org.companies(id) ON DELETE CASCADE,
  pm_interval_days_default int NOT NULL DEFAULT 30 CHECK (pm_interval_days_default BETWEEN 1 AND 365),
  notification_email_enabled boolean NOT NULL DEFAULT true,
  default_shop_location text NOT NULL DEFAULT 'Main yard',
  bay_assignment_policy text NOT NULL DEFAULT 'Auto-assign by first available bay',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION maintenance.touch_maintenance_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_maintenance_settings_touch_updated_at ON maintenance.maintenance_settings;
CREATE TRIGGER trg_maintenance_settings_touch_updated_at
BEFORE UPDATE ON maintenance.maintenance_settings
FOR EACH ROW
EXECUTE FUNCTION maintenance.touch_maintenance_settings_updated_at();

CREATE OR REPLACE FUNCTION maintenance.ensure_company_maintenance_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, maintenance
AS $$
BEGIN
  INSERT INTO maintenance.maintenance_settings (operating_company_id)
  VALUES (NEW.id)
  ON CONFLICT (operating_company_id) DO NOTHING;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_org_companies_maintenance_settings ON org.companies;
CREATE TRIGGER trg_org_companies_maintenance_settings
AFTER INSERT ON org.companies
FOR EACH ROW
EXECUTE FUNCTION maintenance.ensure_company_maintenance_settings();

INSERT INTO maintenance.maintenance_settings (operating_company_id)
SELECT c.id
FROM org.companies c
LEFT JOIN maintenance.maintenance_settings s ON s.operating_company_id = c.id
WHERE s.id IS NULL;

ALTER TABLE maintenance.maintenance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance.maintenance_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_settings_company_scope ON maintenance.maintenance_settings;
CREATE POLICY maintenance_settings_company_scope
  ON maintenance.maintenance_settings
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON maintenance.maintenance_settings TO ih35_app;

COMMIT;
