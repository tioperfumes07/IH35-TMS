BEGIN;

CREATE TABLE IF NOT EXISTS accounting.coa_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES org.companies(id),
  qbo_id NUMERIC NOT NULL,
  number TEXT,
  name TEXT NOT NULL,
  type TEXT,
  detail_type TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, qbo_id)
);

CREATE TABLE IF NOT EXISTS accounting.ps_category (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES org.companies(id),
  qbo_id TEXT NOT NULL,
  name TEXT NOT NULL,
  coa_account_id UUID REFERENCES accounting.coa_account(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, qbo_id)
);

CREATE TABLE IF NOT EXISTS accounting.ps_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES org.companies(id),
  qbo_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category_qbo_id TEXT,
  coa_account_id UUID REFERENCES accounting.coa_account(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, qbo_id)
);

CREATE INDEX IF NOT EXISTS idx_coa_account_tenant_active
  ON accounting.coa_account (tenant_id, active, name);
CREATE INDEX IF NOT EXISTS idx_ps_category_tenant_active
  ON accounting.ps_category (tenant_id, active, name);
CREATE INDEX IF NOT EXISTS idx_ps_item_tenant_active
  ON accounting.ps_item (tenant_id, active, name);

ALTER TABLE accounting.coa_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.coa_account FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting.ps_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.ps_category FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting.ps_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.ps_item FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coa_account_tenant_scope ON accounting.coa_account;
CREATE POLICY coa_account_tenant_scope
  ON accounting.coa_account
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS ps_category_tenant_scope ON accounting.ps_category;
CREATE POLICY ps_category_tenant_scope
  ON accounting.ps_category
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS ps_item_tenant_scope ON accounting.ps_item;
CREATE POLICY ps_item_tenant_scope
  ON accounting.ps_item
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

DROP TRIGGER IF EXISTS trg_coa_account_updated_at ON accounting.coa_account;
CREATE TRIGGER trg_coa_account_updated_at
  BEFORE UPDATE ON accounting.coa_account
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_ps_category_updated_at ON accounting.ps_category;
CREATE TRIGGER trg_ps_category_updated_at
  BEFORE UPDATE ON accounting.ps_category
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_ps_item_updated_at ON accounting.ps_item;
CREATE TRIGGER trg_ps_item_updated_at
  BEFORE UPDATE ON accounting.ps_item
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.coa_account TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.ps_category TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.ps_item TO ih35_app;

COMMIT;
BEGIN;

CREATE TABLE IF NOT EXISTS accounting.coa_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES org.companies(id),
  qbo_id NUMERIC NOT NULL,
  number TEXT,
  name TEXT NOT NULL,
  type TEXT,
  detail_type TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, qbo_id)
);

CREATE TABLE IF NOT EXISTS accounting.ps_category (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES org.companies(id),
  qbo_id TEXT NOT NULL,
  name TEXT NOT NULL,
  coa_account_id UUID REFERENCES accounting.coa_account(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, qbo_id)
);

CREATE TABLE IF NOT EXISTS accounting.ps_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES org.companies(id),
  qbo_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category_qbo_id TEXT,
  coa_account_id UUID REFERENCES accounting.coa_account(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, qbo_id)
);

CREATE INDEX IF NOT EXISTS idx_ps_category_tenant_active ON accounting.ps_category (tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_ps_item_tenant_category ON accounting.ps_item (tenant_id, category_qbo_id, active);
CREATE INDEX IF NOT EXISTS idx_coa_account_tenant_active ON accounting.coa_account (tenant_id, active);

ALTER TABLE accounting.coa_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.coa_account FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting.ps_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.ps_category FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting.ps_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.ps_item FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coa_account_tenant_scope ON accounting.coa_account;
CREATE POLICY coa_account_tenant_scope
  ON accounting.coa_account
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS ps_category_tenant_scope ON accounting.ps_category;
CREATE POLICY ps_category_tenant_scope
  ON accounting.ps_category
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS ps_item_tenant_scope ON accounting.ps_item;
CREATE POLICY ps_item_tenant_scope
  ON accounting.ps_item
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

DROP TRIGGER IF EXISTS trg_coa_account_updated_at ON accounting.coa_account;
CREATE TRIGGER trg_coa_account_updated_at
  BEFORE UPDATE ON accounting.coa_account
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_ps_category_updated_at ON accounting.ps_category;
CREATE TRIGGER trg_ps_category_updated_at
  BEFORE UPDATE ON accounting.ps_category
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_ps_item_updated_at ON accounting.ps_item;
CREATE TRIGGER trg_ps_item_updated_at
  BEFORE UPDATE ON accounting.ps_item
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.coa_account TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.ps_category TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.ps_item TO ih35_app;

COMMIT;
