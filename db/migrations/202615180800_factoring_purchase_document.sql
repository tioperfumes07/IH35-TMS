-- 202615180800_factoring_purchase_document.sql
-- ROUND 315 (FINAL) step 2 (owner, 2026-10-01 16:05Z): "PURCHASE = THE DOCUMENT: accounting.factoring_purchases header
-- (purchase date, wire date, invoices, gross, advance, escrow reserve, cash reserve, fee, wire fee, net to IH35, bank
-- match) + lines per invoice; one posting engine; links invoice <-> purchase <-> load <-> settlement <-> customer <-> bank
-- both ways. Escrow and cash reserve are TWO accounts and two columns everywhere."
--
-- One purchase = one Faro wire. Lines = one per invoice. Posting reuses the existing secured-borrowing funding poster
-- (factoring-posting/poster.service.ts, ASC 860: A/R stays until the debtor pays) through ONE accounting.factoring_advances
-- row per purchase (factoring_advance_id, 1:1), so no GL math is duplicated. Amounts, Faro's own formula:
--   advance_cents (purchase price) = gross - escrow_reserve - fee
--   net_to_company_cents (the wire)  = advance - cash_reserve - wire_fee
-- Owner-only (ROUND 315 law): every create/post/match is gated in the app (factoring/owner-only-purchase.ts).
-- Bank match is NOT stored here: the canonical match engine records it on the bank line
-- (banking.bank_transactions.matched_factoring_advance_id = this purchase's factoring_advance_id) — one fact, one place.
-- Additive. FORCE RLS. Never deleted (void). CANONICAL: accounting.* / mdata.* / driver_finance.* / banking.*.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS accounting.factoring_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  display_id text NOT NULL,
  factoring_company_vendor_id uuid NOT NULL REFERENCES mdata.vendors(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','voided')),
  purchase_date date NOT NULL,
  wire_date date,
  faro_report_ref text,
  invoice_count integer NOT NULL DEFAULT 0 CHECK (invoice_count >= 0),
  gross_cents bigint NOT NULL DEFAULT 0 CHECK (gross_cents >= 0),
  escrow_reserve_cents bigint NOT NULL DEFAULT 0 CHECK (escrow_reserve_cents >= 0),
  cash_reserve_cents bigint NOT NULL DEFAULT 0 CHECK (cash_reserve_cents >= 0),
  fee_cents bigint NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  wire_fee_cents bigint NOT NULL DEFAULT 0 CHECK (wire_fee_cents >= 0),
  advance_cents bigint NOT NULL DEFAULT 0,
  net_to_company_cents bigint NOT NULL DEFAULT 0,
  factoring_advance_id uuid REFERENCES accounting.factoring_advances(id),
  journal_entry_id uuid REFERENCES accounting.journal_entries(id),
  posted_at timestamptz,
  posted_by_user_id uuid REFERENCES identity.users(id),
  notes text,
  is_sample_data boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES identity.users(id),
  voided_at timestamptz,
  void_reason text,
  voided_by_user_id uuid REFERENCES identity.users(id),
  CONSTRAINT factoring_purchases_advance_formula CHECK (advance_cents = gross_cents - escrow_reserve_cents - fee_cents),
  CONSTRAINT factoring_purchases_net_formula CHECK (net_to_company_cents = advance_cents - cash_reserve_cents - wire_fee_cents),
  CONSTRAINT factoring_purchases_net_nonneg CHECK (net_to_company_cents >= 0),
  CONSTRAINT factoring_purchases_posted_has_gl CHECK (status <> 'posted' OR (journal_entry_id IS NOT NULL AND factoring_advance_id IS NOT NULL AND posted_at IS NOT NULL)),
  CONSTRAINT factoring_purchases_voided_stamped CHECK ((status = 'voided') = (voided_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_factoring_purchases_display ON accounting.factoring_purchases (operating_company_id, display_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_factoring_purchases_company_id ON accounting.factoring_purchases (operating_company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_factoring_purchases_live_advance ON accounting.factoring_purchases (factoring_advance_id) WHERE factoring_advance_id IS NOT NULL AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_factoring_purchases_date ON accounting.factoring_purchases (operating_company_id, purchase_date);

CREATE TABLE IF NOT EXISTS accounting.factoring_purchase_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  purchase_id uuid NOT NULL REFERENCES accounting.factoring_purchases(id),
  line_no integer NOT NULL CHECK (line_no > 0),
  invoice_id uuid NOT NULL REFERENCES accounting.invoices(id),
  customer_id uuid NOT NULL REFERENCES mdata.customers(id),
  load_id uuid REFERENCES mdata.loads(id),
  settlement_id uuid REFERENCES driver_finance.driver_settlements(id),
  gross_cents bigint NOT NULL CHECK (gross_cents >= 0),
  escrow_reserve_cents bigint NOT NULL DEFAULT 0 CHECK (escrow_reserve_cents >= 0),
  cash_reserve_cents bigint NOT NULL DEFAULT 0 CHECK (cash_reserve_cents >= 0),
  fee_cents bigint NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id),
  voided_at timestamptz,
  CONSTRAINT factoring_purchase_lines_purchase_same_company FOREIGN KEY (operating_company_id, purchase_id)
    REFERENCES accounting.factoring_purchases(operating_company_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_factoring_purchase_lines_no ON accounting.factoring_purchase_lines (purchase_id, line_no);
-- An invoice sits on at most one live purchase.
CREATE UNIQUE INDEX IF NOT EXISTS uq_factoring_purchase_lines_live_invoice ON accounting.factoring_purchase_lines (invoice_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_factoring_purchase_lines_load ON accounting.factoring_purchase_lines (load_id) WHERE load_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_factoring_purchase_lines_customer ON accounting.factoring_purchase_lines (operating_company_id, customer_id);
CREATE INDEX IF NOT EXISTS ix_factoring_purchase_lines_settlement ON accounting.factoring_purchase_lines (settlement_id) WHERE settlement_id IS NOT NULL;

-- Same-entity law: each line's invoice, customer and load belong to the purchase's company; the invoice's own customer
-- and load are the line's (no drift between the line and its invoice).
CREATE OR REPLACE FUNCTION accounting.fn_factoring_purchase_line_same_entity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inv record;
BEGIN
  SELECT operating_company_id, customer_id, source_load_id, voided_at INTO inv FROM accounting.invoices WHERE id = NEW.invoice_id;
  IF inv.operating_company_id IS DISTINCT FROM NEW.operating_company_id THEN
    RAISE EXCEPTION 'factoring_purchase_line_cross_entity: invoice % is not in company %', NEW.invoice_id, NEW.operating_company_id USING ERRCODE = 'check_violation';
  END IF;
  IF inv.voided_at IS NOT NULL AND NEW.voided_at IS NULL THEN
    RAISE EXCEPTION 'factoring_purchase_line_voided_invoice: invoice % is voided', NEW.invoice_id USING ERRCODE = 'check_violation';
  END IF;
  IF inv.customer_id IS DISTINCT FROM NEW.customer_id THEN
    RAISE EXCEPTION 'factoring_purchase_line_customer_drift: line customer % <> invoice customer %', NEW.customer_id, inv.customer_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.load_id IS DISTINCT FROM inv.source_load_id THEN
    RAISE EXCEPTION 'factoring_purchase_line_load_drift: line load % <> invoice load %', NEW.load_id, inv.source_load_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_factoring_purchase_line_same_entity ON accounting.factoring_purchase_lines;
CREATE TRIGGER trg_factoring_purchase_line_same_entity BEFORE INSERT OR UPDATE OF invoice_id, customer_id, load_id, operating_company_id, voided_at
  ON accounting.factoring_purchase_lines FOR EACH ROW EXECUTE FUNCTION accounting.fn_factoring_purchase_line_same_entity();

-- A purchase posts only when its header equals the sum of its live lines (no plug).
CREATE OR REPLACE FUNCTION accounting.fn_factoring_purchase_ties_to_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s record;
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'posted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'posted') THEN
    SELECT count(*)::int n, COALESCE(sum(gross_cents),0) g, COALESCE(sum(escrow_reserve_cents),0) e,
           COALESCE(sum(cash_reserve_cents),0) c, COALESCE(sum(fee_cents),0) f
      INTO s FROM accounting.factoring_purchase_lines WHERE purchase_id = NEW.id AND voided_at IS NULL;
    IF s.n = 0 OR s.n <> NEW.invoice_count OR s.g <> NEW.gross_cents OR s.e <> NEW.escrow_reserve_cents
       OR s.c <> NEW.cash_reserve_cents OR s.f <> NEW.fee_cents THEN
      RAISE EXCEPTION 'factoring_purchase_does_not_tie: header (n % g % e % c % f %) <> lines (n % g % e % c % f %)',
        NEW.invoice_count, NEW.gross_cents, NEW.escrow_reserve_cents, NEW.cash_reserve_cents, NEW.fee_cents,
        s.n, s.g, s.e, s.c, s.f USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_factoring_purchase_ties_to_lines ON accounting.factoring_purchases;
CREATE TRIGGER trg_factoring_purchase_ties_to_lines BEFORE INSERT OR UPDATE ON accounting.factoring_purchases
  FOR EACH ROW EXECUTE FUNCTION accounting.fn_factoring_purchase_ties_to_lines();

-- Lines of a posted purchase are frozen (void the purchase to change it).
CREATE OR REPLACE FUNCTION accounting.fn_factoring_purchase_lines_frozen_when_posted() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM accounting.factoring_purchases WHERE id = COALESCE(NEW.purchase_id, OLD.purchase_id);
  IF st = 'posted' AND NOT (TG_OP = 'UPDATE' AND OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL
       AND NEW.gross_cents = OLD.gross_cents AND NEW.escrow_reserve_cents = OLD.escrow_reserve_cents
       AND NEW.cash_reserve_cents = OLD.cash_reserve_cents AND NEW.fee_cents = OLD.fee_cents AND NEW.invoice_id = OLD.invoice_id) THEN
    RAISE EXCEPTION 'factoring_purchase_line_frozen: purchase is posted -- void it to change a line' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS trg_factoring_purchase_lines_frozen ON accounting.factoring_purchase_lines;
CREATE TRIGGER trg_factoring_purchase_lines_frozen BEFORE INSERT OR UPDATE ON accounting.factoring_purchase_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.fn_factoring_purchase_lines_frozen_when_posted();

DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.factoring_purchases;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.factoring_purchases
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.factoring_purchase_lines;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.factoring_purchase_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();

ALTER TABLE accounting.factoring_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.factoring_purchases FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting.factoring_purchase_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.factoring_purchase_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factoring_purchases_company_isolation ON accounting.factoring_purchases;
CREATE POLICY factoring_purchases_company_isolation ON accounting.factoring_purchases
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
DROP POLICY IF EXISTS factoring_purchase_lines_company_isolation ON accounting.factoring_purchase_lines;
CREATE POLICY factoring_purchase_lines_company_isolation ON accounting.factoring_purchase_lines
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON accounting.factoring_purchases TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.factoring_purchase_lines TO ih35_app;

COMMENT ON TABLE accounting.factoring_purchases IS 'ROUND 315: one factoring purchase = one Faro wire (Owner-only). Posts through its 1:1 factoring_advance (secured borrowing). advance = gross - escrow - fee; net = advance - cash reserve - wire fee.';
COMMENT ON TABLE accounting.factoring_purchase_lines IS 'ROUND 315: one line per invoice on a purchase; escrow and cash reserve split per invoice; links invoice, customer, load, settlement.';
COMMIT;
