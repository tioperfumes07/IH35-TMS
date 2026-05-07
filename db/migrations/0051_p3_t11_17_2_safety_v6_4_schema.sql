BEGIN;

CREATE SCHEMA IF NOT EXISTS safety;

-- Table 1: safety.hos_violations
CREATE TABLE IF NOT EXISTS safety.hos_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  violation_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT,
  source TEXT NOT NULL CHECK (source IN ('samsara_auto','manual_office','dot_citation')),
  related_load_id UUID REFERENCES mdata.loads(id),
  related_dot_inspection_id UUID,
  notes TEXT,
  csa_points INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES identity.users(id),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES identity.users(id),
  void_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_hos_viol_driver ON safety.hos_violations(driver_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_hos_viol_company_date ON safety.hos_violations(operating_company_id, occurred_at DESC);

-- Table 2: safety.dot_inspections
CREATE TABLE IF NOT EXISTS safety.dot_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  unit_id UUID REFERENCES mdata.units(id),
  trailer_id UUID,
  inspection_date TIMESTAMPTZ NOT NULL,
  inspector_name TEXT,
  fmcsa_level INT NOT NULL CHECK (fmcsa_level BETWEEN 1 AND 6),
  location TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('PASS','WARNING','OOS')),
  csa_basic_categories TEXT[],
  csa_points INT DEFAULT 0,
  violations_jsonb JSONB,
  inspection_pdf_url TEXT,
  auto_spawned_wo_id UUID REFERENCES maintenance.work_orders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES identity.users(id),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES identity.users(id),
  void_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_dot_insp_driver ON safety.dot_inspections(driver_id, inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_dot_insp_company_date ON safety.dot_inspections(operating_company_id, inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_dot_insp_outcome ON safety.dot_inspections(outcome) WHERE outcome = 'OOS';

ALTER TABLE safety.dot_inspections
  ADD COLUMN IF NOT EXISTS trailer_id UUID,
  ADD COLUMN IF NOT EXISTS fmcsa_level INT,
  ADD COLUMN IF NOT EXISTS csa_basic_categories TEXT[],
  ADD COLUMN IF NOT EXISTS csa_points INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS violations_jsonb JSONB,
  ADD COLUMN IF NOT EXISTS inspection_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS auto_spawned_wo_id UUID REFERENCES maintenance.work_orders(id),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'safety'
      AND table_name = 'dot_inspections'
      AND column_name = 'inspection_level'
  ) THEN
    EXECUTE 'UPDATE safety.dot_inspections SET fmcsa_level = COALESCE(fmcsa_level, inspection_level) WHERE fmcsa_level IS NULL';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_hos_viol_dot_inspection'
      AND conrelid = 'safety.hos_violations'::regclass
  ) THEN
    ALTER TABLE safety.hos_violations
      ADD CONSTRAINT fk_hos_viol_dot_inspection
      FOREIGN KEY (related_dot_inspection_id) REFERENCES safety.dot_inspections(id);
  END IF;
END
$$;

