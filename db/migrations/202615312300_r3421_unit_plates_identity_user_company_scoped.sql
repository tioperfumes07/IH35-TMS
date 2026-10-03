-- ROUND 342.1 Class D (Cursor) — unit-keyed plates + drivers.identity_user_id company scope.
-- Claimed: 202615312300 (CLAIM-RESERVE #24291). Cursor HH 23.
--
-- Owner 342.1: identity_user_id IS A DEFECT ("yes they can" hold driver in two carriers).
-- unit_plates / equipment_plates MOVED UP — live TRK↔USMCA exposure.
-- samsara_driver_id: CHANGE NOTHING (Class B allow-list).
--
-- BEFORE:
--   uq_unit_plates_active UNIQUE (unit_id, country, jurisdiction) WHERE status=active
--   uq_eq_plates_active   UNIQUE (equipment_id, country, jurisdiction) WHERE status=active
--   drivers_identity_user_id_key UNIQUE (identity_user_id)  -- CONSTRAINT, global
--
-- AFTER: company-scoped partial uniques. Idempotent.

ALTER TABLE mdata.drivers DROP CONSTRAINT IF EXISTS drivers_identity_user_id_key;
DROP INDEX IF EXISTS mdata.drivers_identity_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mdata_drivers_company_identity_user
  ON mdata.drivers (operating_company_id, identity_user_id)
  WHERE identity_user_id IS NOT NULL;

DROP INDEX IF EXISTS mdata.uq_unit_plates_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mdata_unit_plates_company_active
  ON mdata.unit_plates (operating_company_id, unit_id, country, jurisdiction)
  WHERE status = 'active';

DROP INDEX IF EXISTS mdata.uq_eq_plates_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mdata_equipment_plates_company_active
  ON mdata.equipment_plates (operating_company_id, equipment_id, country, jurisdiction)
  WHERE status = 'active';

COMMENT ON INDEX mdata.uq_mdata_drivers_company_identity_user IS
  'ROUND 342.1: one portal user may hold a driver row per company (owner: yes they can).';
COMMENT ON INDEX mdata.uq_mdata_unit_plates_company_active IS
  'ROUND 342.1: active plate unique per company+unit+country+jurisdiction (was unit-global).';
COMMENT ON INDEX mdata.uq_mdata_equipment_plates_company_active IS
  'ROUND 342.1: active equipment plate unique per company+equipment+country+jurisdiction.';
