-- SCENTSX B3a — the bridge between the TIO Perfumes desk (perfume.*) and ScentsX's books (accounting / mdata), and the
-- two database walls.
--
-- Owner 2026-11-26 20:16 CT "full accounting engines making sure linkage connectivity reverse … complete wiring to
-- ledgers"; design https://claude.ai/artifact/VQ83ogvJyPpVoop1FNKJXC ("Entity model and the walls", "Linkage map").
--
-- SHAPE. The perfume schema stays isolated (verify-perfume-desk-isolation unchanged: perfume.* never names a carrier or
-- accounting table). Every link lives HERE, in schema scentsx, as a real foreign key on both sides:
--   scentsx.customer_links  perfume.contact_companies  <->  mdata.customers        (one each way)
--   scentsx.vendor_links    perfume.vendors            <->  mdata.vendors          (one each way)
--   scentsx.document_links  a perfume quote / sales order / purchase order  <->  an invoice / bill / journal entry
-- WALL 1: every link row's operating_company_id must be SCENTSX, and the engine row it names must belong to SCENTSX —
--         a USMCA / TRANSP / TRK customer, vendor, invoice, bill or journal entry can never be linked to the desk.
-- WALL 2: the same trigger refuses a link whose engine row is any other company — so no carrier row ever carries a
--         perfume link (the carrier tables themselves are untouched).
-- Rows are never deleted (no DELETE grant); a wrong link is voided (voided_at + reason), and a new one is written.

BEGIN;

CREATE SCHEMA IF NOT EXISTS scentsx;
GRANT USAGE ON SCHEMA scentsx TO ih35_app;

CREATE OR REPLACE FUNCTION scentsx.company_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, org
AS $$ SELECT id FROM org.companies WHERE code = 'SCENTSX' $$;
GRANT EXECUTE ON FUNCTION scentsx.company_id() TO ih35_app;

CREATE TABLE IF NOT EXISTS scentsx.customer_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  contact_company_id uuid NOT NULL REFERENCES perfume.contact_companies(id),
  customer_id uuid NOT NULL REFERENCES mdata.customers(id),
  voided_at timestamptz,
  void_reason text,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (voided_at IS NULL OR length(btrim(coalesce(void_reason, ''))) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_customer_links_contact ON scentsx.customer_links (contact_company_id) WHERE voided_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_customer_links_customer ON scentsx.customer_links (customer_id) WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS scentsx.vendor_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  perfume_vendor_id uuid NOT NULL REFERENCES perfume.vendors(id),
  vendor_id uuid NOT NULL REFERENCES mdata.vendors(id),
  voided_at timestamptz,
  void_reason text,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (voided_at IS NULL OR length(btrim(coalesce(void_reason, ''))) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_vendor_links_perfume ON scentsx.vendor_links (perfume_vendor_id) WHERE voided_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_vendor_links_vendor ON scentsx.vendor_links (vendor_id) WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS scentsx.document_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  quote_id uuid REFERENCES perfume.quotes(id),
  sales_order_id uuid REFERENCES perfume.sales_orders(id),
  purchase_order_id uuid REFERENCES perfume.purchase_orders(id),
  invoice_id uuid REFERENCES accounting.invoices(id),
  bill_id uuid REFERENCES accounting.bills(id),
  journal_entry_id uuid REFERENCES accounting.journal_entries(id),
  voided_at timestamptz,
  void_reason text,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(quote_id, sales_order_id, purchase_order_id) = 1),
  CHECK (num_nonnulls(invoice_id, bill_id, journal_entry_id) = 1),
  CHECK (voided_at IS NULL OR length(btrim(coalesce(void_reason, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS idx_scentsx_doc_links_so ON scentsx.document_links (sales_order_id) WHERE sales_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scentsx_doc_links_po ON scentsx.document_links (purchase_order_id) WHERE purchase_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scentsx_doc_links_quote ON scentsx.document_links (quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scentsx_doc_links_invoice ON scentsx.document_links (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scentsx_doc_links_bill ON scentsx.document_links (bill_id) WHERE bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scentsx_doc_links_je ON scentsx.document_links (journal_entry_id) WHERE journal_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_doc_links_pair ON scentsx.document_links
  (coalesce(quote_id, sales_order_id, purchase_order_id), coalesce(invoice_id, bill_id, journal_entry_id)) WHERE voided_at IS NULL;

-- WALL 1 + WALL 2 — one trigger function for the three tables. SECURITY DEFINER so it can read the engine row's company
-- even when the writer's own RLS scope would hide it (the check must never pass VACUOUSLY on a hidden row).
CREATE OR REPLACE FUNCTION scentsx.refuse_non_scentsx_link() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, org, mdata, accounting
AS $$
DECLARE
  v_sx uuid := (SELECT id FROM org.companies WHERE code = 'SCENTSX');
  v_co uuid;
BEGIN
  IF v_sx IS NULL THEN
    RAISE EXCEPTION 'SCENTSX company row missing — no perfume link may be written' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.operating_company_id IS DISTINCT FROM v_sx THEN
    RAISE EXCEPTION 'scentsx link must belong to SCENTSX (got %)', NEW.operating_company_id USING ERRCODE = 'check_violation';
  END IF;
  IF TG_TABLE_NAME = 'customer_links' THEN
    SELECT operating_company_id INTO v_co FROM mdata.customers WHERE id = NEW.customer_id;
  ELSIF TG_TABLE_NAME = 'vendor_links' THEN
    SELECT operating_company_id INTO v_co FROM mdata.vendors WHERE id = NEW.vendor_id;
  ELSIF NEW.invoice_id IS NOT NULL THEN
    SELECT operating_company_id INTO v_co FROM accounting.invoices WHERE id = NEW.invoice_id;
  ELSIF NEW.bill_id IS NOT NULL THEN
    SELECT operating_company_id INTO v_co FROM accounting.bills WHERE id = NEW.bill_id;
  ELSE
    SELECT operating_company_id INTO v_co FROM accounting.journal_entries WHERE id = NEW.journal_entry_id;
  END IF;
  IF v_co IS DISTINCT FROM v_sx THEN
    RAISE EXCEPTION 'a TIO Perfumes record may link only to a ScentsX row — this % row belongs to company %', TG_TABLE_NAME, v_co
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customer_links', 'vendor_links', 'document_links'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_scentsx_wall ON scentsx.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_scentsx_wall BEFORE INSERT OR UPDATE OF operating_company_id ON scentsx.%1$I
                    FOR EACH ROW EXECUTE FUNCTION scentsx.refuse_non_scentsx_link()', t);
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
END $$;

COMMIT;
