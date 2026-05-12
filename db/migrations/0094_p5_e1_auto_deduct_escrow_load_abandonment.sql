BEGIN;

CREATE SCHEMA IF NOT EXISTS dispatch;
CREATE SCHEMA IF NOT EXISTS driver_finance;

ALTER TYPE mdata.load_status_enum ADD VALUE IF NOT EXISTS 'abandoned';
ALTER TYPE mdata.load_status_enum ADD VALUE IF NOT EXISTS 'driver_walkoff';
ALTER TYPE mdata.load_status_enum ADD VALUE IF NOT EXISTS 'driver_no_show';

CREATE TABLE IF NOT EXISTS dispatch.load_abandonments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid NOT NULL REFERENCES mdata.loads(id),
  driver_id uuid REFERENCES mdata.drivers(id),
  unit_id uuid REFERENCES mdata.units(id),
  abandoned_at timestamptz NOT NULL DEFAULT now(),
  abandonment_type text NOT NULL CHECK (abandonment_type IN ('walkoff', 'no_show', 'refused_delivery', 'dropped_trailer', 'other')),
  reported_by_user_id uuid REFERENCES identity.users(id),
  abandonment_location text,
  abandonment_notes text,
  estimated_cost_cents bigint CHECK (estimated_cost_cents IS NULL OR estimated_cost_cents > 0),
  recovery_driver_id uuid REFERENCES mdata.drivers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dispatch.load_abandonments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_load_abandonments_isolation ON dispatch.load_abandonments;
CREATE POLICY rls_load_abandonments_isolation
  ON dispatch.load_abandonments
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE INDEX IF NOT EXISTS idx_load_abandon_load ON dispatch.load_abandonments (load_id);
CREATE INDEX IF NOT EXISTS idx_load_abandon_driver ON dispatch.load_abandonments (driver_id, abandoned_at DESC) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_load_abandon_company_date ON dispatch.load_abandonments (operating_company_id, abandoned_at DESC);

CREATE TABLE IF NOT EXISTS driver_finance.escrow_deductions_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  source_type text NOT NULL CHECK (source_type IN ('load_abandonment', 'damage_claim', 'manual_proposal')),
  source_id uuid,
  load_id uuid REFERENCES mdata.loads(id),
  proposed_amount_cents bigint NOT NULL CHECK (proposed_amount_cents > 0),
  proposed_reason text NOT NULL,
  proposed_breakdown_json jsonb,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  proposed_by_system boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid REFERENCES identity.users(id),
  review_notes text,
  resulting_deduction_id uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  owner_notified_at timestamptz,
  wf064_requested_at timestamptz,
  wf064_reminder_7d_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE driver_finance.escrow_deductions_pending ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_escrow_pending_isolation ON driver_finance.escrow_deductions_pending;
CREATE POLICY rls_escrow_pending_isolation
  ON driver_finance.escrow_deductions_pending
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE INDEX IF NOT EXISTS idx_escrow_pending_driver_status
  ON driver_finance.escrow_deductions_pending (driver_id, status);
CREATE INDEX IF NOT EXISTS idx_escrow_pending_company_status
  ON driver_finance.escrow_deductions_pending (operating_company_id, status, proposed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_escrow_pending_source
  ON driver_finance.escrow_deductions_pending (operating_company_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS driver_finance.driver_settlement_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  deduction_type text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  reason text NOT NULL,
  applied_to_settlement_id uuid,
  source_pending_id uuid REFERENCES driver_finance.escrow_deductions_pending(id),
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE driver_finance.driver_settlement_deductions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_driver_settlement_deductions_isolation ON driver_finance.driver_settlement_deductions;
CREATE POLICY rls_driver_settlement_deductions_isolation
  ON driver_finance.driver_settlement_deductions
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE INDEX IF NOT EXISTS idx_driver_settlement_deductions_driver
  ON driver_finance.driver_settlement_deductions (driver_id, created_at DESC);

CREATE OR REPLACE FUNCTION dispatch.auto_propose_escrow_on_abandonment()
RETURNS trigger AS $$
DECLARE
  v_abandonment_id uuid;
  v_estimated_cost_cents bigint;
  v_load_value_cents bigint;
  v_abandonment_type text;
  v_breakdown jsonb;
BEGIN
  IF NEW.status NOT IN ('abandoned', 'driver_walkoff', 'driver_no_show') THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('abandoned', 'driver_walkoff', 'driver_no_show') THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_primary_driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_load_value_cents := GREATEST(COALESCE(NEW.rate_total_cents, 0), 0);
  v_estimated_cost_cents := GREATEST((v_load_value_cents * 15) / 100, 50000);
  v_abandonment_type := CASE NEW.status
    WHEN 'driver_walkoff' THEN 'walkoff'
    WHEN 'driver_no_show' THEN 'no_show'
    ELSE 'other'
  END;

  INSERT INTO dispatch.load_abandonments (
    operating_company_id,
    load_id,
    driver_id,
    unit_id,
    abandoned_at,
    abandonment_type,
    estimated_cost_cents
  ) VALUES (
    NEW.operating_company_id,
    NEW.id,
    NEW.assigned_primary_driver_id,
    NEW.assigned_unit_id,
    now(),
    v_abandonment_type,
    v_estimated_cost_cents
  ) RETURNING id INTO v_abandonment_id;

  v_breakdown := jsonb_build_object(
    'load_value_cents', v_load_value_cents,
    'percent_factor', 15,
    'minimum_floor_cents', 50000,
    'calculated_cents', v_estimated_cost_cents,
    'load_number', NEW.load_number,
    'abandonment_type', v_abandonment_type
  );

  INSERT INTO driver_finance.escrow_deductions_pending (
    operating_company_id,
    driver_id,
    source_type,
    source_id,
    load_id,
    proposed_amount_cents,
    proposed_reason,
    proposed_breakdown_json,
    proposed_by_system
  ) VALUES (
    NEW.operating_company_id,
    NEW.assigned_primary_driver_id,
    'load_abandonment',
    v_abandonment_id,
    NEW.id,
    v_estimated_cost_cents,
    'Auto-proposed: load ' || COALESCE(NEW.load_number, NEW.id::text) || ' abandoned (' || NEW.status::text || ')',
    v_breakdown,
    true
  )
  ON CONFLICT (operating_company_id, source_type, source_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_propose_escrow_on_abandon ON mdata.loads;
CREATE TRIGGER trg_auto_propose_escrow_on_abandon
  AFTER UPDATE OF status ON mdata.loads
  FOR EACH ROW
  EXECUTE FUNCTION dispatch.auto_propose_escrow_on_abandonment();

COMMIT;
