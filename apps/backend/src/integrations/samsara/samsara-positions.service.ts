import { resolveSamsaraApiToken } from "./samsara-token.js";
import {
  deriveEngineState,
  ingestVehicleLocationEvent,
} from "../../telematics/vehicle-locations.service.js";
import { processArrivalDetectionsForGpsPoint } from "../../telematics/arrival-detection.service.js";
import { processGeofenceDetectionsForGpsPoint } from "../../telematics/geofence-detector.service.js";
import { parseCityState, SamsaraApiError, SamsaraClient } from "./samsara-client.js";
import type { SamsaraVehicleStat } from "./samsara-client.js";
import type { PgClient } from "./samsara.service.js";
import { getSamsaraConfigForCompany } from "./samsara.service.js";
import { buildSamsaraAssignmentId } from "./vehicle-driver-pairing/pairing.service.js";

export type SyncPositionsStats = {
  /** T-01: arrivals this run triggered. Zero forever means the engine is dead -- surface it. */
  arrivals_triggered: number;
  fetched: number;
  inserted: number;
  skipped_no_unit: number;
  errors: string[];
};

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

export async function loadUnitIdBySamsaraVehicleId(
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


/**
 * T-01 (Lead, 2026-09-30) — ARRIVAL DETECTION ON THE POLLING PATH.
 *
 * MEASURED LIVE before writing this, on br-fancy-credit-akjnd07a:
 *   dispatch.stop_arrivals                     0 rows, EVER
 *   integrations.samsara_webhook_events        0 rows, EVER
 *   telematics.vehicle_locations         828,445 rows, newest seconds old
 *   all 16 open loads status='dispatched', newest status write 2026-09-28
 *
 * processArrivalDetectionsForGpsPoint had EXACTLY ONE caller: the Samsara webhook projector
 * (integrations/samsara/webhook-projectors/vehicle-projector.ts). That projector runs only on
 * webhook events, and this account has never delivered one. So the engine that advances a load
 * through its stops has never executed against a single GPS point, while the CRON path -- the one
 * that actually feeds this system, hundreds of thousands of points -- ingested every one of them
 * and called only the GEOFENCE detector beside it.
 *
 * That is why every truck on the Truck Line sits on "Dispatched": nothing has written a stop
 * arrival, so nothing advances the load. The board was honest; the engine was never wired.
 *
 * Both cron ingest paths now call arrival detection on every position they persist, immediately
 * after the geofence detector that has always run there, with the SAME inputs.
 *
 * WHY THIS IS SAFE TO CALL PER POINT:
 *   - It only runs on `didInsert` -- ingestVehicleLocationEvent is ON CONFLICT DO NOTHING against
 *     (operating_company_id, raw_samsara_event_id), so a replayed point is a no-op and detection
 *     cannot double-fire for it.
 *   - The service is itself idempotent per stop: shouldTriggerArrival() consults the last arrival
 *     for that (stop, unit) and refuses to re-trigger.
 *   - It returns {checked_stops: 0} immediately when the unit has no remaining stops, which is the
 *     common case, so the cost on an unassigned truck is one indexed query.
 *
 * ISOLATED ON PURPOSE: a failure here must never take position ingest down with it. Positions are
 * the live map and the dispatch board; arrivals are a derived signal. The error is LOGGED with its
 * ids and counted, never swallowed -- silence is what let this stay invisible.
 */
async function detectArrivalsForIngestedPoint(
  client: Parameters<typeof processArrivalDetectionsForGpsPoint>[0],
  input: { operating_company_id: string; unit_id: string; latitude: number; longitude: number; occurred_at: string },
  errors: string[]
): Promise<number> {
  try {
    const res = await processArrivalDetectionsForGpsPoint(client, {
      operating_company_id: input.operating_company_id,
      unit_id: input.unit_id,
      latitude: input.latitude,
      longitude: input.longitude,
      occurred_at: input.occurred_at,
    });
    return res.arrivals_triggered;
  } catch (error) {
    errors.push(
      `arrival_detection_failed:unit=${input.unit_id}:${String((error as Error)?.message ?? error).slice(0, 200)}`
    );
    return 0;
  }
}

export async function syncSamsaraVehicleLocations(
  client: PgClient,
  operatingCompanyId: string
): Promise<SyncPositionsStats> {
  const errors: string[] = [];
  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  if (!cfg || !Boolean(cfg.is_enabled)) {
    return { fetched: 0, inserted: 0, arrivals_triggered: 0, skipped_no_unit: 0, errors };
  }

  const token = resolveSamsaraApiToken(cfg as Record<string, unknown>);
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
    return { fetched: 0, inserted: 0, arrivals_triggered: 0, skipped_no_unit: 0, errors };
  }

  const unitByVehicleId = await loadUnitIdBySamsaraVehicleId(client, operatingCompanyId);
  let inserted = 0;
  let skippedNoUnit = 0;
  let arrivalsTriggered = 0;

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
      // E-01: the odometer Samsara read at this exact fix (stats/feed gps decoration), or null.
      odometer_mi: location.odometer_mi ?? null,
      ...parseCityState(location.formatted_location ?? null),
      formatted_location: location.formatted_location ?? null,
    });
    if (didInsert) {
      inserted += 1;
      await processGeofenceDetectionsForGpsPoint(client as never, {
        operating_company_id: operatingCompanyId,
        unit_id: unitId,
        latitude: location.latitude,
        longitude: location.longitude,
        occurred_at: location.captured_at,
        source: "samsara_gps",
      });
      // T-01 — see detectArrivalsForIngestedPoint above. This is the call that has never run.
      arrivalsTriggered += await detectArrivalsForIngestedPoint(
        client as never,
        {
          operating_company_id: operatingCompanyId,
          unit_id: unitId,
          latitude: location.latitude,
          longitude: location.longitude,
          occurred_at: location.captured_at,
        },
        errors
      );
    }
  }

  // T-01: the arrival count rides the sync log. A run that ingests hundreds of points and triggers
  // zero arrivals forever is exactly how this engine stayed dead for its whole life without one
  // error anywhere -- the number has to be WRITTEN DOWN or nobody can see it stop.
  await writeSyncLog(client, {
    operatingCompanyId,
    success: errors.length === 0,
    fetched: locations.length,
    inserted,
    skippedNoUnit,
    errorMessage: errors[0] ?? null,
  });

  return {
    fetched: locations.length,
    inserted,
    arrivals_triggered: arrivalsTriggered,
    skipped_no_unit: skippedNoUnit,
    errors,
  };
}

