-- HOS snapshots audit table (MUST 3.15.8) — Block 01 of the HOS/Compliance build.
--
-- Every Samsara HOS poll persists a snapshot here, regardless of change, for the 5-year FMCSA audit trail.
-- This is the raw audit WRITE path; it is SEPARATE from hos.duty_status_events (the normalized events the
-- clocks read). The HOS Tracker endpoints do NOT depend on this table — it can land independently.
--
-- Conventions (mirrors 0372 samsara.* + CLAUDE.md): server-generated PK, operating_company_id RLS scoping,
-- per-entity policy FOR ALL TO ih35_app, explicit GRANTs (a new table is NOT covered by 0372's one-time
-- GRANT ON ALL TABLES). Append-only audit — never UPDATE/DELETE rows in app code.
-- Reversible: DROP TABLE samsara.hos_snapshots;
BEGIN;

CREATE SCHEMA IF NOT EXISTS samsara;

CREATE TABLE IF NOT EXISTS samsara.hos_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_uuid uuid NOT NULL REFERENCES mdata.drivers(id),
  vehicle_uuid uuid NULL REFERENCES mdata.units(id),
  duty_status text NULL,
  driving_hours_remaining numeric(6, 2) NULL,   -- 11h clock
  on_duty_hours_remaining numeric(6, 2) NULL,   -- 14h shift window
  cycle_hours_remaining numeric(6, 2) NULL,     -- 70h / 8-day
  time_to_next_break_minutes integer NULL,      -- 30m-after-8h-driving
  samsara_payload jsonb NOT NULL DEFAULT '{}'::jsonb, -- raw poll payload (full FMCSA evidence)
  polled_at timestamptz NOT NULL DEFAULT now(),       -- when WE polled
  samsara_event_at timestamptz NULL,                  -- Samsara's own timestamp for the reading
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Read pattern: latest snapshots per driver, and audit scans by time. 5-YEAR RETENTION (FMCSA) — enforced by
-- a separate retention job, not a constraint; nothing in app code prunes < 5y.
CREATE INDEX IF NOT EXISTS idx_hos_snapshots_driver_time
  ON samsara.hos_snapshots (operating_company_id, driver_uuid, polled_at DESC);
CREATE INDEX IF NOT EXISTS idx_hos_snapshots_polled_at
  ON samsara.hos_snapshots (operating_company_id, polled_at DESC);

-- RLS: per-entity, identical shape to samsara.vehicle_state_miles (0372).
ALTER TABLE samsara.hos_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS samsara_hos_snapshots_company ON samsara.hos_snapshots;
CREATE POLICY samsara_hos_snapshots_company ON samsara.hos_snapshots
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

-- GRANTs: a NEW table is not covered by 0372's one-time GRANT ON ALL TABLES — grant explicitly (no DELETE:
-- append-only audit; the retention job runs as a privileged role, not ih35_app).
GRANT USAGE ON SCHEMA samsara TO ih35_app;
GRANT SELECT, INSERT ON samsara.hos_snapshots TO ih35_app;

COMMENT ON TABLE samsara.hos_snapshots IS
  'Append-only 5-year FMCSA audit of every Samsara HOS poll (MUST 3.15.8). Raw evidence; clocks read hos.duty_status_events.';

COMMIT;
