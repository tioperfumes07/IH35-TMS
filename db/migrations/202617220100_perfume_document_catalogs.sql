-- PERFUME M20 — catalogs wired into documents (LEAD ROUND L.32, owner 2026-11-27 19:38 CT "distribute work … all fully
-- completely done"; master list M20: payment terms Net 0/15/30/60, payment methods, shipping methods, sales-tax codes picked
-- on quote / SO / invoice / PO / bill / payment; due date from the terms).
--
-- Measured on production 2026-11-28 01:55 UTC:
--   * catalogs.payment_terms already holds ScentsX's terms (Due on Receipt 0, Net 7, Net 15, Net 30, Net 45, Net 60) — the
--     engine's own list (createExpandedInvoice reads days_until_due). Reused: no second terms list.
--   * catalogs.payment_methods already holds ScentsX's 9 methods (Cash, Check, ACH, Wire, Card, Zelle …). Reused.
--   * catalogs.tax_codes holds 0 ScentsX codes; there is no shipping-method catalog.
--   * perfume.quotes / sales_orders / purchase_orders: 0 rows each; `terms` is free text.
--
-- This migration (additive, idempotent):
--   1) quotes, sales_orders, purchase_orders: payment_terms_id → catalogs.payment_terms, shipping_method (a value of the
--      perfume catalog kind 'shipping_method'); quotes + sales_orders: tax_code_id → catalogs.tax_codes. `terms` stays as the
--      printed name (written from the picked terms by the services).
--   2) catalog kind 'shipping_method' with a starting list (owner edits on Catalogs).
--   3) ScentsX sales-tax codes: only the two Texas exemptions the invoice engine already checks (resale certificate, export
--      with proof), 0%. A taxable rate is NOT guessed — the owner adds it on Catalogs with its rate.

-- Rehearsed 2026-11-28 01:59 UTC on Neon branch br-lucky-sea-akrbcfq1 forked from br-fancy-credit-akjnd07a: applied clean; the new
-- kind CHECK validated all 156 existing catalog rows; 7 shipping methods + 2 ScentsX tax codes inserted (163 catalog rows after).

BEGIN;

ALTER TABLE perfume.quotes ADD COLUMN IF NOT EXISTS payment_terms_id uuid REFERENCES catalogs.payment_terms(id);
ALTER TABLE perfume.quotes ADD COLUMN IF NOT EXISTS shipping_method text CHECK (shipping_method IS NULL OR length(btrim(shipping_method)) BETWEEN 1 AND 200);
ALTER TABLE perfume.quotes ADD COLUMN IF NOT EXISTS tax_code_id uuid REFERENCES catalogs.tax_codes(id);
ALTER TABLE perfume.sales_orders ADD COLUMN IF NOT EXISTS payment_terms_id uuid REFERENCES catalogs.payment_terms(id);
ALTER TABLE perfume.sales_orders ADD COLUMN IF NOT EXISTS shipping_method text CHECK (shipping_method IS NULL OR length(btrim(shipping_method)) BETWEEN 1 AND 200);
ALTER TABLE perfume.sales_orders ADD COLUMN IF NOT EXISTS tax_code_id uuid REFERENCES catalogs.tax_codes(id);
ALTER TABLE perfume.purchase_orders ADD COLUMN IF NOT EXISTS payment_terms_id uuid REFERENCES catalogs.payment_terms(id);
ALTER TABLE perfume.purchase_orders ADD COLUMN IF NOT EXISTS shipping_method text CHECK (shipping_method IS NULL OR length(btrim(shipping_method)) BETWEEN 1 AND 200);
CREATE INDEX IF NOT EXISTS idx_perfume_quotes_payment_terms ON perfume.quotes (payment_terms_id);
CREATE INDEX IF NOT EXISTS idx_perfume_sales_orders_payment_terms ON perfume.sales_orders (payment_terms_id);
CREATE INDEX IF NOT EXISTS idx_perfume_purchase_orders_payment_terms ON perfume.purchase_orders (payment_terms_id);

ALTER TABLE perfume.catalog_values DROP CONSTRAINT IF EXISTS catalog_values_kind_check;
ALTER TABLE perfume.catalog_values ADD CONSTRAINT catalog_values_kind_check
  CHECK (kind IN ('vendor_type', 'customer_type', 'category', 'segment', 'source_kind', 'product_type', 'gender', 'item_category',
                  'olfactory_family', 'industry', 'review_tag', 'origin_country', 'shipping_method'));

INSERT INTO perfume.catalog_values (kind, value, sort)
SELECT 'shipping_method', t.v, t.s
  FROM (VALUES ('Customer pickup', 10), ('Our delivery', 20), ('UPS', 30), ('FedEx', 40), ('USPS', 50), ('LTL freight', 60),
               ('Export — customs broker', 70)) AS t(v, s)
 WHERE NOT EXISTS (SELECT 1 FROM perfume.catalog_values x WHERE x.kind = 'shipping_method' AND lower(x.value) = lower(t.v) AND x.archived_at IS NULL);

-- No backfill: 0 quotes / sales orders / purchase orders exist (measured above); terms typed later are picked from the list.

INSERT INTO catalogs.tax_codes (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
SELECT scentsx.company_id(), t.code, t.name, t.descr, jsonb_build_object('rate_pct', 0, 'exempt', true), true, t.s
  FROM (VALUES ('RESALE_EXEMPT', 'Exempt — resale certificate', 'Texas: the buyer gave a resale certificate (Form 01-339) — no sales tax', 10),
               ('EXPORT_EXEMPT', 'Exempt — export with proof', 'Texas: the goods left the US with export proof — no sales tax', 20)) AS t(code, name, descr, s)
 WHERE scentsx.company_id() IS NOT NULL
ON CONFLICT (operating_company_id, code) DO NOTHING;

COMMIT;
