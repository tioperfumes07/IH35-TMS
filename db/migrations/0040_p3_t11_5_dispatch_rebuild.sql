BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'mdata'
      AND t.typname = 'load_status_enum'
  ) THEN
    ALTER TYPE mdata.load_status_enum ADD VALUE IF NOT EXISTS 'unassigned';
    ALTER TYPE mdata.load_status_enum ADD VALUE IF NOT EXISTS 'assigned_not_dispatched';
    ALTER TYPE mdata.load_status_enum ADD VALUE IF NOT EXISTS 'delivered_pending_docs';
    ALTER TYPE mdata.load_status_enum ADD VALUE IF NOT EXISTS 'completed_docs_received';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

UPDATE mdata.loads SET status = 'assigned_not_dispatched'::mdata.load_status_enum WHERE status = 'assigned'::mdata.load_status_enum;
UPDATE mdata.loads SET status = 'delivered_pending_docs'::mdata.load_status_enum WHERE status = 'delivered'::mdata.load_status_enum;

CREATE SCHEMA IF NOT EXISTS dispatch;
CREATE SCHEMA IF NOT EXISTS views;

CREATE TABLE IF NOT EXISTS dispatch.load_eta_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES mdata.loads(id) ON DELETE CASCADE,
  predicted_arrival_at timestamptz,
  predicted_arrival_stop_uuid uuid REFERENCES mdata.load_stops(id),
  confidence_class text NOT NULL CHECK (confidence_class IN ('on_time', 'tight', 'late_risk', 'late')),
  variance_minutes int,
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_by text NOT NULL CHECK (computed_by IN ('samsara_eta', 'historical_avg', 'manual')),
  inputs_json jsonb
);

CREATE INDEX IF NOT EXISTS idx_eta_pred_load_id
  ON dispatch.load_eta_predictions (load_id, computed_at DESC);

ALTER TABLE dispatch.load_eta_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_load_eta_predictions ON dispatch.load_eta_predictions;
CREATE POLICY rls_load_eta_predictions
  ON dispatch.load_eta_predictions
  FOR ALL TO ih35_app
  USING (
    load_id IN (
      SELECT l.id
      FROM mdata.loads l
      WHERE
        l.operating_company_id = current_setting('app.operating_company_id', true)::uuid
        OR identity.is_lucia_bypass()
    )
  )
  WITH CHECK (
    load_id IN (
      SELECT l.id
      FROM mdata.loads l
      WHERE
        l.operating_company_id = current_setting('app.operating_company_id', true)::uuid
        OR identity.is_lucia_bypass()
    )
  );

GRANT SELECT, INSERT, UPDATE ON dispatch.load_eta_predictions TO ih35_app;

CREATE OR REPLACE VIEW views.dispatch_load_with_driver_status AS
SELECT
  l.id,
  l.operating_company_id,
  l.load_number,
  l.customer_id,
  l.status,
  l.rate_total_cents,
  l.currency_code,
  l.assigned_unit_id,
  l.assigned_primary_driver_id,
  l.assigned_secondary_driver_id,
  l.dispatcher_user_id,
  l.notes,
  l.created_at,
  l.updated_at,
  l.soft_deleted_at,
  l.deleted_by_user_id,
  CASE
    WHEN l.status = 'assigned_not_dispatched'::mdata.load_status_enum THEN 'pretrip'
    WHEN l.status = 'dispatched'::mdata.load_status_enum THEN 'pretrip'
    WHEN l.status = 'in_transit'::mdata.load_status_enum THEN 'enroute_del'
    WHEN l.status = 'delivered_pending_docs'::mdata.load_status_enum THEN 'unloaded'
    WHEN l.status = 'completed_docs_received'::mdata.load_status_enum THEN 'off_duty'
    WHEN l.status = 'cancelled'::mdata.load_status_enum THEN 'off_duty'
    WHEN l.status = 'unassigned'::mdata.load_status_enum THEN 'off_duty'
    ELSE 'off_duty'
  END AS driver_lifecycle_stage,
  (
    SELECT to_jsonb(p)
    FROM dispatch.load_eta_predictions p
    WHERE p.load_id = l.id
    ORDER BY p.computed_at DESC
    LIMIT 1
  ) AS latest_eta_prediction
FROM mdata.loads l;

CREATE TABLE IF NOT EXISTS identity.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  dispatch_default_view text NOT NULL DEFAULT 'home',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE identity.user_preferences
  ADD COLUMN IF NOT EXISTS dispatch_default_view text NOT NULL DEFAULT 'home';

DROP TRIGGER IF EXISTS trg_identity_user_preferences_updated_at ON identity.user_preferences;
CREATE TRIGGER trg_identity_user_preferences_updated_at
BEFORE UPDATE ON identity.user_preferences
FOR EACH ROW EXECUTE FUNCTION mdata.set_updated_at();

ALTER TABLE identity.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.user_preferences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_preferences_select_self ON identity.user_preferences;
CREATE POLICY user_preferences_select_self ON identity.user_preferences
FOR SELECT TO ih35_app
USING (
  user_id = identity.current_user_id()
  OR identity.is_lucia_bypass()
);

DROP POLICY IF EXISTS user_preferences_upsert_self ON identity.user_preferences;
CREATE POLICY user_preferences_upsert_self ON identity.user_preferences
FOR INSERT TO ih35_app
WITH CHECK (
  user_id = identity.current_user_id()
  OR identity.is_lucia_bypass()
);

DROP POLICY IF EXISTS user_preferences_update_self ON identity.user_preferences;
CREATE POLICY user_preferences_update_self ON identity.user_preferences
FOR UPDATE TO ih35_app
USING (
  user_id = identity.current_user_id()
  OR identity.is_lucia_bypass()
)
WITH CHECK (
  user_id = identity.current_user_id()
  OR identity.is_lucia_bypass()
);

GRANT SELECT, INSERT, UPDATE ON identity.user_preferences TO ih35_app;

COMMIT;