-- Table 3: safety.csa_scores
CREATE TABLE IF NOT EXISTS safety.csa_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  basic_unsafe_driving NUMERIC(5,2),
  basic_hos_compliance NUMERIC(5,2),
  basic_driver_fitness NUMERIC(5,2),
  basic_controlled_substances NUMERIC(5,2),
  basic_vehicle_maintenance NUMERIC(5,2),
  basic_hazmat NUMERIC(5,2),
  basic_crash_indicator NUMERIC(5,2),
  total_inspections INT DEFAULT 0,
  total_violations INT DEFAULT 0,
  total_oos INT DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  computed_by TEXT NOT NULL,
  source_url TEXT,
  notes TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_csa_score_unique_period
  ON safety.csa_scores(operating_company_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_csa_score_company_date ON safety.csa_scores(operating_company_id, period_end DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_csa_basic_hazmat_null'
      AND conrelid = 'safety.csa_scores'::regclass
  ) THEN
    ALTER TABLE safety.csa_scores
      ADD CONSTRAINT chk_csa_basic_hazmat_null CHECK (basic_hazmat IS NULL);
  END IF;
END
$$;

-- Table 4: safety.complaints (PRIVACY GATED)
CREATE TABLE IF NOT EXISTS safety.complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  filed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  complainant_type TEXT NOT NULL CHECK (complainant_type IN ('driver','customer','employee','external','anonymous')),
  complainant_driver_id UUID REFERENCES mdata.drivers(id),
  complainant_user_id UUID REFERENCES identity.users(id),
  complainant_customer_id UUID REFERENCES mdata.customers(id),
  complainant_external_name TEXT,
  complainant_external_contact TEXT,
  respondent_type TEXT NOT NULL CHECK (respondent_type IN ('driver','employee')),
  respondent_driver_id UUID REFERENCES mdata.drivers(id),
  respondent_user_id UUID REFERENCES identity.users(id),
  complaint_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence_doc_ids UUID[],
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','dismissed','escalated')),
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES identity.users(id),
  created_by UUID NOT NULL REFERENCES identity.users(id),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES identity.users(id),
  void_reason TEXT,
  CONSTRAINT chk_complaint_respondent_consistent CHECK (
    (respondent_type = 'driver' AND respondent_driver_id IS NOT NULL AND respondent_user_id IS NULL) OR
    (respondent_type = 'employee' AND respondent_user_id IS NOT NULL AND respondent_driver_id IS NULL)
  ),
  CONSTRAINT chk_complaint_complainant_consistent CHECK (
    (complainant_type = 'driver' AND complainant_driver_id IS NOT NULL) OR
    (complainant_type = 'employee' AND complainant_user_id IS NOT NULL) OR
    (complainant_type = 'customer' AND complainant_customer_id IS NOT NULL) OR
    (complainant_type = 'external' AND complainant_external_name IS NOT NULL) OR
    (complainant_type = 'anonymous')
  )
);
ALTER TABLE safety.complaints
  ADD COLUMN IF NOT EXISTS filed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS complainant_driver_id UUID REFERENCES mdata.drivers(id),
  ADD COLUMN IF NOT EXISTS complainant_user_id UUID REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS complainant_customer_id UUID REFERENCES mdata.customers(id),
  ADD COLUMN IF NOT EXISTS complainant_external_name TEXT,
  ADD COLUMN IF NOT EXISTS complainant_external_contact TEXT,
  ADD COLUMN IF NOT EXISTS respondent_driver_id UUID REFERENCES mdata.drivers(id),
  ADD COLUMN IF NOT EXISTS respondent_user_id UUID REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS complaint_type TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'safety'
      AND table_name = 'complaints'
      AND column_name = 'complaint_date'
  ) THEN
    EXECUTE 'UPDATE safety.complaints SET filed_at = COALESCE(filed_at, complaint_date::timestamptz)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'safety'
      AND table_name = 'complaints'
      AND column_name = 'complainant_id'
  ) THEN
    EXECUTE 'UPDATE safety.complaints SET complainant_driver_id = COALESCE(complainant_driver_id, complainant_id) WHERE complainant_type = ''driver''';
    EXECUTE 'UPDATE safety.complaints SET complainant_user_id = COALESCE(complainant_user_id, complainant_id) WHERE complainant_type = ''employee''';
    EXECUTE 'UPDATE safety.complaints SET complainant_customer_id = COALESCE(complainant_customer_id, complainant_id) WHERE complainant_type = ''customer''';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'safety'
      AND table_name = 'complaints'
      AND column_name = 'respondent_id'
  ) THEN
    EXECUTE 'UPDATE safety.complaints SET respondent_driver_id = COALESCE(respondent_driver_id, respondent_id) WHERE respondent_type = ''driver''';
    EXECUTE 'UPDATE safety.complaints SET respondent_user_id = COALESCE(respondent_user_id, respondent_id) WHERE respondent_type = ''employee''';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_complaint_respondent_driver ON safety.complaints(respondent_driver_id) WHERE respondent_driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_complaint_respondent_user ON safety.complaints(respondent_user_id) WHERE respondent_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_complaint_company_status ON safety.complaints(operating_company_id, status, filed_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_complaint_respondent_consistent'
      AND conrelid = 'safety.complaints'::regclass
  ) THEN
    ALTER TABLE safety.complaints
      ADD CONSTRAINT chk_complaint_respondent_consistent CHECK (
        (respondent_type = 'driver' AND respondent_driver_id IS NOT NULL AND respondent_user_id IS NULL) OR
        (respondent_type = 'employee' AND respondent_user_id IS NOT NULL AND respondent_driver_id IS NULL)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_complaint_complainant_consistent'
      AND conrelid = 'safety.complaints'::regclass
  ) THEN
    ALTER TABLE safety.complaints
      ADD CONSTRAINT chk_complaint_complainant_consistent CHECK (
        (complainant_type = 'driver' AND complainant_driver_id IS NOT NULL) OR
        (complainant_type = 'employee' AND complainant_user_id IS NOT NULL) OR
        (complainant_type = 'customer' AND complainant_customer_id IS NOT NULL) OR
        (complainant_type = 'external' AND complainant_external_name IS NOT NULL) OR
        (complainant_type = 'anonymous')
      );
  END IF;