export type SyncStatsResult = {
  /** T-01: arrivals this run triggered. Zero forever means the engine is dead -- surface it. */
  arrivals_triggered: number;
  fetched: number;
  positions_inserted: number;
  drivers_paired: number;
  skipped_no_unit: number;
  errors: string[];
};

// Resolve a Samsara driver id -> local mdata.drivers.id (entity-scoped, active only).
async function resolveLocalDriverId(
  client: PgClient,
  operatingCompanyId: string,
  samsaraDriverId: string
): Promise<string | null> {
  const res = await client.query(
    `
      SELECT id::text AS driver_id
      FROM mdata.drivers
      WHERE operating_company_id = $1::uuid
        AND samsara_driver_id = $2
        AND deactivated_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId, samsaraDriverId]
  );
  const row = res.rows[0] as { driver_id?: string } | undefined;
  return row?.driver_id ?? null;
}

export async function touchObservedSamsaraDriver(
  client: PgClient,
  operatingCompanyId: string,
  samsaraDriverId: string,
  localDriverId: string,
  observedAt: string
): Promise<void> {
  await client.query(
    `
      INSERT INTO integrations.samsara_drivers (
        operating_company_id, samsara_driver_id, local_driver_id, raw_payload, last_seen_at
      )
      VALUES ($1::uuid, $2, $3::uuid, jsonb_build_object('id', $2::text), $4::timestamptz)
      ON CONFLICT (operating_company_id, samsara_driver_id) DO UPDATE
      SET local_driver_id = EXCLUDED.local_driver_id,
          last_seen_at = GREATEST(
            COALESCE(integrations.samsara_drivers.last_seen_at, '-infinity'::timestamptz),
            EXCLUDED.last_seen_at
          ),
          updated_at = now()
    `,
    [operatingCompanyId, samsaraDriverId, localDriverId, observedAt]
  );
}

// Make the current Samsara driver the unit's single OPEN assignment in telematics.vehicle_driver_assignments
// (the table fleet-location-hos reads). End any stale open for the unit, then insert the current one.
// Append-only/immutable trigger allows setting ended_at; reuses the deterministic samsara_assignment_id
// (vehicle:driver:startedAt) so repeated polls dedup via the unique index. Returns true if a row landed.
async function pairCurrentDriver(
  client: PgClient,
  operatingCompanyId: string,
  unitId: string,
  samsaraVehicleId: string,
  current: NonNullable<SamsaraVehicleStat["current_driver"]>,
  observedAt: string
): Promise<boolean> {
  const localDriverId = await resolveLocalDriverId(client, operatingCompanyId, current.samsara_driver_id);
  if (!localDriverId) return false;
  await touchObservedSamsaraDriver(
    client,
    operatingCompanyId,
    current.samsara_driver_id,
    localDriverId,
    observedAt
  );
  const assignmentId = buildSamsaraAssignmentId(samsaraVehicleId, current.samsara_driver_id, current.started_at);

  // Close any other open assignment on this unit (driver handoff) — keeps exactly one open = current.
  await client.query(
    `
      UPDATE telematics.vehicle_driver_assignments
      SET ended_at = now()
      WHERE operating_company_id = $1::uuid
        AND unit_id = $2::uuid
        AND ended_at IS NULL
        AND samsara_assignment_id IS DISTINCT FROM $3
    `,
    [operatingCompanyId, unitId, assignmentId]
  );

  const ins = await client.query(
    `
      INSERT INTO telematics.vehicle_driver_assignments (
        operating_company_id, unit_id, driver_id, started_at, ended_at, source, samsara_assignment_id
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::timestamptz, $5::timestamptz, 'reconciled', $6)
      ON CONFLICT DO NOTHING
    `,
    [operatingCompanyId, unitId, localDriverId, current.started_at, current.ended_at, assignmentId]
  );
  return (ins.rowCount ?? 0) > 0;
}

// Priority-1 completion: enrich vehicle positions with reverseGeo city/state from
// /fleet/vehicles/stats?types=gps,engineStates (driverAssignments is NOT a valid stats type — it 400s; the
// vehicle->driver pairing comes from the separate driver-assignments feed). Runs alongside the lat/lng-only
// locations poll; writes a fresh position event (the latest
// wins in vehicle_latest_position) so city/state is always on the newest fix, and pairs the driver so
// fleet-location-hos resolves driver_id -> HOS for moving trucks (not just the one with a load).
export async function syncSamsaraVehicleStats(
  client: PgClient,
  operatingCompanyId: string
): Promise<SyncStatsResult> {
  const errors: string[] = [];
  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  if (!cfg || !Boolean(cfg.is_enabled)) {
    return { fetched: 0, positions_inserted: 0, arrivals_triggered: 0, drivers_paired: 0, skipped_no_unit: 0, errors };
  }

  const token = resolveSamsaraApiToken(cfg as Record<string, unknown>);
  const api = new SamsaraClient({
    apiToken: token,
    samsaraOrgId: cfg.samsara_org_id ? String(cfg.samsara_org_id) : null,
  });

  let stats: SamsaraVehicleStat[];
  let statsDegraded = false;
  let statsTypesUsed = "";
  let statsFullSetError: string | null = null;
  try {
    // WITH META (Lead, 2026-09-30): the stats fetch falls back to a types set that carries NO
    // odometer when the full set 400s. That fallback is correct -- it keeps the dispatch board's
    // live location working -- but it used to be invisible, and 35 days of odometer went missing
    // without a single error anywhere. Measured on rows this path wrote:
    //   2026-08-26   779 rows,  733 with odometer
    //   2026-09-10 1,900 rows,    0 with odometer   ... and every day since
    // Now the pull says which set it got, and a degraded pull is recorded as a failed-shape sync
    // with the reason named, so "MPG is unavailable" has a cause instead of a blank column.
    const pull = await api.listVehicleStatsWithMeta();
    stats = pull.data;
    statsDegraded = pull.degraded;
    statsTypesUsed = pull.typesUsed;
    statsFullSetError = pull.fullSetError;
  } catch (error) {
    const message =
      error instanceof SamsaraApiError
        ? `${error.message}${error.statusCode ? `:http_${error.statusCode}` : ""}`
        : String((error as Error)?.message ?? error);
    errors.push(message);
    // SURFACE the failure — never swallow. The Samsara error (e.g. an invalid-types 400) lands in
    // integrations.integration_sync_log so it's visible without prod DB spelunking or a redeploy.
    await writeSyncLog(client, {
      operatingCompanyId,
      success: false,
      fetched: 0,
      inserted: 0,
      skippedNoUnit: 0,
      errorMessage: message,
    });
    return { fetched: 0, positions_inserted: 0, arrivals_triggered: 0, drivers_paired: 0, skipped_no_unit: 0, errors };
  }

  if (statsDegraded) {
    const reason =
      `samsara_stats_degraded_types:${statsTypesUsed} — this account did not serve ` +
      `obdOdometerMeters/fuelPercents/obdEngineSeconds, so odometer, fuel level and engine hours are ` +
      `NULL for every row in this pull. Driven miles and MPG cannot be computed from it. ` +
      `SAMSARA SAID: ${statsFullSetError ?? "(no refusal captured — the full set was never attempted)"}`;
    errors.push(reason);
    await writeSyncLog(client, {
      operatingCompanyId,
      success: false,
      fetched: stats.length,
      inserted: 0,
      skippedNoUnit: 0,
      errorMessage: reason,
    });
  }

  const unitByVehicleId = await loadUnitIdBySamsaraVehicleId(client, operatingCompanyId);
  let positionsInserted = 0;
  let statsArrivalsTriggered = 0;
  let driversPaired = 0;
  let skippedNoUnit = 0;

  for (const stat of stats) {
    const unitId = unitByVehicleId.get(stat.id);
    if (!unitId) {
      skippedNoUnit += 1;
      continue;
    }

    if (stat.latitude !== null && stat.longitude !== null) {
      const didInsert = await ingestVehicleLocationEvent(client as never, {
        operating_company_id: operatingCompanyId,
        unit_id: unitId,
        samsara_vehicle_id: stat.id,
        captured_at: stat.captured_at,
        lat: stat.latitude,
        lng: stat.longitude,
        speed_mph: stat.speed_mph,
        heading_deg: stat.heading_deg,
        engine_state: stat.engine_state !== "unknown" ? stat.engine_state : deriveEngineState(null, stat.speed_mph),
        raw_samsara_event_id: `cron:stats:${stat.id}:${stat.captured_at}`,
        payload: {
          ...stat.raw,
          odometer_mi: stat.odometer_mi,
          engine_hours: stat.engine_hours,
          fuel_level_pct: stat.fuel_level_pct,
        },
        city: stat.city,
        state: stat.state,
        formatted_location: stat.formatted_location,
        odometer_mi: stat.odometer_mi,
      });
      if (didInsert) {
        positionsInserted += 1;
        await processGeofenceDetectionsForGpsPoint(client as never, {
          operating_company_id: operatingCompanyId,
          unit_id: unitId,
          latitude: stat.latitude,
          longitude: stat.longitude,
          occurred_at: stat.captured_at,
          source: "samsara_gps",
        });
        // T-01 — see detectArrivalsForIngestedPoint above. This is the call that has never run.
        statsArrivalsTriggered += await detectArrivalsForIngestedPoint(
          client as never,
          {
            operating_company_id: operatingCompanyId,
            unit_id: unitId,
            latitude: stat.latitude,
            longitude: stat.longitude,
            occurred_at: stat.captured_at,
          },
          errors
        );
      }
    }

    if (stat.current_driver) {
      try {
        if (await pairCurrentDriver(client, operatingCompanyId, unitId, stat.id, stat.current_driver, stat.captured_at)) {
          driversPaired += 1;
        }
      } catch (error) {
        errors.push(`pair_driver:${stat.id}:${String((error as Error)?.message ?? error)}`);
      }
    }
  }

  await writeSyncLog(client, {
    operatingCompanyId,
    success: errors.length === 0,
    fetched: stats.length,
    inserted: positionsInserted,
    skippedNoUnit,
    errorMessage: errors[0] ?? null,
  });

  return {
    fetched: stats.length,
    positions_inserted: positionsInserted,
    arrivals_triggered: statsArrivalsTriggered,
    drivers_paired: driversPaired,
    skipped_no_unit: skippedNoUnit,
    errors,
  };
}
