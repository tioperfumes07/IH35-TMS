-- SCENTSX B9b — OFAC sanctions screening, Texas resale certificates, export proof.
--
-- Owner 2026-11-26 20:18 CT "compliance for money forms … money laundering etc fincen"; design
-- https://claude.ai/artifact/VQ83ogvJyPpVoop1FNKJXC section 8:
--  * OFAC: every new customer, vendor and Form 8300 payer is screened against the Treasury SDN list before the first sale or PO,
--    and again when the list changes. A possible match blocks the party until the owner clears it with a written reason.
--    The list is loaded from OFAC's Sanctions List Service (SDN.CSV + ALT.CSV; verified 2026-11-26: HTTP 200, published
--    2026-11-20). Names are compared with pg_trgm similarity on a normalized form.
--  * Texas sales tax: a reseller's resale certificate (Comptroller Form 01-339) is stored on the customer; an export is tax-free
--    only with proof the goods left the US (customs broker export certification, the foreign import papers — e.g. a Mexican
--    pedimento — or a carrier's bill of lading to a point outside the US). Proof is kept 4 years; nothing here is deleted.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS scentsx.sanctions_list_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'OFAC SDN',
  source_url text NOT NULL,
  published_on date,
  sdn_rows integer NOT NULL CHECK (sdn_rows >= 0),
  alt_rows integer NOT NULL CHECK (alt_rows >= 0),
  content_sha256 text NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  loaded_by uuid REFERENCES identity.users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_sanctions_load_sha ON scentsx.sanctions_list_loads (content_sha256);

-- Every loaded list, kept (append-only; a screening names the load it ran against). The current list = the newest load.
CREATE TABLE IF NOT EXISTS scentsx.sanctions_list_entries (
  id bigserial PRIMARY KEY,
  load_id uuid NOT NULL REFERENCES scentsx.sanctions_list_loads(id),
  ent_num integer NOT NULL,
  alt_num integer,
  name text NOT NULL,
  name_norm text NOT NULL,
  sdn_type text,
  program text,
  remarks text
);
CREATE INDEX IF NOT EXISTS idx_scentsx_sanctions_name_trgm ON scentsx.sanctions_list_entries USING gin (name_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_scentsx_sanctions_load ON scentsx.sanctions_list_entries (load_id);

CREATE TABLE IF NOT EXISTS scentsx.sanctions_screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  party_kind text NOT NULL CHECK (party_kind IN ('contact_company', 'customer', 'vendor', 'cash_payer')),
  contact_company_id uuid REFERENCES perfume.contact_companies(id),
  customer_id uuid REFERENCES mdata.customers(id),
  vendor_id uuid REFERENCES mdata.vendors(id),
  cash_payer_id uuid REFERENCES scentsx.cash_payers(id),
  screened_name text NOT NULL,
  list_load_id uuid NOT NULL REFERENCES scentsx.sanctions_list_loads(id),
  threshold numeric(4,3) NOT NULL,
  best_score numeric(4,3) NOT NULL DEFAULT 0,
  hits jsonb NOT NULL DEFAULT '[]'::jsonb,
  result text NOT NULL CHECK (result IN ('clear', 'possible_match')),
  cleared_at timestamptz,
  cleared_by uuid REFERENCES identity.users(id),
  clear_reason text,
  confirmed_match_at timestamptz,
  confirmed_by uuid REFERENCES identity.users(id),
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(contact_company_id, customer_id, vendor_id, cash_payer_id) = 1),
  CHECK (cleared_at IS NULL OR (cleared_by IS NOT NULL AND clear_reason IS NOT NULL)),
  CHECK (NOT (cleared_at IS NOT NULL AND confirmed_match_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_scentsx_screen_contact ON scentsx.sanctions_screenings (contact_company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scentsx_screen_customer ON scentsx.sanctions_screenings (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scentsx_screen_vendor ON scentsx.sanctions_screenings (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scentsx_screen_payer ON scentsx.sanctions_screenings (cash_payer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS scentsx.resale_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  contact_company_id uuid NOT NULL REFERENCES perfume.contact_companies(id),
  customer_id uuid REFERENCES mdata.customers(id),
  form_code text NOT NULL DEFAULT '01-339' CHECK (form_code IN ('01-339', 'out_of_state', 'mexico_export_buyer')),
  purchaser_tax_id text,
  signed_on date NOT NULL,
  file_id uuid NOT NULL REFERENCES docs.files(id),
  notes text,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES identity.users(id),
  void_reason text,
  CHECK (voided_at IS NULL OR void_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_scentsx_resale_contact ON scentsx.resale_certificates (contact_company_id);

CREATE TABLE IF NOT EXISTS scentsx.export_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  sales_order_id uuid NOT NULL REFERENCES perfume.sales_orders(id),
  invoice_id uuid REFERENCES accounting.invoices(id),
  proof_kind text NOT NULL CHECK (proof_kind IN ('broker_export_certification', 'foreign_import_papers', 'bill_of_lading_outside_us')),
  document_number text,
  crossed_on date,
  port text,
  file_id uuid NOT NULL REFERENCES docs.files(id),
  notes text,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES identity.users(id),
  void_reason text,
  CHECK (voided_at IS NULL OR void_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_scentsx_export_proof_so ON scentsx.export_proofs (sales_order_id);

-- Wall: rows belong to SCENTSX; named customers / invoices must be ScentsX's. (Vendors are shared master data.)
CREATE OR REPLACE FUNCTION scentsx.refuse_non_scentsx_b9b_row() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, org, accounting, mdata
AS $$
DECLARE
  v_sx uuid := (SELECT id FROM org.companies WHERE code = 'SCENTSX');
  v_co uuid;
BEGIN
  IF v_sx IS NULL OR NEW.operating_company_id IS DISTINCT FROM v_sx THEN
    RAISE EXCEPTION '% row must belong to SCENTSX', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  IF TG_TABLE_NAME IN ('sanctions_screenings', 'resale_certificates') THEN
    IF NEW.customer_id IS NOT NULL THEN
      SELECT operating_company_id INTO v_co FROM mdata.customers WHERE id = NEW.customer_id;
      IF v_co IS DISTINCT FROM v_sx THEN
        RAISE EXCEPTION '% names a customer of another company (%)', TG_TABLE_NAME, v_co USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'export_proofs' THEN
    IF NEW.invoice_id IS NOT NULL THEN
      SELECT operating_company_id INTO v_co FROM accounting.invoices WHERE id = NEW.invoice_id;
      IF v_co IS DISTINCT FROM v_sx THEN
        RAISE EXCEPTION 'export proof names an invoice of another company (%)', v_co USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sanctions_screenings', 'resale_certificates', 'export_proofs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_scentsx_wall ON scentsx.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_scentsx_wall BEFORE INSERT OR UPDATE ON scentsx.%1$I FOR EACH ROW EXECUTE FUNCTION scentsx.refuse_non_scentsx_b9b_row()', t);
    EXECUTE format('ALTER TABLE scentsx.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE scentsx.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_entity_select ON scentsx.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_entity_write ON scentsx.%1$I', t);
    EXECUTE format($p$CREATE POLICY %1$s_entity_select ON scentsx.%1$I FOR SELECT
      USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))$p$, t);
    EXECUTE format($p$CREATE POLICY %1$s_entity_write ON scentsx.%1$I FOR ALL
      USING (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])))
      WITH CHECK (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])))$p$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON scentsx.%I TO ih35_app', t);
  END LOOP;
  -- The public sanctions list carries no company data: readable by the app, written only by the loader (Owner session).
  FOREACH t IN ARRAY ARRAY['sanctions_list_loads', 'sanctions_list_entries'] LOOP
    EXECUTE format('ALTER TABLE scentsx.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE scentsx.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON scentsx.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write ON scentsx.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_read ON scentsx.%1$I FOR SELECT USING (true)', t);
    EXECUTE format($p$CREATE POLICY %1$s_write ON scentsx.%1$I FOR ALL
      USING (identity.is_lucia_bypass() OR identity.current_user_role() = 'Owner'::identity.role_enum)
      WITH CHECK (identity.is_lucia_bypass() OR identity.current_user_role() = 'Owner'::identity.role_enum)$p$, t);
  END LOOP;
  GRANT SELECT, INSERT ON scentsx.sanctions_list_loads TO ih35_app;
  GRANT SELECT, INSERT ON scentsx.sanctions_list_entries TO ih35_app;
  GRANT USAGE ON SEQUENCE scentsx.sanctions_list_entries_id_seq TO ih35_app;
END $$;

COMMIT;
