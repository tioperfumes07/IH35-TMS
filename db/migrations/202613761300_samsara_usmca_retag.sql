BEGIN;

-- Owner ruling 2026-09-05: the physical Samsara fleet now belongs to the
-- USMCA operating carrier.  Preserve every observation and assignment while
-- correcting its tenant tag; never delete or recreate telemetry evidence.
-- mdata.units is intentionally lease-scoped (it has no operating_company_id).

ALTER TABLE telematics.vehicle_locations
  ADD COLUMN IF NOT EXISTS source_operating_company_id uuid REFERENCES org.companies(id),
  ADD COLUMN IF NOT EXISTS source_raw_samsara_event_id text;

DO $retag$
DECLARE
  transportation_id constant uuid := '91e0bf0a-133f-4ce8-a734-2586cfa66d96';
  usmca_id constant uuid := '5c854333-6ea5-4faa-af31-67cb272fef80';
  remaining_count bigint;
BEGIN
  -- Point ingestion at USMCA.  If the target config already exists, retain its
  -- identity and copy only missing secret/config values from Transportation.
  INSERT INTO integrations.samsara_config (
    operating_company_id,
    samsara_org_id,
    api_token_encrypted,
    webhook_secret_encrypted,
    is_enabled,
    encrypted_api_token,
    token_key_version,
    connected_at,
    disconnected_at
  )
  SELECT
    usmca_id,
    samsara_org_id,
    api_token_encrypted,
    webhook_secret_encrypted,
    true,
    encrypted_api_token,
    token_key_version,
    COALESCE(connected_at, now()),
    NULL
  FROM integrations.samsara_config
  WHERE operating_company_id = transportation_id
  ON CONFLICT (operating_company_id) DO UPDATE
  SET samsara_org_id = COALESCE(integrations.samsara_config.samsara_org_id, EXCLUDED.samsara_org_id),
      api_token_encrypted = COALESCE(integrations.samsara_config.api_token_encrypted, EXCLUDED.api_token_encrypted),
      webhook_secret_encrypted = COALESCE(integrations.samsara_config.webhook_secret_encrypted, EXCLUDED.webhook_secret_encrypted),
      encrypted_api_token = COALESCE(integrations.samsara_config.encrypted_api_token, EXCLUDED.encrypted_api_token),
      token_key_version = GREATEST(integrations.samsara_config.token_key_version, EXCLUDED.token_key_version),
      is_enabled = true,
      connected_at = COALESCE(integrations.samsara_config.connected_at, EXCLUDED.connected_at),
      disconnected_at = NULL,
      last_error = NULL;

  UPDATE integrations.samsara_config
  SET is_enabled = false,
      disconnected_at = COALESCE(disconnected_at, now()),
      last_error = 'INGESTION MOVED TO USMCA — owner ruling 2026-09-05'
  WHERE operating_company_id = transportation_id
    AND (is_enabled OR disconnected_at IS NULL);

  UPDATE integrations.samsara_vehicles sv
  SET operating_company_id = usmca_id,
      updated_at = now()
  FROM mdata.units u
  WHERE sv.operating_company_id = transportation_id
    AND sv.local_unit_id = u.id
    AND u.currently_leased_to_company_id = usmca_id;

  UPDATE integrations.samsara_drivers sd
  SET operating_company_id = usmca_id,
      updated_at = now()
  FROM mdata.drivers d
  WHERE sd.operating_company_id = transportation_id
    AND sd.local_driver_id = d.id
    AND d.operating_company_id = usmca_id;

  -- These two ledgers are append-only during normal runtime.  This explicit,
  -- owner-directed tenant correction changes only the scope key and preserves
  -- every row id and observation byte-for-byte.  Triggers are restored inside
  -- the same transaction; any failure rolls the entire migration back.
  ALTER TABLE telematics.vehicle_locations DISABLE TRIGGER trg_block_vehicle_locations_update;
  UPDATE telematics.vehicle_locations vl
  SET source_operating_company_id = COALESCE(vl.source_operating_company_id, transportation_id),
      source_raw_samsara_event_id = COALESCE(vl.source_raw_samsara_event_id, vl.raw_samsara_event_id),
      raw_samsara_event_id = CASE
        WHEN EXISTS (
          SELECT 1
          FROM telematics.vehicle_locations target
          WHERE target.operating_company_id = usmca_id
            AND target.raw_samsara_event_id = vl.raw_samsara_event_id
            AND target.id <> vl.id
        ) THEN 'retag:' || transportation_id::text || ':' || vl.raw_samsara_event_id
        ELSE vl.raw_samsara_event_id
      END
  FROM mdata.units u
  WHERE vl.operating_company_id = transportation_id
    AND vl.unit_id = u.id
    AND u.currently_leased_to_company_id = usmca_id;
  UPDATE telematics.vehicle_locations vl
  SET operating_company_id = usmca_id
  FROM mdata.units u
  WHERE vl.operating_company_id = transportation_id
    AND vl.unit_id = u.id
    AND u.currently_leased_to_company_id = usmca_id;
  ALTER TABLE telematics.vehicle_locations ENABLE TRIGGER trg_block_vehicle_locations_update;

  ALTER TABLE telematics.vehicle_driver_assignments DISABLE TRIGGER trg_block_vehicle_driver_assignments_update;
  UPDATE telematics.vehicle_driver_assignments vda
  SET operating_company_id = usmca_id
  FROM mdata.units u
  WHERE vda.operating_company_id = transportation_id
    AND vda.unit_id = u.id
    AND u.currently_leased_to_company_id = usmca_id;
  ALTER TABLE telematics.vehicle_driver_assignments ENABLE TRIGGER trg_block_vehicle_driver_assignments_update;

  SELECT
    (SELECT count(*)
       FROM integrations.samsara_vehicles sv
       JOIN mdata.units u ON u.id = sv.local_unit_id
      WHERE sv.operating_company_id = transportation_id
        AND u.currently_leased_to_company_id = usmca_id)
    +
    (SELECT count(*)
       FROM telematics.vehicle_locations vl
       JOIN mdata.units u ON u.id = vl.unit_id
      WHERE vl.operating_company_id = transportation_id
        AND u.currently_leased_to_company_id = usmca_id)
    +
    (SELECT count(*)
       FROM telematics.vehicle_driver_assignments vda
       JOIN mdata.units u ON u.id = vda.unit_id
      WHERE vda.operating_company_id = transportation_id
        AND u.currently_leased_to_company_id = usmca_id)
  INTO remaining_count;

  IF remaining_count <> 0 THEN
    RAISE EXCEPTION 'Samsara USMCA re-tag incomplete: % eligible rows remain under Transportation', remaining_count;
  END IF;
END
$retag$;

COMMIT;
