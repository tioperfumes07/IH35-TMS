-- PERFUME-DESK (owner 2026-11-20 20:38 CT): "LOCATIONS — rename tabs as well with number and name — and in the app
-- register etc. Bodega-008 perfume bodega laredo, 5 hidalgo-McAllen, 11-Laredo, 12-El Paso, 18-Otai, 19-San Isidro,
-- 229-Calexico, 230-Austin, 231-New Orleans."
-- 1) perfume.locations — the owner's register of stores / bodegas: number (code) + name, editable on the desk.
-- 2) perfume.price_list_rows.qty_by_location — my inventory lines carry the pieces held at each location
--    ({"008": 12, "011": 5}); the grid shows one stock column per location.
-- Isolated perfume schema (ScentsX LLC), never posts to accounting. Additive, idempotent. No DELETE grant: a location
-- that closes is set inactive, never deleted (its stock history keeps its code).
CREATE TABLE IF NOT EXISTS perfume.locations (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z0-9-]{1,10}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE perfume.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.locations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS locations_owner_only ON perfume.locations;
CREATE POLICY locations_owner_only ON perfume.locations USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.locations TO ih35_app;

ALTER TABLE perfume.price_list_rows ADD COLUMN IF NOT EXISTS qty_by_location jsonb;

-- 3) Owner 2026-11-20 20:46 CT: "all those with 0 cost are either testers or blotters". My own inventory prints a $0
--    cost for free testers / blotters; the line is kept at $0. The import code still refuses $0 on supplier and
--    competitor lists (prepare()), so only my own lists can carry it.
ALTER TABLE perfume.price_list_rows DROP CONSTRAINT IF EXISTS price_list_rows_price_cents_check;
ALTER TABLE perfume.price_list_rows ADD CONSTRAINT price_list_rows_price_cents_check CHECK (price_cents IS NULL OR price_cents >= 0);

-- The owner's register as he wrote it (numbers padded to the 3-digit store code; names as given). Codes 002 and T1
-- also hold perfume stock in the HK 11-17 report but were not named — registered under their number until he names them.
INSERT INTO perfume.locations (code, name, sort_order) VALUES
  ('008', 'Perfume Bodega Laredo', 10),
  ('005', 'Hidalgo - McAllen', 20),
  ('011', 'Laredo', 30),
  ('012', 'El Paso', 40),
  ('018', 'Otay', 50),
  ('019', 'San Isidro', 60),
  ('229', 'Calexico', 70),
  ('230', 'Austin', 80),
  ('231', 'New Orleans', 90),
  ('002', '002', 100),
  ('T1', 'T1', 110)
ON CONFLICT (code) DO NOTHING;
