-- PERFUME-DESK (owner 2026-11-12 5:02 PM ET): "for vendors we should abbreviate, Perfume Center of America PCA, Miami
-- Trading MTZ, Nandansons NAND, Perfume Plus Wholesale PPW … remove 'after cushion' to make smaller, so just cushion."
-- A short name per vendor, used as the column header in every tab; the full name stays the record's name.
-- Isolated perfume schema; no money, no GL. Idempotent.
ALTER TABLE perfume.vendors ADD COLUMN IF NOT EXISTS short_name text;
ALTER TABLE perfume.vendors DROP CONSTRAINT IF EXISTS vendors_short_name_len;
ALTER TABLE perfume.vendors ADD CONSTRAINT vendors_short_name_len CHECK (short_name IS NULL OR char_length(short_name) BETWEEN 1 AND 12);
UPDATE perfume.vendors v SET short_name = x.short_name, updated_at = now()
  FROM (VALUES
    ('perfume center of america%', 'PCA'),
    ('miami trading%', 'MTZ'),
    ('nandansons%', 'NAND'),
    ('perfumes plus wholesale%', 'PPW'),
    ('perfume plus wholesale%', 'PPW'),
    ('jizan%', 'JIZAN'),
    ('lux america%', 'LUX'),
    ('darielle%', 'DARIELLE'),
    ('la esperanza%', 'ESPERANZA'),
    ('tio · my offer list', 'MY OFFER'),
    ('tio · my inventory', 'MY STOCK')
  ) AS x(pattern, short_name)
 WHERE v.short_name IS NULL AND lower(v.name) LIKE x.pattern;
