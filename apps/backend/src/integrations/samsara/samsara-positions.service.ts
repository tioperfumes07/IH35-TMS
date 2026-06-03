import { decryptSamsaraSecret } from "../../lib/samsara-crypto.js";
import {
  deriveEngineState,
  ingestVehicleLocationEvent,
} from "../../telematics/vehicle-locations.service.js";
import { SamsaraApiError, SamsaraClient } from "./samsara-client.js";
import type { PgClient } from "./samsara.service.js";
import { getSamsaraConfigForCompany } from "./samsara.service.js";

export type SyncPositionsStats = {
  fetched: number;
  inserted: number;
  skipped_no_unit: number;
  errors: string[];
};

function readEncryptedToken(config: Record<string, unknown> | null): Buffer | null {
  if (!config) return null;
  const canonical = config.encrypted_api_token;
  if (Buffer.isBuffer(canonical) && canonical.length > 0) return canonical;
  const legacy = config.api_token_encrypted;
  if (Buffer.isBuffer(legacy) && legacy.length > 0) return legacy;
  return null;
}

async function writeSyncLog(
  client: PgClient,
  input: {
    operatingCompanyId: string;
    success: boolean;
    fetched: number;
    inserted: number;
    skippedNoUnit: number;
    errorMessage?: string | null;
  }
) {
  const exists = await client.query(`SELECT to_regclass('integrations.integration_sync_log') IS NOT NULL AS ok`);
  if (!exists.rows[0]?.ok) return;
  await client.query(
    `
      INSERT INTO integrations.integration_sync_log (
        operating_company_id,
        integration,
        sync_kind,
        finished_at,
        success,
        rows_added,
        rows_updated,
        rows_removed,
        error_message,
        payload
      ) VALUES ($1, 'samsara', 'vehicle_locations_poll', now(), $2, $3, 0, 0, $4, $5::jsonb)
    `,
    [
      input.operatingCompanyId,
      input.success,
      input.inserted,
      input.errorMessage ?? null,
      JSON.stringify({
        fetched: input.fetched,
        skipped_no_unit: input.skippedNoUnit,
      }),
    ]
  );
}

async function loadUnitIdBySamsaraVehicleId(
  client: PgClient,
  operatingCompanyId: string
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  const mirrorRes = await client.query(
    `
      SELECT samsara_vehicle_id, local_unit_id::text AS unit_id
      FROM integrations.samsara_vehicles
      WHERE operating_company_id = $1::uuid
        AND local_unit_id IS NOT NULL
    `,
    [operatingCompanyId]
  );
  for (const row of mirrorRes.rows) {
    const samsaraVehicleId = row.samsara_vehicle_id ? String(row.samsara_vehicle_id) : "";
    const unitId = row.unit_id ? String(row.unit_id) : "";
    if (samsaraVehicleId && unitId) out.set(samsaraVehicleId, unitId);
  }

  const unitsRes = await client.query(
    `
      SELECT samsara_vehicle_id, id::text AS unit_id
      FROM mdata.units
      WHERE samsara_vehicle_id IS NOT NULL
        AND deactivated_at IS NULL
        AND COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid
    `,
    [operatingCompanyId]
  );
  for (const row of unitsRes.rows) {
    const samsaraVehicleId = row.samsara_vehicle_id ? String(row.samsara_vehicle_id) : "";
    const unitId = row.unit_id ? String(row.unit_id) : "";
    if (samsaraVehicleId && unitId && !out.has(samsaraVehicleId)) {
      out.set(samsaraVehicleId, unitId);
    }
  }

  return out;
}

export async function syncSamsaraVehicleLocations(
  client: PgClient,
  operatingCompanyId: string
): Promise<SyncPositionsStats> {
  const errors: string[] = [];
  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  if (!cfg || !Boolean(cfg.is_enabled)) {
    return { fetched: 0, inserted: 0, skipped_no_unit: 0, errors };
  }

  const token = decryptSamsaraSecret(readEncryptedToken(cfg));
  const api = new SamsaraClient({
    apiToken: token,
    samsaraOrgId: cfg.samsara_org_id ? String(cfg.samsara_org_id) : null,
  });

  let locations;
  try {
    locations = await api.listVehicleLocations();
  } catch (error) {
    const message =
      error instanceof SamsaraApiError
        ? `${error.message}${error.statusCode ? `:http_${error.statusCode}` : ""}`
        : String((error as Error)?.message ?? error);
    errors.push(message);
    await writeSyncLog(client, {
      operatingCompanyId,
      success: false,
      fetched: 0,
      inserted: 0,
      skippedNoUnit: 0,
      errorMessage: message,
    });
    return { fetched: 0, inserted: 0, skipped_no_unit: 0, errors };
  }

  const unitByVehicleId = await loadUnitIdBySamsaraVehicleId(client, operatingCompanyId);
  let inserted = 0;
  let skippedNoUnit = 0;

  for (const location of locations) {
    const unitId = unitByVehicleId.get(location.id);
    if (!unitId) {
      skippedNoUnit += 1;
      continue;
    }

    const didInsert = await ingestVehicleLocationEvent(client as never, {
      operating_company_id: operatingCompanyId,
      unit_id: unitId,
      samsara_vehicle_id: location.id,
      captured_at: location.captured_at,
      lat: location.latitude,
      lng: location.longitude,
      speed_mph: location.speed_mph,
      heading_deg: location.heading_deg,
      engine_state: deriveEngineState(location.engine_on, location.speed_mph),
      raw_samsara_event_id: `cron:locations:${location.id}:${location.captured_at}`,
      payload: location.raw,
    });
    if (didInsert) inserted += 1;
  }

  await writeSyncLog(client, {
    operatingCompanyId,
    success: true,
    fetched: locations.length,
    inserted,
    skippedNoUnit,
  });

  return {
    fetched: locations.length,
    inserted,
    skipped_no_unit: skippedNoUnit,
    errors,
  };
}
