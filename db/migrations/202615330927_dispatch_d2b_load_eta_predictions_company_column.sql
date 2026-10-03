-- 202615330927 · CC-3 · Dispatch D2b — dispatch.load_eta_predictions carried NO operating_company_id (standing order point
-- 7). Measured on prod under SET LOCAL app.bypass_rls = 'lucia' (2026-10-03): 0 rows. The company is DERIVED from the
-- prediction's load by a BEFORE trigger (writers unchanged; a writer naming a different company is refused 23514), then
-- required (CHECK validated + SET NOT NULL). Same shape as mdata.load_stops (202615330911).
-- Idempotent.

SELECT set_config('app.bypass_rls', 'lucia', true);

ALTER TABLE dispatch.load_eta_predictions ADD COLUMN IF NOT EXISTS operating_company_id uuid;

CREATE OR REPLACE FUNCTION dispatch.load_eta_predictions_derive_company()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT l.operating_company_id INTO v_company FROM mdata.loads l WHERE l.id = NEW.load_id;
  IF v_company IS NOT NULL AND NEW.operating_company_id IS NOT NULL AND NEW.operating_company_id <> v_company THEN
    RAISE EXCEPTION 'load_eta_predictions.operating_company_id % does not match its load''s company %', NEW.operating_company_id, v_company
      USING ERRCODE = '23514';
  END IF;
  NEW.operating_company_id := COALESCE(v_company, NEW.operating_company_id);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_load_eta_predictions_derive_company ON dispatch.load_eta_predictions;
CREATE TRIGGER trg_load_eta_predictions_derive_company
  BEFORE INSERT OR UPDATE OF load_id, operating_company_id ON dispatch.load_eta_predictions
  FOR EACH ROW EXECUTE FUNCTION dispatch.load_eta_predictions_derive_company();

UPDATE dispatch.load_eta_predictions p
   SET operating_company_id = l.operating_company_id
  FROM mdata.loads l
 WHERE l.id = p.load_id AND p.operating_company_id IS DISTINCT FROM l.operating_company_id;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.load_eta_predictions'::regclass AND conname = 'load_eta_predictions_company_required') THEN
    ALTER TABLE dispatch.load_eta_predictions ADD CONSTRAINT load_eta_predictions_company_required CHECK (operating_company_id IS NOT NULL) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.load_eta_predictions VALIDATE CONSTRAINT load_eta_predictions_company_required;
ALTER TABLE dispatch.load_eta_predictions ALTER COLUMN operating_company_id SET NOT NULL;
