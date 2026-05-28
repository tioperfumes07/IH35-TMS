BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'drug_test_result_enum'
      AND n.nspname = 'safety'
  ) THEN
    CREATE TYPE safety.drug_test_result_enum AS ENUM (
      'negative',
      'positive',
      'refusal',
      'adulterated',
      'substituted',
      'cancelled'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'random_pool_status_enum'
      AND n.nspname = 'safety'
  ) THEN
    CREATE TYPE safety.random_pool_status_enum AS ENUM (
      'selected',
      'notified',
      'scheduled',
      'completed',
      'missed',
      'excused'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'clearinghouse_query_status_enum'
      AND n.nspname = 'safety'
  ) THEN
    CREATE TYPE safety.clearinghouse_query_status_enum AS ENUM (
      'clear',
      'record_found',
      'pending',
      'error'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS safety.drug_test (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  test_type TEXT NOT NULL DEFAULT 'random',
  result safety.drug_test_result_enum NOT NULL,
  test_date DATE NOT NULL,
  lab_name TEXT NULL,
  mro_name TEXT NULL,
  notes TEXT NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safety.random_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  selection_period TEXT NOT NULL,
  selection_seed TEXT NULL,
  status safety.random_pool_status_enum NOT NULL DEFAULT 'selected',
  selected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_test_id UUID NULL REFERENCES safety.drug_test(id) ON DELETE SET NULL,
  notes TEXT NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safety.clearinghouse_query (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  query_status safety.clearinghouse_query_status_enum NOT NULL,
  queried_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consent_on_file BOOLEAN NOT NULL DEFAULT false,
  expires_at DATE NULL,
  notes TEXT NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drug_test_company_driver_date
  ON safety.drug_test (operating_company_id, driver_id, test_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_drug_test_company_result_open
  ON safety.drug_test (operating_company_id, result, test_date DESC)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_random_pool_company_driver_selected
  ON safety.random_pool (operating_company_id, driver_id, selected_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_random_pool_company_status_open
  ON safety.random_pool (operating_company_id, status, selected_at DESC)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clearinghouse_company_driver_queried
  ON safety.clearinghouse_query (operating_company_id, driver_id, queried_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clearinghouse_company_status_open
  ON safety.clearinghouse_query (operating_company_id, query_status, queried_at DESC)
  WHERE voided_at IS NULL;

ALTER TABLE safety.drug_test ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.random_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.clearinghouse_query ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drug_test_tenant_scope ON safety.drug_test;
CREATE POLICY drug_test_tenant_scope
  ON safety.drug_test
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS random_pool_tenant_scope ON safety.random_pool;
CREATE POLICY random_pool_tenant_scope
  ON safety.random_pool
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS clearinghouse_query_tenant_scope ON safety.clearinghouse_query;
CREATE POLICY clearinghouse_query_tenant_scope
  ON safety.clearinghouse_query
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.drug_test TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON safety.random_pool TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON safety.clearinghouse_query TO ih35_app;

CREATE OR REPLACE FUNCTION safety.touch_drug_test_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_touch_drug_test_updated_at ON safety.drug_test;
CREATE TRIGGER trg_touch_drug_test_updated_at
BEFORE UPDATE ON safety.drug_test
FOR EACH ROW
EXECUTE FUNCTION safety.touch_drug_test_updated_at();

CREATE OR REPLACE FUNCTION safety.touch_random_pool_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_touch_random_pool_updated_at ON safety.random_pool;
CREATE TRIGGER trg_touch_random_pool_updated_at
BEFORE UPDATE ON safety.random_pool
FOR EACH ROW
EXECUTE FUNCTION safety.touch_random_pool_updated_at();

CREATE OR REPLACE FUNCTION safety.touch_clearinghouse_query_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_touch_clearinghouse_query_updated_at ON safety.clearinghouse_query;
CREATE TRIGGER trg_touch_clearinghouse_query_updated_at
BEFORE UPDATE ON safety.clearinghouse_query
FOR EACH ROW
EXECUTE FUNCTION safety.touch_clearinghouse_query_updated_at();

COMMIT;
