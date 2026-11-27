-- PERFUME product types on every item + tester pricing — owner 2026-11-27 12:03 CT "Search our regular items and they [testers] should
-- be sold at around 70 percent of the selling price of the regular goods … check and compare the vendors lists and databases for testers
-- regular goods" and 12:04 CT "Testers should have testers product type and bags should be tagged as bags, etc all those should exist".
--
-- 1. Product types. The item-product-type catalog gains every kind the item file holds (Unisex, Perfume, Set, Mini, Sample / Vial, Gift
--    with purchase, Bag, Box / Packaging, Display, Accessory, Blotter, Deodorant, Body care, Hair care, Cosmetics, Home fragrance) next to
--    Tester / Tester Man / Tester Woman / Man / Woman / Man Set / Woman Set / Body Mist. perfume.classify_product_type() reads the item's
--    own flags, gender, concentration and words (first match wins: blotter, tester, set, display, bag, gift with purchase, box, accessory,
--    home fragrance, cosmetics, sample, mini, body mist, deodorant, hair care, body care, then Man / Woman / Unisex by gender, then
--    Perfume by concentration; nothing matched → left blank). Every live item with NO product type is tagged once, with a history row
--    (via auto_classify); an item that already has one is never touched. New items get theirs on insert (trigger) when none is given.
-- 2. Tester → regular. perfume.items.regular_item_id links a tester to its regular (non-tester) item: same brand, name, size and
--    concentration first; else the closest name (trigram ≥ 0.65) of the same size, same brand and same concentration when both carry one
--    (brand blank: ≥ 0.75); a set or a mini is never the regular of a plain tester, and a flanker word (Intense, Elixir, Noir,
--    Parfum …) on one name and not the other is a different perfume. Set for every
--    tester once (history row), on insert of a new tester, and changeable on the item.
-- 3. perfume.price_levels.tester_pct (default 70): a tester's price at a level = tester_pct % of its regular item's price at that level
--    (the regular's fixed price, else the level's rule on the regular's cost). A fixed price set on the tester itself still wins.

BEGIN;

INSERT INTO perfume.catalog_values (kind, value, sort)
SELECT 'product_type', t.v, t.s
  FROM (VALUES ('Unisex', 25), ('Perfume', 28), ('Set', 75), ('Mini', 90), ('Sample / Vial', 95), ('Gift with purchase', 100), ('Bag', 110),
               ('Box / Packaging', 115), ('Display', 120), ('Accessory', 125), ('Blotter', 130), ('Deodorant', 140), ('Body care', 145),
               ('Hair care', 150), ('Cosmetics', 155), ('Home fragrance', 160)) AS t(v, s)
 WHERE NOT EXISTS (SELECT 1 FROM perfume.catalog_values x WHERE x.kind = 'product_type' AND lower(btrim(x.value)) = lower(t.v) AND x.archived_at IS NULL);

CREATE OR REPLACE FUNCTION perfume.classify_product_type(p_name text, p_flags text[], p_gender text, p_conc text) RETURNS text
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN n ~ '\m(BLOTTERS?|PAPER STRIPS?|SCENT STRIPS?)\M' THEN 'Blotter'
    WHEN 'TESTER' = ANY(f) OR n ~ '\mTESTER\M' THEN CASE p_gender WHEN 'W' THEN 'Tester Woman' WHEN 'M' THEN 'Tester Man' ELSE 'Tester' END
    WHEN 'SET' = ANY(f) OR n ~ '\m(SET|SETS|COFFRET|KIT|[0-9] ?PCS?)\M' THEN CASE p_gender WHEN 'W' THEN 'Woman Set' WHEN 'M' THEN 'Man Set' ELSE 'Set' END
    WHEN n ~ '\m(DISPLAY|STAND|FACTICE|DUMMY)\M' THEN 'Display'
    WHEN n ~ '\m(BAGS?|POUCH|TOTE|BACKPACK|DUFFLE|TOLETRY|TOILETRY)\M' THEN 'Bag'
    WHEN n ~ '\mGWP\M' THEN 'Gift with purchase'
    WHEN n ~ '\m(BOX|BOXES|PACKAGING|WRAP)\M' THEN 'Box / Packaging'
    WHEN n ~ '\m(ATOMIZER|KEYCHAIN|KEY CHAIN|NECKLACE|BRACELET|UMBRELLA|TOWEL|MIRROR|WALLET|CARD HOLDER|SUNGLASSES|WATCH|COMB)\M' THEN 'Accessory'
    WHEN n ~ '\m(CANDLE|DIFFUSER|INCENSE|ROOM SPRAY|HOME SPRAY|REED)\M' THEN 'Home fragrance'
    WHEN n ~ '\m(LIPSTICK|LIP|GLOSS|PALETTE|MASCARA|FOUNDATION|EYELINER|LINER|BLUSH|NAIL|CONCEALER|BRONZER|HIGHLIGHTER|EYESHADOW|PRIMER|COMPACT)\M' THEN 'Cosmetics'
    WHEN n ~ '\m(SAMPLES?|VIALS?)\M' THEN 'Sample / Vial'
    WHEN 'MINI' = ANY(f) OR n ~ '\m(MINI|MINIATURE)\M' THEN 'Mini'
    WHEN upper(coalesce(p_conc, '')) = 'MIST' OR n ~ '\m(BODY MIST|MIST|BODY SPRAY)\M' THEN 'Body Mist'
    WHEN n ~ '\m(DEO|DEODORANT|ANTIPERSPIRANT)\M' THEN 'Deodorant'
    WHEN n ~ '\m(SHAMPOO|CONDITIONER|HAIR)\M' THEN 'Hair care'
    WHEN n ~ '\m(LOTION|CREAM|CREME|GEL|SHOWER|SOAP|BALM|SCRUB|CLEANSER|CLNSR|SERUM|MOISTURIZER|OIL|BUTTER|POWDER|AFTER SHAVE|AFTERSHAVE|WASH)\M' THEN 'Body care'
    WHEN p_gender = 'W' THEN 'Woman' WHEN p_gender = 'M' THEN 'Man' WHEN p_gender = 'U' THEN 'Unisex'
    WHEN upper(coalesce(p_conc, '')) IN ('EDT', 'EDP', 'PARFUM', 'EXTRAIT', 'EDC') THEN 'Perfume'
    ELSE NULL END
  FROM (SELECT upper(coalesce(p_name, '')) AS n, coalesce(p_flags, '{}'::text[]) AS f) x
$$;

-- Tester → regular link.
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS regular_item_id uuid REFERENCES perfume.items(id);
CREATE INDEX IF NOT EXISTS idx_perfume_items_regular ON perfume.items (regular_item_id) WHERE regular_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_perfume_items_name_trgm ON perfume.items USING gin (lower(name) gin_trgm_ops);

CREATE OR REPLACE FUNCTION perfume.find_regular_item(p_id uuid, p_brand text, p_name text, p_size numeric, p_conc text, p_flags text[]) RETURNS uuid
  LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$
  WITH c AS (
    SELECT r.id,
           (lower(r.brand) = lower(coalesce(p_brand, '')) AND lower(r.name) = lower(coalesce(p_name, '')) AND coalesce(r.conc, '') = coalesce(p_conc, '')) AS exact,
           public.similarity(lower(r.name), lower(coalesce(p_name, ''))) AS sim,
           lower(r.brand) = lower(coalesce(p_brand, '')) AS same_brand,
           EXISTS (SELECT 1 FROM perfume.price_list_rows pr JOIN perfume.price_lists pl ON pl.id = pr.list_id
                    WHERE pr.item_id = r.id AND pl.is_current AND pl.voided_at IS NULL AND pr.price_cents > 0) AS priced
      FROM perfume.items r
     WHERE r.merged_into_id IS NULL AND r.id <> p_id AND NOT ('TESTER' = ANY(coalesce(r.flags, '{}'::text[])))
       AND r.size_ml IS NOT DISTINCT FROM p_size
       -- same concentration when both carry one; a set or a mini is never the regular of a plain tester
       AND (coalesce(p_conc, '') = '' OR coalesce(r.conc, '') = '' OR r.conc = p_conc)
       AND (NOT ('SET' = ANY(coalesce(r.flags, '{}'::text[]))) OR 'SET' = ANY(coalesce(p_flags, '{}'::text[])))
       AND (NOT ('MINI' = ANY(coalesce(r.flags, '{}'::text[]))) OR 'MINI' = ANY(coalesce(p_flags, '{}'::text[])))
       AND lower(r.name) OPERATOR(public.%) lower(coalesce(p_name, ''))
       -- a flanker is a different perfume: a modifier word on one name and not the other (Icon Supreme vs Icon Supreme Intense) is never a match
       AND NOT EXISTS (
         SELECT 1 FROM unnest(ARRAY['intense','intenso','elixir','absolu','absolute','extreme','noir','nero','sport','prive','extrait','night','nuit',
                                    'oud','gold','platinum','profondo','profumo','essence','legere','fraiche','eclat','tonic','aqua','acqua','edition',
                                    'limited','collector','reserve','black','blue','bleu','red','rouge','white','blanc','pink','rose','silver','argent',
                                    'cologne','parfum','summer','winter','fresh','glow','dark','light','royal','imperial','iconic','pure','wild'])
                       AS w(word)
          WHERE (lower(r.name) ~ ('\m' || w.word || '\M')) <> (lower(coalesce(p_name, '')) ~ ('\m' || w.word || '\M')))
  )
  SELECT id FROM c
   WHERE exact OR (same_brand AND sim >= 0.65) OR (coalesce(btrim(p_brand), '') IN ('', '?') AND sim >= 0.75)
   ORDER BY exact DESC, sim DESC, priced DESC, id
   LIMIT 1
$$;

-- Item history gains nothing new: auto tags are 'attributes' rows with via = auto_classify / auto_regular.

-- Price levels: tester rule.
ALTER TABLE perfume.price_levels ADD COLUMN IF NOT EXISTS tester_pct numeric(5, 2) NOT NULL DEFAULT 70;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'price_levels_tester_pct_check') THEN
    ALTER TABLE perfume.price_levels ADD CONSTRAINT price_levels_tester_pct_check CHECK (tester_pct > 0 AND tester_pct <= 100);
  END IF;
