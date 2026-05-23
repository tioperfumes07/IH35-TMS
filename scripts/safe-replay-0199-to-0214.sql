-- SAFE_REPLAY.sql generated for strict historical replay of 0199-0214
-- Source migrations are replayed in-order with original statement bodies.
-- BEGIN/COMMIT wrappers from each migration are removed for a single atomic transaction.
-- Ledger rows are inserted using db-migrate.mjs-compatible SHA256 checksums.
BEGIN;

-- >>> 0199_ds_remediate_admin_jobs_queue.sql
-- checksum(sha256): ef50f3f5185c2794ba4e841b077058b41e042abcac1f932d1eb1e5d1154af0b8
-- DS-REMEDIATE-1: durable admin jobs queue for moving external calls out of request paths.
-- Forward-only, additive migration.


CREATE SCHEMA IF NOT EXISTS _system;

CREATE TABLE IF NOT EXISTS _system.admin_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL,
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  requested_by_user_id UUID REFERENCES identity.users(id),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  last_error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1 AND max_attempts <= 10),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_admin_jobs_claim
  ON _system.admin_jobs (status, next_attempt_at, created_at)
  WHERE status IN ('queued', 'failed');

CREATE INDEX IF NOT EXISTS ix_admin_jobs_company_recent
  ON _system.admin_jobs (operating_company_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_admin_jobs_active_idempotency
  ON _system.admin_jobs (operation, idempotency_key)
  WHERE status IN ('queued', 'running');

ALTER TABLE _system.admin_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_jobs_company_scope ON _system.admin_jobs;
CREATE POLICY admin_jobs_company_scope
  ON _system.admin_jobs
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON _system.admin_jobs TO ih35_app;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0199_ds_remediate_admin_jobs_queue.sql', 'ef50f3f5185c2794ba4e841b077058b41e042abcac1f932d1eb1e5d1154af0b8', now(), 'claude-replay-2026-05-22', 0) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0199_ds_remediate_admin_jobs_queue.sql', now(), 'claude-replay-2026-05-22') ON CONFLICT (name) DO NOTHING;

