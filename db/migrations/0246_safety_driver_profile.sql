BEGIN;

CREATE TABLE IF NOT EXISTS safety.driver_safety_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL,
  profile_status TEXT NOT NULL DEFAULT 'active',
  hire_date DATE NULL,
  medical_days_to_expiry INTEGER NULL,
  dq_missing_count INTEGER NOT NULL DEFAULT 0,
  background_due_count INTEGER NOT NULL DEFAULT 0,
  training_due_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, driver_id)
);

ALTER TABLE safety.driver_safety_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_safety_profiles_tenant_scope ON safety.driver_safety_profiles;
CREATE POLICY driver_safety_profiles_tenant_scope
  ON safety.driver_safety_profiles
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.driver_safety_profiles TO ih35_app;

CREATE OR REPLACE FUNCTION safety.touch_driver_safety_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_touch_driver_safety_profiles_updated_at ON safety.driver_safety_profiles;
CREATE TRIGGER trg_touch_driver_safety_profiles_updated_at
BEFORE UPDATE ON safety.driver_safety_profiles
FOR EACH ROW
EXECUTE FUNCTION safety.touch_driver_safety_profiles_updated_at();

COMMIT;
