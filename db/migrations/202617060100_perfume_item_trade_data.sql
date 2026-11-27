-- PERFUME item trade data — owner 2026-11-27 08:10 CT ("make this more efficient and professional … lists wholesale lists") and 09:12 CT
-- ("only pause when all is done and complete").
--
-- What a wholesale buyer and a border crossing need about each item (Cin7 / Acumatica item master; CBP / SAT paperwork):
--   case_pack      — units in a master case (wholesale lists sell by the case)
--   min_order_qty  — the minimum a wholesale order takes of this item
--   weight_g       — shipping weight of one unit, grams
--   origin_country — country of origin, ISO 3166-1 alpha-2 (FR, US, AE …) — required on the commercial invoice for an export
--   hs_code        — Harmonized System tariff code, 6 to 10 digits (perfumes 3303.00) — required on the export invoice / pedimento
-- All nullable, checked for shape. The wholesale list shows them; a ScentsX export invoice line carries HS + origin.

BEGIN;

ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS case_pack integer;
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS min_order_qty integer;
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS weight_g numeric(10, 1);
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS origin_country text;
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS hs_code text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perfume_items_trade_check') THEN
    ALTER TABLE perfume.items ADD CONSTRAINT perfume_items_trade_check CHECK (
      (case_pack IS NULL OR case_pack BETWEEN 1 AND 100000)
      AND (min_order_qty IS NULL OR min_order_qty BETWEEN 1 AND 1000000)
      AND (weight_g IS NULL OR weight_g > 0)
      AND (origin_country IS NULL OR origin_country ~ '^[A-Z]{2}$')
      AND (hs_code IS NULL OR hs_code ~ '^[0-9]{6,10}$'));
  END IF;
END $$;

COMMIT;
