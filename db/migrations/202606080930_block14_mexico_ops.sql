-- Block 14 of 29 — TIER2.5-MEXICO-OPS — Mexico Operations Module
-- Creates cross-border fields on loads, mx_permits, mx_tolls_ledger tables
BEGIN;

-- ─── Cross-border fields on loads ───────────────────────────────────────────
ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS is_cross_border boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mx_carta_porte_uuid uuid,
  ADD COLUMN IF NOT EXISTS mx_manifest_number text,
  ADD COLUMN IF NOT EXISTS mx_customs_broker_id uuid,
  ADD COLUMN IF NOT EXISTS us_customs_broker_id uuid,
  ADD COLUMN IF NOT EXISTS cruce_north_at timestamptz,
  ADD COLUMN IF NOT EXISTS cruce_south_at timestamptz,
  ADD COLUMN IF NOT EXISTS empty_or_loaded_at_cruce text CHECK (empty_or_loaded_at_cruce IN ('empty', 'loaded'));

CREATE INDEX IF NOT EXISTS idx_loads_is_cross_border
  ON loads (is_cross_border) WHERE is_cross_border = true;

-- ─── B1 visa flag on mdata.drivers ──────────────────────────────────────────
ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS has_b1_visa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS b1_visa_number text,
  ADD COLUMN IF NOT EXISTS b1_visa_expires_date date;

-- ─── MX Permits table ────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS mdata;
GRANT USAGE ON SCHEMA mdata TO ih35_app;

CREATE TABLE IF NOT EXISTS mdata.mx_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  tenant_id uuid NOT NULL REFERENCES org.companies(id),
  permit_type text NOT NULL CHECK (permit_type IN ('I-94', 'SCT', 'OS_OW_TX', 'OVERSIZE_MX', 'HAZMAT_MX', 'OTHER')),
  unit_id uuid REFERENCES mdata.units(id),
  driver_id uuid REFERENCES mdata.drivers(id),
  issued_date date NOT NULL,
  expires_date date NOT NULL,
  permit_number text,
  issuing_authority text,
  cost_cents bigint CHECK (cost_cents >= 0),
  attachment_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (operating_company_id = tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_mx_permits_unit_active
  ON mdata.mx_permits (unit_id, is_active, expires_date);

CREATE INDEX IF NOT EXISTS idx_mx_permits_expires
  ON mdata.mx_permits (expires_date) WHERE is_active = true;

-- ─── MX Tolls Ledger ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mdata.mx_tolls_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  tenant_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid REFERENCES loads(id),
  toll_date date NOT NULL,
  caseta text NOT NULL,
  amount_mxn bigint CHECK (amount_mxn >= 0),
  amount_usd_cents bigint CHECK (amount_usd_cents >= 0),
  exchange_rate_used numeric(10,4),
  payment_method text NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('IAVE', 'CASH', 'TAG')),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  receipt_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (operating_company_id = tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_mx_tolls_load
  ON mdata.mx_tolls_ledger (load_id) WHERE load_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mx_tolls_unit_date
  ON mdata.mx_tolls_ledger (unit_id, toll_date DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON mdata.mx_permits TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON mdata.mx_tolls_ledger TO ih35_app;

ALTER TABLE mdata.mx_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.mx_tolls_ledger ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mx_permits' AND schemaname = 'mdata' AND policyname = 'mx_permits_tenant_isolation'
  ) THEN
    CREATE POLICY mx_permits_tenant_isolation ON mdata.mx_permits
      USING (tenant_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mx_tolls_ledger' AND schemaname = 'mdata' AND policyname = 'mx_tolls_tenant_isolation'
  ) THEN
    CREATE POLICY mx_tolls_tenant_isolation ON mdata.mx_tolls_ledger
      USING (tenant_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
  END IF;
END $$;

-- ─── Audit triggers ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mdata.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'mx_permits_updated_at'
  ) THEN
    CREATE TRIGGER mx_permits_updated_at
      BEFORE UPDATE ON mdata.mx_permits
      FOR EACH ROW EXECUTE FUNCTION mdata.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'mx_tolls_updated_at'
  ) THEN
    CREATE TRIGGER mx_tolls_updated_at
      BEFORE UPDATE ON mdata.mx_tolls_ledger
      FOR EACH ROW EXECUTE FUNCTION mdata.set_updated_at();
  END IF;
END $$;

-- ─── Backfill: mark active cross-border loads ─────────────────────────────────
-- Flag loads that have border crossing events or mx fields already set
UPDATE loads
SET is_cross_border = true
WHERE id IN (
  SELECT DISTINCT load_uuid
  FROM dispatch.border_crossing_events
  WHERE load_uuid IS NOT NULL
)
AND is_cross_border = false;

COMMIT;