-- >>> 0200_ds_remediate_reconciliation_findings.sql
-- checksum(sha256): a3a53df19a02396e5c3f156e51d4a3c26f3d8e174a9267e221734c85df7a6fd5
-- DS-REMEDIATE-3: create _system.reconciliation_findings per DS-IMPL-3 Section 5.
-- Populated by reconciliation worker in DS-REMEDIATE-4 (not by this migration).
-- Schema contract locked by DS-IMPL-3 reconciliation worker design (PR #161).


CREATE SCHEMA IF NOT EXISTS _system;
GRANT USAGE ON SCHEMA _system TO ih35_app;

CREATE TABLE IF NOT EXISTS _system.reconciliation_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  integration TEXT NOT NULL
    CHECK (integration IN ('qbo', 'samsara', 'plaid', 'fmcsa')),
  mirror_category TEXT NOT NULL,
  finding_type TEXT NOT NULL
    CHECK (
      finding_type IN (
        'count_drift',
        'value_drift',
        'identity_mismatch',
        'remote_unavailable',
        'webhook_projection_gap',
        'schema_contract_gap',
        'sync_metadata_stale'
      )
    ),
  severity TEXT NOT NULL
    CHECK (severity IN ('critical', 'important', 'cleanup')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'suppressed')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconciliation_run_id UUID,
  resource_scope JSONB NOT NULL,
  local_value JSONB NOT NULL,
  remote_value JSONB,
  drift_metric_abs NUMERIC(20, 6),
  drift_metric_pct NUMERIC(10, 6),
  threshold_snapshot JSONB NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_findings_open_by_company
  ON _system.reconciliation_findings (operating_company_id, status, severity, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_recon_findings_integration_window
  ON _system.reconciliation_findings (integration, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_recon_findings_finding_type
  ON _system.reconciliation_findings (finding_type, status);

CREATE INDEX IF NOT EXISTS idx_recon_findings_resource_scope_gin
  ON _system.reconciliation_findings
  USING GIN (resource_scope);

ALTER TABLE _system.reconciliation_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reconciliation_findings_company_scope ON _system.reconciliation_findings;
CREATE POLICY reconciliation_findings_company_scope
  ON _system.reconciliation_findings
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON _system.reconciliation_findings TO ih35_app;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0200_ds_remediate_reconciliation_findings.sql', 'a3a53df19a02396e5c3f156e51d4a3c26f3d8e174a9267e221734c85df7a6fd5', now(), 'claude-replay-2026-05-22', 0) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0200_ds_remediate_reconciliation_findings.sql', now(), 'claude-replay-2026-05-22') ON CONFLICT (name) DO NOTHING;

-- >>> 0201_ds_remediate_qbo_remote_counts_canonical.sql
-- checksum(sha256): b23312b6048276c03d2f857869cbbf7d179bb2c1960f533b64c8b27f5ccc59a1
-- DS-REMEDIATE-2: canonical QBO remote-count collector storage + lists-hub view repoint.
-- Strategy lock: drop/recreate accounting.qbo_remote_counts with canonical schema, keep view output contracts stable.


-- DS-REMEDIATE-2 drift capture (PR #84 class: manual prod ops never captured).
-- outbox.queue exists in production but no migration creates it.
-- Capture it here so fresh CI DBs match production.
-- Long-term outbox unification with accounting.outbox_events is tracked separately.
CREATE SCHEMA IF NOT EXISTS outbox;

CREATE TABLE IF NOT EXISTS outbox.queue (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  target_system TEXT NOT NULL CHECK (target_system IN ('qbo', 'samsara', 'relay', 'plaid', 'twilio', 'resend')),
  operation TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_uuid UUID NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_flight', 'succeeded', 'failed', 'dead_letter')),
  attempt_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempted_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_msg TEXT,
  succeeded_at TIMESTAMPTZ,
  external_id TEXT,
  external_version TEXT,
  audit_user_id UUID,
  audit_session_id UUID
);

CREATE INDEX IF NOT EXISTS outbox_pending_target_idx
  ON outbox.queue (target_system, status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS outbox_entity_idx
  ON outbox.queue (entity_type, entity_uuid);

-- RLS intentionally not added here. Production RLS policy could not be introspected in this environment
-- (no DATABASE_URL available). Outbox unification and outbox.queue governance are tracked as follow-up work.

DROP VIEW IF EXISTS views.catalogs_inventory;
DROP VIEW IF EXISTS views.qbo_sync_health;

DROP TABLE IF EXISTS accounting.qbo_remote_counts;

CREATE TABLE accounting.qbo_remote_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  entity_type TEXT NOT NULL,
  remote_count INTEGER NOT NULL CHECK (remote_count >= 0),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  collection_run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounting.qbo_remote_count_collection_state (
  operating_company_id UUID PRIMARY KEY REFERENCES org.companies(id),
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  outage_started_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qbo_remote_counts_lookup_latest
  ON accounting.qbo_remote_counts (operating_company_id, entity_type, collected_at DESC);

CREATE UNIQUE INDEX ux_qbo_remote_counts_per_run
  ON accounting.qbo_remote_counts (operating_company_id, entity_type, collection_run_id)
  WHERE collection_run_id IS NOT NULL;

ALTER TABLE accounting.qbo_remote_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.qbo_remote_count_collection_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qbo_remote_counts_company_scope ON accounting.qbo_remote_counts;
CREATE POLICY qbo_remote_counts_company_scope
  ON accounting.qbo_remote_counts
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS qbo_remote_count_collection_state_company_scope ON accounting.qbo_remote_count_collection_state;
CREATE POLICY qbo_remote_count_collection_state_company_scope
  ON accounting.qbo_remote_count_collection_state
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT USAGE ON SCHEMA accounting TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.qbo_remote_counts TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.qbo_remote_count_collection_state TO ih35_app;
GRANT USAGE ON SCHEMA outbox TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON outbox.queue TO ih35_app;

CREATE OR REPLACE VIEW views.catalogs_inventory
WITH (security_invoker = true) AS
WITH latest_counts AS (
  SELECT DISTINCT ON (rc.entity_type)
    rc.entity_type AS entity_key,
    rc.remote_count AS count_value,
    rc.collected_at AS last_polled_at
  FROM accounting.qbo_remote_counts rc
  ORDER BY rc.entity_type, rc.collected_at DESC
)
SELECT 'safety'::text AS domain, 'incident_types'::text AS catalog_key, 'Incident Types'::text AS display_name, COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.incident_types'), 0)::int AS row_count
UNION ALL SELECT 'safety', 'injury_severity_levels', 'Injury Severity Levels', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.injury_severity_levels'), 0)::int
UNION ALL SELECT 'safety', 'drug_test_types', 'Drug Test Types', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.drug_test_types'), 0)::int
UNION ALL SELECT 'safety', 'drug_test_results', 'Drug Test Results', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.drug_test_results'), 0)::int
UNION ALL SELECT 'safety', 'csa_basic_categories', 'CSA BASIC Categories', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.csa_basic_categories'), 0)::int
UNION ALL SELECT 'safety', 'hos_violation_types', 'HOS Violation Types', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.hos_violation_types'), 0)::int
UNION ALL SELECT 'safety', 'safety_event_statuses', 'Safety Event Statuses', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.safety_event_statuses'), 0)::int
UNION ALL SELECT 'safety', 'company_violation_types', 'Company Violation Types', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.company_violation_types'), 0)::int
UNION ALL SELECT 'maintenance', 'work_order_types', 'Work Order Types', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.work_order_types'), 0)::int
UNION ALL SELECT 'maintenance', 'work_order_statuses', 'Work Order Statuses', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.work_order_statuses'), 0)::int
UNION ALL SELECT 'maintenance', 'maintenance_priority_levels', 'Maintenance Priority Levels', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.maintenance_priority_levels'), 0)::int
UNION ALL SELECT 'maintenance', 'maintenance_vendors', 'Maintenance Vendors', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.maintenance_vendors'), 0)::int
UNION ALL SELECT 'maintenance', 'maintenance_failure_codes', 'Maintenance Failure Codes', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.maintenance_failure_codes'), 0)::int
UNION ALL SELECT 'maintenance', 'maintenance_service_tasks', 'Maintenance Service Tasks', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.maintenance_service_tasks'), 0)::int
UNION ALL SELECT 'maintenance', 'maintenance_parts', 'Maintenance Parts', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.maintenance_parts'), 0)::int
UNION ALL SELECT 'maintenance', 'maintenance_labor_codes', 'Maintenance Labor Codes', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.maintenance_labor_codes'), 0)::int
UNION ALL SELECT 'maintenance', 'maintenance_shop_locations', 'Maintenance Shop Locations', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.maintenance_shop_locations'), 0)::int
UNION ALL SELECT 'dispatch', 'load_statuses', 'Load Statuses', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.load_statuses'), 0)::int
UNION ALL SELECT 'dispatch', 'stop_types', 'Stop Types', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.stop_types'), 0)::int
UNION ALL SELECT 'dispatch', 'trailer_types', 'Trailer Types', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.trailer_types'), 0)::int
UNION ALL SELECT 'dispatch', 'lane_profiles', 'Lane Profiles', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.lane_profiles'), 0)::int
UNION ALL SELECT 'dispatch', 'border_routing_profiles', 'Border Routing Profiles', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.border_routing_profiles'), 0)::int
UNION ALL SELECT 'dispatch', 'detention_reasons', 'Detention Reasons', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.detention_reasons'), 0)::int
UNION ALL SELECT 'dispatch', 'cancellation_reasons', 'Cancellation Reasons', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.cancellation_reasons'), 0)::int
UNION ALL SELECT 'dispatch', 'dispatch_flag_colors', 'Dispatch Flag Colors', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.dispatch_flag_colors'), 0)::int
UNION ALL SELECT 'dispatch', 'route_risk_levels', 'Route Risk Levels', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.route_risk_levels'), 0)::int
UNION ALL SELECT 'dispatch', 'appointment_statuses', 'Appointment Statuses', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.appointment_statuses'), 0)::int
UNION ALL SELECT 'dispatch', 'in_transit_issue_types', 'In-Transit Issue Types', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.in_transit_issue_types'), 0)::int
UNION ALL SELECT 'fuel', 'fuel_station_brands', 'Fuel Station Brands', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.fuel_station_brands'), 0)::int
UNION ALL SELECT 'fuel', 'fuel_card_types', 'Fuel Card Types', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.fuel_card_types'), 0)::int
UNION ALL SELECT 'fuel', 'expensive_states', 'Expensive States', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.expensive_states'), 0)::int
UNION ALL SELECT 'fuel', 'fuel_tax_jurisdictions', 'Fuel Tax Jurisdictions', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.fuel_tax_jurisdictions'), 0)::int
UNION ALL SELECT 'fuel', 'fuel_stop_reason_codes', 'Fuel Stop Reason Codes', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.fuel_stop_reason_codes'), 0)::int
UNION ALL SELECT 'fuel', 'mpg_bands', 'MPG Bands', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.mpg_bands'), 0)::int
UNION ALL SELECT 'fuel', 'fuel_exception_types', 'Fuel Exception Types', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.fuel_exception_types'), 0)::int
UNION ALL SELECT 'drivers', 'driver_pay_codes', 'Driver Pay Codes', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.driver_pay_codes'), 0)::int
UNION ALL SELECT 'drivers', 'driver_deduction_codes', 'Driver Deduction Codes', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.driver_deduction_codes'), 0)::int
UNION ALL SELECT 'drivers', 'driver_statuses', 'Driver Statuses', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.driver_statuses'), 0)::int
UNION ALL SELECT 'drivers', 'endorsement_types', 'Endorsement Types', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.endorsement_types'), 0)::int
UNION ALL SELECT 'drivers', 'driver_event_types', 'Driver Event Types', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.driver_event_types'), 0)::int
UNION ALL SELECT 'drivers', 'settlement_statuses', 'Settlement Statuses', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.settlement_statuses'), 0)::int
UNION ALL SELECT 'drivers', 'liability_types', 'Liability Types', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.liability_types'), 0)::int
UNION ALL SELECT 'drivers', 'cash_advance_statuses', 'Cash Advance Statuses', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.cash_advance_statuses'), 0)::int
UNION ALL SELECT 'fleet', 'equipment_types', 'Equipment Types', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.equipment_types'), 0)::int
UNION ALL SELECT 'fleet', 'tractor_statuses', 'Tractor Statuses', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.tractor_statuses'), 0)::int
UNION ALL SELECT 'fleet', 'trailer_statuses', 'Trailer Statuses', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.trailer_statuses'), 0)::int
UNION ALL SELECT 'fleet', 'unit_ownership_types', 'Unit Ownership Types', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.unit_ownership_types'), 0)::int
UNION ALL SELECT 'fleet', 'tire_positions', 'Tire Positions', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.tire_positions'), 0)::int
UNION ALL SELECT 'fleet', 'asset_condition_codes', 'Asset Condition Codes', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.asset_condition_codes'), 0)::int
UNION ALL SELECT 'accounting', 'chart_of_accounts', 'Chart of Accounts', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.chart_of_accounts'), 0)::int
UNION ALL SELECT 'accounting', 'classes', 'Classes', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.classes'), 0)::int
UNION ALL SELECT 'accounting', 'items', 'Items', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.items'), 0)::int
UNION ALL SELECT 'accounting', 'payment_terms', 'Payment Terms', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.payment_terms'), 0)::int
UNION ALL SELECT 'accounting', 'posting_templates', 'Posting Templates', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.posting_templates'), 0)::int
UNION ALL SELECT 'accounting', 'account_role_bindings', 'Account Role Bindings', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.account_role_bindings'), 0)::int
UNION ALL SELECT 'accounting', 'vendor_types', 'Vendor Types', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.vendor_types'), 0)::int
UNION ALL SELECT 'accounting', 'customer_terms', 'Customer Terms', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.customer_terms'), 0)::int
UNION ALL SELECT 'accounting', 'journal_entry_types', 'Journal Entry Types', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.journal_entry_types'), 0)::int
UNION ALL SELECT 'accounting', 'qbo_categories', 'QBO Categories', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'catalog.qbo_categories'), 0)::int
UNION ALL SELECT 'names_master', 'names_master', 'Names Master', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'view.names_master'), 0)::int
UNION ALL SELECT 'names_master', 'names_drivers', 'Names · Drivers', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'view.names_drivers'), 0)::int
UNION ALL SELECT 'names_master', 'names_vendors', 'Names · Vendors', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'view.names_vendors'), 0)::int
UNION ALL SELECT 'names_master', 'names_customers', 'Names · Customers', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'view.names_customers'), 0)::int
UNION ALL SELECT 'names_master', 'names_dispatch_contacts', 'Names · Dispatch Contacts', COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'view.names_dispatch_contacts'), 0)::int;

