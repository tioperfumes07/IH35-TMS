-- P8-COMP-2: FMCSA Part 382 drug & alcohol compliance program
BEGIN;

CREATE TABLE IF NOT EXISTS compliance.drug_alcohol_pool_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz NULL,
  removal_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_da_pool_member UNIQUE (operating_company_id, driver_id)
);

CREATE TABLE IF NOT EXISTS compliance.drug_alcohol_random_draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  quarter smallint NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year integer NOT NULL,
  drug_count integer NOT NULL DEFAULT 0,
  alcohol_count integer NOT NULL DEFAULT 0,
  drawn_at timestamptz NOT NULL DEFAULT now(),
  selection_seed text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_da_random_draw_period UNIQUE (operating_company_id, year, quarter)
);

CREATE TABLE IF NOT EXISTS compliance.drug_alcohol_random_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  draw_id uuid NOT NULL REFERENCES compliance.drug_alcohol_random_draws(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id) ON DELETE CASCADE,
  test_type text NOT NULL CHECK (test_type IN ('drug', 'alcohol')),
  notified_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_da_random_selection UNIQUE (draw_id, driver_id, test_type)
);

CREATE TABLE IF NOT EXISTS compliance.drug_alcohol_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id) ON DELETE CASCADE,
  test_date date NOT NULL,
  test_type text NOT NULL CHECK (test_type IN ('drug', 'alcohol')),
  test_reason text NOT NULL CHECK (
    test_reason IN (
      'pre_employment',
      'random',
      'post_accident',
      'reasonable_suspicion',
      'return_to_duty',
      'follow_up'
    )
  ),
  result text NOT NULL CHECK (result IN ('negative', 'positive', 'refusal', 'dilute')),
  lab_id text NULL,
  mro_verified_at timestamptz NULL,
  clearinghouse_reported_at timestamptz NULL,
  clearinghouse_pending boolean NOT NULL DEFAULT false,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance.return_to_duty_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id) ON DELETE CASCADE,
  test_result_id uuid NULL REFERENCES compliance.drug_alcohol_test_results(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  sap_assigned text NULL,
  follow_up_test_schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'complete', 'cancelled')),
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_da_pool_members_company_active
  ON compliance.drug_alcohol_pool_members (operating_company_id, added_at DESC)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_da_test_results_company_year
  ON compliance.drug_alcohol_test_results (operating_company_id, test_date DESC);

CREATE INDEX IF NOT EXISTS idx_da_rtd_company_open
  ON compliance.return_to_duty_processes (operating_company_id, status, started_at DESC)
  WHERE status IN ('open', 'in_progress');

ALTER TABLE compliance.drug_alcohol_pool_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.drug_alcohol_random_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.drug_alcohol_random_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.drug_alcohol_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.return_to_duty_processes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS da_pool_members_tenant ON compliance.drug_alcohol_pool_members;
CREATE POLICY da_pool_members_tenant ON compliance.drug_alcohol_pool_members
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS da_random_draws_tenant ON compliance.drug_alcohol_random_draws;
CREATE POLICY da_random_draws_tenant ON compliance.drug_alcohol_random_draws
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS da_random_selections_tenant ON compliance.drug_alcohol_random_selections;
CREATE POLICY da_random_selections_tenant ON compliance.drug_alcohol_random_selections
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS da_test_results_tenant ON compliance.drug_alcohol_test_results;
CREATE POLICY da_test_results_tenant ON compliance.drug_alcohol_test_results
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS da_rtd_tenant ON compliance.return_to_duty_processes;
CREATE POLICY da_rtd_tenant ON compliance.return_to_duty_processes
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT USAGE ON SCHEMA compliance TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON compliance.drug_alcohol_pool_members TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON compliance.drug_alcohol_random_draws TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON compliance.drug_alcohol_random_selections TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON compliance.drug_alcohol_test_results TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON compliance.return_to_duty_processes TO ih35_app;

COMMIT;
