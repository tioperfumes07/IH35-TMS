// Samsara stats/driver diagnostic probe — external I/O lives HERE (service layer, circuit-breaker
// wrapped), never in the route (ds-admin-route-boundary). Read-only: GETs Samsara, returns a per-vehicle
// table. Writes nothing. See samsara-stats-probe.routes.ts for the gated entry point.
import { withCircuitBreaker } from "../../lib/circuit-breaker/index.js";
import { samsaraFetch } from "./samsara-client.js";

const SAMSARA_API_BASE = "https://api.samsara.com";

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

type RawCall = { url: string; http_status: number | null; error: string | null; rows: Record<string, unknown>[] };

async function rawGet(token: string, url: string): Promise<RawCall> {
  const out: RawCall = { url: url.replace(SAMSARA_API_BASE, ""), http_status: null, error: null, rows: [] };
  let res: Response;
  try {
    res = await withCircuitBreaker("samsara", () =>
      samsaraFetch(url, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } })
    );
  } catch (err) {
    out.error = `network_error:${String((err as Error)?.message ?? err)}`;
    return out;
  }
  out.http_status = res.status;
  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    out.error = "non_json_response";
    return out;
  }
  if (!res.ok) {
    out.error = str(json.message) ?? JSON.stringify(json).slice(0, 300);
    return out;
  }
  out.rows = Array.isArray(json.data) ? (json.data.filter((r) => asObject(r)) as Record<string, unknown>[]) : [];
  return out;
}

// Local-side diagnostics (DB, no external I/O) — the OTHER half of the driver chain: even if Samsara
// returns a logged-in driver, we can only show it if mdata.drivers.samsara_driver_id maps it and the
// pairing worker persisted an open assignment. Also surfaces the last (now un-swallowed) stats error.
type LocalQuery = <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;

