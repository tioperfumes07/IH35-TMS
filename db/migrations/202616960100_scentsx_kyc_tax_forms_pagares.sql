-- SCENTSX B12 — party KYC profile, IRS tax forms (W-9 / W-8BEN / W-8BEN-E / W-8ECI), pagarés.
--
-- Owner 2026-11-26 23:17 CT: "WE NEED TO CREATE A COMPLIANCE MODULE, FORM 8300, FINCEN, WBEN8, VISA PASSPORT RFC CURP FOR MEXICAN
-- CUSTOMERS, AND ANY OTHER REQURIED DATA, ALSO PAGARES, AND FOR US OR AMERICAN CUSTOMERS THE FED TAX ID, SALES TAX ID, ETC,
-- CONTACT INFORMATION, AND SHOULD BE LINKED AND WIRED TO CUSTOMERS, VENDORS ETC AND ACCOUNTING, AND CHART OF ACCOUNTS AND AR AND AP".
-- Form 8300 / FinCEN (cash log, cases, structuring) is 202616920100; OFAC, resale certificates and export proof are 202616930100.
--
-- WHAT
--   scentsx.party_kyc   — one live profile per TIO Perfumes party: a contact company (customer side) or a perfume vendor (vendor
--                         side). Mexico: RFC, CURP, passport, US visa (B1/B2 or border crossing card), INE copy, Constancia de
--                         Situación Fiscal. US: EIN, Texas sales and use tax permit (11-digit taxpayer number) or another state's
--                         permit, SSN / ITIN LAST 4 ONLY. Contact person, phone, email, address, proof of address.
--                         RFC, CURP, EIN, passport and visa numbers are stored in full (owner-only rows — the policy below);
--                         SSN / ITIN are never stored beyond the last 4 (the copy lives in docs.files).
--   scentsx.tax_forms   — W-9 / W-8BEN / W-8BEN-E / W-8ECI received from the party, signed date, expiry (a W-8 stays valid until
--                         Dec 31 of the third calendar year after signing — IRS Instructions for Form W-8BEN; W-9 does not
--                         expire), the signed copy.
--   scentsx.pagares     — promissory notes (Ley General de Títulos y Operaciones de Crédito arts. 170-174) a credit customer signs
--                         as security for its ScentsX credit account: amount, currency, issue / due date, place of payment,
--                         suscriptor, aval, moratorio rate, signed copy, status. A pagaré held as security is NOT a journal
--                         entry: the debt is already on the books as A/R (1100); the note secures it. If the owner later converts
--                         an A/R balance into a note, account 1150 "Notes Receivable - Pagarés" (202616950100) receives it
--                         through the existing journal-entry writer.
--
-- LINKAGE: party_kyc → perfume.contact_companies / perfume.vendors (desk record) → scentsx.customer_links / vendor_links →
--   mdata.customers / mdata.vendors → accounting.invoices (A/R 1100) / accounting.bills (A/P 2000). pagares → contact company →
--   perfume.customer_accounts (credit limit) and the credit-exposure read (credit-exposure.service.ts). Every file → docs.files.
-- Nothing is deleted (no DELETE grant); mistakes are voided with a reason.

BEGIN;

