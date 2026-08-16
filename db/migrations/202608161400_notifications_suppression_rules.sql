-- LV-EMAIL-SUPPRESSION-FAILS-OPEN — create notifications.suppression_rules (Part 4.9.2 / WF-064.3).
-- Table was absent on prod → isSuppressed() fail-OPEN mailed every recipient.
-- Idempotent. FORCE RLS. REVOKE DELETE (clear via effective_to, never hard-delete).

CREATE SCHEMA IF NOT EXISTS notifications;

CREATE TABLE IF NOT EXISTS notifications.suppression_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid UUID NOT NULL REFERENCES identity.users(id),
  event_class TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  auto_suppressed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID NULL REFERENCES identity.users(id),
  CONSTRAINT chk_suppression_rules_max_7d
    CHECK (effective_to <= effective_from + INTERVAL '7 days'),
  CONSTRAINT chk_suppression_rules_window
    CHECK (effective_to > effective_from)
);

CREATE INDEX IF NOT EXISTS idx_suppression_rules_user_event_window
  ON notifications.suppression_rules (user_uuid, event_class, effective_from, effective_to);

ALTER TABLE notifications.suppression_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications.suppression_rules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppression_rules_isolation ON notifications.suppression_rules;
CREATE POLICY suppression_rules_isolation ON notifications.suppression_rules
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR user_uuid = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR user_uuid = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR user_uuid = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR user_uuid = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

GRANT SELECT, INSERT, UPDATE ON notifications.suppression_rules TO ih35_app;
REVOKE DELETE ON notifications.suppression_rules FROM PUBLIC;
REVOKE DELETE ON notifications.suppression_rules FROM ih35_app;