export async function localPairingDiagnostics(query: LocalQuery, operatingCompanyId: string) {
  const oneNum = async (sql: string) => {
    const r = await query<{ n: string | number }>(sql, [operatingCompanyId]);
    return Number(r.rows[0]?.n ?? 0);
  };
  const drivers_mapped = await oneNum(
    `SELECT count(*) AS n FROM mdata.drivers WHERE operating_company_id = $1::uuid AND samsara_driver_id IS NOT NULL AND deactivated_at IS NULL`
  );
  const drivers_total = await oneNum(
    `SELECT count(*) AS n FROM mdata.drivers WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL`
  );
  const units_mapped = await oneNum(
    `SELECT count(*) AS n FROM mdata.units WHERE COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid AND samsara_vehicle_id IS NOT NULL AND deactivated_at IS NULL`
  );
  const open_assignments = await oneNum(
    `SELECT count(*) AS n FROM telematics.vehicle_driver_assignments WHERE operating_company_id = $1::uuid AND ended_at IS NULL`
  );
  const open_assignments_with_driver = await oneNum(
    `SELECT count(*) AS n FROM telematics.vehicle_driver_assignments WHERE operating_company_id = $1::uuid AND ended_at IS NULL AND driver_id IS NOT NULL`
  );
  const locations_with_city_1h = await oneNum(
    `SELECT count(*) AS n FROM telematics.vehicle_locations WHERE operating_company_id = $1::uuid AND city IS NOT NULL AND captured_at > now() - interval '1 hour'`
  );
  const stats_rows_1h = await oneNum(
    `SELECT count(*) AS n FROM telematics.vehicle_locations WHERE operating_company_id = $1::uuid AND raw_samsara_event_id LIKE 'cron:stats:%' AND captured_at > now() - interval '1 hour'`
  );
  const lastErr = await query<{ finished_at: string; success: boolean; error_message: string | null }>(
    `SELECT finished_at::text, success, error_message FROM integrations.integration_sync_log
      WHERE operating_company_id = $1::uuid AND integration = 'samsara'
      ORDER BY finished_at DESC LIMIT 1`,
    [operatingCompanyId]
  );
  // The PAIRING op's own committed row (sync_kind='vehicle_driver_pairing') — fetched/skipped (payload) +
  // rows_added (inserted) + error verbatim. This is the row that pinpoints why open_assignments stays 0
  // (HTTP error vs fetched>0-but-inserted=0), readable via the authenticated probe (no SQL / prod creds).
  const lastPairing = await query<{ finished_at: string; success: boolean; error_message: string | null; rows_added: number; payload: unknown }>(
    `SELECT finished_at::text, success, error_message, rows_added, payload
       FROM integrations.integration_sync_log
      WHERE operating_company_id = $1::uuid AND integration = 'samsara' AND sync_kind = 'vehicle_driver_pairing'
      ORDER BY finished_at DESC LIMIT 1`,
    [operatingCompanyId]
  );
  // The HOS-pull op's own committed row (sync_kind='samsara_hos_pull'): inserted (rows_added) + mapped/unmapped/
  // driver_errors (payload) + error verbatim. This is the clean-path proof that the board's HOS clocks are REAL
  // (driver duty events ingested) vs the 14h "fresh shift" default that shows when hos.duty_status_events is empty.
  const lastHosPull = await query<{ finished_at: string; success: boolean; error_message: string | null; rows_added: number; payload: unknown }>(
    `SELECT finished_at::text, success, error_message, rows_added, payload
       FROM integrations.integration_sync_log
      WHERE operating_company_id = $1::uuid AND integration = 'samsara' AND sync_kind = 'samsara_hos_pull'
      ORDER BY finished_at DESC LIMIT 1`,
    [operatingCompanyId]
  );
  const hos_events_24h = await oneNum(
    `SELECT count(*) AS n FROM hos.duty_status_events WHERE operating_company_id = $1::uuid AND source = 'samsara_eld' AND started_at > now() - interval '24 hours'`
  );
  // VERBATIM clocks (Path B / PR C): OUR active drivers' latest Samsara-computed clocks (by name) from
  // samsara.hos_snapshots — so GUARD compares Samsara-verbatim cycle/drive/shift/break vs our recompute per driver,
  // and checks cycle_started_at to tell a real 34h restart from a default reading. Values are MINUTES.
  const latest_hos_clocks = await query<{
    driver_name: string; cycle_min: number | string | null; drive_min: number | string | null;
    shift_min: number | string | null; break_min: number | string | null; cycle_started_at: string | null; polled_at: string;
  }>(
    `SELECT trim(coalesce(d.first_name,'') || ' ' || coalesce(d.last_name,'')) AS driver_name,
            s.cycle_hours_remaining AS cycle_min, s.driving_hours_remaining AS drive_min,
            s.on_duty_hours_remaining AS shift_min, s.time_to_next_break_minutes AS break_min,
            s.samsara_event_at::text AS cycle_started_at, s.polled_at::text AS polled_at
       FROM (SELECT DISTINCT ON (driver_uuid) driver_uuid, cycle_hours_remaining, driving_hours_remaining,
                    on_duty_hours_remaining, time_to_next_break_minutes, samsara_event_at, polled_at
               FROM samsara.hos_snapshots WHERE operating_company_id = $1::uuid
              ORDER BY driver_uuid, polled_at DESC) s
       JOIN mdata.drivers d ON d.id = s.driver_uuid
      ORDER BY driver_name`,
    [operatingCompanyId]
  );
  const last_hos_clocks_pull = await query<{ finished_at: string; success: boolean; error_message: string | null; rows_added: number; payload: unknown }>(
    `SELECT finished_at::text, success, error_message, rows_added, payload
       FROM integrations.integration_sync_log
      WHERE operating_company_id = $1::uuid AND integration = 'samsara' AND sync_kind = 'samsara_hos_clocks'
      ORDER BY finished_at DESC LIMIT 1`,
    [operatingCompanyId]
  );
  return {
    drivers_mapped,
    drivers_total,
    units_mapped,
    open_assignments,
    open_assignments_with_driver,
    locations_with_city_1h,
    stats_rows_1h,
    last_samsara_sync: lastErr.rows[0] ?? null,
    last_pairing_sync: lastPairing.rows[0] ?? null,
    last_hos_pull: lastHosPull.rows[0] ?? null,
    last_hos_clocks_pull: last_hos_clocks_pull.rows[0] ?? null,
    hos_events_24h,
    latest_hos_clocks: latest_hos_clocks.rows, // OUR drivers' Samsara-verbatim clocks (minutes), by name
  };
}

export type ProbeVehicle = {
  vehicle_id: string;
  name: string | null;
  formatted_location: string | null;
  engine_state: string | null;
  driver_name: string | null;
  logged_in_driver: boolean;
};