CREATE OR REPLACE VIEW views.qbo_sync_health
WITH (security_invoker = true) AS
WITH latest_counts AS (
  SELECT DISTINCT ON (rc.entity_type)
    rc.entity_type AS entity_key,
    rc.remote_count AS count_value,
    rc.collected_at AS last_polled_at
  FROM accounting.qbo_remote_counts rc
  ORDER BY rc.entity_type, rc.collected_at DESC
),
entities(entity) AS (
  VALUES
    ('vendors'::text),
    ('customers'),
    ('classes'),
    ('items'),
    ('bank_accounts'),
    ('chart_of_accounts'),
    ('qbo_categories'),
    ('names_master')
)
SELECT
  e.entity,
  CASE
    WHEN e.entity = 'vendors' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_vendors), 0)
    WHEN e.entity = 'customers' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_customers), 0)
    WHEN e.entity = 'classes' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_classes), 0)
    WHEN e.entity = 'items' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_items), 0)
    WHEN e.entity = 'chart_of_accounts' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_accounts), 0)
    WHEN e.entity = 'names_master' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'local.names_master'), 0)
    ELSE COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'local.' || e.entity), 0)
  END::int AS local_count,
  CASE
    WHEN e.entity = 'vendors' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_vendors'), 0)
    WHEN e.entity = 'customers' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_customers'), 0)
    WHEN e.entity = 'classes' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_classes'), 0)
    WHEN e.entity = 'items' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_items'), 0)
    WHEN e.entity = 'chart_of_accounts' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_accounts'), 0)
    WHEN e.entity = 'names_master' THEN NULL::int
    ELSE COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo.' || e.entity), 0)
  END::int AS qbo_count,
  COALESCE((
    SELECT COUNT(*)::int
    FROM outbox.queue q
    WHERE q.target_system = 'qbo'
      AND q.entity_type = e.entity
      AND q.status IN ('pending', 'failed', 'in_flight')
  ), 0)::int AS pending_count,
  CASE
    WHEN e.entity = 'names_master' THEN 'local-only'
    WHEN (
      CASE
        WHEN e.entity = 'vendors' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_vendors), 0)
        WHEN e.entity = 'customers' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_customers), 0)
        WHEN e.entity = 'classes' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_classes), 0)
        WHEN e.entity = 'items' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_items), 0)
        WHEN e.entity = 'chart_of_accounts' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_accounts), 0)
        ELSE COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'local.' || e.entity), 0)
      END
    ) = (
      CASE
        WHEN e.entity = 'vendors' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_vendors'), 0)
        WHEN e.entity = 'customers' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_customers'), 0)
        WHEN e.entity = 'classes' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_classes'), 0)
        WHEN e.entity = 'items' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_items'), 0)
        WHEN e.entity = 'chart_of_accounts' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_accounts'), 0)
        ELSE COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo.' || e.entity), 0)
      END
    )
    AND COALESCE((
      SELECT COUNT(*)::int
      FROM outbox.queue q
      WHERE q.target_system = 'qbo'
        AND q.entity_type = e.entity
        AND q.status IN ('pending', 'failed', 'in_flight')
    ), 0) = 0 THEN '0'
    WHEN COALESCE((
      SELECT COUNT(*)::int
      FROM outbox.queue q
      WHERE q.target_system = 'qbo'
        AND q.entity_type = e.entity
        AND q.status IN ('pending', 'failed', 'in_flight')
    ), 0) > 0 THEN COALESCE((
      SELECT COUNT(*)::int
      FROM outbox.queue q
      WHERE q.target_system = 'qbo'
        AND q.entity_type = e.entity
        AND q.status IN ('pending', 'failed', 'in_flight')
    ), 0)::text || ' pend'
    ELSE abs(
      (
        CASE
          WHEN e.entity = 'vendors' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_vendors), 0)
          WHEN e.entity = 'customers' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_customers), 0)
          WHEN e.entity = 'classes' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_classes), 0)
          WHEN e.entity = 'items' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_items), 0)
          WHEN e.entity = 'chart_of_accounts' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_accounts), 0)
          ELSE COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'local.' || e.entity), 0)
        END
      ) - (
        CASE
          WHEN e.entity = 'vendors' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_vendors'), 0)
          WHEN e.entity = 'customers' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_customers'), 0)
          WHEN e.entity = 'classes' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_classes'), 0)
          WHEN e.entity = 'items' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_items'), 0)
          WHEN e.entity = 'chart_of_accounts' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_accounts'), 0)
          ELSE COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo.' || e.entity), 0)
        END
      )
    )::text || ' drift'
  END AS drift
