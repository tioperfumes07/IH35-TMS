-- W5-TIME-UTILIZATION: schema, tables, RLS, spine logging
-- Per-driver + per-truck minute ledger. READ-ONLY reporting (no financial writes).
-- Surfaces UNACCOUNTED time. Reuses analytics schema for rate inputs.
-- Writes computed-summary audit event to spine via events.log_event().
-- NULLIF RLS pattern. NON-FINANCIAL.

CREATE SCHEMA IF NOT EXISTS utilization;

-- ─── DRIVER PERIOD ───────────────────────────────────────────────────────────
-- Aggregated per-driver per-period minute ledger. Populated by background job.
CREATE TABLE IF NOT EXISTS utilization.driver_period (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  driver_id             uuid NOT NULL,
  period_start          date NOT NULL,
  period_end            date NOT NULL,

  -- minute buckets (all in minutes)
  minutes_driving       integer NOT NULL DEFAULT 0,
  minutes_on_duty       integer NOT NULL DEFAULT 0,
  minutes_loading       integer NOT NULL DEFAULT 0,
  minutes_detention     integer NOT NULL DEFAULT 0,
  minutes_idle          integer NOT NULL DEFAULT 0,
  minutes_rest          integer NOT NULL DEFAULT 0,
  minutes_deadhead      integer NOT NULL DEFAULT 0,
  minutes_layover       integer NOT NULL DEFAULT 0,
  minutes_oos           integer NOT NULL DEFAULT 0,
  minutes_unaccounted   integer NOT NULL DEFAULT 0,
  minutes_total         integer NOT NULL DEFAULT 0,

  -- rate inputs from analytics (populated from profitability engine)
  total_revenue_cents   bigint NOT NULL DEFAULT 0,
  total_cost_cents      bigint NOT NULL DEFAULT 0,

  -- computed $/hr (stored as cents per hour to avoid float)
  cents_per_productive_hr  integer,
  cents_per_driving_hr     integer,
  utilization_pct          numeric(5,2),

  spine_event_id        uuid,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (operating_company_id, driver_id, period_start, period_end)
);

ALTER TABLE utilization.driver_period ENABLE ROW LEVEL SECURITY;

CREATE POLICY utilization_driver_period_tenant ON utilization.driver_period
  USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS idx_util_driver_period_company
  ON utilization.driver_period (operating_company_id, period_start DESC, driver_id);

CREATE INDEX IF NOT EXISTS idx_util_driver_period_driver
  ON utilization.driver_period (operating_company_id, driver_id, period_start DESC);

-- ─── UNIT PERIOD ─────────────────────────────────────────────────────────────
-- Aggregated per-truck/unit per-period minute ledger.
CREATE TABLE IF NOT EXISTS utilization.unit_period (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  unit_id               uuid NOT NULL,
  period_start          date NOT NULL,
  period_end            date NOT NULL,

  minutes_in_use        integer NOT NULL DEFAULT 0,
  minutes_idle          integer NOT NULL DEFAULT 0,
  minutes_oos           integer NOT NULL DEFAULT 0,
  minutes_unaccounted   integer NOT NULL DEFAULT 0,
  minutes_total         integer NOT NULL DEFAULT 0,

  total_revenue_cents   bigint NOT NULL DEFAULT 0,
  cents_per_productive_hr  integer,
  utilization_pct          numeric(5,2),

  spine_event_id        uuid,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (operating_company_id, unit_id, period_start, period_end)
);

ALTER TABLE utilization.unit_period ENABLE ROW LEVEL SECURITY;

CREATE POLICY utilization_unit_period_tenant ON utilization.unit_period
  USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS idx_util_unit_period_company
  ON utilization.unit_period (operating_company_id, period_start DESC, unit_id);

-- ─── updated_at TRIGGERS ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION utilization.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_driver_period ON utilization.driver_period;
CREATE TRIGGER set_updated_at_driver_period
  BEFORE UPDATE ON utilization.driver_period
  FOR EACH ROW EXECUTE FUNCTION utilization.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_unit_period ON utilization.unit_period;
CREATE TRIGGER set_updated_at_unit_period
  BEFORE UPDATE ON utilization.unit_period
  FOR EACH ROW EXECUTE FUNCTION utilization.set_updated_at();

-- ─── SPINE LOGGING TRIGGER ───────────────────────────────────────────────────
-- Logs computed-summary events to spine when a period is upserted/updated.
CREATE OR REPLACE FUNCTION utilization.log_period_to_spine()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_spine_event_id uuid;
  v_event_type text;
BEGIN
  IF TG_TABLE_NAME = 'driver_period' THEN
    v_event_type := 'utilization.driver_period_computed';
  ELSE
    v_event_type := 'utilization.unit_period_computed';
  END IF;

  SELECT events.log_event(
    NEW.operating_company_id::text,
    v_event_type,
    'system',
    'system',
    TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    NEW.id::text,
    jsonb_build_object(
      'period_start', NEW.period_start,
      'period_end', NEW.period_end,
      'minutes_unaccounted', NEW.minutes_unaccounted,
      'utilization_pct', NEW.utilization_pct
    ),
    now(),
    'utilization'
  ) INTO v_spine_event_id;

  NEW.spine_event_id := v_spine_event_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_driver_period_to_spine ON utilization.driver_period;
CREATE TRIGGER log_driver_period_to_spine
  BEFORE INSERT OR UPDATE ON utilization.driver_period
  FOR EACH ROW EXECUTE FUNCTION utilization.log_period_to_spine();

DROP TRIGGER IF EXISTS log_unit_period_to_spine ON utilization.unit_period;
CREATE TRIGGER log_unit_period_to_spine
  BEFORE INSERT OR UPDATE ON utilization.unit_period
  FOR EACH ROW EXECUTE FUNCTION utilization.log_period_to_spine();

-- ─── GRANTS ───────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA utilization TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON utilization.driver_period TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON utilization.unit_period TO ih35_app;
