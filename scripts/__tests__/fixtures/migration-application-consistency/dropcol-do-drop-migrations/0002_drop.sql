-- ENG-60 shape: DROP COLUMN lives inside DO $$ … $$ (not a top-level ALTER TABLE).
DO $$
BEGIN
  ALTER TABLE qa.policy DROP COLUMN IF EXISTS tenant_id;
END $$;
