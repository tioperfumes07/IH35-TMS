-- Self-heal: maintenance.wo_status_history is referenced by REST routes but was never introduced in the SQL migration chain (runtime INSERT failed on fresh PG replays).
BEGIN;

CREATE SCHEMA IF NOT EXISTS maintenance;

CREATE TABLE IF NOT EXISTS maintenance.wo_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES maintenance.work_orders (id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by_user_id uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_maintenance_wo_status_history_work_order
  ON maintenance.wo_status_history (work_order_id, changed_at DESC);

-- Align with 0117 maintenance grants / default privileges for ih35_app.
GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance.wo_status_history TO ih35_app;

COMMIT;
