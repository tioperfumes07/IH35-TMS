BEGIN;

WITH vehicle_source AS (
  SELECT
    sv.operating_company_id,
    sv.samsara_vehicle_id,
    sv.raw_payload,
    sv.updated_at,
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
    AND sv.local_unit_id IS NULL
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
  RETURNING id
)
UPDATE integrations.samsara_vehicles sv
SET local_unit_id = u.id,
    updated_at = NOW()
FROM mdata.units u
WHERE sv.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
  AND sv.local_unit_id IS NULL
  AND COALESCE(NULLIF(TRIM(sv.raw_payload->>'vin'), ''), CONCAT('SMS-', sv.samsara_vehicle_id)) = u.vin
  AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = sv.operating_company_id;

WITH driver_source AS (
  SELECT
    sd.operating_company_id,
    sd.samsara_driver_id,
    sd.raw_payload,
    trim(coalesce(sd.raw_payload->>'name', '')) AS full_name
  FROM integrations.samsara_drivers sd
  WHERE sd.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
    AND sd.local_driver_id IS NULL
),
driver_parsed AS (
  SELECT
    ds.operating_company_id,
    ds.samsara_driver_id,
    ds.raw_payload,
    CASE
      WHEN ds.full_name = '' THEN 'Unknown'
      ELSE split_part(ds.full_name, ' ', 1)
    END AS first_name,
    CASE
      WHEN ds.full_name = '' THEN ds.samsara_driver_id
      WHEN position(' ' IN ds.full_name) > 0 THEN trim(substr(ds.full_name, position(' ' IN ds.full_name) + 1))
      ELSE ds.full_name
    END AS last_name
  FROM driver_source ds
),
driver_upsert AS (
  INSERT INTO mdata.drivers (
    first_name,
    last_name,
    phone,
    cdl_number,
    cdl_state,
    status,
    operating_company_id,
    samsara_driver_id,
    created_at,
    updated_at
  )
  SELECT
    dp.first_name,
    dp.last_name,
    COALESCE(NULLIF(TRIM(dp.raw_payload->>'phone'), ''), CONCAT('sms-', dp.samsara_driver_id)),
    NULLIF(TRIM(dp.raw_payload->>'licenseNumber'), ''),
    NULLIF(TRIM(dp.raw_payload->>'licenseState'), ''),
    CASE
      WHEN COALESCE(NULLIF(dp.raw_payload->>'driverActivationStatus', ''), 'active') = 'active' THEN 'Active'::mdata.driver_status
      ELSE 'Inactive'::mdata.driver_status
    END,
    dp.operating_company_id,
    dp.samsara_driver_id,
    NOW(),
    NOW()
  FROM driver_parsed dp
  ON CONFLICT (operating_company_id, samsara_driver_id)
    WHERE samsara_driver_id IS NOT NULL
  DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone = EXCLUDED.phone,
    cdl_number = EXCLUDED.cdl_number,
    cdl_state = EXCLUDED.cdl_state,
    status = EXCLUDED.status,
    updated_at = NOW()
  RETURNING id, samsara_driver_id
)
UPDATE integrations.samsara_drivers sd
SET local_driver_id = du.id,
    updated_at = NOW()
FROM driver_upsert du
WHERE sd.samsara_driver_id = du.samsara_driver_id
  AND sd.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid;

COMMIT;
