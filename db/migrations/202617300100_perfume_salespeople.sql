-- PERFUME E3 — salespeople (CONTROL "Salesman"; the owner's "LISTA DE CLIENTES POR VENDEDOR") — ROUND L.31 M18 E3, taken over by LEAD
-- (owner 2026-11-27 22:54 CT "… customers … fully total and complete").
--   * perfume.salespeople — who sells for TIO, with the commission % paid on what their customers buy (0 until the owner sets it).
--   * perfume.customer_salespeople — the salesperson of a customer company, ONE live assignment per company (partial unique index),
--     every change kept as history (ended_at / ended_by / end_reason): reassigning ends the old row and opens a new one, never an update.
--   * The sales / commission by salesperson report is READ ONLY over ScentsX's issued invoices (by the contact company linked to the
--     ScentsX customer) and the imported purchase history — perfume/salespeople.service.ts.
--
-- CANONICAL-CHECK: salesperson_master_and_assignment. NOT a money ledger and NOT a second customer / invoice / A/R table:
--   perfume.salespeople is a people list (a name and a commission %), perfume.customer_salespeople names which salesperson a
--   perfume.contact_companies row belongs to. Neither holds a balance, a sale, a commission owed or a payment; commission is only ever
--   COMPUTED in the report from accounting.invoices (the one A/R invoice table) and perfume.customer_purchase_history. A commission that
--   is actually paid goes through the one bill / expense writer. Distinct from identity.users (app logins) and mdata.drivers.

BEGIN;

CREATE TABLE IF NOT EXISTS perfume.salespeople (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  name_key text GENERATED ALWAYS AS (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) STORED,
  commission_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_pct >= 0 AND commission_pct <= 100),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_perfume_salespeople_name ON perfume.salespeople (name_key);

CREATE TABLE IF NOT EXISTS perfume.customer_salespeople (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES perfume.contact_companies(id),
  salesperson_id uuid NOT NULL REFERENCES perfume.salespeople(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES identity.users(id),
  ended_at timestamptz,
  ended_by uuid REFERENCES identity.users(id),
  end_reason text,
  CHECK (ended_at IS NULL OR ended_at >= assigned_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_perfume_customer_salesperson_live ON perfume.customer_salespeople (company_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_perfume_customer_salespeople_sp ON perfume.customer_salespeople (salesperson_id) WHERE ended_at IS NULL;

ALTER TABLE perfume.salespeople ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.salespeople FORCE ROW LEVEL SECURITY;
ALTER TABLE perfume.customer_salespeople ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.customer_salespeople FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS salespeople_owner_only ON perfume.salespeople;
CREATE POLICY salespeople_owner_only ON perfume.salespeople FOR ALL
  USING ((SELECT perfume.is_owner())) WITH CHECK ((SELECT perfume.is_owner()));
DROP POLICY IF EXISTS customer_salespeople_owner_only ON perfume.customer_salespeople;
CREATE POLICY customer_salespeople_owner_only ON perfume.customer_salespeople FOR ALL
  USING ((SELECT perfume.is_owner())) WITH CHECK ((SELECT perfume.is_owner()));

-- History is kept, never deleted.
GRANT SELECT, INSERT, UPDATE ON perfume.salespeople TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON perfume.customer_salespeople TO ih35_app;

COMMIT;
