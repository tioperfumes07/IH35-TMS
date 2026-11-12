-- PERFUME-DESK (owner 2026-11-12): "I will upload a list to offer to clients … and I will upload my inventory so I can
-- see real inventory and quantities and what I need to purchase … each time I upload a new one it should replace the
-- previous one." Two more list kinds on perfume.vendors: 'offer' (my offer list to clients) and 'inventory' (my stock,
-- quantities, last cost). They import through the same engine as vendor lists; a new upload replaces the old one.
-- Isolated perfume schema; no money, no GL. Idempotent.
ALTER TABLE perfume.vendors DROP CONSTRAINT IF EXISTS vendors_kind_check;
ALTER TABLE perfume.vendors ADD CONSTRAINT vendors_kind_check CHECK (kind IN ('buy', 'sell', 'both', 'offer', 'inventory'));
INSERT INTO perfume.vendors (name, kind)
SELECT x.name, x.kind FROM (VALUES ('TIO · My offer list', 'offer'), ('TIO · My inventory', 'inventory')) AS x(name, kind)
WHERE NOT EXISTS (SELECT 1 FROM perfume.vendors v WHERE lower(v.name) = lower(x.name) AND v.archived_at IS NULL);
