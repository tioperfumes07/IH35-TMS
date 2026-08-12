-- P44 Wave A: cargo claims persist the canonical reason UUID, not only a mutable reason code.

ALTER TABLE safety.incidents
  ADD COLUMN IF NOT EXISTS claim_reason_id uuid;

UPDATE safety.incidents i
SET claim_reason_id = r.id
FROM catalogs.cargo_claim_reasons r
WHERE i.incident_type = 'cargo_claim'
  AND i.claim_reason_id IS NULL
  AND r.operating_company_id = i.operating_company_id
  AND r.reason_code = i.claim_reason_code;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM safety.incidents
    WHERE incident_type = 'cargo_claim' AND claim_reason_id IS NULL
  ) THEN
    RAISE EXCEPTION 'P44 cargo claim reason backfill left unresolved rows';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cargo_claim_reasons_id_operating_company_uidx
  ON catalogs.cargo_claim_reasons (id, operating_company_id);

ALTER TABLE safety.incidents
  DROP CONSTRAINT IF EXISTS incidents_claim_reason_same_company_fk;
ALTER TABLE safety.incidents
  ADD CONSTRAINT incidents_claim_reason_same_company_fk
  FOREIGN KEY (claim_reason_id, operating_company_id)
  REFERENCES catalogs.cargo_claim_reasons (id, operating_company_id)
  NOT VALID;
ALTER TABLE safety.incidents VALIDATE CONSTRAINT incidents_claim_reason_same_company_fk;

ALTER TABLE safety.incidents
  DROP CONSTRAINT IF EXISTS incidents_cargo_claim_reason_required;
ALTER TABLE safety.incidents
  ADD CONSTRAINT incidents_cargo_claim_reason_required
  CHECK (incident_type <> 'cargo_claim' OR claim_reason_id IS NOT NULL)
  NOT VALID;
ALTER TABLE safety.incidents VALIDATE CONSTRAINT incidents_cargo_claim_reason_required;