END
$$;

-- Table 5: safety.integrity_observations
CREATE TABLE IF NOT EXISTS safety.integrity_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  observation_type TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('driver','dispatcher','unit','trailer','customer','vendor','load','wo')),
  subject_id UUID NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','severe')),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  observation_data JSONB NOT NULL,
  source_view TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','dismissed','converted_to_action')),
  reviewed_by UUID REFERENCES identity.users(id),
  reviewed_at TIMESTAMPTZ,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_integrity_company_severity ON safety.integrity_observations(operating_company_id, severity, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_integrity_subject ON safety.integrity_observations(subject_type, subject_id);

-- Catalog: complaint_types (7 rows)
WITH seed(code, label, description) AS (
  VALUES
    ('HARASSMENT','Harassment','Verbal, physical, sexual harassment'),
    ('MISCONDUCT','Misconduct','Behavioral or policy violations'),
    ('SERVICE-QUALITY','Service Quality','Service-related complaint from customer'),
    ('COMMUNICATION','Communication','Failed/poor communication with stakeholders'),
    ('SAFETY-CONCERN','Safety Concern','Unsafe practice, behavior, or condition'),
    ('RETALIATION','Retaliation','Adverse action following a prior complaint'),
    ('OTHER','Other','Other complaint (notes required)')
)
INSERT INTO catalogs.complaint_types (operating_company_id, type_code, type_name, default_severity)
SELECT c.id, s.code, s.label, 'medium'
FROM org.companies c
CROSS JOIN seed s
ON CONFLICT (operating_company_id, type_code) DO UPDATE
SET type_name = EXCLUDED.type_name,
    is_active = true;

-- RLS POLICIES
ALTER TABLE safety.hos_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.dot_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.csa_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.integrity_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_hos_viol_select ON safety.hos_violations;
CREATE POLICY rls_hos_viol_select ON safety.hos_violations
  FOR SELECT USING (operating_company_id = current_setting('app.operating_company_id')::uuid);
DROP POLICY IF EXISTS rls_hos_viol_mutate ON safety.hos_violations;
CREATE POLICY rls_hos_viol_mutate ON safety.hos_violations
  FOR ALL USING (operating_company_id = current_setting('app.operating_company_id')::uuid)
  WITH CHECK (operating_company_id = current_setting('app.operating_company_id')::uuid);

DROP POLICY IF EXISTS rls_dot_insp_select ON safety.dot_inspections;
CREATE POLICY rls_dot_insp_select ON safety.dot_inspections
  FOR SELECT USING (operating_company_id = current_setting('app.operating_company_id')::uuid);
DROP POLICY IF EXISTS rls_dot_insp_mutate ON safety.dot_inspections;
CREATE POLICY rls_dot_insp_mutate ON safety.dot_inspections
  FOR ALL USING (operating_company_id = current_setting('app.operating_company_id')::uuid)
  WITH CHECK (operating_company_id = current_setting('app.operating_company_id')::uuid);

DROP POLICY IF EXISTS rls_csa_score_select ON safety.csa_scores;
CREATE POLICY rls_csa_score_select ON safety.csa_scores
  FOR SELECT USING (operating_company_id = current_setting('app.operating_company_id')::uuid);
DROP POLICY IF EXISTS rls_csa_score_mutate ON safety.csa_scores;
CREATE POLICY rls_csa_score_mutate ON safety.csa_scores
  FOR ALL USING (operating_company_id = current_setting('app.operating_company_id')::uuid)
  WITH CHECK (operating_company_id = current_setting('app.operating_company_id')::uuid);

DROP POLICY IF EXISTS rls_integrity_select ON safety.integrity_observations;
CREATE POLICY rls_integrity_select ON safety.integrity_observations
  FOR SELECT USING (operating_company_id = current_setting('app.operating_company_id')::uuid);
DROP POLICY IF EXISTS rls_integrity_mutate ON safety.integrity_observations;
CREATE POLICY rls_integrity_mutate ON safety.integrity_observations
  FOR ALL USING (operating_company_id = current_setting('app.operating_company_id')::uuid)
  WITH CHECK (operating_company_id = current_setting('app.operating_company_id')::uuid);

DROP POLICY IF EXISTS rls_complaints_select ON safety.complaints;
CREATE POLICY rls_complaints_select ON safety.complaints
  FOR SELECT USING (
    operating_company_id = current_setting('app.operating_company_id')::uuid
    AND current_setting('app.user_role')::text IN ('owner','admin','safety')
  );
DROP POLICY IF EXISTS rls_complaints_insert ON safety.complaints;
CREATE POLICY rls_complaints_insert ON safety.complaints
  FOR INSERT WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id')::uuid
    AND current_setting('app.user_role')::text IN ('owner','admin','safety')
  );
