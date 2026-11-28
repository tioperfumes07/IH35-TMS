-- PERFUME country of origin = the items' 2-letter code. perfume.items.origin_country is stored and checked as a 2-letter code (FR, US,
-- AE …; items.service.ts "Country of origin is 2 letters"), but 202617200100 seeded the Country of origin list with country NAMES — a
-- rename / merge of a list value would have written a name onto items that require a code. The list values become the codes (the screen
-- shows the name beside each code). Catalog rows only; no item changes (origin_country is empty on every item today). Idempotent.

BEGIN;

UPDATE perfume.catalog_values v SET value = t.code, updated_at = now()
  FROM (VALUES ('France', 'FR'), ('Italy', 'IT'), ('Spain', 'ES'), ('United States', 'US'), ('United Arab Emirates', 'AE'), ('United Kingdom', 'GB'),
               ('Germany', 'DE'), ('Switzerland', 'CH'), ('Mexico', 'MX'), ('Brazil', 'BR'), ('Netherlands', 'NL'), ('Japan', 'JP'), ('Korea', 'KR'),
               ('China', 'CN'), ('India', 'IN'), ('Turkey', 'TR'), ('Saudi Arabia', 'SA'), ('Poland', 'PL'), ('Portugal', 'PT'), ('Canada', 'CA')) AS t(name, code)
 WHERE v.kind = 'origin_country' AND v.archived_at IS NULL AND v.value = t.name
   AND NOT EXISTS (SELECT 1 FROM perfume.catalog_values x WHERE x.kind = 'origin_country' AND x.archived_at IS NULL AND x.value = t.code);

COMMIT;
