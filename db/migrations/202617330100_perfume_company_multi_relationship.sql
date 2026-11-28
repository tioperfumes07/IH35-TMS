-- PERFUME — Relationship and Business type hold SEVERAL values (owner 2026-11-28 14:58 CT: "in relationship I might want to select
-- multiple, business type also"). A company can be, e.g., a Supplier / Brand AND a Potential customer; a Perfume retail AND a Beauty
-- supply store.
--   * perfume.contact_companies.relationships text[] / business_types text[] — the lists the creator / editor and the filters use.
--   * main_category / segment stay as the PRIMARY value (the first of each list) so every existing reader (imports, Google search,
--     catalog cleanup, Excel round trip, campaigns) keeps working unchanged. A trigger keeps both in step on every write:
--       - a writer that sets the list → the single column becomes its first value;
--       - a writer that sets only the single column (imports, older code) → the value is put first in the list.
-- Backfill: each list starts as the company's current single value. No new table, no money, no RLS change.

BEGIN;

ALTER TABLE perfume.contact_companies ADD COLUMN IF NOT EXISTS relationships text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE perfume.contact_companies ADD COLUMN IF NOT EXISTS business_types text[] NOT NULL DEFAULT '{}'::text[];

UPDATE perfume.contact_companies SET relationships = ARRAY[main_category] WHERE main_category IS NOT NULL AND btrim(main_category) <> '' AND relationships = '{}'::text[];
UPDATE perfume.contact_companies SET business_types = ARRAY[segment] WHERE segment IS NOT NULL AND btrim(segment) <> '' AND business_types = '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_contact_companies_relationships ON perfume.contact_companies USING gin (relationships);
CREATE INDEX IF NOT EXISTS idx_contact_companies_business_types ON perfume.contact_companies USING gin (business_types);

CREATE OR REPLACE FUNCTION perfume.tg_company_lists_in_step() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Relationship
  IF TG_OP = 'INSERT' OR NEW.relationships IS DISTINCT FROM OLD.relationships THEN
    -- de-duplicated, blanks dropped, the caller's order kept
    NEW.relationships := coalesce((SELECT array_agg(x ORDER BY o) FROM (SELECT x, min(o) o FROM unnest(NEW.relationships) WITH ORDINALITY AS t(x, o)
                                    WHERE x IS NOT NULL AND btrim(x) <> '' GROUP BY x) s), '{}'::text[]);
    IF cardinality(NEW.relationships) > 0 THEN NEW.main_category := NEW.relationships[1];
    ELSIF TG_OP = 'UPDATE' AND NEW.main_category IS NOT DISTINCT FROM OLD.main_category THEN NEW.main_category := NULL; END IF;
  END IF;
  IF (TG_OP = 'INSERT' AND cardinality(NEW.relationships) = 0 AND coalesce(btrim(NEW.main_category), '') <> '')
     OR (TG_OP = 'UPDATE' AND NEW.main_category IS DISTINCT FROM OLD.main_category AND NEW.relationships IS NOT DISTINCT FROM OLD.relationships) THEN
    NEW.relationships := CASE WHEN coalesce(btrim(NEW.main_category), '') = '' THEN '{}'::text[]
                              ELSE ARRAY[NEW.main_category] || array_remove(NEW.relationships, NEW.main_category) END;
  END IF;
  -- Business type
  IF TG_OP = 'INSERT' OR NEW.business_types IS DISTINCT FROM OLD.business_types THEN
    NEW.business_types := coalesce((SELECT array_agg(x ORDER BY o) FROM (SELECT x, min(o) o FROM unnest(NEW.business_types) WITH ORDINALITY AS t(x, o)
                                     WHERE x IS NOT NULL AND btrim(x) <> '' GROUP BY x) s), '{}'::text[]);
    IF cardinality(NEW.business_types) > 0 THEN NEW.segment := NEW.business_types[1];
    ELSIF TG_OP = 'UPDATE' AND NEW.segment IS NOT DISTINCT FROM OLD.segment THEN NEW.segment := NULL; END IF;
  END IF;
  IF (TG_OP = 'INSERT' AND cardinality(NEW.business_types) = 0 AND coalesce(btrim(NEW.segment), '') <> '')
     OR (TG_OP = 'UPDATE' AND NEW.segment IS DISTINCT FROM OLD.segment AND NEW.business_types IS NOT DISTINCT FROM OLD.business_types) THEN
    NEW.business_types := CASE WHEN coalesce(btrim(NEW.segment), '') = '' THEN '{}'::text[]
                               ELSE ARRAY[NEW.segment] || array_remove(NEW.business_types, NEW.segment) END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_company_lists_in_step ON perfume.contact_companies;
CREATE TRIGGER trg_company_lists_in_step BEFORE INSERT OR UPDATE ON perfume.contact_companies
  FOR EACH ROW EXECUTE FUNCTION perfume.tg_company_lists_in_step();

COMMIT;