END $$;

-- New items: product type and (testers) regular link filled on insert when not given.
CREATE OR REPLACE FUNCTION perfume.items_autofill() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, perfume, public
AS $$
BEGIN
  IF NEW.product_type IS NULL THEN
    NEW.product_type := perfume.classify_product_type(NEW.display_name, NEW.flags, NEW.gender, NEW.conc);
  END IF;
  IF NEW.regular_item_id IS NULL AND 'TESTER' = ANY(coalesce(NEW.flags, '{}'::text[])) THEN
    NEW.regular_item_id := perfume.find_regular_item(NEW.id, NEW.brand, NEW.name, NEW.size_ml, NEW.conc, NEW.flags);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_perfume_items_autofill ON perfume.items;
CREATE TRIGGER trg_perfume_items_autofill BEFORE INSERT ON perfume.items FOR EACH ROW EXECUTE FUNCTION perfume.items_autofill();

-- One-time backfill: product type on every live item that has none; regular link on every tester that has none. History for each.
WITH t AS (
  UPDATE perfume.items i SET product_type = perfume.classify_product_type(i.display_name, i.flags, i.gender, i.conc), updated_at = now()
   WHERE i.merged_into_id IS NULL AND i.product_type IS NULL
     AND perfume.classify_product_type(i.display_name, i.flags, i.gender, i.conc) IS NOT NULL
  RETURNING i.id, i.product_type)
INSERT INTO perfume.item_events (item_id, kind, detail)
SELECT id, 'attributes', jsonb_build_object('from', jsonb_build_object('product_type', null), 'to', jsonb_build_object('product_type', product_type), 'via', 'auto_classify')
  FROM t;

WITH r AS (
  UPDATE perfume.items i SET regular_item_id = perfume.find_regular_item(i.id, i.brand, i.name, i.size_ml, i.conc, i.flags), updated_at = now()
   WHERE i.merged_into_id IS NULL AND i.regular_item_id IS NULL AND 'TESTER' = ANY(coalesce(i.flags, '{}'::text[]))
     AND perfume.find_regular_item(i.id, i.brand, i.name, i.size_ml, i.conc, i.flags) IS NOT NULL
  RETURNING i.id, i.regular_item_id)
INSERT INTO perfume.item_events (item_id, kind, detail)
SELECT id, 'attributes', jsonb_build_object('from', jsonb_build_object('regular_item_id', null), 'to', jsonb_build_object('regular_item_id', regular_item_id), 'via', 'auto_regular')
  FROM r;

COMMIT;