FROM entities e
ORDER BY e.entity;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0201_ds_remediate_qbo_remote_counts_canonical.sql', 'b23312b6048276c03d2f857869cbbf7d179bb2c1960f533b64c8b27f5ccc59a1', now(), 'claude-replay-2026-05-22', 0) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0201_ds_remediate_qbo_remote_counts_canonical.sql', now(), 'claude-replay-2026-05-22') ON CONFLICT (name) DO NOTHING;

-- >>> 0202_ds_remediate_reconciliation_state.sql
-- checksum(sha256): 789b61db5d1833a3105b10b0616f67eb0ef294a817035ee26906e8492bcb859b
-- DS-REMEDIATE-4: persistent reconciliation outage/failure streak state.
-- Supports DD-6 (escalate after 3 consecutive failures + recovery tracking).


CREATE SCHEMA IF NOT EXISTS _system;
GRANT USAGE ON SCHEMA _system TO ih35_app;

CREATE TABLE IF NOT EXISTS _system.reconciliation_state (
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  integration TEXT NOT NULL CHECK (integration IN ('qbo', 'samsara', 'plaid', 'fmcsa')),
  mirror_category TEXT NOT NULL,
  consecutive_failure_count INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failure_count >= 0),
  last_outage_started_at TIMESTAMPTZ,
  last_outage_recovered_at TIMESTAMPTZ,
  last_successful_tick_at TIMESTAMPTZ,
  last_run_status TEXT NOT NULL DEFAULT 'idle' CHECK (last_run_status IN ('idle', 'ok', 'failed')),
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (operating_company_id, integration, mirror_category)
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_state_integration_status
  ON _system.reconciliation_state (integration, mirror_category, last_run_status, updated_at DESC);

ALTER TABLE _system.reconciliation_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reconciliation_state_company_scope ON _system.reconciliation_state;
CREATE POLICY reconciliation_state_company_scope
  ON _system.reconciliation_state
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON _system.reconciliation_state TO ih35_app;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0202_ds_remediate_reconciliation_state.sql', '789b61db5d1833a3105b10b0616f67eb0ef294a817035ee26906e8492bcb859b', now(), 'claude-replay-2026-05-22', 0) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0202_ds_remediate_reconciliation_state.sql', now(), 'claude-replay-2026-05-22') ON CONFLICT (name) DO NOTHING;

-- >>> 0203_ds_remediate_samsara_webhook_projection_state.sql
-- checksum(sha256): d1e696ef993fc15db1b13658ea3375aff24cac54b9aedb7cb56e846b2e4e01f6
-- DS-REMEDIATE-7 — Samsara webhook projection state + dedupe.
-- Preserve append-only raw webhook ingestion; projection status is tracked in a sidecar table.


CREATE UNIQUE INDEX IF NOT EXISTS ix_samsara_webhook_events_event_id_dedupe
  ON integrations.samsara_webhook_events (operating_company_id, samsara_event_id)
  WHERE samsara_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS integrations.samsara_webhook_projection_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_event_id uuid NOT NULL UNIQUE
    REFERENCES integrations.samsara_webhook_events(id)
    ON DELETE CASCADE,
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  projection_status text NOT NULL DEFAULT 'pending'
    CHECK (projection_status IN ('pending', 'processed', 'dead_lettered', 'permanently_failed')),
  projection_attempts integer NOT NULL DEFAULT 0,
  projection_error text,
  projection_error_class text
    CHECK (
      projection_error_class IS NULL OR
      projection_error_class IN (
        'unsupported_event_type',
        'signature_invalid',
        'malformed_payload',
        'mirror_table_missing',
        'tenant_context_invalid',
        'transient_db_error',
        'fk_violation',
        'other'
      )
    ),
  samsara_event_id text,
  last_projection_attempt_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION integrations.touch_samsara_webhook_projection_state_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_samsara_webhook_projection_state_touch_updated
  ON integrations.samsara_webhook_projection_state;
CREATE TRIGGER trg_samsara_webhook_projection_state_touch_updated
BEFORE UPDATE ON integrations.samsara_webhook_projection_state
FOR EACH ROW
EXECUTE FUNCTION integrations.touch_samsara_webhook_projection_state_updated_at();

ALTER TABLE integrations.samsara_webhook_projection_state
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS samsara_webhook_projection_state_company_scope
  ON integrations.samsara_webhook_projection_state;
