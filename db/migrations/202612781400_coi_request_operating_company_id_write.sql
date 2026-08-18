-- COI create RLS 42501: policy WITH CHECK uses operating_company_id; writers only stamped tenant_id.
-- Backfill + BEFORE INSERT sync so tenant_id / operating_company_id stay twin-scoped.

BEGIN;

UPDATE insurance.coi_request
SET operating_company_id = tenant_id
WHERE operating_company_id IS NULL
  AND tenant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION insurance.coi_request_sync_operating_company_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.operating_company_id IS NULL AND NEW.tenant_id IS NOT NULL THEN
    NEW.operating_company_id := NEW.tenant_id;
  END IF;
  IF NEW.tenant_id IS NULL AND NEW.operating_company_id IS NOT NULL THEN
    NEW.tenant_id := NEW.operating_company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_coi_request_sync_operating_company_id ON insurance.coi_request;
CREATE TRIGGER trg_coi_request_sync_operating_company_id
  BEFORE INSERT OR UPDATE OF tenant_id, operating_company_id
  ON insurance.coi_request
  FOR EACH ROW
  EXECUTE FUNCTION insurance.coi_request_sync_operating_company_id();

COMMIT;