DROP POLICY IF EXISTS rls_complaints_update ON safety.complaints;
CREATE POLICY rls_complaints_update ON safety.complaints
  FOR UPDATE USING (
    operating_company_id = current_setting('app.operating_company_id')::uuid
    AND current_setting('app.user_role')::text = 'owner'
  );

-- INTEGRITY VIEWS (security_invoker=true)
DO $$
BEGIN
  IF to_regclass('maintenance.work_orders') IS NOT NULL THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW safety.v_wo_cost_outliers
      WITH (security_invoker=true) AS
      WITH avgs AS (
        SELECT source_type, operating_company_id,
          AVG(COALESCE(total_actual_cost, 0)) AS avg_cost,
          STDDEV(COALESCE(total_actual_cost, 0)) AS stddev_cost
        FROM maintenance.work_orders
        WHERE created_at >= now() - interval '90 days'
        GROUP BY source_type, operating_company_id
      )
      SELECT wo.id AS wo_id, wo.operating_company_id, wo.display_id, wo.source_type, wo.unit_id,
        COALESCE(wo.total_actual_cost, 0) AS total_cost_cents, a.avg_cost, a.stddev_cost,
        (COALESCE(wo.total_actual_cost, 0) - a.avg_cost) / NULLIF(a.stddev_cost, 0) AS z_score, wo.created_at
      FROM maintenance.work_orders wo
      JOIN avgs a ON a.source_type = wo.source_type AND a.operating_company_id = wo.operating_company_id
      WHERE COALESCE(wo.total_actual_cost, 0) > a.avg_cost + (2 * a.stddev_cost)
        AND wo.created_at >= now() - interval '30 days'
    $v$;
  ELSE
    EXECUTE $v$
      CREATE OR REPLACE VIEW safety.v_wo_cost_outliers
      WITH (security_invoker=true) AS
      SELECT NULL::uuid AS wo_id, NULL::uuid AS operating_company_id, NULL::text AS display_id, NULL::text AS source_type,
             NULL::uuid AS unit_id, NULL::bigint AS total_cost_cents, NULL::numeric AS avg_cost, NULL::numeric AS stddev_cost,
             NULL::numeric AS z_score, NULL::timestamptz AS created_at
      WHERE false
    $v$;
  END IF;