CREATE POLICY samsara_webhook_projection_state_company_scope
  ON integrations.samsara_webhook_projection_state
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE INDEX IF NOT EXISTS ix_samsara_projection_state_pending
  ON integrations.samsara_webhook_projection_state (operating_company_id, next_retry_at, created_at)
  WHERE projection_status = 'pending';

GRANT SELECT, INSERT, UPDATE ON integrations.samsara_webhook_projection_state TO ih35_app;

DO $$
BEGIN
  IF to_regclass('audit.allowed_event_classes') IS NOT NULL THEN
    INSERT INTO audit.allowed_event_classes (event_class)
    VALUES
      ('webhook_projection_started'),
      ('webhook_projection_succeeded'),
      ('webhook_projection_dead_lettered'),
      ('webhook_projection_permanently_failed'),
      ('webhook_projection_retry_scheduled'),
      ('cron_no_pending_webhooks')
    ON CONFLICT DO NOTHING;
  END IF;
END
$$;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0203_ds_remediate_samsara_webhook_projection_state.sql', 'd1e696ef993fc15db1b13658ea3375aff24cac54b9aedb7cb56e846b2e4e01f6', now(), 'claude-replay-2026-05-22', 0) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0203_ds_remediate_samsara_webhook_projection_state.sql', now(), 'claude-replay-2026-05-22') ON CONFLICT (name) DO NOTHING;

-- >>> 0204_ds_remediate_qbo_accounts_contract_alignment.sql
-- checksum(sha256): b1943e01288cf7f7fb960c9699bddcfe50e4d37de9e0cca8bdbac50745503f4c

ALTER TABLE mdata.qbo_accounts
  ADD COLUMN IF NOT EXISTS raw_payload jsonb GENERATED ALWAYS AS (payload_json) STORED,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz GENERATED ALWAYS AS (mirrored_at) STORED,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE mdata.qbo_accounts
SET
  created_at = COALESCE(created_at, mirrored_at, now()),
  updated_at = COALESCE(updated_at, mirrored_at, now())
WHERE created_at IS NULL OR updated_at IS NULL;

ALTER TABLE mdata.qbo_accounts
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS ix_qbo_accounts_last_seen_at
  ON mdata.qbo_accounts (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_accounts TO ih35_app;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0204_ds_remediate_qbo_accounts_contract_alignment.sql', 'b1943e01288cf7f7fb960c9699bddcfe50e4d37de9e0cca8bdbac50745503f4c', now(), 'claude-replay-2026-05-22', 0) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0204_ds_remediate_qbo_accounts_contract_alignment.sql', now(), 'claude-replay-2026-05-22') ON CONFLICT (name) DO NOTHING;

-- >>> 0205_ds_remediate_qbo_classes_contract_alignment.sql
-- checksum(sha256): a65b27c0bb195b1f4e04a1c87ca5b305c798dd89e4050d88e0e53493863debad

ALTER TABLE mdata.qbo_classes
  ADD COLUMN IF NOT EXISTS raw_payload jsonb GENERATED ALWAYS AS (payload_json) STORED,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz GENERATED ALWAYS AS (mirrored_at) STORED,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE mdata.qbo_classes
SET
  created_at = COALESCE(created_at, mirrored_at, now()),
  updated_at = COALESCE(updated_at, mirrored_at, now())
WHERE created_at IS NULL OR updated_at IS NULL;

ALTER TABLE mdata.qbo_classes
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS ix_qbo_classes_last_seen_at
  ON mdata.qbo_classes (operating_company_id, last_seen_at);

ALTER TABLE mdata.qbo_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_classes FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_classes TO ih35_app;

DROP POLICY IF EXISTS qbo_classes_select_office ON mdata.qbo_classes;
CREATE POLICY qbo_classes_select_office ON mdata.qbo_classes
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS qbo_classes_sync_all ON mdata.qbo_classes;
CREATE POLICY qbo_classes_sync_all ON mdata.qbo_classes
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

DROP POLICY IF EXISTS qbo_classes_mutate_office ON mdata.qbo_classes;
CREATE POLICY qbo_classes_mutate_office ON mdata.qbo_classes
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  );

DROP POLICY IF EXISTS qbo_classes_update_office ON mdata.qbo_classes;
CREATE POLICY qbo_classes_update_office ON mdata.qbo_classes
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  );

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0205_ds_remediate_qbo_classes_contract_alignment.sql', 'a65b27c0bb195b1f4e04a1c87ca5b305c798dd89e4050d88e0e53493863debad', now(), 'claude-replay-2026-05-22', 0) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0205_ds_remediate_qbo_classes_contract_alignment.sql', now(), 'claude-replay-2026-05-22') ON CONFLICT (name) DO NOTHING;

-- >>> 0206_ds_remediate_qbo_customers_contract_alignment.sql
-- checksum(sha256): a8f5536f55a0b766f75b62570c303f48625c19d166237d6c4fe4adb17fdb2a6b

ALTER TABLE mdata.qbo_customers
  ADD COLUMN IF NOT EXISTS raw_payload jsonb GENERATED ALWAYS AS (payload_json) STORED,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz GENERATED ALWAYS AS (mirrored_at) STORED,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE mdata.qbo_customers
SET
  created_at = COALESCE(created_at, mirrored_at, now()),
  updated_at = COALESCE(updated_at, mirrored_at, now())
WHERE created_at IS NULL OR updated_at IS NULL;

ALTER TABLE mdata.qbo_customers
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS ix_qbo_customers_last_seen_at
  ON mdata.qbo_customers (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_customers TO ih35_app;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0206_ds_remediate_qbo_customers_contract_alignment.sql', 'a8f5536f55a0b766f75b62570c303f48625c19d166237d6c4fe4adb17fdb2a6b', now(), 'claude-replay-2026-05-22', 0) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0206_ds_remediate_qbo_customers_contract_alignment.sql', now(), 'claude-replay-2026-05-22') ON CONFLICT (name) DO NOTHING;

-- >>> 0207_ds_remediate_qbo_items_contract_alignment.sql
-- checksum(sha256): b296a410fa07537e749eedf3f99cceb8bbd0b0b518f05e1801a91ff195504268

ALTER TABLE mdata.qbo_items
  ADD COLUMN IF NOT EXISTS raw_payload jsonb GENERATED ALWAYS AS (payload_json) STORED,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz GENERATED ALWAYS AS (mirrored_at) STORED,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE mdata.qbo_items
