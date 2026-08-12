BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='accident_types_company_id_id_key') THEN
  ALTER TABLE catalogs.accident_types ADD CONSTRAINT accident_types_company_id_id_key UNIQUE (operating_company_id,id);
 END IF;
END $$;
WITH seed(code,display_name,sort_order) AS (VALUES ('ACCIDENT','Accident',10),('DAMAGE','Damage',20),('VANDALISM','Vandalism',30))
INSERT INTO catalogs.accident_types(operating_company_id,code,display_name,is_active,sort_order)
SELECT c.id,s.code,s.display_name,true,s.sort_order FROM org.companies c CROSS JOIN seed s WHERE c.deactivated_at IS NULL
ON CONFLICT (operating_company_id,code) DO NOTHING;
ALTER TABLE safety.accident_reports ADD COLUMN IF NOT EXISTS accident_type_id UUID;
UPDATE safety.accident_reports a SET accident_type_id=t.id FROM catalogs.accident_types t
WHERE t.operating_company_id=a.operating_company_id AND t.code=upper(COALESCE(NULLIF(a.record_type,''),'ACCIDENT')) AND a.accident_type_id IS NULL;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM safety.accident_reports WHERE accident_type_id IS NULL) THEN RAISE EXCEPTION 'P44 accident type backfill left NULL'; END IF; END $$;
ALTER TABLE safety.accident_reports ALTER COLUMN accident_type_id SET NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='accident_reports_type_same_company_fk') THEN
  ALTER TABLE safety.accident_reports ADD CONSTRAINT accident_reports_type_same_company_fk FOREIGN KEY(operating_company_id,accident_type_id) REFERENCES catalogs.accident_types(operating_company_id,id);
 END IF;
END $$;
COMMIT;