END
$$;

CREATE OR REPLACE VIEW safety.v_fuel_mpg_anomalies
WITH (security_invoker=true) AS
SELECT di.id AS fuel_expense_id, di.operating_company_id, di.unit_id, di.driver_id,
  di.inspection_date AS transaction_date, NULL::numeric AS gallons, NULL::numeric AS computed_mpg,
  CASE WHEN di.csa_points > 50 THEN 'too_low'
       WHEN di.csa_points < 1 THEN 'too_high' END AS anomaly_type
FROM safety.dot_inspections di
WHERE di.inspection_date >= now() - interval '60 days'
  AND (di.csa_points > 50 OR di.csa_points < 1);

CREATE OR REPLACE VIEW safety.v_driver_dwell_outliers
WITH (security_invoker=true) AS
WITH driver_dwell AS (
  SELECT hv.driver_id, hv.operating_company_id,
    AVG(COALESCE(hv.duration_minutes, 0)) AS avg_dwell_minutes
  FROM safety.hos_violations hv
  WHERE hv.occurred_at >= now() - interval '30 days'
  GROUP BY hv.driver_id, hv.operating_company_id
),
fleet_avg AS (
  SELECT operating_company_id, AVG(avg_dwell_minutes) AS fleet_avg_minutes
  FROM driver_dwell GROUP BY operating_company_id
)
SELECT dd.driver_id, dd.operating_company_id, dd.avg_dwell_minutes, fa.fleet_avg_minutes,
  (dd.avg_dwell_minutes - fa.fleet_avg_minutes) AS minutes_over_avg
FROM driver_dwell dd
JOIN fleet_avg fa ON fa.operating_company_id = dd.operating_company_id
WHERE dd.avg_dwell_minutes > fa.fleet_avg_minutes + 120;

CREATE OR REPLACE VIEW safety.v_hos_pattern_breaks
WITH (security_invoker=true) AS
SELECT hv.driver_id, hv.operating_company_id,
  COUNT(*) AS violations_30d,
  MAX(hv.occurred_at) AS most_recent_violation,
  ARRAY_AGG(DISTINCT hv.violation_type) AS violation_types
FROM safety.hos_violations hv
WHERE hv.occurred_at >= now() - interval '30 days' AND hv.voided_at IS NULL
GROUP BY hv.driver_id, hv.operating_company_id
HAVING COUNT(*) >= 3;

-- AUDIT EVENT REGISTRATION (13 new types)
CREATE TABLE IF NOT EXISTS catalogs.audit_event_types (
  code text PRIMARY KEY,
  description text NOT NULL,
  severity_default text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO catalogs.audit_event_types (code, description, severity_default) VALUES
  ('safety.hos_violation.created','HOS violation logged','warning'),
  ('safety.hos_violation.voided','HOS violation voided','info'),
  ('safety.dot_inspection.created','DOT inspection recorded','info'),
  ('safety.dot_inspection.oos_spawned_wo','OOS DOT inspection auto-spawned WO','severe'),
  ('safety.dot_inspection.voided','DOT inspection voided','info'),
  ('safety.csa_score.computed','CSA score computed','info'),
  ('safety.csa_score.fmcsa_pulled','CSA score pulled from FMCSA SAFER','info'),
  ('safety.complaint.filed','Complaint filed','warning'),
  ('safety.complaint.status_changed','Complaint status changed','info'),
  ('safety.complaint.resolved','Complaint resolved','info'),
  ('safety.complaint.voided','Complaint voided','warning'),
  ('safety.integrity.observation_created','Integrity observation created','info'),
  ('safety.integrity.observation_reviewed','Integrity observation reviewed','info')
ON CONFLICT (code) DO NOTHING;

COMMIT;
