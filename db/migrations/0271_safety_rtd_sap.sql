BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'rtd_stage_enum'
      AND n.nspname = 'safety'
  ) THEN
    CREATE TYPE safety.rtd_stage_enum AS ENUM (
      'removed',
      'sap_evaluation',
      'education_treatment',
      'rtd_test_scheduled',
      'rtd_test_negative',
      'follow_up_testing',
      'complete'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS safety.rtd_case (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  triggered_by_test_id UUID NULL REFERENCES safety.drug_test(id) ON DELETE SET NULL,
  stage safety.rtd_stage_enum NOT NULL DEFAULT 'removed',
  sap_name TEXT NULL,
  sap_eval_date DATE NULL,
  rtd_test_id UUID NULL REFERENCES safety.drug_test(id) ON DELETE SET NULL,
  follow_up_plan TEXT NULL,
  follow_up_tests_completed INTEGER NOT NULL DEFAULT 0,
  follow_up_tests_required INTEGER NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ NULL,
  reprimand_notes TEXT NULL,
  training_records_url TEXT NULL,
  clearinghouse_updated BOOLEAN NOT NULL DEFAULT false,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rtd_case_company_driver_open
  ON safety.rtd_case (operating_company_id, driver_id, opened_at DESC)
  WHERE voided_at IS NULL AND stage <> 'complete';

CREATE INDEX IF NOT EXISTS idx_rtd_case_company_stage_open
  ON safety.rtd_case (operating_company_id, stage, opened_at DESC)
  WHERE voided_at IS NULL;

ALTER TABLE safety.rtd_case ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rtd_case_tenant_scope ON safety.rtd_case;
CREATE POLICY rtd_case_tenant_scope
  ON safety.rtd_case
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.rtd_case TO ih35_app;

CREATE OR REPLACE FUNCTION safety.touch_rtd_case_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_touch_rtd_case_updated_at ON safety.rtd_case;
CREATE TRIGGER trg_touch_rtd_case_updated_at
BEFORE UPDATE ON safety.rtd_case
FOR EACH ROW
EXECUTE FUNCTION safety.touch_rtd_case_updated_at();

COMMIT;
