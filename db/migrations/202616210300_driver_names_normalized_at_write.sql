-- 202616210300_driver_names_normalized_at_write.sql
-- CC-3 · LEAD 443.281-E "names normalized at write (DB still ALL CAPS: EDUARDO AZAEL FLORES ORTIZ, HUGO GAYTAN…)".
-- Measured on prod 10-23: 78 of 170 USMCA drivers carry an ALL-CAPS first name (the 08-21 import, and 3 of 5 created on
-- 09-28 by a writer that did not case them). Every screen proper-cased them at READ (frontend formatPersonName), so any
-- reader that skipped that helper (exports, PDFs, QBO, search) showed the raw caps.
--
-- ONE rule at WRITE for every writer (UI, Samsara sync, imports, QBO): mdata.proper_person_name mirrors the frontend's
-- formatPersonName word by word — ALL-CAPS or all-lowercase words become proper case per hyphen/apostrophe part
-- ("PEREZ-GARCIA" → "Perez-Garcia", "O'NEIL" → "O'Neil"), a word already in deliberate mixed case is kept ("McDonald"),
-- II/III/IV stay upper, JR/SR → Jr/Sr. A BEFORE INSERT / UPDATE OF first_name, last_name trigger applies it; the existing
-- rows are normalized THROUGH that trigger (audited by trg_audit_drivers). Idempotent: proper names map to themselves.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION mdata.proper_person_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  w text;
  bare text;
  out_words text[] := ARRAY[]::text[];
  cleaned text;
BEGIN
  IF p_name IS NULL THEN
    RETURN NULL;
  END IF;
  cleaned := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
  IF cleaned = '' THEN
    RETURN cleaned;
  END IF;
  FOREACH w IN ARRAY string_to_array(cleaned, ' ') LOOP
    bare := upper(replace(w, '.', ''));
    IF bare IN ('II', 'III', 'IV') THEN
      out_words := out_words || bare;
    ELSIF bare IN ('JR', 'SR') THEN
      out_words := out_words || (left(bare, 1) || lower(substr(bare, 2)) || CASE WHEN right(w, 1) = '.' THEN '.' ELSE '' END);
    ELSIF w <> upper(w) AND w <> lower(w) AND substr(w, 2) <> lower(substr(w, 2)) THEN
      out_words := out_words || w; -- deliberate mixed case ("McDonald") is the operator's spelling
    ELSE
      out_words := out_words || initcap(lower(w)); -- initcap capitalizes after '-' and '''' as the frontend does
    END IF;
  END LOOP;
  RETURN array_to_string(out_words, ' ');
END;
$$;

COMMENT ON FUNCTION mdata.proper_person_name(text) IS
  'LEAD 443.281-E: the one person-name casing rule at write (mirrors frontend formatPersonName).';

CREATE OR REPLACE FUNCTION mdata.tg_drivers_proper_names()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.first_name := mdata.proper_person_name(NEW.first_name);
  NEW.last_name := mdata.proper_person_name(NEW.last_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drivers_proper_names ON mdata.drivers;
CREATE TRIGGER trg_drivers_proper_names
  BEFORE INSERT OR UPDATE OF first_name, last_name ON mdata.drivers
  FOR EACH ROW EXECUTE FUNCTION mdata.tg_drivers_proper_names();

-- Existing rows (USMCA only — owner law; other entities normalize on their next write): re-write only the names whose
-- casing would change, through the trigger above. Rehearsed on a prod fork: 84 USMCA rows, 0 remaining, 0 ALL-CAPS.
UPDATE mdata.drivers d
   SET first_name = d.first_name,
       last_name = d.last_name
  FROM org.companies c
 WHERE c.id = d.operating_company_id
   AND c.code = 'USMCA'
   AND (d.first_name IS DISTINCT FROM mdata.proper_person_name(d.first_name)
        OR d.last_name IS DISTINCT FROM mdata.proper_person_name(d.last_name));

COMMIT;
