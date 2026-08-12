-- P44: persist the Book Load detention-reason picker as a canonical, entity-safe FK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'detention_reasons_id_company_unique'
  ) THEN
    ALTER TABLE catalogs.detention_reasons
      ADD CONSTRAINT detention_reasons_id_company_unique UNIQUE (id, operating_company_id);
  END IF;
END $$;

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS detention_reason_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loads_detention_reason_company_fk'
  ) THEN
    ALTER TABLE mdata.loads
      ADD CONSTRAINT loads_detention_reason_company_fk
      FOREIGN KEY (detention_reason_id, operating_company_id)
      REFERENCES catalogs.detention_reasons (id, operating_company_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_loads_detention_reason_id
  ON mdata.loads (detention_reason_id)
  WHERE detention_reason_id IS NOT NULL;
