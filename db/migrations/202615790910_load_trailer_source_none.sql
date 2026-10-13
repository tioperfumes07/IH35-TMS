-- LEAD 443.107 item 3 (owner, 2026-10-12): Book Load and Edit Load REQUIRE the trailer choice — a company trailer, a
-- customer / shipper trailer, or an explicit "no trailer (bobtail / power only)". The third choice must be RECORDED,
-- not inferred from a NULL: mdata.loads.trailer_source gains 'none'. 'none' carries no non-owned trailer.
-- Additive only: the CHECK is widened (old values stay valid), every existing row is unchanged.
SET LOCAL lock_timeout = '60s';

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'loads_trailer_source_check'
       AND conrelid = 'mdata.loads'::regclass
       AND pg_get_constraintdef(oid) NOT LIKE '%none%'
  ) THEN
    ALTER TABLE mdata.loads DROP CONSTRAINT loads_trailer_source_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loads_trailer_source_check' AND conrelid = 'mdata.loads'::regclass) THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_trailer_source_check
      CHECK (trailer_source IS NULL OR trailer_source IN ('company', 'customer', 'none')) NOT VALID;
    ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_trailer_source_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loads_no_trailer_names_none' AND conrelid = 'mdata.loads'::regclass) THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_no_trailer_names_none
      CHECK (trailer_source IS DISTINCT FROM 'none' OR non_owned_trailer_id IS NULL) NOT VALID;
    ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_no_trailer_names_none;
  END IF;
END $$;

COMMENT ON COLUMN mdata.loads.trailer_source IS
  'The recorded trailer choice (443.107): company = an owned/leased trailer on dispatch.load_assignment_history.new_trailer_id; customer = dispatch.non_owned_trailers via non_owned_trailer_id; none = explicitly no trailer (bobtail / power only). NULL = not yet chosen (pre-443.107 loads).';

-- "Carried by every expense": the expense trailer trigger (202615620900) copied only a COMPANY trailer (assignment history).
-- A customer-trailer load's expense now carries the load's non-owned trailer too; 'none' leaves both NULL (recorded choice).
-- Same company only; never overwrites a trailer the writer set. Function body restated with the one added branch.
CREATE OR REPLACE FUNCTION accounting.expenses_trailer_from_load() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.trailer_id IS NOT NULL OR NEW.load_id IS NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE((SELECT c.enforce_line_categorization FROM org.companies c WHERE c.id = NEW.operating_company_id), false) THEN RETURN NEW; END IF;
  NEW.trailer_id := (SELECT h.new_trailer_id FROM dispatch.load_assignment_history h
                      WHERE h.load_id = NEW.load_id AND h.new_trailer_id IS NOT NULL ORDER BY h.created_at DESC LIMIT 1);
  IF NEW.trailer_id IS NULL AND NEW.non_owned_trailer_id IS NULL THEN
    NEW.non_owned_trailer_id := (SELECT l.non_owned_trailer_id FROM mdata.loads l
                                  WHERE l.id = NEW.load_id AND l.operating_company_id = NEW.operating_company_id
                                    AND l.trailer_source = 'customer');
  END IF;
  RETURN NEW;
END $fn$;