export async function runSamsaraStatsProbe(token: string, now: Date) {
  const start = new Date(now.getTime() - 60 * 60 * 1000);

  // A) valid stats (gps + engine). B) the deployed call — now valid types only (driverAssignments is NOT a
  // /fleet/vehicles/stats type; it 400'd the whole request — the live ingest was fixed in #1200, and driver
  // login lives on the separate driver-assignments feed in C). C) the driver-login feed.
  const statsValid = await rawGet(token, `${SAMSARA_API_BASE}/fleet/vehicles/stats?types=gps,engineStates`);
  const statsDeployed = await rawGet(token, `${SAMSARA_API_BASE}/fleet/vehicles/stats?types=gps,engineStates`);
  // DIAGNOSTIC (FINISH-OPS #7 proof): probe the odometer types string WITHOUT touching the live ingest cron
  // (which still requests gps,engineStates). GUARD reads odometer_probe below to decide whether the
  // odometer-in-stats approach is safe (200 + gps/engineStates still present) before #7's ingest merges.
  const statsOdometer = await rawGet(token, `${SAMSARA_API_BASE}/fleet/vehicles/stats?types=gps,engineStates,obdOdometerMeters`);
  const driverFeed = await rawGet(
    token,
    `${SAMSARA_API_BASE}/fleet/vehicles/driver-assignments?startTime=${start.toISOString()}&endTime=${now.toISOString()}`
  );
  // D) SCOPE+SHAPE check for Samsara's COMPUTED HOS clocks (the verbatim-source path, Blueprint §3.15.9.2). This is
  //    the go/no-go: http_status 200 = scope OK; 403/empty = STOP (Jorge requests scope). The raw clocks object per
  //    driver reveals the EXACT field names (driving/shift/cycle/break remaining + violation) so PR B writes the
  //    snapshot columns verbatim, plus COVERAGE (which logged-in drivers have clocks; not-logged-in => no clocks).
  const hosClocksCall = await rawGet(token, `${SAMSARA_API_BASE}/fleet/hos/clocks`);
  const hos_clocks_sample = hosClocksCall.rows.slice(0, 12).map((r) => {
    const driver = asObject(r.driver);
    const clocks = asObject(r.clocks);
    return {
      driver_id: driver ? str(driver.id) : null,
      driver_name: driver ? str(driver.name) : null,
      clocks_keys: clocks ? Object.keys(clocks) : null, // EXACT Samsara field names for PR B
      raw_clocks: r.clocks ?? null, // verbatim values (e.g. Samsara's cycle remaining, next to our recompute)
    };
  });

  const byId = new Map<string, ProbeVehicle>();
  for (const row of statsValid.rows) {
    const id = str(row.id);
    if (!id) continue;
    const gps = asObject(row.gps);
    const reverse = gps ? asObject(gps.reverseGeo) : null;
    const engine = asObject(row.engineStates);
    byId.set(id, {
      vehicle_id: id,
      name: str(row.name),
      formatted_location: reverse ? str(reverse.formattedLocation) : null,
      engine_state: engine ? str(engine.value) : null,
      driver_name: null,
      logged_in_driver: false,
    });
  }
  for (const row of driverFeed.rows) {
    const id = str(row.id);
    if (!id) continue;
    const assignments = Array.isArray(row.driverAssignments) ? row.driverAssignments : [];
    let current: Record<string, unknown> | null = null;
    let best = "";
    for (const a of assignments) {
      const ao = asObject(a);
      if (!ao) continue;
      const startT = str(ao.startTime) ?? "";
      const ended = str(ao.endTime);
      if (ended && current) continue;
      if (startT >= best) { best = startT; current = ao; }
    }
    const driver = current ? asObject(current.driver) : null;
    const v = byId.get(id) ?? { vehicle_id: id, name: str(row.name), formatted_location: null, engine_state: null, driver_name: null, logged_in_driver: false };
    v.name = v.name ?? str(row.name);
    v.driver_name = driver ? str(driver.name) : null;
    v.logged_in_driver = Boolean(driver);
    byId.set(id, v);
  }

  const perVehicle = [...byId.values()].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const movingHint = perVehicle.filter((v) => v.engine_state === "On");

  // Raw engine/gps shape from the first few vehicles — so we SEE why engineStates isn't parsing instead
  // of guessing the field path. Carrier's own GPS+engine data, no PII.
  const engine_gps_samples = statsValid.rows.slice(0, 4).map((r) => {
    const g = asObject(r.gps);
    return {
      id: str(r.id),
      name: str(r.name),
      gps_keys: g ? Object.keys(g) : null,
      engineStates: r.engineStates ?? null,
      engineState: r.engineState ?? null,
    };
  });

  // FINISH-OPS #7 proof: from the odometer-types response, confirm (a) it returned 200, (b) rows still
  // carry gps + engineStates (feed not regressed by adding obdOdometerMeters), (c) odometer actually present.
  const odometer_samples = statsOdometer.rows.slice(0, 6).map((r) => {
    const g = asObject(r.gps);
    const odo = asObject(r.obdOdometerMeters) ?? asObject(r.gatewayOdometerMeters);
    return {
      id: str(r.id),
      name: str(r.name),
      has_gps: Boolean(g),
      has_engineStates: Boolean(asObject(r.engineStates)),
      obd_odometer_meters: odo ? odo.value ?? null : null,
    };
  });

  // A-vs-B disambiguation (GUARD #7): does adding obdOdometerMeters DISPLACE engineStates, or was
  // engineStates already absent Samsara-side (pre-existing token-scope issue, unrelated to odometer)?
  // Compare baseline A = gps,engineStates (statsValid) to B = gps,engineStates,obdOdometerMeters
  // (statsOdometer). A TRUE regression is only when B LOST a field that A had.
  const engineStates_in_valid_call = statsValid.rows.some((r) => asObject(r.engineStates)); // A
  const engineStates_in_odometer_call = statsOdometer.rows.some((r) => asObject(r.engineStates)); // B
  const gps_in_valid_call = statsValid.rows.some((r) => asObject(r.gps));
  const gps_in_odometer_call = statsOdometer.rows.some((r) => asObject(r.gps));
  const odometer_displaces_engineStates = engineStates_in_valid_call && !engineStates_in_odometer_call;
  const odometer_displaces_gps = gps_in_valid_call && !gps_in_odometer_call;
  const odometer_safe =
    statsOdometer.http_status === 200 && !odometer_displaces_engineStates && !odometer_displaces_gps;
  const odometer_verdict =
    statsOdometer.http_status !== 200
      ? "BLOCK: odometer call did not return 200"
      : odometer_displaces_engineStates || odometer_displaces_gps
        ? "BLOCK: odometer call dropped a field the baseline had (real regression) -> use isolated endpoint"
        : !engineStates_in_valid_call
          ? "SAFE: engineStates already absent in baseline gps,engineStates call (pre-existing Samsara issue, NOT caused by odometer)"
          : "SAFE: odometer call preserves gps + engineStates";

  return {
    probed_at: now.toISOString(),
    engine_gps_samples,
    odometer_samples,
    interpretation: {
      deployed_call_http_status: statsDeployed.http_status,
      deployed_call_is_invalid: statsDeployed.http_status === 400,
      deployed_call_error: statsDeployed.error,
      valid_stats_http_status: statsValid.http_status,
      city_state_available: perVehicle.some((v) => v.formatted_location),
      engine_state_available: perVehicle.some((v) => v.engine_state),
      driver_feed_http_status: driverFeed.http_status,
      vehicles_total: perVehicle.length,
      vehicles_with_logged_in_driver: perVehicle.filter((v) => v.logged_in_driver).length,
      engine_on_vehicles: movingHint.length,
      engine_on_with_driver: movingHint.filter((v) => v.logged_in_driver).length,
      // HOS clocks scope go/no-go (the verbatim-source gate): 200 = our token returns Samsara's computed clocks.
      hos_clocks_http_status: hosClocksCall.http_status,
      hos_clocks_scope_ok: hosClocksCall.http_status === 200,
      hos_clocks_error: hosClocksCall.error,
      hos_clocks_drivers_returned: hosClocksCall.rows.length,
      // FINISH-OPS #7 odometer-types proof (the go/no-go for the odometer ingest):
      odometer_call_http_status: statsOdometer.http_status,
      odometer_call_ok: statsOdometer.http_status === 200,
      odometer_call_error: statsOdometer.error,
      odometer_present: statsOdometer.rows.some((r) => asObject(r.obdOdometerMeters) ?? asObject(r.gatewayOdometerMeters)),
      // A-vs-B regression disambiguation (the #1289 go/no-go). not_regressed is now a TRUE comparison:
      // it only flags a regression if the odometer call LOST a field the baseline gps,engineStates call had.
      engineStates_in_valid_call: engineStates_in_valid_call, // A: baseline gps,engineStates
      engineStates_in_odometer_call: engineStates_in_odometer_call, // B: gps,engineStates,obdOdometerMeters
      gps_in_valid_call: gps_in_valid_call,
      gps_in_odometer_call: gps_in_odometer_call,
      odometer_displaces_engineStates: odometer_displaces_engineStates,
      odometer_displaces_gps: odometer_displaces_gps,
      odometer_feed_not_regressed: odometer_safe,
      odometer_verdict: odometer_verdict,
    },
    per_vehicle: perVehicle,
    // Samsara's COMPUTED clocks per driver (verbatim) — field names + coverage + values for GUARD to compare against
    // our recompute (board 189 / daily 472 for CAZARES) and confirm Samsara's is the number to trust.
    hos_clocks_sample,
    raw_call_status: {
      valid_gps_engine: { http_status: statsValid.http_status, error: statsValid.error, vehicles: statsValid.rows.length },
      deployed_with_driver: { http_status: statsDeployed.http_status, error: statsDeployed.error },
      odometer_types: { http_status: statsOdometer.http_status, error: statsOdometer.error, vehicles: statsOdometer.rows.length },
      driver_assignments: { http_status: driverFeed.http_status, error: driverFeed.error, vehicles: driverFeed.rows.length },
      hos_clocks: { http_status: hosClocksCall.http_status, error: hosClocksCall.error, drivers: hosClocksCall.rows.length },
    },
  };
}
