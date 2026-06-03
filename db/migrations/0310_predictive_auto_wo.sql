-- Block 22: Predictive auto work orders from Samsara fault codes
BEGIN;

CREATE SCHEMA IF NOT EXISTS maintenance;
CREATE SCHEMA IF NOT EXISTS notifications;

-- Block 17 notification tables (IF NOT EXISTS — shared with agent2 Block 17)
CREATE TABLE IF NOT EXISTS notifications.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'compliance_expiring','compliance_expired','maintenance_alert',
    'load_status','driver_alert','system','message'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
  title TEXT NOT NULL,
  body TEXT,
  action_link TEXT,
  entity_type TEXT,
  entity_id UUID,
  source_block TEXT,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notif_user ON notifications.user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notif_unread ON notifications.user_notifications(user_id)
  WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_notif_created ON notifications.user_notifications(created_at DESC);

ALTER TABLE notifications.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notif_isolation ON notifications.user_notifications;
CREATE POLICY user_notif_isolation ON notifications.user_notifications
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR user_id = current_setting('app.current_user_id', true)::uuid
  );

GRANT SELECT, INSERT, UPDATE ON notifications.user_notifications TO ih35_app;

-- A1: Fault code severity mapping table
CREATE TABLE IF NOT EXISTS maintenance.fault_code_severity_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  fault_code TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('samsara','j1939_dtc','custom')),
  description TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  auto_create_wo BOOLEAN DEFAULT FALSE,
  suggested_shop_id UUID,
  suggested_priority TEXT CHECK (suggested_priority IN ('routine','urgent','immediate') OR suggested_priority IS NULL),
  estimated_repair_hours NUMERIC,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fault_rules_company ON maintenance.fault_code_severity_rules(operating_company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fault_rules_code_source ON maintenance.fault_code_severity_rules(operating_company_id, fault_code, source) WHERE active;

ALTER TABLE maintenance.fault_code_severity_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fault_rules_company_isolation ON maintenance.fault_code_severity_rules;
CREATE POLICY fault_rules_company_isolation ON maintenance.fault_code_severity_rules
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  );

-- A2: Fault event history (audit + dedup)
CREATE TABLE IF NOT EXISTS maintenance.samsara_fault_code_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL,
  unit_id UUID NOT NULL,
  fault_code TEXT NOT NULL,
  source TEXT NOT NULL,
  severity TEXT,
  raw_event_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  auto_wo_id UUID,
  auto_wo_created_at TIMESTAMPTZ,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fault_history_unit ON maintenance.samsara_fault_code_history(unit_id);
CREATE INDEX IF NOT EXISTS idx_fault_history_occurred ON maintenance.samsara_fault_code_history(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_fault_history_unresolved ON maintenance.samsara_fault_code_history(unit_id, fault_code) WHERE resolved_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fault_history_event ON maintenance.samsara_fault_code_history(raw_event_id, fault_code) WHERE raw_event_id IS NOT NULL;

ALTER TABLE maintenance.samsara_fault_code_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fault_history_company_isolation ON maintenance.samsara_fault_code_history;
CREATE POLICY fault_history_company_isolation ON maintenance.samsara_fault_code_history
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  );

-- A3: Work order origin tracking
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS origin TEXT,
  ADD COLUMN IF NOT EXISTS origin_fault_history_id UUID,
  ADD COLUMN IF NOT EXISTS wo_title TEXT,
  ADD COLUMN IF NOT EXISTS wo_priority TEXT;

ALTER TABLE maintenance.work_orders DROP CONSTRAINT IF EXISTS chk_maintenance_wo_origin;
ALTER TABLE maintenance.work_orders
  ADD CONSTRAINT chk_maintenance_wo_origin CHECK (
    origin IS NULL OR origin IN ('manual','fault_auto','pm_schedule','dvir','inspection')
  );

ALTER TABLE maintenance.work_orders DROP CONSTRAINT IF EXISTS chk_maintenance_wo_priority;
ALTER TABLE maintenance.work_orders
  ADD CONSTRAINT chk_maintenance_wo_priority CHECK (
    wo_priority IS NULL OR wo_priority IN ('routine','urgent','immediate')
  );

-- Allow draft status for auto-created fault WOs (additive — status is text, no enum constraint)
COMMENT ON COLUMN maintenance.work_orders.status IS 'Includes draft for fault_auto origin (Block 22)';

GRANT SELECT, INSERT, UPDATE ON maintenance.fault_code_severity_rules TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON maintenance.samsara_fault_code_history TO ih35_app;

COMMIT;
