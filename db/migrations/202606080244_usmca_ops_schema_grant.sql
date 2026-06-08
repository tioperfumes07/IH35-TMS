-- CLOSURE-13: usmca_ops schema + grant for ih35_app role.
-- The activation state machine tables live in usmca_ops.
BEGIN;

CREATE SCHEMA IF NOT EXISTS usmca_ops;
GRANT USAGE ON SCHEMA usmca_ops TO ih35_app;

CREATE TABLE IF NOT EXISTS usmca_ops.activation_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL DEFAULT 'hidden' CHECK (
    state IN ('hidden', 'soft_launch', 'pilot_drivers', 'full_active', 'rollback')
  ),
  activated_at timestamptz,
  activated_by_user_id uuid REFERENCES identity.users(id),
  rollback_at timestamptz,
  qbo_subaccount_id text,
  pilot_driver_ids uuid[] NOT NULL DEFAULT '{}',
  go_live_target_date date NOT NULL DEFAULT '2026-07-01',
  checklist_completed jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usmca_ops.activation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_state text NOT NULL,
  to_state text NOT NULL,
  transitioned_by_user_id uuid REFERENCES identity.users(id),
  checklist_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON usmca_ops.activation_state TO ih35_app;
GRANT SELECT, INSERT ON usmca_ops.activation_audit TO ih35_app;

ALTER TABLE usmca_ops.activation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE usmca_ops.activation_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'usmca_ops' AND tablename = 'activation_state'
  ) THEN
    CREATE POLICY usmca_activation_state_open ON usmca_ops.activation_state
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'usmca_ops' AND tablename = 'activation_audit'
  ) THEN
    CREATE POLICY usmca_activation_audit_open ON usmca_ops.activation_audit
      USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO usmca_ops.activation_state (state)
SELECT 'hidden'
WHERE NOT EXISTS (SELECT 1 FROM usmca_ops.activation_state);

COMMIT;
