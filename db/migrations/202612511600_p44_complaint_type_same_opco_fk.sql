-- P44 Wave A: safety complaints must point to a canonical complaint type owned by the same opco.
-- complaint_type_id was already NOT NULL, but its original single-column FK allowed cross-company IDs.

CREATE UNIQUE INDEX IF NOT EXISTS complaint_types_id_operating_company_uidx
  ON catalogs.complaint_types (id, operating_company_id);

ALTER TABLE safety.complaints
  DROP CONSTRAINT IF EXISTS complaints_complaint_type_id_fkey;

ALTER TABLE safety.complaints
  DROP CONSTRAINT IF EXISTS complaints_complaint_type_same_company_fk;

ALTER TABLE safety.complaints
  ADD CONSTRAINT complaints_complaint_type_same_company_fk
  FOREIGN KEY (complaint_type_id, operating_company_id)
  REFERENCES catalogs.complaint_types (id, operating_company_id)
  NOT VALID;

ALTER TABLE safety.complaints
  VALIDATE CONSTRAINT complaints_complaint_type_same_company_fk;