CREATE TABLE IF NOT EXISTS scentsx.party_kyc (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  contact_company_id uuid REFERENCES perfume.contact_companies(id),
  perfume_vendor_id uuid REFERENCES perfume.vendors(id),
  residency text NOT NULL CHECK (residency IN ('us', 'mexico', 'other')),
  entity_kind text NOT NULL CHECK (entity_kind IN ('individual', 'business')),
  legal_name text NOT NULL CHECK (length(btrim(legal_name)) > 0),
  dba_name text,
  -- United States
  ein text CHECK (ein IS NULL OR ein ~ '^[0-9]{2}-[0-9]{7}$'),
  ssn_itin_last4 text CHECK (ssn_itin_last4 IS NULL OR ssn_itin_last4 ~ '^[0-9]{4}$'),
  sales_tax_permit_state text CHECK (sales_tax_permit_state IS NULL OR sales_tax_permit_state ~ '^[A-Z]{2}$'),
  sales_tax_permit_number text,
  sales_tax_permit_file_id uuid REFERENCES docs.files(id),
  -- Mexico
  rfc text CHECK (rfc IS NULL OR rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  curp text CHECK (curp IS NULL OR curp ~ '^[A-Z]{4}[0-9]{6}[HMX][A-Z]{5}[A-Z0-9][0-9]$'),
  regimen_fiscal text,
  constancia_fiscal_file_id uuid REFERENCES docs.files(id),
  ine_file_id uuid REFERENCES docs.files(id),
  -- Travel documents (Mexican buyers crossing to Laredo)
  passport_number text,
  passport_country text CHECK (passport_country IS NULL OR passport_country ~ '^[A-Z]{2}$'),
  passport_expires_on date,
  passport_file_id uuid REFERENCES docs.files(id),
  visa_kind text CHECK (visa_kind IS NULL OR visa_kind IN ('b1_b2', 'border_crossing_card', 'other')),
  visa_number text,
  visa_expires_on date,
  visa_file_id uuid REFERENCES docs.files(id),
  -- Contact
  contact_person text,
  phone text,
  email text CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address_line text,
  city text,
  state_region text,
  postal_code text,
  country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  proof_of_address_file_id uuid REFERENCES docs.files(id),
  notes text,
  reviewed_by uuid REFERENCES identity.users(id),
  reviewed_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES identity.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  void_reason text,
  CHECK (num_nonnulls(contact_company_id, perfume_vendor_id) = 1),
  CHECK (sales_tax_permit_number IS NULL OR sales_tax_permit_state IS NOT NULL),
  CHECK (sales_tax_permit_state IS DISTINCT FROM 'TX' OR sales_tax_permit_number ~ '^[0-9]{11}$'),
  CHECK (voided_at IS NULL OR void_reason IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_kyc_contact ON scentsx.party_kyc (contact_company_id) WHERE voided_at IS NULL AND contact_company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_kyc_vendor ON scentsx.party_kyc (perfume_vendor_id) WHERE voided_at IS NULL AND perfume_vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scentsx_kyc_rfc ON scentsx.party_kyc (rfc) WHERE rfc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scentsx_kyc_ein ON scentsx.party_kyc (ein) WHERE ein IS NOT NULL;

CREATE TABLE IF NOT EXISTS scentsx.tax_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  party_kyc_id uuid NOT NULL REFERENCES scentsx.party_kyc(id),
  form_kind text NOT NULL CHECK (form_kind IN ('W-9', 'W-8BEN', 'W-8BEN-E', 'W-8ECI')),
  signed_on date NOT NULL,
  expires_on date,
  foreign_tin text,
  treaty_country text CHECK (treaty_country IS NULL OR treaty_country ~ '^[A-Z]{2}$'),
  chapter3_status text,
  file_id uuid NOT NULL REFERENCES docs.files(id),
  notes text,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  void_reason text,
  voided_by uuid REFERENCES identity.users(id),
  CHECK (form_kind <> 'W-9' OR expires_on IS NULL),
  CHECK (form_kind = 'W-9' OR expires_on IS NOT NULL),
  CHECK (expires_on IS NULL OR expires_on >= signed_on),
  CHECK (voided_at IS NULL OR void_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_scentsx_tax_forms_party ON scentsx.tax_forms (party_kyc_id, signed_on DESC);

CREATE TABLE IF NOT EXISTS scentsx.pagares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  pagare_no text NOT NULL,
  contact_company_id uuid NOT NULL REFERENCES perfume.contact_companies(id),
  party_kyc_id uuid REFERENCES scentsx.party_kyc(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'MXN')),
  issued_on date NOT NULL,
  due_on date,
  place_of_payment text NOT NULL CHECK (length(btrim(place_of_payment)) > 0),
  suscriptor_name text NOT NULL CHECK (length(btrim(suscriptor_name)) > 0),
  aval_name text,
  moratorio_rate_pct numeric(7,4) CHECK (moratorio_rate_pct IS NULL OR moratorio_rate_pct >= 0),
  signed_file_id uuid NOT NULL REFERENCES docs.files(id),
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'returned', 'void')),
  returned_at timestamptz,
  returned_by uuid REFERENCES identity.users(id),
  return_note text,
  notes text,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  void_reason text,
  voided_by uuid REFERENCES identity.users(id),
  CHECK (due_on IS NULL OR due_on >= issued_on),
  CHECK (status <> 'returned' OR (returned_at IS NOT NULL AND return_note IS NOT NULL)),
  CHECK (status <> 'void' OR (voided_at IS NOT NULL AND void_reason IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_pagare_no ON scentsx.pagares (operating_company_id, pagare_no);
CREATE INDEX IF NOT EXISTS idx_scentsx_pagares_contact ON scentsx.pagares (contact_company_id, status);

-- The ScentsX wall: every row belongs to SCENTSX, and a tax form / pagaré names a profile of SCENTSX for the same party.
CREATE OR REPLACE FUNCTION scentsx.refuse_non_scentsx_kyc_row() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, org, scentsx
AS $$
DECLARE
  v_sx uuid := (SELECT id FROM org.companies WHERE code = 'SCENTSX');
  v_co uuid;
  v_contact uuid;
BEGIN
  IF v_sx IS NULL OR NEW.operating_company_id IS DISTINCT FROM v_sx THEN
    RAISE EXCEPTION '% row must belong to SCENTSX', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  -- Nested IFs: PL/pgSQL does not promise to short-circuit AND, and NEW of party_kyc has no party_kyc_id.
  IF TG_TABLE_NAME = 'tax_forms' THEN
    SELECT operating_company_id INTO v_co FROM scentsx.party_kyc WHERE id = NEW.party_kyc_id;
    IF v_co IS DISTINCT FROM v_sx THEN
      RAISE EXCEPTION 'tax form names a profile of another company (%)', v_co USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'pagares' THEN
    IF NEW.party_kyc_id IS NOT NULL THEN
      SELECT operating_company_id, contact_company_id INTO v_co, v_contact FROM scentsx.party_kyc WHERE id = NEW.party_kyc_id;
      IF v_co IS DISTINCT FROM v_sx OR v_contact IS DISTINCT FROM NEW.contact_company_id THEN
        RAISE EXCEPTION 'pagaré names a profile of another party or company' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Owner-only rows (full RFC / CURP / EIN / passport / visa numbers): read and write need the Owner role in SCENTSX scope.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['party_kyc', 'tax_forms', 'pagares'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_scentsx_wall ON scentsx.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_scentsx_wall BEFORE INSERT OR UPDATE ON scentsx.%1$I FOR EACH ROW EXECUTE FUNCTION scentsx.refuse_non_scentsx_kyc_row()', t);
    EXECUTE format('ALTER TABLE scentsx.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE scentsx.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_owner_only ON scentsx.%1$I', t);
    EXECUTE format($p$CREATE POLICY %1$s_owner_only ON scentsx.%1$I FOR ALL
      USING (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = 'Owner'::identity.role_enum))
      WITH CHECK (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = 'Owner'::identity.role_enum))$p$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON scentsx.%I TO ih35_app', t);
  END LOOP;
END $$;

COMMIT;
