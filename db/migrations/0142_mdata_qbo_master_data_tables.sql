-- P6-T11173 — QBO master-data mirror Phase 1 (read-only): vendors, customers, items, accounts + sync run log.
-- Additive only (Invariant #24). FK uses org.companies(id) as operating_company_id (IH35-TMS convention).

BEGIN;

CREATE TABLE IF NOT EXISTS mdata.qbo_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  qbo_id TEXT NOT NULL,
  qbo_sync_token TEXT,
  display_name TEXT NOT NULL,
  company_name TEXT,
  primary_email TEXT,
  primary_phone TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  qbo_updated_at TIMESTAMPTZ,
  mirrored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload_json JSONB,
  UNIQUE (operating_company_id, qbo_id)
);

CREATE INDEX IF NOT EXISTS ix_qbo_vendors_search
  ON mdata.qbo_vendors USING gin (to_tsvector('english', display_name || ' ' || COALESCE(company_name, '')));
CREATE INDEX IF NOT EXISTS ix_qbo_vendors_active ON mdata.qbo_vendors (operating_company_id, active);

CREATE TABLE IF NOT EXISTS mdata.qbo_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  qbo_id TEXT NOT NULL,
  qbo_sync_token TEXT,
  display_name TEXT NOT NULL,
  company_name TEXT,
  primary_email TEXT,
  primary_phone TEXT,
  mc_number TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  qbo_updated_at TIMESTAMPTZ,
  mirrored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload_json JSONB,
  UNIQUE (operating_company_id, qbo_id)
);

CREATE INDEX IF NOT EXISTS ix_qbo_customers_search
  ON mdata.qbo_customers USING gin (to_tsvector('english', display_name || ' ' || COALESCE(company_name, '')));
CREATE INDEX IF NOT EXISTS ix_qbo_customers_active ON mdata.qbo_customers (operating_company_id, active);

CREATE TABLE IF NOT EXISTS mdata.qbo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  qbo_id TEXT NOT NULL,
  qbo_sync_token TEXT,
  name TEXT NOT NULL,
  sku TEXT,
  item_type TEXT,
  unit_price_cents INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  qbo_updated_at TIMESTAMPTZ,
  mirrored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload_json JSONB,
  UNIQUE (operating_company_id, qbo_id)
);

CREATE INDEX IF NOT EXISTS ix_qbo_items_search
  ON mdata.qbo_items USING gin (to_tsvector('english', name || ' ' || COALESCE(sku, '')));
CREATE INDEX IF NOT EXISTS ix_qbo_items_active ON mdata.qbo_items (operating_company_id, active);

CREATE TABLE IF NOT EXISTS mdata.qbo_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  qbo_id TEXT NOT NULL,
  qbo_sync_token TEXT,
  name TEXT NOT NULL,
  full_qualified_name TEXT,
  account_type TEXT,
  account_sub_type TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  qbo_updated_at TIMESTAMPTZ,
  mirrored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload_json JSONB,
  UNIQUE (operating_company_id, qbo_id)
);

CREATE INDEX IF NOT EXISTS ix_qbo_accounts_search
  ON mdata.qbo_accounts USING gin (to_tsvector('english', name || ' ' || COALESCE(full_qualified_name, '')));
CREATE INDEX IF NOT EXISTS ix_qbo_accounts_active ON mdata.qbo_accounts (operating_company_id, active);

CREATE TABLE IF NOT EXISTS mdata.qbo_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('vendor', 'customer', 'item', 'account')),
  sync_type TEXT NOT NULL CHECK (sync_type IN ('full', 'delta')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  rows_upserted INTEGER DEFAULT 0,
  rows_deactivated INTEGER DEFAULT 0,
  error_message TEXT,
  cdc_cursor TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_qbo_sync_runs_entity ON mdata.qbo_sync_runs (operating_company_id, entity_type, started_at DESC);

ALTER TABLE mdata.qbo_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_vendors FORCE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_customers FORCE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_items FORCE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_sync_runs FORCE ROW LEVEL SECURITY;

GRANT SELECT ON mdata.qbo_vendors TO ih35_app;
GRANT SELECT ON mdata.qbo_customers TO ih35_app;
GRANT SELECT ON mdata.qbo_items TO ih35_app;
GRANT SELECT ON mdata.qbo_accounts TO ih35_app;
GRANT SELECT ON mdata.qbo_sync_runs TO ih35_app;

-- Authenticated office roles can read mirror rows for accessible operating companies.
DROP POLICY IF EXISTS qbo_vendors_select_office ON mdata.qbo_vendors;
CREATE POLICY qbo_vendors_select_office ON mdata.qbo_vendors
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

DROP POLICY IF EXISTS qbo_vendors_sync_all ON mdata.qbo_vendors;
CREATE POLICY qbo_vendors_sync_all ON mdata.qbo_vendors
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

DROP POLICY IF EXISTS qbo_customers_select_office ON mdata.qbo_customers;
CREATE POLICY qbo_customers_select_office ON mdata.qbo_customers
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

DROP POLICY IF EXISTS qbo_customers_sync_all ON mdata.qbo_customers;
CREATE POLICY qbo_customers_sync_all ON mdata.qbo_customers
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

DROP POLICY IF EXISTS qbo_items_select_office ON mdata.qbo_items;
CREATE POLICY qbo_items_select_office ON mdata.qbo_items
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

DROP POLICY IF EXISTS qbo_items_sync_all ON mdata.qbo_items;
CREATE POLICY qbo_items_sync_all ON mdata.qbo_items
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

DROP POLICY IF EXISTS qbo_accounts_select_office ON mdata.qbo_accounts;
CREATE POLICY qbo_accounts_select_office ON mdata.qbo_accounts
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

DROP POLICY IF EXISTS qbo_accounts_sync_all ON mdata.qbo_accounts;
CREATE POLICY qbo_accounts_sync_all ON mdata.qbo_accounts
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

DROP POLICY IF EXISTS qbo_sync_runs_select_office ON mdata.qbo_sync_runs;
CREATE POLICY qbo_sync_runs_select_office ON mdata.qbo_sync_runs
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

DROP POLICY IF EXISTS qbo_sync_runs_sync_all ON mdata.qbo_sync_runs;
CREATE POLICY qbo_sync_runs_sync_all ON mdata.qbo_sync_runs
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

COMMIT;
