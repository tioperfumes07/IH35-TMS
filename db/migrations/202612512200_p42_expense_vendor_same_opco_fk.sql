-- P42: expense vendor selections must reference a canonical vendor in the same opco.

CREATE UNIQUE INDEX IF NOT EXISTS vendors_id_operating_company_uidx
  ON mdata.vendors (id, operating_company_id);

ALTER TABLE accounting.expenses DROP CONSTRAINT IF EXISTS expenses_vendor_same_company_fk;
ALTER TABLE accounting.expenses
  ADD CONSTRAINT expenses_vendor_same_company_fk
  FOREIGN KEY (vendor_uuid, operating_company_id)
  REFERENCES mdata.vendors (id, operating_company_id)
  NOT VALID;
ALTER TABLE accounting.expenses VALIDATE CONSTRAINT expenses_vendor_same_company_fk;
