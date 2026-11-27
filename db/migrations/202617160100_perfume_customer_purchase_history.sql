-- PERFUME customer purchase history — ROUND P1.31 L1 (owner 2026-11-27 15:45 CT item 10: "for vendors customers and vendors i need
-- to be able to categorize or rank on purchase capacity or quantity"). ScentsX opens at $0 (owner law 14:12 CT: "do not bring in
-- balances … im brining in customers, items, etc"), so the purchase history of TIO's customers lives in the old systems:
--   * USA store system (Sales By Customer, 2020-01 … 2026-11): per customer per month — invoices and total (tax included, returns
--     netted) — source 'usa_store', currency USD;
--   * Mexico customer file (2020 … 2025): per customer per year — total in MXN with IVA — source 'mexico_file', currency MXN.
-- These rows are a history of what each customer BOUGHT, nothing else: no balance, no open amount, no credit, never posted to any
-- ledger. Each row may point at its contact company (perfume.contact_companies) when the name matches; an unmatched row keeps the
-- name as in the source. The A/B/C rank is read from here (perfume/customer-ranking.service.ts). Never deleted; a re-import replaces
-- the same (source, customer no., period) row.

BEGIN;

-- CANONICAL-CHECK: customer_purchase_history. NOT a money ledger and NOT a second invoice / A/R table: it holds no balance, posts
--   nothing, has no account and no payment. It is the imported sales HISTORY of the old store systems (before ScentsX existed), kept
--   only to rank customers by purchases. ScentsX's own sales live ONLY in accounting.invoices (the canonical A/R).
CREATE TABLE IF NOT EXISTS perfume.customer_purchase_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('usa_store', 'mexico_file')),
  customer_no text NOT NULL,
  customer_name text NOT NULL,
  company_id uuid REFERENCES perfume.contact_companies(id),
  period_kind text NOT NULL CHECK (period_kind IN ('month', 'year')),
  period_start date NOT NULL,
  invoices integer CHECK (invoices IS NULL OR invoices >= 0),
  amount_cents bigint NOT NULL,
  currency text NOT NULL CHECK (currency IN ('USD', 'MXN')),
  imported_by uuid REFERENCES identity.users(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, customer_no, period_start)
);
CREATE INDEX IF NOT EXISTS idx_perfume_cph_company ON perfume.customer_purchase_history (company_id);
CREATE INDEX IF NOT EXISTS idx_perfume_cph_customer ON perfume.customer_purchase_history (source, customer_no);

ALTER TABLE perfume.customer_purchase_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.customer_purchase_history FORCE ROW LEVEL SECURITY;
-- Same wall as every perfume table (perfume.is_owner(): the owner, desk granted).
DROP POLICY IF EXISTS customer_purchase_history_owner_only ON perfume.customer_purchase_history;
CREATE POLICY customer_purchase_history_owner_only ON perfume.customer_purchase_history FOR ALL
  USING ((SELECT perfume.is_owner())) WITH CHECK ((SELECT perfume.is_owner()));
GRANT SELECT, INSERT, UPDATE ON perfume.customer_purchase_history TO ih35_app;

COMMIT;
