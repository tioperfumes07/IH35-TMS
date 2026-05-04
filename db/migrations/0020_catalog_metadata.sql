BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.catalog_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  department text NOT NULL CHECK (department IN ('dispatch', 'safety', 'accounting', 'identity', 'operations')),
  route_path text NOT NULL,
  icon_label text NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_registry_dept_sort
  ON catalogs.catalog_registry (department, sort_order)
  WHERE deactivated_at IS NULL;

COMMENT ON TABLE catalogs.catalog_registry IS 'Registry of catalogs that appear on the Lists & Catalogs hub page. Admin can add/remove/reorder. Department determines grouping in hub.';

GRANT SELECT, INSERT, UPDATE ON catalogs.catalog_registry TO ih35_app;
ALTER TABLE catalogs.catalog_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.catalog_registry FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cr_select_all ON catalogs.catalog_registry;
CREATE POLICY cr_select_all ON catalogs.catalog_registry
  FOR SELECT TO ih35_app USING (true);

DROP POLICY IF EXISTS cr_insert_admin ON catalogs.catalog_registry;
CREATE POLICY cr_insert_admin ON catalogs.catalog_registry
  FOR INSERT TO ih35_app
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator'));

DROP POLICY IF EXISTS cr_update_admin ON catalogs.catalog_registry;
CREATE POLICY cr_update_admin ON catalogs.catalog_registry
  FOR UPDATE TO ih35_app
  USING (identity.current_user_role() IN ('Owner', 'Administrator'))
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator'));

DROP POLICY IF EXISTS cr_lucia_bypass ON catalogs.catalog_registry;
CREATE POLICY cr_lucia_bypass ON catalogs.catalog_registry
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

INSERT INTO catalogs.catalog_registry (code, name, description, department, route_path, icon_label, sort_order) VALUES
  ('EQUIPMENT_TYPES', 'Equipment Types', 'Trailer types and per-type line item templates', 'dispatch', '/catalogs/equipment-types', 'EQ', 10),
  ('DRIVER_LOAD_STATUSES', 'Driver Load Statuses', 'Status workflow for active loads', 'dispatch', '/catalogs/driver-load-statuses', 'DS', 20),
  ('CHART_OF_ACCOUNTS', 'Chart of Accounts', 'GL accounts synced with QuickBooks', 'accounting', '/catalogs/accounts', '$', 10),
  ('CLASSES', 'Classes', 'Cost centers and class tracking', 'accounting', '/catalogs/classes', 'CL', 20),
  ('ITEMS', 'Items', 'Service items and product items', 'accounting', '/catalogs/items', 'IT', 30),
  ('PAYMENT_TERMS', 'Payment Terms', 'Net 30, Net 15, etc.', 'accounting', '/catalogs/payment-terms', 'PT', 40),
  ('POSTING_TEMPLATES', 'Posting Templates', 'Templates for journal entries', 'accounting', '/catalogs/posting-templates', 'PO', 50),
  ('ACCOUNT_ROLE_BINDINGS', 'Account Role Bindings', 'Which accounts each role can post to', 'accounting', '/catalogs/account-role-bindings', 'AR', 60)
ON CONFLICT (code) DO NOTHING;

COMMIT;
