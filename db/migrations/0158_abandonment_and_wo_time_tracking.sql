-- P6-T11186 — Auto-deduct on abandonment + WO time tracking (additive).

BEGIN;

-- ---------------------------------------------------------------------------
-- P5-T12 abandonment chargebacks + company defaults
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_finance.abandonment_chargebacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  load_id UUID NOT NULL REFERENCES mdata.loads(id),
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  abandonment_event_at TIMESTAMPTZ NOT NULL,
  abandonment_location TEXT,
  towing_cost_cents BIGINT NOT NULL DEFAULT 0,
  deadhead_miles NUMERIC(8,2) NOT NULL DEFAULT 0,
  deadhead_cost_cents BIGINT NOT NULL DEFAULT 0,
  replacement_driver_premium_cents BIGINT NOT NULL DEFAULT 0,
  other_recovery_cost_cents BIGINT NOT NULL DEFAULT 0,
  total_chargeback_cents BIGINT NOT NULL,
  settlement_line_id UUID,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','disputed','applied','reversed')),
  approval_user_id UUID REFERENCES identity.users(id),
  approved_at TIMESTAMPTZ,
  applied_to_settlement_id UUID REFERENCES driver_finance.driver_settlements(id),
  reversal_reason TEXT,
  notes TEXT,
  created_by_user_id UUID REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_abandonment_chargebacks_load
  ON driver_finance.abandonment_chargebacks(load_id);
CREATE INDEX IF NOT EXISTS ix_abandonment_chargebacks_driver_status
  ON driver_finance.abandonment_chargebacks(driver_id, status);
CREATE INDEX IF NOT EXISTS ix_abandonment_chargebacks_pending
  ON driver_finance.abandonment_chargebacks(operating_company_id, abandonment_event_at DESC)
  WHERE status = 'pending';

ALTER TABLE driver_finance.abandonment_chargebacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS abandonment_chargebacks_company_scope ON driver_finance.abandonment_chargebacks;
CREATE POLICY abandonment_chargebacks_company_scope
  ON driver_finance.abandonment_chargebacks
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE TABLE IF NOT EXISTS driver_finance.abandonment_defaults (
  operating_company_id UUID PRIMARY KEY REFERENCES org.companies(id),
  default_towing_cost_cents BIGINT NOT NULL DEFAULT 50000,
  default_deadhead_rate_per_mile_cents BIGINT NOT NULL DEFAULT 250,
  default_replacement_premium_pct NUMERIC(5,2) NOT NULL DEFAULT 25.00,
  require_approval_above_cents BIGINT NOT NULL DEFAULT 100000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE driver_finance.abandonment_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS abandonment_defaults_company_scope ON driver_finance.abandonment_defaults;
CREATE POLICY abandonment_defaults_company_scope
  ON driver_finance.abandonment_defaults
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DO $$
BEGIN
  IF to_regnamespace('driver_finance') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON driver_finance.abandonment_chargebacks TO ih35_app;
    GRANT SELECT, INSERT, UPDATE ON driver_finance.abandonment_defaults TO ih35_app;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- P5-T15 WO time tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance.wo_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  work_order_id UUID NOT NULL REFERENCES maintenance.work_orders(id),
  wo_task_id UUID,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('vendor','internal_mechanic','driver','admin')),
  actor_vendor_id UUID,
  actor_user_id UUID REFERENCES identity.users(id),
  actor_employee_id UUID,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN ended_at IS NULL THEN NULL
      ELSE FLOOR(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60.0)::INTEGER
    END
  ) STORED,
  labor_rate_cents_per_hour BIGINT,
  computed_labor_cost_cents BIGINT GENERATED ALWAYS AS (
    CASE
      WHEN ended_at IS NULL OR labor_rate_cents_per_hour IS NULL THEN NULL
      ELSE (
        (EXTRACT(EPOCH FROM (ended_at - started_at)) / 3600.0) * labor_rate_cents_per_hour::numeric
      )::BIGINT
    END
  ) STORED,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_wo_time_entries_wo
  ON maintenance.wo_time_entries(work_order_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_wo_time_entries_actor
  ON maintenance.wo_time_entries(actor_kind, COALESCE(actor_user_id, actor_vendor_id))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_wo_time_entries_open
  ON maintenance.wo_time_entries(work_order_id, started_at DESC)
  WHERE ended_at IS NULL AND deleted_at IS NULL;

ALTER TABLE maintenance.wo_time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wo_time_entries_company_scope ON maintenance.wo_time_entries;
CREATE POLICY wo_time_entries_company_scope
  ON maintenance.wo_time_entries
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DO $$
BEGIN
  IF to_regnamespace('maintenance') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON maintenance.wo_time_entries TO ih35_app;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'audit' AND p.proname = 'tg_audit_row'
  ) THEN
    EXECUTE $sql$
      DROP TRIGGER IF EXISTS tg_audit_abandonment_chargebacks ON driver_finance.abandonment_chargebacks;
      CREATE TRIGGER tg_audit_abandonment_chargebacks
        AFTER INSERT OR UPDATE OR DELETE ON driver_finance.abandonment_chargebacks
        FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    $sql$;

    EXECUTE $sql$
      DROP TRIGGER IF EXISTS tg_audit_wo_time_entries ON maintenance.wo_time_entries;
      CREATE TRIGGER tg_audit_wo_time_entries
        AFTER INSERT OR UPDATE OR DELETE ON maintenance.wo_time_entries
        FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    $sql$;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Settlement lines: allow abandonment_chargeback deduction rows (additive).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  conname text;
BEGIN
  IF to_regclass('driver_finance.settlement_lines') IS NOT NULL THEN
    SELECT c.conname INTO conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'driver_finance'
      AND t.relname = 'settlement_lines'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%line_type%'
    ORDER BY c.conname
    LIMIT 1;

    IF conname IS NOT NULL THEN
      EXECUTE format('ALTER TABLE driver_finance.settlement_lines DROP CONSTRAINT %I', conname);
    END IF;

    ALTER TABLE driver_finance.settlement_lines
      DROP CONSTRAINT IF EXISTS settlement_lines_line_type_chk_p6_t11186;

    ALTER TABLE driver_finance.settlement_lines
      ADD CONSTRAINT settlement_lines_line_type_chk_p6_t11186
      CHECK (line_type IN (
        'earnings',
        'extra_pay',
        'reimbursement',
        'deduction',
        'abandonment_chargeback',
        'team_split_primary',
        'team_split_secondary'
      ));
  END IF;
END
$$;

COMMIT;
