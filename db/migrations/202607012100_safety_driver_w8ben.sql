-- IH35 drivers are Mexican B-1 drivers (foreign persons). Per the CPA ruling (2026-07-01),
-- each driver must have an IRS Form W-8BEN ("Certificate of Foreign Status of Beneficial
-- Owner for United States Tax Withholding and Reporting") on file at hire, renewed yearly.
-- This table captures the structured Part I + Part II certification fields. It is a
-- per-entity (operating_company_id) driver-credential record, mirroring
-- safety.training_records / safety.driver_documents. Non-financial: no GL, no posting.
BEGIN;

CREATE TABLE IF NOT EXISTS safety.driver_w8ben (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL,
  -- Part I — Identification of Beneficial Owner
  full_legal_name TEXT NOT NULL,
  country_of_citizenship TEXT NOT NULL,
  permanent_residence_street TEXT NULL,
  permanent_residence_city TEXT NULL,
  permanent_residence_country TEXT NULL,
  mailing_address_street TEXT NULL,
  mailing_address_city TEXT NULL,
  mailing_address_country TEXT NULL,
  us_tin TEXT NULL,                     -- SSN/ITIN — usually blank for B-1 drivers
  foreign_tin TEXT NULL,                -- Mexican RFC / CURP
  reference_numbers TEXT NULL,
  date_of_birth DATE NULL,
  -- Part II — Claim of Tax Treaty Benefits (usually N/A for these drivers)
  treaty_country TEXT NULL,
  treaty_article TEXT NULL,
  -- Part III — Certification
  certification_name TEXT NULL,         -- name of signer (capacity to sign for beneficial owner)
  signed_date DATE NOT NULL,
  -- IRS validity = last day of the 3rd calendar year after signing.
  -- IH35 policy = renew yearly (renewal reminder derived at read time from signed_date).
  irs_expiration_date DATE NULL,
  notes TEXT NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_w8ben_driver
  ON safety.driver_w8ben (operating_company_id, driver_id)
  WHERE voided_at IS NULL;

ALTER TABLE safety.driver_w8ben ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.driver_w8ben FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_w8ben_tenant_scope ON safety.driver_w8ben;
CREATE POLICY driver_w8ben_tenant_scope
  ON safety.driver_w8ben
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.driver_w8ben TO ih35_app;

CREATE OR REPLACE FUNCTION safety.touch_driver_w8ben_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_touch_driver_w8ben_updated_at ON safety.driver_w8ben;
CREATE TRIGGER trg_touch_driver_w8ben_updated_at
BEFORE UPDATE ON safety.driver_w8ben
FOR EACH ROW
EXECUTE FUNCTION safety.touch_driver_w8ben_updated_at();

COMMIT;
