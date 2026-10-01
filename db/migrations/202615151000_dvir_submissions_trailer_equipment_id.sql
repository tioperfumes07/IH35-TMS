-- 202615151000_dvir_submissions_trailer_equipment_id.sql
-- Linkage law (DVIR -> trailer). Trailers live in TWO registries today: some as mdata.units rows (e.g. 10224,
-- vehicle_type Reefer) and most as mdata.equipment rows (e.g. 10209/10218/10219 for USMCA, measured 2026-10-01).
-- safety.dvir_submissions.trailer_id references mdata.units only, so a DVIR on an equipment-registered trailer could
-- not link at all. Adds trailer_equipment_id -> mdata.equipment; the Samsara DVIR import fills whichever registry
-- holds the trailer (single match only). Additive; trailer_id unchanged.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE safety.dvir_submissions
  ADD COLUMN IF NOT EXISTS trailer_equipment_id uuid NULL REFERENCES mdata.equipment(id);

CREATE INDEX IF NOT EXISTS dvir_submissions_trailer_equipment_id_idx
  ON safety.dvir_submissions (trailer_equipment_id) WHERE trailer_equipment_id IS NOT NULL;

COMMENT ON COLUMN safety.dvir_submissions.trailer_equipment_id IS
  'The trailer when it is registered in mdata.equipment (trailer_id covers trailers registered as mdata.units).';

COMMIT;
