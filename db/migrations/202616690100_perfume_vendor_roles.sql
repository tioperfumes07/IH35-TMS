-- PERFUME-DESK (owner 2026-11-23 12:32 CT): "in analysis or the wholesale vs competition i need to have wholesalers —
-- Esperanza, Broadway, Omni — not PCA and those, those are vendors, and they are for trading and for purchasing … that is
-- why i need you to categorize vendors, for trading and purchases, and wholesale for wholesale and trading, and have
-- toggle buttons."
-- perfume.vendors.roles — which desk tabs a vendor's list feeds: 'purchase' (Purchase · compare vendors), 'trading'
-- (Trading · sell to my vendors), 'wholesale' (Wholesale · vs competition, Competition · their margin, List analysis).
-- A vendor can carry several roles. My own lists (kind offer / inventory) carry none.
-- Backfill from the single kind it replaces as the tab switch: supplier (buy / both) → purchase + trading;
-- competitor (sell) → wholesale. Isolated perfume schema (ScentsX LLC), never posts to accounting. Additive, idempotent.
ALTER TABLE perfume.vendors ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}';
ALTER TABLE perfume.vendors DROP CONSTRAINT IF EXISTS vendors_roles_check;
ALTER TABLE perfume.vendors ADD CONSTRAINT vendors_roles_check CHECK (roles <@ ARRAY['purchase', 'trading', 'wholesale']::text[]);

UPDATE perfume.vendors SET roles = ARRAY['purchase', 'trading']::text[]
 WHERE kind IN ('buy', 'both') AND cardinality(roles) = 0;
UPDATE perfume.vendors SET roles = ARRAY['wholesale']::text[]
 WHERE kind = 'sell' AND cardinality(roles) = 0;
