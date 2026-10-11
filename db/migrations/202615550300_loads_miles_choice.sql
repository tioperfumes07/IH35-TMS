-- 202615550300_loads_miles_choice.sql
-- CC-2 · OWNER ORDER (Lead 443.55, owner 2026-10-11 09:33 CT): "In loads it should show both recommendations historical and
-- google and we should be able to select which ones for short and practical etc."
-- Per miles field (practical / short / empty) the load keeps WHICH source was chosen and BOTH recommendations at that moment:
--   { "practical": { "value": 512.0, "source": "historical"|"google"|"manual"|"document",
--                    "historical": 509.0|null, "google": 515.3|null, "reason": "...", "chosen_by": "<user uuid>", "chosen_at": "<iso>" },
--     "short": {...}, "empty": {...} }
-- The chosen value itself stays in the existing columns (miles_practical / miles_shortest / miles_deadhead); this column is the
-- evidence. Additive, nullable, writes no rows. Driver pay is never read from here (pay = the signed settlement).
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS miles_choice jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loads_miles_choice_is_object') THEN
    ALTER TABLE mdata.loads
      ADD CONSTRAINT loads_miles_choice_is_object CHECK (miles_choice IS NULL OR jsonb_typeof(miles_choice) = 'object') NOT VALID;
  END IF;
END $$;

ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_miles_choice_is_object;

COMMENT ON COLUMN mdata.loads.miles_choice IS
  '443.55: per miles field (practical/short/empty) the chosen source (historical|google|manual|document), both recommended values at choice time, manual reason, chosen_by, chosen_at. Evidence only; the value lives in miles_practical/miles_shortest/miles_deadhead.';

COMMIT;
