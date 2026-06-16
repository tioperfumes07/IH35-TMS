-- GO-LIVE Block 2 (500-fix, highest): add the vehicle_type column that the unified fleet query already
-- SELECTs from mdata.units but that was never created.
--
-- Measured on prod: GET /api/v1/mdata/units?include=trailers 500s because
-- units-unified-list.service.ts does `SELECT ... vehicle_type ... FROM mdata.units` and the column does
-- not exist (same class as the #998 non-existent-column bug). This breaks the Fleet "include trailers" view.
--
-- Model reality (researched + GUARD-confirmed): trucks live in mdata.units, trailers live in the SEPARATE
-- mdata.equipment table — there is NO single-table unit_type field. vehicle_type is a truck-vs-tractor
-- discriminator WITHIN mdata.units that truckTypeSqlFilter already reads (`vehicle_type ILIKE '%tractor%'`).
-- NULL/empty/non-'tractor' is treated as Truck, so adding the column (nullable) is correct with no backfill;
-- Samsara/heuristic classification of tractors lands in Block 2-samsara.
--
-- mdata only — disjoint from Path B. Idempotent. Reversible: ALTER TABLE mdata.units DROP COLUMN vehicle_type.

BEGIN;

ALTER TABLE mdata.units ADD COLUMN IF NOT EXISTS vehicle_type text;

COMMIT;