SET
  created_at = COALESCE(created_at, mirrored_at, now()),
  updated_at = COALESCE(updated_at, mirrored_at, now())
WHERE created_at IS NULL OR updated_at IS NULL;

ALTER TABLE mdata.qbo_items
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS ix_qbo_items_last_seen_at
  ON mdata.qbo_items (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_items TO ih35_app;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0207_ds_remediate_qbo_items_contract_alignment.sql', 'b296a410fa07537e749eedf3f99cceb8bbd0b0b518f05e1801a91ff195504268', now(), 'claude-replay-2026-05-22', 0) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0207_ds_remediate_qbo_items_contract_alignment.sql', now(), 'claude-replay-2026-05-22') ON CONFLICT (name) DO NOTHING;

-- >>> 0208_ds_remediate_qbo_vendors_contract_alignment.sql
-- checksum(sha256): fe789e99aff02bc2e3cc31f44dfeabc03c1c1e59411fada100cccac21140a99a

ALTER TABLE mdata.qbo_vendors
  ADD COLUMN IF NOT EXISTS raw_payload jsonb GENERATED ALWAYS AS (payload_json) STORED,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz GENERATED ALWAYS AS (mirrored_at) STORED,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE mdata.qbo_vendors
SET
  created_at = COALESCE(created_at, mirrored_at, now()),
  updated_at = COALESCE(updated_at, mirrored_at, now())
WHERE created_at IS NULL OR updated_at IS NULL;

ALTER TABLE mdata.qbo_vendors
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS ix_qbo_vendors_last_seen_at
  ON mdata.qbo_vendors (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_vendors TO ih35_app;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0208_ds_remediate_qbo_vendors_contract_alignment.sql', 'fe789e99aff02bc2e3cc31f44dfeabc03c1c1e59411fada100cccac21140a99a', now(), 'claude-replay-2026-05-22', 0) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0208_ds_remediate_qbo_vendors_contract_alignment.sql', now(), 'claude-replay-2026-05-22') ON CONFLICT (name) DO NOTHING;

-- >>> 0209_ds_remediate_samsara_drivers_contract_alignment.sql
-- checksum(sha256): abf77f8946cc3237f002e69502b3b505c7b7b5abe63d219ac1d4996095dfee61

ALTER TABLE integrations.samsara_drivers
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE integrations.samsara_drivers
SET
  created_at = COALESCE(created_at, last_seen_at, now()),
  updated_at = COALESCE(updated_at, last_seen_at, now()),
  last_seen_at = COALESCE(last_seen_at, created_at, now())
WHERE created_at IS NULL OR updated_at IS NULL OR last_seen_at IS NULL;

ALTER TABLE integrations.samsara_drivers
  ALTER COLUMN last_seen_at SET NOT NULL,
  ALTER COLUMN last_seen_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS ix_samsara_drivers_last_seen_at
  ON integrations.samsara_drivers (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON integrations.samsara_drivers TO ih35_app;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0209_ds_remediate_samsara_drivers_contract_alignment.sql', 'abf77f8946cc3237f002e69502b3b505c7b7b5abe63d219ac1d4996095dfee61', now(), 'claude-replay-2026-05-22', 0) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0209_ds_remediate_samsara_drivers_contract_alignment.sql', now(), 'claude-replay-2026-05-22') ON CONFLICT (name) DO NOTHING;

-- >>> 0210_ds_remediate_samsara_vehicles_contract_alignment.sql
-- checksum(sha256): 43fe349d5832fc2b0543089fabeeeabbc5c1642b669b38188b1efc5bbb985cf4

ALTER TABLE integrations.samsara_vehicles
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE integrations.samsara_vehicles
SET
  created_at = COALESCE(created_at, last_seen_at, now()),
  updated_at = COALESCE(updated_at, last_seen_at, now()),
  last_seen_at = COALESCE(last_seen_at, created_at, now())
WHERE created_at IS NULL OR updated_at IS NULL OR last_seen_at IS NULL;

ALTER TABLE integrations.samsara_vehicles
  ALTER COLUMN last_seen_at SET NOT NULL,
  ALTER COLUMN last_seen_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS ix_samsara_vehicles_last_seen_at
  ON integrations.samsara_vehicles (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON integrations.samsara_vehicles TO ih35_app;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0210_ds_remediate_samsara_vehicles_contract_alignment.sql', '43fe349d5832fc2b0543089fabeeeabbc5c1642b669b38188b1efc5bbb985cf4', now(), 'claude-replay-2026-05-22', 0) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0210_ds_remediate_samsara_vehicles_contract_alignment.sql', now(), 'claude-replay-2026-05-22') ON CONFLICT (name) DO NOTHING;

-- >>> 0211_ds_remediate_samsara_remote_counts.sql
-- checksum(sha256): bb1475dd02f4e358b249dd32c5f8cb4899ccc63c5e2ee169f5a8d486cdf6e11a

CREATE TABLE IF NOT EXISTS integrations.samsara_remote_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  entity_type text NOT NULL CHECK (entity_type IN ('drivers', 'vehicles')),
  remote_count integer NOT NULL CHECK (remote_count >= 0),
  polled_at timestamptz NOT NULL DEFAULT now(),
  api_response_time_ms integer,
  api_status_code integer,
  collection_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, entity_type, polled_at)
);

CREATE TABLE IF NOT EXISTS integrations.samsara_remote_count_collection_state (
  operating_company_id uuid PRIMARY KEY REFERENCES org.companies(id),
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_run_status text NOT NULL DEFAULT 'ok' CHECK (last_run_status IN ('ok', 'failed')),
  last_error_class text CHECK (
    last_error_class IS NULL OR last_error_class IN (
      'auth_failed',
      'rate_limited',
      'transient_error',
      'not_configured'
    )
  ),
  last_error_message text,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_samsara_remote_counts_latest
  ON integrations.samsara_remote_counts (operating_company_id, entity_type, polled_at DESC);

CREATE INDEX IF NOT EXISTS ix_samsara_webhook_events_entity_latest
  ON integrations.samsara_webhook_events (operating_company_id, event_type, received_at DESC);

ALTER TABLE integrations.samsara_remote_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.samsara_remote_count_collection_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS samsara_remote_counts_company_scope ON integrations.samsara_remote_counts;
CREATE POLICY samsara_remote_counts_company_scope
  ON integrations.samsara_remote_counts
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS samsara_remote_count_collection_state_company_scope ON integrations.samsara_remote_count_collection_state;
CREATE POLICY samsara_remote_count_collection_state_company_scope
  ON integrations.samsara_remote_count_collection_state
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT ON integrations.samsara_remote_counts TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON integrations.samsara_remote_count_collection_state TO ih35_app;

DO $$
BEGIN
  IF to_regclass('audit.allowed_event_classes') IS NOT NULL THEN
    INSERT INTO audit.allowed_event_classes (event_class)
    VALUES
      ('samsara_remote_count_collected'),
      ('samsara_remote_count_failed'),
      ('samsara_api_rate_limit_hit'),
      ('samsara_auth_failed'),
      ('cron_count_drift_check_skipped_pending_projection')
    ON CONFLICT DO NOTHING;
  END IF;
END
$$;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0211_ds_remediate_samsara_remote_counts.sql', 'bb1475dd02f4e358b249dd32c5f8cb4899ccc63c5e2ee169f5a8d486cdf6e11a', now(), 'claude-replay-2026-05-22', 0) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0211_ds_remediate_samsara_remote_counts.sql', now(), 'claude-replay-2026-05-22') ON CONFLICT (name) DO NOTHING;

