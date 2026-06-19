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
    hos_events_24h,
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

  // A) valid stats (gps + engine). B) the deployed (suspected-invalid) call. C) the driver-login feed.
  const statsValid = await rawGet(token, `${SAMSARA_API_BASE}/fleet/vehicles/stats?types=gps,engineStates`);
  const statsDeployed = await rawGet(token, `${SAMSARA_API_BASE}/fleet/vehicles/stats?types=gps,driverAssignments,engineStates`);
  const driverFeed = await rawGet(
    token,
    `${SAMSARA_API_BASE}/fleet/vehicles/driver-assignments?startTime=${start.toISOString()}&endTime=${now.toISOString()}`
  );

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

  return {
    probed_at: now.toISOString(),
    engine_gps_samples,
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
    },
    per_vehicle: perVehicle,
    raw_call_status: {
      valid_gps_engine: { http_status: statsValid.http_status, error: statsValid.error, vehicles: statsValid.rows.length },
      deployed_with_driver: { http_status: statsDeployed.http_status, error: statsDeployed.error },
      driver_assignments: { http_status: driverFeed.http_status, error: driverFeed.error, vehicles: driverFeed.rows.length },
    },
  };
}
