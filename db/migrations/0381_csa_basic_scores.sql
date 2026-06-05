-- P8-COMP-3: CSA BASIC score automation (FMCSA pull + projection + mitigation queue)
BEGIN;

CREATE SCHEMA IF NOT EXISTS compliance;

DO $$
BEGIN
  CREATE TYPE compliance.csa_basic_category AS ENUM (
    'unsafe_driving',
    'hos_compliance',
    'driver_fitness',
    'controlled_substances_alcohol',
    'vehicle_maintenance',
    'hazmat_compliance',
    'crash_indicator'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE compliance.csa_alert_status AS ENUM ('yes', 'no', 'inconclusive');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE compliance.csa_mitigation_action_type AS ENUM (
    'coaching_campaign',
    'elog_audit',
    'dq_file_audit',
    'drug_program_audit',
    'inspection_blitz',
    'hazmat_file_review',
    'incident_prevention',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE compliance.csa_mitigation_status AS ENUM (
    'open',
    'in_progress',
    'blocked',
    'completed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS compliance.csa_basic_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  basic_category compliance.csa_basic_category NOT NULL,
  score numeric(6, 2) NULL,
  pct_percentile numeric(6, 2) NULL,
  threshold numeric(6, 2) NOT NULL,
  alert_status compliance.csa_alert_status NOT NULL DEFAULT 'inconclusive',
  pulled_at timestamptz NOT NULL DEFAULT now(),
  source_url text NULL,
  source_dot_number text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_csa_basic_scores_company_snapshot_basic UNIQUE (operating_company_id, snapshot_date, basic_category),
  CONSTRAINT ck_csa_basic_score_range CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  CONSTRAINT ck_csa_basic_pct_range CHECK (pct_percentile IS NULL OR (pct_percentile >= 0 AND pct_percentile <= 100))
);

CREATE TABLE IF NOT EXISTS compliance.csa_mitigation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  basic_category compliance.csa_basic_category NOT NULL,
  action_type compliance.csa_mitigation_action_type NOT NULL,
  title text NOT NULL,
  description text NULL,
  owner_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  due_date date NOT NULL,
  status compliance.csa_mitigation_status NOT NULL DEFAULT 'open',
  priority integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 10),
  source_trigger text NOT NULL DEFAULT 'manual',
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_csa_basic_scores_company_date
  ON compliance.csa_basic_scores (operating_company_id, snapshot_date DESC, basic_category);

CREATE INDEX IF NOT EXISTS idx_csa_basic_scores_pulled_at
  ON compliance.csa_basic_scores (pulled_at DESC);

CREATE INDEX IF NOT EXISTS idx_csa_mitigation_actions_company_status_due
  ON compliance.csa_mitigation_actions (operating_company_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_csa_mitigation_actions_company_category_status
  ON compliance.csa_mitigation_actions (operating_company_id, basic_category, status);

ALTER TABLE compliance.csa_basic_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.csa_mitigation_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS csa_basic_scores_tenant_scope ON compliance.csa_basic_scores;
CREATE POLICY csa_basic_scores_tenant_scope
  ON compliance.csa_basic_scores
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS csa_mitigation_actions_tenant_scope ON compliance.csa_mitigation_actions;
CREATE POLICY csa_mitigation_actions_tenant_scope
  ON compliance.csa_mitigation_actions
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT USAGE ON SCHEMA compliance TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON compliance.csa_basic_scores TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON compliance.csa_mitigation_actions TO ih35_app;

COMMIT;