-- >>> 0212_ds_remediate_alert_routing.sql
-- checksum(sha256): bebd4a150cf1b1fe44fd99b42366fb83991e25a308a167b3fe5eb615249eb09f
-- DS-REMEDIATE-5: support idempotent reconciliation alert enqueue.

ALTER TABLE outbox.events
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_outbox_events_dedupe_key
  ON outbox.events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('audit.allowed_event_classes') IS NOT NULL THEN
    INSERT INTO audit.allowed_event_classes (event_class)
    VALUES
      ('alert_enqueued'),
      ('alert_recipient_missing')
    ON CONFLICT (event_class) DO NOTHING;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON outbox.events TO ih35_app;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0212_ds_remediate_alert_routing.sql', 'bebd4a150cf1b1fe44fd99b42366fb83991e25a308a167b3fe5eb615249eb09f', now(), 'claude-replay-2026-05-22', 0) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0212_ds_remediate_alert_routing.sql', now(), 'claude-replay-2026-05-22') ON CONFLICT (name) DO NOTHING;

-- >>> 0213_ds_remediate_8_1_real_canonical_columns.sql
-- checksum(sha256): 88fb3214fae35407042804eca9ffc0b732a573e484ed8573770f1d295b7abd6a

-- DS-REMEDIATE-8.1
-- Replace DS-8 GENERATED canonical columns with real columns + sync triggers.

-- qbo_accounts
DROP TRIGGER IF EXISTS trg_qbo_accounts_canonical_sync ON mdata.qbo_accounts;
DROP FUNCTION IF EXISTS mdata.qbo_accounts_canonical_sync_fn();

ALTER TABLE mdata.qbo_accounts
  DROP COLUMN IF EXISTS raw_payload,
  DROP COLUMN IF EXISTS last_seen_at;

ALTER TABLE mdata.qbo_accounts
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

UPDATE mdata.qbo_accounts
SET
  raw_payload = COALESCE(payload_json, '{}'::jsonb),
  last_seen_at = COALESCE(mirrored_at, now())
WHERE raw_payload IS NULL OR last_seen_at IS NULL;

ALTER TABLE mdata.qbo_accounts
  ALTER COLUMN raw_payload SET NOT NULL,
  ALTER COLUMN last_seen_at SET NOT NULL;

CREATE OR REPLACE FUNCTION mdata.qbo_accounts_canonical_sync_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.raw_payload := COALESCE(NEW.payload_json, '{}'::jsonb);
  NEW.last_seen_at := COALESCE(NEW.mirrored_at, NEW.last_seen_at, now());
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION mdata.qbo_accounts_canonical_sync_fn() TO ih35_app;

CREATE TRIGGER trg_qbo_accounts_canonical_sync
BEFORE INSERT OR UPDATE ON mdata.qbo_accounts
FOR EACH ROW
EXECUTE FUNCTION mdata.qbo_accounts_canonical_sync_fn();

