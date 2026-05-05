BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'customer_status'
      AND n.nspname = 'mdata'
  ) THEN
    CREATE TYPE mdata.customer_status AS ENUM ('active', 'inactive', 'credit_hold', 'blacklist');
  END IF;
END
$$;

ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS dot_number text,
  ADD COLUMN IF NOT EXISTS mc_number text,
  ADD COLUMN IF NOT EXISTS tax_id_encrypted bytea,
  ADD COLUMN IF NOT EXISTS credit_limit numeric(12, 2) CHECK (credit_limit IS NULL OR credit_limit >= 0),
  ADD COLUMN IF NOT EXISTS payment_terms_id uuid REFERENCES catalogs.payment_terms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status mdata.customer_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS office_phone text,
  ADD COLUMN IF NOT EXISTS fax_phone text,
  ADD COLUMN IF NOT EXISTS main_contact_name text,
  ADD COLUMN IF NOT EXISTS main_contact_title text,
  ADD COLUMN IF NOT EXISTS main_contact_email text,
  ADD COLUMN IF NOT EXISTS main_contact_phone text,
  ADD COLUMN IF NOT EXISTS main_contact_mobile text,
  ADD COLUMN IF NOT EXISTS ar_email text,
  ADD COLUMN IF NOT EXISTS ar_phone text,
  ADD COLUMN IF NOT EXISTS ap_email text,
  ADD COLUMN IF NOT EXISTS ap_phone text,
  ADD COLUMN IF NOT EXISTS free_time_pickup_minutes integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS free_time_delivery_minutes integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS detention_rate_per_hour numeric(8, 2) NOT NULL DEFAULT 0 CHECK (detention_rate_per_hour >= 0);

COMMENT ON COLUMN mdata.customers.dot_number IS 'USDOT registration number for broker/carrier authority verification';
COMMENT ON COLUMN mdata.customers.mc_number IS 'Motor Carrier number (FMCSA broker authority) for broker customers';
COMMENT ON COLUMN mdata.customers.tax_id_encrypted IS 'Federal Tax ID / EIN encrypted in app-layer (AES-256-GCM).';
COMMENT ON COLUMN mdata.customers.credit_limit IS 'Maximum outstanding receivables permitted. Phase 5 invoicing gates against this.';
COMMENT ON COLUMN mdata.customers.payment_terms_id IS 'Default payment terms (FK to catalogs.payment_terms). Per-load override possible at invoice time.';
COMMENT ON COLUMN mdata.customers.status IS 'active=normal, inactive=archived, credit_hold=cannot dispatch new loads without override, blacklist=never dispatch';
COMMENT ON COLUMN mdata.customers.ar_email IS 'Where to send invoices (institutional, not personal contact)';
COMMENT ON COLUMN mdata.customers.ap_email IS 'Where to receive payments / remittances from this customer';
COMMENT ON COLUMN mdata.customers.free_time_pickup_minutes IS 'Default pickup free time before detention billing starts.';
COMMENT ON COLUMN mdata.customers.free_time_delivery_minutes IS 'Default delivery free time before detention billing starts.';
COMMENT ON COLUMN mdata.customers.detention_rate_per_hour IS 'Default detention billing rate per hour.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'customer_contact_department'
      AND n.nspname = 'mdata'
  ) THEN
    CREATE TYPE mdata.customer_contact_department AS ENUM ('sales', 'billing', 'dispatch', 'operations', 'owner', 'other');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS mdata.customer_contacts (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_uuid uuid NOT NULL REFERENCES mdata.customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  email text,
  phone text,
  mobile text,
  department mdata.customer_contact_department NOT NULL DEFAULT 'other',
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_uuid uuid REFERENCES identity.users(id),
  updated_by_uuid uuid REFERENCES identity.users(id)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'mdata' AND table_name = 'customer_contacts' AND column_name = 'id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'mdata' AND table_name = 'customer_contacts' AND column_name = 'uuid'
  ) THEN
    EXECUTE 'ALTER TABLE mdata.customer_contacts RENAME COLUMN id TO uuid';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'mdata' AND table_name = 'customer_contacts' AND column_name = 'customer_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'mdata' AND table_name = 'customer_contacts' AND column_name = 'customer_uuid'
  ) THEN
    EXECUTE 'ALTER TABLE mdata.customer_contacts RENAME COLUMN customer_id TO customer_uuid';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'mdata' AND table_name = 'customer_contacts' AND column_name = 'created_by_user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'mdata' AND table_name = 'customer_contacts' AND column_name = 'created_by_uuid'
  ) THEN
    EXECUTE 'ALTER TABLE mdata.customer_contacts RENAME COLUMN created_by_user_id TO created_by_uuid';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'mdata' AND table_name = 'customer_contacts' AND column_name = 'updated_by_user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'mdata' AND table_name = 'customer_contacts' AND column_name = 'updated_by_uuid'
  ) THEN
    EXECUTE 'ALTER TABLE mdata.customer_contacts RENAME COLUMN updated_by_user_id TO updated_by_uuid';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer
  ON mdata.customer_contacts (customer_uuid, department, name)
  WHERE deactivated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_contacts_primary_per_customer
  ON mdata.customer_contacts (customer_uuid)
  WHERE is_primary = true AND deactivated_at IS NULL;

COMMENT ON TABLE mdata.customer_contacts IS 'Multiple personal contacts per customer (employees, decision makers). Distinct from institutional A/R and A/P endpoints which live on the customer record itself.';

GRANT SELECT, INSERT, UPDATE ON mdata.customer_contacts TO ih35_app;
ALTER TABLE mdata.customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.customer_contacts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cc_select ON mdata.customer_contacts;
CREATE POLICY cc_select ON mdata.customer_contacts
  FOR SELECT TO ih35_app
  USING (
    EXISTS (
      SELECT 1 FROM mdata.customers c
      WHERE c.id = customer_contacts.customer_uuid
        AND c.operating_company_id IN (SELECT org.user_accessible_company_ids())
    )
  );

DROP POLICY IF EXISTS cc_insert ON mdata.customer_contacts;
CREATE POLICY cc_insert ON mdata.customer_contacts
  FOR INSERT TO ih35_app
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mdata.customers c
      WHERE c.id = customer_contacts.customer_uuid
        AND c.deactivated_at IS NULL
        AND c.operating_company_id IN (SELECT org.user_accessible_company_ids())
    )
  );

DROP POLICY IF EXISTS cc_update ON mdata.customer_contacts;
CREATE POLICY cc_update ON mdata.customer_contacts
  FOR UPDATE TO ih35_app
  USING (
    EXISTS (
      SELECT 1 FROM mdata.customers c
      WHERE c.id = customer_contacts.customer_uuid
        AND c.operating_company_id IN (SELECT org.user_accessible_company_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mdata.customers c
      WHERE c.id = customer_contacts.customer_uuid
        AND c.operating_company_id IN (SELECT org.user_accessible_company_ids())
    )
  );

DROP POLICY IF EXISTS cc_lucia_bypass ON mdata.customer_contacts;
CREATE POLICY cc_lucia_bypass ON mdata.customer_contacts
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

COMMIT;
