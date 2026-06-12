-- ── C3-CUSTOMER-CONTRACT-UPLOAD ───────────────────────────────────────────────
-- Append-only contract record linked to the existing docs/file storage.
-- Never silently edit stored metadata — supersede by new version.
-- Storage: docs.files / docs.file_links (existing R2 infrastructure).
-- ──────────────────────────────────────────────────────────────────────────────

-- ── file_categories seed: customer_contract ───────────────────────────────────
INSERT INTO catalogs.file_categories (
  code, label, description, applies_to, typical_expiration_months, requires_expiration_date
)
VALUES (
  'customer_contract',
  'Customer Contract',
  'Signed broker/shipper contract or rate agreement with a customer. Append-only; supersede to update.',
  ARRAY['customer'],
  12,
  false
)
ON CONFLICT (code) DO NOTHING;

-- ── schema ─────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS customer;
GRANT USAGE ON SCHEMA customer TO ih35_app;

-- ── customer.contract ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer.contract (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid        NOT NULL REFERENCES org.companies(id),
  customer_id           uuid        NOT NULL REFERENCES mdata.customers(id),

  -- link into existing docs system
  file_id               uuid        REFERENCES docs.files(id),

  contract_type         text        NOT NULL DEFAULT 'rate_agreement'
                          CHECK (contract_type IN (
                            'rate_agreement', 'master_service', 'broker_carrier', 'other'
                          )),
  effective_date        date,
  expiration_date       date,

  -- supersede chain: newer version points back to predecessor
  supersedes_id         uuid        REFERENCES customer.contract(id),

  notes                 text,
  uploaded_by_user_id   uuid        REFERENCES identity.users(id),
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_contract_customer
  ON customer.contract (customer_id, operating_company_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ix_contract_file
  ON customer.contract (file_id)
  WHERE file_id IS NOT NULL;

-- ── updated_at trigger ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION customer.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contract_updated_at'
  ) THEN
    CREATE TRIGGER trg_contract_updated_at
      BEFORE UPDATE ON customer.contract
      FOR EACH ROW EXECUTE FUNCTION customer.set_updated_at();
  END IF;
END $$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE customer.contract ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_contract_company ON customer.contract;
CREATE POLICY rls_contract_company ON customer.contract
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(
      current_setting('app.operating_company_id', true), ''
    )::uuid
  );

GRANT SELECT, INSERT, UPDATE ON customer.contract TO ih35_app;