CREATE INDEX IF NOT EXISTS ix_qbo_accounts_last_seen_at
  ON mdata.qbo_accounts (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_accounts TO ih35_app;

-- qbo_classes
DROP TRIGGER IF EXISTS trg_qbo_classes_canonical_sync ON mdata.qbo_classes;
DROP FUNCTION IF EXISTS mdata.qbo_classes_canonical_sync_fn();

ALTER TABLE mdata.qbo_classes
  DROP COLUMN IF EXISTS raw_payload,
  DROP COLUMN IF EXISTS last_seen_at;

ALTER TABLE mdata.qbo_classes
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

UPDATE mdata.qbo_classes
SET
  raw_payload = COALESCE(payload_json, '{}'::jsonb),
  last_seen_at = COALESCE(mirrored_at, now())
WHERE raw_payload IS NULL OR last_seen_at IS NULL;

ALTER TABLE mdata.qbo_classes
  ALTER COLUMN raw_payload SET NOT NULL,
  ALTER COLUMN last_seen_at SET NOT NULL;

CREATE OR REPLACE FUNCTION mdata.qbo_classes_canonical_sync_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.raw_payload := COALESCE(NEW.payload_json, '{}'::jsonb);
  NEW.last_seen_at := COALESCE(NEW.mirrored_at, NEW.last_seen_at, now());
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION mdata.qbo_classes_canonical_sync_fn() TO ih35_app;

CREATE TRIGGER trg_qbo_classes_canonical_sync
BEFORE INSERT OR UPDATE ON mdata.qbo_classes
FOR EACH ROW
EXECUTE FUNCTION mdata.qbo_classes_canonical_sync_fn();

CREATE INDEX IF NOT EXISTS ix_qbo_classes_last_seen_at
  ON mdata.qbo_classes (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_classes TO ih35_app;

-- qbo_customers
DROP TRIGGER IF EXISTS trg_qbo_customers_canonical_sync ON mdata.qbo_customers;
DROP FUNCTION IF EXISTS mdata.qbo_customers_canonical_sync_fn();

ALTER TABLE mdata.qbo_customers
  DROP COLUMN IF EXISTS raw_payload,
  DROP COLUMN IF EXISTS last_seen_at;

ALTER TABLE mdata.qbo_customers
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

UPDATE mdata.qbo_customers
SET
  raw_payload = COALESCE(payload_json, '{}'::jsonb),
  last_seen_at = COALESCE(mirrored_at, now())
WHERE raw_payload IS NULL OR last_seen_at IS NULL;

ALTER TABLE mdata.qbo_customers
  ALTER COLUMN raw_payload SET NOT NULL,
  ALTER COLUMN last_seen_at SET NOT NULL;

CREATE OR REPLACE FUNCTION mdata.qbo_customers_canonical_sync_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.raw_payload := COALESCE(NEW.payload_json, '{}'::jsonb);
  NEW.last_seen_at := COALESCE(NEW.mirrored_at, NEW.last_seen_at, now());
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION mdata.qbo_customers_canonical_sync_fn() TO ih35_app;

CREATE TRIGGER trg_qbo_customers_canonical_sync
BEFORE INSERT OR UPDATE ON mdata.qbo_customers
FOR EACH ROW
EXECUTE FUNCTION mdata.qbo_customers_canonical_sync_fn();

CREATE INDEX IF NOT EXISTS ix_qbo_customers_last_seen_at
  ON mdata.qbo_customers (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_customers TO ih35_app;

-- qbo_items
DROP TRIGGER IF EXISTS trg_qbo_items_canonical_sync ON mdata.qbo_items;
DROP FUNCTION IF EXISTS mdata.qbo_items_canonical_sync_fn();

ALTER TABLE mdata.qbo_items
  DROP COLUMN IF EXISTS raw_payload,
  DROP COLUMN IF EXISTS last_seen_at;

ALTER TABLE mdata.qbo_items
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

UPDATE mdata.qbo_items
SET
  raw_payload = COALESCE(payload_json, '{}'::jsonb),
  last_seen_at = COALESCE(mirrored_at, now())
WHERE raw_payload IS NULL OR last_seen_at IS NULL;

ALTER TABLE mdata.qbo_items
  ALTER COLUMN raw_payload SET NOT NULL,
  ALTER COLUMN last_seen_at SET NOT NULL;

CREATE OR REPLACE FUNCTION mdata.qbo_items_canonical_sync_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.raw_payload := COALESCE(NEW.payload_json, '{}'::jsonb);
  NEW.last_seen_at := COALESCE(NEW.mirrored_at, NEW.last_seen_at, now());
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION mdata.qbo_items_canonical_sync_fn() TO ih35_app;

CREATE TRIGGER trg_qbo_items_canonical_sync
BEFORE INSERT OR UPDATE ON mdata.qbo_items
FOR EACH ROW
EXECUTE FUNCTION mdata.qbo_items_canonical_sync_fn();

CREATE INDEX IF NOT EXISTS ix_qbo_items_last_seen_at
  ON mdata.qbo_items (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_items TO ih35_app;

-- qbo_vendors
DROP TRIGGER IF EXISTS trg_qbo_vendors_canonical_sync ON mdata.qbo_vendors;
DROP FUNCTION IF EXISTS mdata.qbo_vendors_canonical_sync_fn();

ALTER TABLE mdata.qbo_vendors
  DROP COLUMN IF EXISTS raw_payload,
  DROP COLUMN IF EXISTS last_seen_at;

ALTER TABLE mdata.qbo_vendors
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

UPDATE mdata.qbo_vendors
SET
  raw_payload = COALESCE(payload_json, '{}'::jsonb),
  last_seen_at = COALESCE(mirrored_at, now())
WHERE raw_payload IS NULL OR last_seen_at IS NULL;

ALTER TABLE mdata.qbo_vendors
  ALTER COLUMN raw_payload SET NOT NULL,
  ALTER COLUMN last_seen_at SET NOT NULL;

CREATE OR REPLACE FUNCTION mdata.qbo_vendors_canonical_sync_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.raw_payload := COALESCE(NEW.payload_json, '{}'::jsonb);
  NEW.last_seen_at := COALESCE(NEW.mirrored_at, NEW.last_seen_at, now());
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION mdata.qbo_vendors_canonical_sync_fn() TO ih35_app;

CREATE TRIGGER trg_qbo_vendors_canonical_sync
BEFORE INSERT OR UPDATE ON mdata.qbo_vendors
FOR EACH ROW
EXECUTE FUNCTION mdata.qbo_vendors_canonical_sync_fn();

CREATE INDEX IF NOT EXISTS ix_qbo_vendors_last_seen_at
  ON mdata.qbo_vendors (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_vendors TO ih35_app;

-- Samsara mirrors (minimal treatment, no triggers)
ALTER TABLE integrations.samsara_drivers
  ALTER COLUMN raw_payload SET NOT NULL;

ALTER TABLE integrations.samsara_vehicles
  ALTER COLUMN raw_payload SET NOT NULL;

GRANT SELECT, INSERT, UPDATE ON integrations.samsara_drivers TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON integrations.samsara_vehicles TO ih35_app;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0213_ds_remediate_8_1_real_canonical_columns.sql', '88fb3214fae35407042804eca9ffc0b732a573e484ed8573770f1d295b7abd6a', now(), 'claude-replay-2026-05-22', 0) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0213_ds_remediate_8_1_real_canonical_columns.sql', now(), 'claude-replay-2026-05-22') ON CONFLICT (name) DO NOTHING;

-- >>> 0214_qbo_mdata_handler_reconciliation_orphan_cleanup.sql
-- checksum(sha256): eec8396f2e67ced89113afcc40ec44d426eeaaa4af8450c2386ab1eae2002058

-- Pre-delete forensic count captured from production (2026-05-22): 3636 rows.
-- Query:
-- SELECT COUNT(*) AS pre_delete_count
-- FROM outbox.events
-- WHERE event_type IN (
--   'qbo.mdata.item.synced',
--   'qbo.mdata.vendor.synced',
--   'qbo.mdata.customer.synced',
--   'qbo.mdata.account.synced',
--   'email.queued'
-- )
--   AND failed_at IS NOT NULL
--   AND delivered_at IS NULL;

DELETE FROM outbox.events
WHERE event_type IN (
  'qbo.mdata.item.synced',
  'qbo.mdata.vendor.synced',
  'qbo.mdata.customer.synced',
  'qbo.mdata.account.synced',
  'email.queued'
)
  AND failed_at IS NOT NULL
  AND delivered_at IS NULL;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0214_qbo_mdata_handler_reconciliation_orphan_cleanup.sql', 'eec8396f2e67ced89113afcc40ec44d426eeaaa4af8450c2386ab1eae2002058', now(), 'claude-replay-2026-05-22', 0) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0214_qbo_mdata_handler_reconciliation_orphan_cleanup.sql', now(), 'claude-replay-2026-05-22') ON CONFLICT (name) DO NOTHING;

COMMIT;
