BEGIN;

WITH vehicle_source AS (
  SELECT
    sv.operating_company_id,
    sv.samsara_vehicle_id,
    sv.raw_payload
  FROM integrations.samsara_vehicles sv
  WHERE sv.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
    AND sv.local_unit_id IS NULL
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
    COALESCE(NULLIF(TRIM(vs.raw_payload->>'name'), ''), vs.samsara_vehicle_id),
    COALESCE(NULLIF(TRIM(vs.raw_payload->>'vin'), ''), CONCAT('SMS-', vs.samsara_vehicle_id)),
    NULLIF(TRIM(vs.raw_payload->>'make'), ''),
    NULLIF(TRIM(vs.raw_payload->>'model'), ''),
    CASE
      WHEN NULLIF(TRIM(vs.raw_payload->>'year'), '') ~ '^[0-9]{4}$' THEN (vs.raw_payload->>'year')::integer
      ELSE NULL
    END,
    NULLIF(TRIM(vs.raw_payload->>'licensePlate'), ''),
    vs.samsara_vehicle_id,
    vs.operating_company_id,
    'InService'::mdata.unit_status,
    NOW(),
    NOW()
  FROM vehicle_source vs
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
  RETURNING id, samsara_vehicle_id
)
UPDATE integrations.samsara_vehicles sv
SET local_unit_id = vu.id,
    updated_at = NOW()
FROM vehicle_upsert vu
WHERE sv.samsara_vehicle_id = vu.samsara_vehicle_id
  AND sv.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid;

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
