BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='load_trailer_equipment_company_id_id_key') THEN
    ALTER TABLE catalogs.load_trailer_equipment ADD CONSTRAINT load_trailer_equipment_company_id_id_key UNIQUE (operating_company_id,id);
  END IF;
END $$;

WITH seed(code,display_name,sort_order) AS (VALUES
 ('REFRIGERATED_VAN','Reefer',10),('FLATBED','Flatbed',20),('DRY_VAN','Dry Van',30),
 ('LOWBOY','Lowboy',40),('POWER_ONLY_NO_TRAILER','Power-only · no trailer',50),
 ('POWER_ONLY_CUSTOMER_TRAILER','Power-only · customer trailer',60)
)
INSERT INTO catalogs.load_trailer_equipment (operating_company_id,code,display_name,is_active,sort_order)
SELECT c.id,s.code,s.display_name,true,s.sort_order FROM org.companies c CROSS JOIN seed s
WHERE c.deactivated_at IS NULL
ON CONFLICT (operating_company_id,code) DO NOTHING;

ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS load_trailer_equipment_id UUID;
UPDATE mdata.loads l SET load_trailer_equipment_id=c.id
FROM catalogs.load_trailer_equipment c
WHERE c.operating_company_id=l.operating_company_id
  AND c.code=upper(COALESCE(NULLIF(l.trailer_type,''),'DRY_VAN'))
  AND l.load_trailer_equipment_id IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM mdata.loads WHERE load_trailer_equipment_id IS NULL) THEN
    RAISE EXCEPTION 'P44 trailer equipment backfill left NULL loads';
  END IF;
END $$;

ALTER TABLE mdata.loads ALTER COLUMN load_trailer_equipment_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='loads_trailer_equipment_same_company_fk') THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_trailer_equipment_same_company_fk
      FOREIGN KEY (operating_company_id,load_trailer_equipment_id)
      REFERENCES catalogs.load_trailer_equipment(operating_company_id,id);
  END IF;
END $$;

COMMIT;
