BEGIN;

CREATE SCHEMA IF NOT EXISTS safety;

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_liabilities') IS NOT NULL THEN
    ALTER TABLE driver_finance.driver_liabilities
      ADD COLUMN IF NOT EXISTS origin text,
      ADD COLUMN IF NOT EXISTS origin_id uuid,
      ADD COLUMN IF NOT EXISTS reference_doc_id uuid,
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_recovery';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS safety.fines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('driver','company')),
  subject_driver_id uuid NULL REFERENCES mdata.drivers(id) ON DELETE SET NULL,
  issued_by_authority text NOT NULL,
  jurisdiction text NULL,
  violation_code text NULL,
  violation_description text NOT NULL,
  issued_date date NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  paid_date date NULL,
  paid_amount_cents bigint NULL CHECK (paid_amount_cents IS NULL OR paid_amount_cents >= 0),
  paid_via_bank_transaction_id uuid NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','contested','dismissed','reduced')),
  converted_to_liability_id uuid NULL UNIQUE,
  converted_at timestamptz NULL,
  converted_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  related_load_id uuid NULL REFERENCES mdata.loads(id) ON DELETE SET NULL,
  related_unit_id uuid NULL REFERENCES mdata.units(id) ON DELETE SET NULL,
  notes text NULL,
  source_doc_id uuid NULL REFERENCES docs.files(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  CONSTRAINT chk_fine_subject_consistency CHECK (
    (subject_type = 'driver' AND subject_driver_id IS NOT NULL)
    OR (subject_type = 'company' AND subject_driver_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS safety.company_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  violation_type text NOT NULL CHECK (violation_type IN ('FMCSA_audit','DOT_inspection','CSA_intervention','state_audit','IRP','IFTA','other')),
  violation_basic text NULL,
  violation_severity text NOT NULL CHECK (violation_severity IN ('warning','minor','major','severe','OOS')),
  reported_date date NOT NULL,
  description text NOT NULL,
  corrective_action_plan text NULL,
  corrective_action_due_date date NULL,
  corrective_action_completed_date date NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed','escalated')),
  related_drivers jsonb NULL,
  related_units jsonb NULL,
  related_fine_ids jsonb NULL,
  source_doc_id uuid NULL REFERENCES docs.files(id) ON DELETE SET NULL,
  audit_export_doc_id uuid NULL REFERENCES docs.files(id) ON DELETE SET NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS safety.integrity_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  alert_category text NOT NULL CHECK (alert_category IN (
    'tire_frequency_anomaly_unit',
    'repair_frequency_anomaly_unit',
    'unit_cost_anomaly',
    'accident_frequency_driver',
    'accident_frequency_unit',
    'driver_incident_frequency',
    'driver_repair_frequency',
    'driver_mpg_anomaly',
    'driver_tire_change_frequency',
    'vendor_cost_anomaly',
    'vendor_invoice_frequency',
    'vendor_driver_collusion_pattern'
  )),
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  subject_type text NOT NULL CHECK (subject_type IN ('driver','unit','vendor','unit_driver_pair','vendor_driver_pair')),
  subject_driver_id uuid NULL REFERENCES mdata.drivers(id) ON DELETE SET NULL,
  subject_unit_id uuid NULL REFERENCES mdata.units(id) ON DELETE SET NULL,
  subject_vendor_id uuid NULL REFERENCES mdata.vendors(id) ON DELETE SET NULL,
  detection_summary text NOT NULL,
  detection_metric jsonb NOT NULL,
  source_view text NOT NULL,
  acknowledged_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz NULL,
  acknowledgment_note text NULL,
  resolution_status text NOT NULL DEFAULT 'unresolved' CHECK (resolution_status IN ('unresolved','investigating','false_positive','confirmed_action_taken','dismissed')),
  resolution_action text NULL,
  related_load_ids jsonb NULL,
  related_wo_ids jsonb NULL,
  related_safety_event_ids jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS safety.safety_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL UNIQUE REFERENCES org.companies(id) ON DELETE CASCADE,
  dashboard_active_window_days int NOT NULL DEFAULT 10 CHECK (dashboard_active_window_days BETWEEN 1 AND 90),
  dashboard_inactive_threshold_days int NOT NULL DEFAULT 15 CHECK (dashboard_inactive_threshold_days BETWEEN 1 AND 365),
  csa_score_alert_threshold int NULL,
  integrity_alert_email_to text[] NULL,
  integrity_alert_sms_to text[] NULL,
  default_fine_dispute_window_days int NOT NULL DEFAULT 30,
  violation_response_sla_days int NOT NULL DEFAULT 14,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_safety_fines_company_status ON safety.fines (operating_company_id, status);
CREATE INDEX IF NOT EXISTS idx_safety_fines_subject_driver ON safety.fines (subject_driver_id);
CREATE INDEX IF NOT EXISTS idx_safety_fines_issued_date_desc ON safety.fines (issued_date DESC);
CREATE INDEX IF NOT EXISTS idx_safety_fines_open_status ON safety.fines (status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_safety_fines_converted ON safety.fines (converted_to_liability_id) WHERE converted_to_liability_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_liabilities') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'fk_safety_fines_converted_liability'
         AND conrelid = 'safety.fines'::regclass
     ) THEN
    ALTER TABLE safety.fines
      ADD CONSTRAINT fk_safety_fines_converted_liability
      FOREIGN KEY (converted_to_liability_id)
      REFERENCES driver_finance.driver_liabilities(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_safety_company_violations_company_status ON safety.company_violations (operating_company_id, status);
CREATE INDEX IF NOT EXISTS idx_safety_company_violations_type ON safety.company_violations (violation_type);
CREATE INDEX IF NOT EXISTS idx_safety_company_violations_reported_date_desc ON safety.company_violations (reported_date DESC);

CREATE INDEX IF NOT EXISTS idx_safety_integrity_alerts_company_status ON safety.integrity_alerts (operating_company_id, resolution_status);
CREATE INDEX IF NOT EXISTS idx_safety_integrity_alerts_category ON safety.integrity_alerts (alert_category);
CREATE INDEX IF NOT EXISTS idx_safety_integrity_alerts_severity ON safety.integrity_alerts (severity);
CREATE INDEX IF NOT EXISTS idx_safety_integrity_alerts_driver ON safety.integrity_alerts (subject_driver_id);
CREATE INDEX IF NOT EXISTS idx_safety_integrity_alerts_unit ON safety.integrity_alerts (subject_unit_id);
CREATE INDEX IF NOT EXISTS idx_safety_integrity_alerts_created_desc ON safety.integrity_alerts (created_at DESC);

CREATE OR REPLACE FUNCTION safety.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_safety_fines_touch_updated_at ON safety.fines;
CREATE TRIGGER trg_safety_fines_touch_updated_at
BEFORE UPDATE ON safety.fines
FOR EACH ROW
EXECUTE FUNCTION safety.touch_updated_at();

DROP TRIGGER IF EXISTS trg_safety_company_violations_touch_updated_at ON safety.company_violations;
CREATE TRIGGER trg_safety_company_violations_touch_updated_at
BEFORE UPDATE ON safety.company_violations
FOR EACH ROW
EXECUTE FUNCTION safety.touch_updated_at();

DROP TRIGGER IF EXISTS trg_safety_integrity_alerts_touch_updated_at ON safety.integrity_alerts;
CREATE TRIGGER trg_safety_integrity_alerts_touch_updated_at
BEFORE UPDATE ON safety.integrity_alerts
FOR EACH ROW
EXECUTE FUNCTION safety.touch_updated_at();

DROP TRIGGER IF EXISTS trg_safety_settings_touch_updated_at ON safety.safety_settings;
CREATE TRIGGER trg_safety_settings_touch_updated_at
BEFORE UPDATE ON safety.safety_settings
FOR EACH ROW
EXECUTE FUNCTION safety.touch_updated_at();

CREATE OR REPLACE FUNCTION safety.enforce_fine_lock_after_conversion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.converted_to_liability_id IS NOT NULL THEN
    IF NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
       OR NEW.violation_description IS DISTINCT FROM OLD.violation_description
       OR NEW.violation_code IS DISTINCT FROM OLD.violation_code
       OR NEW.issued_date IS DISTINCT FROM OLD.issued_date
       OR NEW.subject_driver_id IS DISTINCT FROM OLD.subject_driver_id
       OR NEW.subject_type IS DISTINCT FROM OLD.subject_type THEN
      RAISE EXCEPTION 'E_FINE_LOCKED_AFTER_CONVERSION';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('paid','reduced') THEN
      RAISE EXCEPTION 'E_FINE_LOCKED_AFTER_CONVERSION';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_safety_fines_lock_after_conversion ON safety.fines;
CREATE TRIGGER trg_safety_fines_lock_after_conversion
BEFORE UPDATE ON safety.fines
FOR EACH ROW
EXECUTE FUNCTION safety.enforce_fine_lock_after_conversion();

CREATE OR REPLACE FUNCTION safety.ensure_company_safety_settings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO safety.safety_settings (operating_company_id)
  VALUES (NEW.id)
  ON CONFLICT (operating_company_id) DO NOTHING;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_org_companies_safety_settings ON org.companies;
CREATE TRIGGER trg_org_companies_safety_settings
AFTER INSERT ON org.companies
FOR EACH ROW
EXECUTE FUNCTION safety.ensure_company_safety_settings();

INSERT INTO safety.safety_settings (operating_company_id)
SELECT c.id
FROM org.companies c
LEFT JOIN safety.safety_settings s ON s.operating_company_id = c.id
WHERE s.id IS NULL;

ALTER TABLE safety.fines ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.company_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.integrity_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.safety_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'safety' AND tablename = 'fines' AND policyname = 'fines_select_policy'
  ) THEN
    CREATE POLICY fines_select_policy
    ON safety.fines
    FOR SELECT
    USING (
      operating_company_id = current_setting('app.operating_company_id', true)::uuid
      AND (
        identity.is_lucia_bypass()
        OR identity.current_user_role() IN ('Owner','Administrator','Manager','Safety','Accountant')
      )
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'safety' AND tablename = 'fines' AND policyname = 'fines_insert_policy'
  ) THEN
    CREATE POLICY fines_insert_policy
    ON safety.fines
    FOR INSERT
    WITH CHECK (
      operating_company_id = current_setting('app.operating_company_id', true)::uuid
      AND (
        identity.is_lucia_bypass()
        OR identity.current_user_role() IN ('Owner','Administrator','Safety')
      )
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'safety' AND tablename = 'fines' AND policyname = 'fines_update_policy'
  ) THEN
    CREATE POLICY fines_update_policy
    ON safety.fines
    FOR UPDATE
    USING (
      operating_company_id = current_setting('app.operating_company_id', true)::uuid
      AND (
        identity.is_lucia_bypass()
        OR identity.current_user_role() IN ('Owner','Administrator','Safety')
      )
    )
    WITH CHECK (
      operating_company_id = current_setting('app.operating_company_id', true)::uuid
      AND (
        identity.is_lucia_bypass()
        OR identity.current_user_role() IN ('Owner','Administrator','Safety')
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'safety' AND tablename = 'company_violations' AND policyname = 'company_violations_select_policy'
  ) THEN
    CREATE POLICY company_violations_select_policy
    ON safety.company_violations
    FOR SELECT
    USING (
      operating_company_id = current_setting('app.operating_company_id', true)::uuid
      AND (
        identity.is_lucia_bypass()
        OR identity.current_user_role() IN ('Owner','Administrator','Manager','Safety','Accountant')
      )
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'safety' AND tablename = 'company_violations' AND policyname = 'company_violations_insert_policy'
  ) THEN
    CREATE POLICY company_violations_insert_policy
    ON safety.company_violations
    FOR INSERT
    WITH CHECK (
      operating_company_id = current_setting('app.operating_company_id', true)::uuid
      AND (
        identity.is_lucia_bypass()
        OR identity.current_user_role() IN ('Owner','Administrator','Safety')
      )
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'safety' AND tablename = 'company_violations' AND policyname = 'company_violations_update_policy'
  ) THEN
    CREATE POLICY company_violations_update_policy
    ON safety.company_violations
    FOR UPDATE
    USING (
      operating_company_id = current_setting('app.operating_company_id', true)::uuid
      AND (
        identity.is_lucia_bypass()
        OR identity.current_user_role() IN ('Owner','Administrator','Safety')
      )
    )
    WITH CHECK (
      operating_company_id = current_setting('app.operating_company_id', true)::uuid
      AND (
        identity.is_lucia_bypass()
        OR identity.current_user_role() IN ('Owner','Administrator','Safety')
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'safety' AND tablename = 'integrity_alerts' AND policyname = 'integrity_alerts_select_policy'
  ) THEN
    CREATE POLICY integrity_alerts_select_policy
    ON safety.integrity_alerts
    FOR SELECT
    USING (
      operating_company_id = current_setting('app.operating_company_id', true)::uuid
      AND (
        identity.is_lucia_bypass()
        OR identity.current_user_role() IN ('Owner','Administrator','Manager','Safety','Accountant')
      )
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'safety' AND tablename = 'integrity_alerts' AND policyname = 'integrity_alerts_insert_policy'
  ) THEN
    CREATE POLICY integrity_alerts_insert_policy
    ON safety.integrity_alerts
    FOR INSERT
    WITH CHECK (
      operating_company_id = current_setting('app.operating_company_id', true)::uuid
      AND (
        identity.is_lucia_bypass()
        OR identity.current_user_role() IN ('Owner','Administrator','Safety')
      )
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'safety' AND tablename = 'integrity_alerts' AND policyname = 'integrity_alerts_update_policy'
  ) THEN
    CREATE POLICY integrity_alerts_update_policy
    ON safety.integrity_alerts
    FOR UPDATE
    USING (
      operating_company_id = current_setting('app.operating_company_id', true)::uuid
      AND (
        identity.is_lucia_bypass()
        OR identity.current_user_role() IN ('Owner','Administrator','Safety')
      )
    )
    WITH CHECK (
      operating_company_id = current_setting('app.operating_company_id', true)::uuid
      AND (
        identity.is_lucia_bypass()
        OR identity.current_user_role() IN ('Owner','Administrator','Safety')
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'safety' AND tablename = 'safety_settings' AND policyname = 'safety_settings_select_policy'
  ) THEN
    CREATE POLICY safety_settings_select_policy
    ON safety.safety_settings
    FOR SELECT
    USING (
      operating_company_id = current_setting('app.operating_company_id', true)::uuid
      AND (
        identity.is_lucia_bypass()
        OR identity.current_user_role() IN ('Owner','Administrator','Manager','Safety','Accountant')
      )
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'safety' AND tablename = 'safety_settings' AND policyname = 'safety_settings_update_policy'
  ) THEN
    CREATE POLICY safety_settings_update_policy
    ON safety.safety_settings
    FOR UPDATE
    USING (
      operating_company_id = current_setting('app.operating_company_id', true)::uuid
      AND (
        identity.is_lucia_bypass()
        OR identity.current_user_role() IN ('Owner','Administrator','Safety')
      )
    )
    WITH CHECK (
      operating_company_id = current_setting('app.operating_company_id', true)::uuid
      AND (
        identity.is_lucia_bypass()
        OR identity.current_user_role() IN ('Owner','Administrator','Safety')
      )
    );
  END IF;
END
$$;

COMMIT;
