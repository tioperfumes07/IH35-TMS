-- P43: Book Load and invoice customer references must stay inside the selected operating company.

CREATE UNIQUE INDEX IF NOT EXISTS customers_id_operating_company_uidx
  ON mdata.customers (id, operating_company_id);

ALTER TABLE mdata.loads DROP CONSTRAINT IF EXISTS loads_customer_id_fkey;
ALTER TABLE mdata.loads DROP CONSTRAINT IF EXISTS loads_customer_same_company_fk;
ALTER TABLE mdata.loads
  ADD CONSTRAINT loads_customer_same_company_fk
  FOREIGN KEY (customer_id, operating_company_id)
  REFERENCES mdata.customers (id, operating_company_id)
  NOT VALID;
ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_customer_same_company_fk;

ALTER TABLE accounting.invoices DROP CONSTRAINT IF EXISTS invoices_customer_id_fkey;
ALTER TABLE accounting.invoices DROP CONSTRAINT IF EXISTS invoices_customer_same_company_fk;
ALTER TABLE accounting.invoices
  ADD CONSTRAINT invoices_customer_same_company_fk
  FOREIGN KEY (customer_id, operating_company_id)
  REFERENCES mdata.customers (id, operating_company_id)
  NOT VALID;
ALTER TABLE accounting.invoices VALIDATE CONSTRAINT invoices_customer_same_company_fk;
