-- DS-REMEDIATE-2: canonical QBO remote-count collector storage + lists-hub view repoint.
-- Strategy lock: drop/recreate accounting.qbo_remote_counts with canonical schema, keep view output contracts stable.

BEGIN;

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

COMMIT;
