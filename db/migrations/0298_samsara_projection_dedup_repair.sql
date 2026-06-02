-- 0298_samsara_projection_dedup_repair.sql
-- Idempotent: applies VIN-dedup + unit_number disambiguation +
-- VIN-based link-back that the original 0291 did not include.
-- Safe to re-run; only updates rows that need it.

BEGIN;

WITH vehicle_source AS (
  SELECT
    sv.operating_company_id,
    sv.samsara_vehicle_id,
    sv.raw_payload,
    sv.updated_at,
    sv.local_unit_id,
    COALESCE(NULLIF(TRIM(sv.raw_payload->>'name'), ''), sv.samsara_vehicle_id) AS computed_unit_number,
    COALESCE(NULLIF(TRIM(sv.raw_payload->>'vin'), ''), CONCAT('SMS-', sv.samsara_vehicle_id)) AS computed_vin,
    NULLIF(TRIM(sv.raw_payload->>'make'), '') AS computed_make,
    NULLIF(TRIM(sv.raw_payload->>'model'), '') AS computed_model,
    CASE
      WHEN NULLIF(TRIM(sv.raw_payload->>'year'), '') ~ '^[0-9]{4}$' THEN (sv.raw_payload->>'year')::integer
      ELSE NULL
    END AS computed_year,
    NULLIF(TRIM(sv.raw_payload->>'licensePlate'), '') AS computed_license_plate
  FROM integrations.samsara_vehicles sv
  WHERE sv.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
),
vehicle_deduped_by_vin AS (
  SELECT DISTINCT ON (vs.computed_vin)
    vs.operating_company_id,
    vs.samsara_vehicle_id,
    vs.updated_at,
    vs.computed_unit_number,
    vs.computed_vin,
    vs.computed_make,
    vs.computed_model,
    vs.computed_year,
    vs.computed_license_plate
  FROM vehicle_source vs
  ORDER BY
    vs.computed_vin,
    vs.updated_at DESC NULLS LAST,
    vs.samsara_vehicle_id
),
vehicle_ranked_unit_numbers AS (
  SELECT
    vdv.operating_company_id,
    vdv.samsara_vehicle_id,
    vdv.computed_vin,
    vdv.computed_make,
    vdv.computed_model,
    vdv.computed_year,
    vdv.computed_license_plate,
    CASE
      WHEN ROW_NUMBER() OVER (
        PARTITION BY vdv.computed_unit_number
        ORDER BY vdv.updated_at DESC NULLS LAST, vdv.samsara_vehicle_id
      ) = 1
        THEN vdv.computed_unit_number
      ELSE CONCAT(
        vdv.computed_unit_number,
        '-',
        ROW_NUMBER() OVER (
          PARTITION BY vdv.computed_unit_number
          ORDER BY vdv.updated_at DESC NULLS LAST, vdv.samsara_vehicle_id
        )
      )
    END AS resolved_unit_number
  FROM vehicle_deduped_by_vin vdv
),
vehicle_upsert AS (
  INSERT INTO mdata.units (
    unit_number,
    vin,
    make,
    model,
    year,
    license_plate,
    samsara_vehicle_id,
    owner_company_id,
    status,
    created_at,
    updated_at
  )
  SELECT
    vr.resolved_unit_number,
    vr.computed_vin,
    vr.computed_make,
    vr.computed_model,
    vr.computed_year,
    vr.computed_license_plate,
    vr.samsara_vehicle_id,
    vr.operating_company_id,
    'InService'::mdata.unit_status,
    NOW(),
    NOW()
  FROM vehicle_ranked_unit_numbers vr
  WHERE NOT EXISTS (
    SELECT 1
    FROM mdata.units u
    WHERE u.samsara_vehicle_id = vr.samsara_vehicle_id
      AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = vr.operating_company_id
  )
  ON CONFLICT ((COALESCE(currently_leased_to_company_id, owner_company_id)), samsara_vehicle_id)
    WHERE samsara_vehicle_id IS NOT NULL
  DO UPDATE SET
    unit_number = EXCLUDED.unit_number,
    vin = EXCLUDED.vin,
    make = EXCLUDED.make,
    model = EXCLUDED.model,
    year = EXCLUDED.year,
    license_plate = EXCLUDED.license_plate,
    updated_at = NOW()
  WHERE
    units.unit_number IS DISTINCT FROM EXCLUDED.unit_number
    OR units.vin IS DISTINCT FROM EXCLUDED.vin
    OR units.make IS DISTINCT FROM EXCLUDED.make
    OR units.model IS DISTINCT FROM EXCLUDED.model
    OR units.year IS DISTINCT FROM EXCLUDED.year
    OR units.license_plate IS DISTINCT FROM EXCLUDED.license_plate
)
UPDATE mdata.units u
SET
  unit_number = vr.resolved_unit_number,
  vin = vr.computed_vin,
  make = COALESCE(vr.computed_make, u.make),
  model = COALESCE(vr.computed_model, u.model),
  year = COALESCE(vr.computed_year, u.year),
  license_plate = COALESCE(vr.computed_license_plate, u.license_plate),
  updated_at = NOW()
FROM vehicle_ranked_unit_numbers vr
WHERE u.samsara_vehicle_id = vr.samsara_vehicle_id
  AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = vr.operating_company_id
  AND (
    u.unit_number IS DISTINCT FROM vr.resolved_unit_number
    OR u.vin IS DISTINCT FROM vr.computed_vin
    OR u.make IS DISTINCT FROM vr.computed_make
    OR u.model IS DISTINCT FROM vr.computed_model
    OR u.year IS DISTINCT FROM vr.computed_year
    OR u.license_plate IS DISTINCT FROM vr.computed_license_plate
  );

UPDATE integrations.samsara_vehicles sv
SET local_unit_id = u.id,
    updated_at = NOW()
FROM mdata.units u
WHERE sv.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
  AND sv.local_unit_id IS DISTINCT FROM u.id
  AND COALESCE(NULLIF(TRIM(sv.raw_payload->>'vin'), ''), CONCAT('SMS-', sv.samsara_vehicle_id)) = u.vin
  AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = sv.operating_company_id;

COMMIT;
