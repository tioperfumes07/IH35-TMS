-- GO-20 slice B — maintenance.predictive_alerts (docs/lockdown/GO-20-EIGHT-FEATURES.txt SLICE B).
-- source_projection_id is deliberately NOT a foreign key: it points at either
-- brake_projections.uuid or tire_projections.uuid depending on alert_type, enforced in
-- apps/backend/src/jobs/predictive-alerts-worker.ts, not the schema.
-- Additive, idempotent, no data touched. No GL/money impact.
--
-- CC-3 handoff (cross-session, 2026-09-02): CC-3's worker/routes/frontend At-Risk panel/guard are
-- already built and applied live on CC-3's own session, barred from carrying this file itself by
-- verify-migration-lane-band.mjs (money/schema migrations stay on cc-1/claude or cursor).
--
-- LIVE GRANT DRIFT FOUND WHILE SHIPPING THIS (not in CC-3's original text) -- pg_default_acl showed
-- schema `maintenance`'s ALTER DEFAULT PRIVILEGES auto-grants PUBLIC arwd (all 4 privileges) on
-- every NEW table created in that schema. maintenance.predictive_alerts came up live with PUBLIC
-- holding INSERT/SELECT/UPDATE/DELETE and ih35_app holding DELETE -- neither requested by CC-3's
-- migration text, both a real exposure (PUBLIC = every role in the database) and a void-not-delete
-- violation (ih35_app should never literally be able to DELETE a soft-deletable row). Fixed live
-- this session: REVOKE ALL ... FROM PUBLIC at the schema-default level (so the NEXT new maintenance
-- table stops inheriting it too) + an explicit REVOKE DELETE for this table. Both folded in below,
-- idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS maintenance.predictive_alerts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  unit_id               uuid NOT NULL REFERENCES mdata.units(id),
  equipment_id          uuid NULL REFERENCES mdata.equipment(id),
  alert_type            text NOT NULL,
  position_code         text NOT NULL,
  source_projection_id  uuid NOT NULL,
  current_measure       numeric NOT NULL,
  threshold_measure     numeric NOT NULL,
  measure_unit          text NOT NULL,
  projected_failure_date date NOT NULL,
  days_remaining        integer NOT NULL,
  severity              text NOT NULL,
  work_order_id         uuid NULL REFERENCES maintenance.work_orders(id),
  resolved_at           timestamptz NULL,
  resolved_by_user_id   uuid NULL REFERENCES identity.users(id),
  resolution_note       text NULL,
  voided_at             timestamptz NULL,
  voided_by_user_id     uuid NULL REFERENCES identity.users(id),
  void_reason           text NULL,
  is_sample_data        boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_predictive_alerts_type'
      AND conrelid = 'maintenance.predictive_alerts'::regclass
  ) THEN
    ALTER TABLE maintenance.predictive_alerts
      ADD CONSTRAINT chk_predictive_alerts_type CHECK (alert_type IN ('brake_wear', 'tire_tread'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_predictive_alerts_severity'
      AND conrelid = 'maintenance.predictive_alerts'::regclass
  ) THEN
    ALTER TABLE maintenance.predictive_alerts
      ADD CONSTRAINT chk_predictive_alerts_severity CHECK (severity IN ('warning', 'critical'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_predictive_open_per_position
  ON maintenance.predictive_alerts (operating_company_id, unit_id, alert_type, position_code)
  WHERE resolved_at IS NULL AND voided_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_predictive_company_due
  ON maintenance.predictive_alerts (operating_company_id, projected_failure_date)
  WHERE resolved_at IS NULL AND voided_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_predictive_alerts_work_order
  ON maintenance.predictive_alerts (work_order_id)
  WHERE work_order_id IS NOT NULL;

ALTER TABLE maintenance.predictive_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance.predictive_alerts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS predictive_alerts_company_isolation ON maintenance.predictive_alerts;
CREATE POLICY predictive_alerts_company_isolation ON maintenance.predictive_alerts
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON maintenance.predictive_alerts TO ih35_app;
REVOKE DELETE ON maintenance.predictive_alerts FROM ih35_app;
REVOKE ALL ON maintenance.predictive_alerts FROM PUBLIC;

-- Schema-wide fix: stop the NEXT new maintenance.* table from inheriting PUBLIC arwd too.
ALTER DEFAULT PRIVILEGES IN SCHEMA maintenance REVOKE ALL ON TABLES FROM PUBLIC;

COMMENT ON TABLE maintenance.predictive_alerts IS
  'GO-20 slice B alert layer over brake_projections/tire_projections. source_projection_id points at one of those two tables uuid column depending on alert_type; not a real FK (polymorphic), enforced in the nightly worker instead of the schema.';

COMMIT;
