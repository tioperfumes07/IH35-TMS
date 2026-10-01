/**
 * Samsara REST client. Uses api.samsara.com when a token is available
 * (configured row, SAMSARA_API_TOKEN, or SAMSARA_API_KEY); otherwise list APIs no-op to [].
 * @packageDocumentation
 */

import { withCircuitBreaker } from "../../lib/circuit-breaker/index.js";
import {
  buildIh35SamsaraExternalIds,
  type Ih35SamsaraExternalIds,
} from "./samsara-external-ids.js";

export type SamsaraConfig = {
  apiToken: string | null;
  samsaraOrgId: string | null;
};

export type SamsaraDriver = { id: string; raw: Record<string, unknown> };
export type SamsaraVehicle = { id: string; raw: Record<string, unknown> };
export type SamsaraTrailer = { id: string; raw: Record<string, unknown> };
export type SamsaraAddress = { id: string; raw: Record<string, unknown> };
export type SamsaraRouteStopInput = {
  externalIds: Ih35SamsaraExternalIds;
  /** A Samsara address id, when the stop's place is linked to one (E-07). */
  addressId?: string;
  /** ROUND 306 E-31: shape measured live -- {address: string, latitude: number, longitude: number}. */
  singleUseLocation?: { address: string; latitude: number; longitude: number };
  scheduledArrivalTime?: string;
  scheduledDepartureTime?: string;
  notes?: string;
};
export type SamsaraHosLog = { startedAt: string; endedAt: string | null; hosStatusType: string };
export type SamsaraHosDriverLogs = { driverId: string; logs: SamsaraHosLog[] };
// Samsara's COMPUTED HOS clocks (GET /fleet/hos/clocks) — DOT-certified remaining, displayed verbatim (Blueprint
// §3.15.9.2). Durations are ms in the API; we convert to minutes. cycle_started_at distinguishes a real 34h restart
// (Samsara legitimately returns a fresh 70h) from a default reading for a driver who is off the clock.
/** ROUND 304 T-47 -- GET /fleet/hos/daily-logs, fields probed live 2026-10-01 (not guessed):
 *  driver.id, startTime, endTime, distanceTraveled.driveDistanceMeters. No vehicle on the row. */
export type SamsaraFuelPurchaseBody = {
  transactionReference: string;
  transactionTime: string;
  transactionLocation: string;
  fuelQuantityLiters: string;
  transactionPrice: { amount: string; currency: string };
  vehicleId: string;
  iftaFuelType: "Diesel" | "Gasoline";
};

export type SamsaraIftaVehicleReport = {
  samsara_vehicle_id: string;
  vehicle_name: string | null;
  jurisdictions: { jurisdiction: string; total_meters: number; taxable_meters: number }[];
};

export type SamsaraIftaPeriod = { year: number; month?: string; quarter?: "Q1" | "Q2" | "Q3" | "Q4" };

export type SamsaraIftaVehicleReportResult = {
  vehicles: SamsaraIftaVehicleReport[];
  /** Samsara's own data.troubleshooting block, verbatim (e.g. noPurchasesFound). */
  troubleshooting: Record<string, unknown> | null;
};

/** ROUND 304 T-50 — one row of /fleet/reports/{vehicles|drivers}/fuel-energy, fields measured live 2026-10-01. */
export type SamsaraFuelEnergyRow = {
  subject_id: string;
  subject_name: string | null;
  efficiency_mpge: number | null;
  fuel_consumed_ml: number | null;
  distance_traveled_meters: number | null;
  engine_run_time_ms: number | null;
  engine_idle_time_ms: number | null;
};

/** ROUND 304 T-51 — one DVIR from /fleet/dvirs/history, fields measured live 2026-10-01. */
export type SamsaraDvir = {
  id: string;
  type: string | null;
  safety_status: string | null;
  signer_user_id: string | null;
  signer_type: string | null;
  signed_at: string | null;
  end_time: string | null;
  odometer_meters: number | null;
  location: string | null;
  samsara_vehicle_id: string | null;
  trailer_name: string | null;
  vehicle_defects: unknown[];
  trailer_defects: unknown[];
};

export type SamsaraHosDailyLog = {
  samsara_driver_id: string;
  start_time: string;
  end_time: string;
  drive_distance_meters: number | null;
};

export type SamsaraHosClocks = {
  driverId: string;
  cycle_remaining_min: number | null;
  drive_remaining_min: number | null;
  shift_remaining_min: number | null;
  break_remaining_min: number | null;
  cycle_started_at: string | null;
  cycle_tomorrow_min: number | null;
  raw: Record<string, unknown>;
};
export type SamsaraVehicleLocation = {
  id: string;
  latitude: number;
  longitude: number;
  captured_at: string;
  speed_mph: number | null;
  heading_deg: number | null;
  engine_on: boolean | null;
  /** E-01: odometer READ at this exact fix (gps decoration obdOdometerMeters), miles; null when Samsara sent none. */
  odometer_mi?: number | null;
  formatted_location?: string | null;
  raw: Record<string, unknown>;
};
// /fleet/vehicles/stats?types=gps,engineStates — one call gives the latest GPS fix
// (incl. reverseGeo.formattedLocation -> city/state) + engine state. (driverAssignments is NOT a valid
// stats type — it 400s; the current driver comes from the separate /fleet/vehicles/driver-assignments feed.)
// Parsed defensively: any missing field degrades to null, never throws (the prod token is encrypted so
// the payload cannot be live-verified here — GUARD verifies the live outcome after deploy).
export type SamsaraVehicleStat = {
  id: string;
  latitude: number | null;
  longitude: number | null;
  captured_at: string;
  speed_mph: number | null;
  heading_deg: number | null;
  formatted_location: string | null;
  city: string | null;
  state: string | null;
  engine_state: "on" | "off" | "idle" | "unknown";
  odometer_mi: number | null;
  fuel_level_pct: number | null;
  engine_hours: number | null;
  current_driver: { samsara_driver_id: string; started_at: string; ended_at: string | null } | null;
  raw: Record<string, unknown>;
};
export type HosLog = Record<string, unknown>;
export type SamsaraRemoteEntityType = "drivers" | "vehicles" | "addresses";
export type DashcamFacing = "road" | "in_cab" | "both";

export class SamsaraApiError extends Error {
  readonly statusCode: number | null;
  readonly body: Record<string, unknown> | null;
  readonly retryable: boolean;

  constructor(message: string, statusCode: number | null, body: Record<string, unknown> | null, retryable: boolean) {
    super(message);
    this.name = "SamsaraApiError";
    this.statusCode = statusCode;
    this.body = body;
    this.retryable = retryable;
  }
}

const SAMSARA_API_BASE = "https://api.samsara.com";

// Timeout-bounded fetch. A bare fetch() has NO timeout — a stalled Samsara socket hangs forever, and the
// background-job cron holds a DB transaction open the whole time (connection-pool exhaustion / killed
// idle-in-transaction → full rollback). AbortController closes the socket so the call always returns.
export async function samsaraFetch(url: URL | string, init: RequestInit, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function envToken(): string | null {
  const t =
    process.env.SAMSARA_API_TOKEN?.trim() ||
    process.env.SAMSARA_API_KEY?.trim() ||
    process.env.SAMSARA_TOKEN?.trim() ||
    "";
  return t.length > 0 ? t : null;
}

function effectiveToken(config: SamsaraConfig): string | null {
  const direct = config.apiToken?.trim() ?? "";
  if (direct.length > 0) return direct;
  return envToken();
}

function bearerHeaders(token: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  return h;
}

async function readJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { _raw: text };
  }
}

function parsePagination(json: Record<string, unknown>): { hasNextPage: boolean; cursor: string | null } {
  const pagination = json.pagination as { endCursor?: unknown; hasNextPage?: unknown } | undefined;
  if (pagination && typeof pagination === "object") {
    const hasNextPage = Boolean(pagination.hasNextPage);
    const endCursor = typeof pagination.endCursor === "string" && pagination.endCursor.trim() ? pagination.endCursor : null;
    return { hasNextPage, cursor: endCursor };
  }
  const after = typeof json.after === "string" && json.after.trim() ? json.after : null;
  return { hasNextPage: Boolean(after), cursor: after };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * ROUND 306 E-01 — the per-fix pull. Was GET /fleet/vehicles/locations, which carries NO odometer and
 * ignores `decorations` (measured live 2026-10-01). Now GET /fleet/vehicles/stats/feed?types=gps&
 * decorations=obdOdometerMeters: same one call for every vehicle (95, hasNextPage=false), and each GPS
 * point carries the odometer Samsara read AT THAT POINT (gps[].decorations.obdOdometerMeters.value) —
 * a read, never a nearest-in-time pairing. A point without the decoration keeps odometer_mi = null.
 * No cursor is stored, so each tick reads the latest point per vehicle (same cadence as before).
 */
export function parseGpsFeedRow(row: Record<string, unknown>): SamsaraVehicleLocation | null {
  const id = row.id == null ? "" : String(row.id);
  const points = Array.isArray(row.gps) ? (row.gps as unknown[]) : [];
  const last = points.length > 0 ? asObject(points[points.length - 1]) : null;
  if (!id || !last) return null;
  const latitude = Number(last.latitude);
  const longitude = Number(last.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || typeof last.time !== "string") return null;
  const speed = Number(last.speedMilesPerHour);
  const heading = Number(last.headingDegrees);
  const odoMeters = Number(asObject(asObject(last.decorations)?.obdOdometerMeters)?.value ?? NaN);
  const fl = asObject(last.reverseGeo)?.formattedLocation;
  return {
    id,
    latitude,
    longitude,
    captured_at: new Date(last.time).toISOString(),
    speed_mph: Number.isFinite(speed) && speed >= 0 ? speed : null,
    heading_deg: Number.isFinite(heading) ? Number((((heading % 360) + 360) % 360).toFixed(2)) : null,
    engine_on: null,
    odometer_mi: Number.isFinite(odoMeters) && odoMeters >= 0 ? Number((odoMeters * 0.000621371).toFixed(1)) : null,
    formatted_location: typeof fl === "string" && fl.trim().length > 0 ? fl.trim() : null,
    raw: row,
  };
}

async function fetchSamsaraLocationsPage(token: string, after: string | null): Promise<{
  data: SamsaraVehicleLocation[];
  hasNextPage: boolean;
  cursor: string | null;
}> {
  const url = new URL(`${SAMSARA_API_BASE}/fleet/vehicles/stats/feed`);
  url.searchParams.set("types", "gps");
  url.searchParams.set("decorations", "obdOdometerMeters");
  if (after) url.searchParams.set("after", after);
  let res: Response;
  try {
    res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }));
  } catch (error) {
    throw new SamsaraApiError(
      `samsara_network_error:${String((error as Error)?.message ?? error)}`,
      null,
      null,
      true
    );
  }
  if (!res.ok) {
    const body = await readJsonResponse(res);
    const retryable = res.status === 429 || res.status >= 500;
    throw new SamsaraApiError(`samsara_http_${res.status}`, res.status, body, retryable);
  }
  const json = await readJsonResponse(res);
  const rows = Array.isArray(json.data)
    ? json.data.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    : [];
  const data = rows
    .map((row) => parseGpsFeedRow(row))
    .filter((row): row is SamsaraVehicleLocation => Boolean(row));
  const { hasNextPage, cursor } = parsePagination(json);
  return { data, hasNextPage, cursor };
}

// Best-effort city/state from a Samsara reverseGeo.formattedLocation string. Samsara only documents the flat
// formattedLocation (e.g. "1200 San Bernardo Ave, Laredo, TX" OR "5415 Centerpoint Parkway, Obetz, OH, 43125").
// The state token is NOT always the last part — a trailing ZIP/country can follow it. SCAN from the right for the
// 2-letter state code; city = the part immediately before it. Earlier code took the last part only, so on
// "...,Obetz,OH,43125" it read state from "43125" (none) and city from "OH" (the state code). Guard: city != state.
export function parseCityState(formatted: string | null): { city: string | null; state: string | null } {
  if (!formatted) return { city: null, state: null };
  const parts = formatted.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length === 0) return { city: null, state: null };
  // Find the state token scanning from the right (handles "TX", "TX 78040", and a trailing ZIP-only part).
  let stateIdx = -1;
  let state: string | null = null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(/\b([A-Z]{2})\b/);
    if (m) { state = m[1]; stateIdx = i; break; }
  }
  // city = the segment immediately before the state token; fall back to second-to-last when no state found.
  let city: string | null = stateIdx > 0 ? parts[stateIdx - 1] || null : parts.length >= 2 ? parts[parts.length - 2] || null : null;
  // HARD GUARD: city must never equal the state code (the exact bug — "OH" as a city). Step back one more part.
  if (city && state && city.toUpperCase() === state) city = stateIdx > 1 ? parts[stateIdx - 2] || null : null;
  return { city, state };
}

export function parseVehicleStatRow(row: Record<string, unknown>): SamsaraVehicleStat | null {
  const id = typeof row.id === "string" && row.id.trim().length > 0 ? row.id.trim() : null;
  if (!id) return null;

  const gps = asObject(row.gps) ?? asObject(row.location);
  let latitude: number | null = null;
  let longitude: number | null = null;
  let captured_at = new Date().toISOString();
  let speed_mph: number | null = null;
  let heading_deg: number | null = null;
  let formatted_location: string | null = null;
  if (gps) {
    const lat = Number(gps.latitude ?? gps.lat);
    const lng = Number(gps.longitude ?? gps.lng ?? gps.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      latitude = lat;
      longitude = lng;
    }
    const timeRaw = gps.time ?? gps.timestamp ?? gps.recordedAt ?? gps.recorded_at;
    if (typeof timeRaw === "string" && timeRaw.trim().length > 0) captured_at = new Date(timeRaw).toISOString();
    for (const raw of [gps.speedMilesPerHour, gps.speed_mph, gps.speedMph, gps.speed]) {
      const v = Number(raw);
      if (Number.isFinite(v) && v >= 0) { speed_mph = v; break; }
    }
    for (const raw of [gps.headingDegrees, gps.heading_deg, gps.heading, gps.bearing]) {
      const v = Number(raw);
      if (Number.isFinite(v)) { heading_deg = Number((((v % 360) + 360) % 360).toFixed(2)); break; }
    }
    const reverse = asObject(gps.reverseGeo) ?? asObject(gps.reverse_geo);
    const fl = reverse?.formattedLocation ?? reverse?.formatted_location ?? gps.formattedLocation;
    if (typeof fl === "string" && fl.trim().length > 0) formatted_location = fl.trim();
  }
  const { city, state } = parseCityState(formatted_location);

  // Engine state from the engineStates stat (Samsara value "On"/"Off"/"Idle") — REAL engine, not derived.
  let engine_state: SamsaraVehicleStat["engine_state"] = "unknown";
  const engineStat = asObject(row.engineStates) ?? asObject(row.engineState);
  const engineVal = typeof engineStat?.value === "string" ? engineStat.value.toLowerCase() : null;
  if (engineVal === "on") engine_state = "on";
  else if (engineVal === "off") engine_state = "off";
  else if (engineVal === "idle") engine_state = "idle";

  // Odometer from the obdOdometerMeters stat (Samsara reports METERS). Convert to miles at ingest so the
  // PM countdown / maintenance predictor read miles directly. Defensive: any missing/invalid value -> null.
  let odometer_mi: number | null = null;
  const odoStat = asObject(row.obdOdometerMeters) ?? asObject(row.gatewayOdometerMeters);
  // Guard against Number(null|undefined) === 0 — when no odometer stat is present odometer_mi must stay null.
  const odoMeters = odoStat != null && odoStat.value != null ? Number(odoStat.value) : NaN;
  if (Number.isFinite(odoMeters) && odoMeters >= 0) {
    odometer_mi = Number((odoMeters * 0.000621371).toFixed(1));
  }

  let fuel_level_pct: number | null = null;
  const fuelStat = asObject(row.fuelPercents) ?? asObject(row.fuelPercent);
  const fuelVal = fuelStat != null && fuelStat.value != null ? Number(fuelStat.value) : NaN;
  if (Number.isFinite(fuelVal) && fuelVal >= 0 && fuelVal <= 100) {
    fuel_level_pct = fuelVal;
  }

  let engine_hours: number | null = null;
  const hoursStat = asObject(row.obdEngineSeconds) ?? asObject(row.engineHours);
  const hoursRaw = hoursStat != null && hoursStat.value != null ? Number(hoursStat.value) : NaN;
  if (Number.isFinite(hoursRaw) && hoursRaw >= 0) {
    engine_hours = asObject(row.obdEngineSeconds)
      ? Number((hoursRaw / 3600).toFixed(1))
      : hoursRaw;
  }

  // Current driver assignment: take the open assignment (no endTime) with the latest startTime.
  let current_driver: SamsaraVehicleStat["current_driver"] = null;
  const assignments = Array.isArray(row.driverAssignments) ? row.driverAssignments : [];
  let bestStart = "";
  for (const rawA of assignments) {
    const a = asObject(rawA);
    if (!a) continue;
    const driver = asObject(a.driver);
    const driverIdRaw = driver?.id ?? a.driverId;
    const samsara_driver_id = typeof driverIdRaw === "string" ? driverIdRaw.trim() : String(driverIdRaw ?? "").trim();
    if (!samsara_driver_id) continue;
    const startRaw = a.startTime ?? a.startedAt ?? a.start_time;
    if (typeof startRaw !== "string" || startRaw.trim().length === 0) continue;
    const endRaw = a.endTime ?? a.endedAt ?? a.end_time;
    const ended_at = typeof endRaw === "string" && endRaw.trim().length > 0 ? new Date(endRaw).toISOString() : null;
    const started_at = new Date(startRaw).toISOString();
    // Prefer an open (not-ended) assignment; among those, the most recent start wins.
    if (ended_at !== null && current_driver !== null) continue;
    if (started_at >= bestStart) {
      bestStart = started_at;
      current_driver = { samsara_driver_id, started_at, ended_at };
    }
  }

  return { id, latitude, longitude, captured_at, speed_mph, heading_deg, formatted_location, city, state, engine_state, odometer_mi, fuel_level_pct, engine_hours, current_driver, raw: row };
}

/**
 * SAMSARA CAPS /fleet/vehicles/stats AT FOUR TYPES. Proven against the live API with the real
 * token, 2026-09-30:
 *   types=gps,engineStates,obdOdometerMeters,fuelPercents,obdEngineSeconds   (5)
 *     -> HTTP 400 {"message":"Vehicle stats are currently restricted to 4 types."}
 *   types=gps,engineStates,obdOdometerMeters,obdEngineSeconds                (4)
 *     -> HTTP 200, 95 vehicles, 93 with obdOdometerMeters, 87 with obdEngineSeconds
 *   types=gps,engineStates,obdOdometerMeters,fuelPercents                    (4)
 *     -> HTTP 200, 95 vehicles, 93 with obdOdometerMeters, 90 with fuelPercent
 *
 * THAT ONE EXTRA TYPE IS THE WHOLE 35-DAY DEFECT. The request asked for five, Samsara refused the
 * lot, and the old fallback collapsed all the way to gps,engineStates -- throwing ODOMETER away to
 * keep a position we already had. Odometer has been NULL since 2026-09-10 as a direct result, which
 * is why driven miles, company-settlement MPG, PM countdowns and engine-hour services all went
 * blind. Nothing ever said a word.
 *
 * So we ask for four and we ask TWICE, merging by vehicle id: the PRIMARY set carries position,
 * engine state, odometer and engine hours; the FUEL set carries fuel level. Odometer is in the
 * primary set and never traded away again.
 */
export const SAMSARA_STATS_TYPES_PRIMARY = "gps,engineStates,obdOdometerMeters,obdEngineSeconds";
export const SAMSARA_STATS_TYPES_FUEL = "gps,fuelPercents";
/** Last-resort set if even four types are refused. Carries NO odometer -- a named, recorded failure. */
export const SAMSARA_STATS_TYPES_DEGRADED = "gps,engineStates";
/** @deprecated kept so existing imports keep compiling; the primary set is what is requested. */
export const SAMSARA_STATS_TYPES_FULL = SAMSARA_STATS_TYPES_PRIMARY;
/** ROUND 297.1 J-3 — fault codes, requested on their OWN call (see listVehicleFaultCodes) so they
 *  never compete with the primary set's 4-type cap and never risk trading away odometer again. */
export const SAMSARA_STATS_TYPES_FAULT = "gps,faultCodes";

async function fetchSamsaraStatsPage(
  token: string,
  after: string | null,
  requestedTypes: string = SAMSARA_STATS_TYPES_PRIMARY
): Promise<{
  data: SamsaraVehicleStat[];
  hasNextPage: boolean;
  cursor: string | null;
  /** Which types set actually succeeded. DEGRADED carries NO odometer, fuel or engine-hours. */
  typesUsed: string;
  /** Samsara's OWN refusal of the full set, verbatim, when we had to fall back. */
  fullSetError: string | null;
}> {
  // VALID stats types only. driverAssignments is NOT a valid /fleet/vehicles/stats type — including it
  // 400s the whole request (the bug that left city/state blank). Driver login lives on the separate
  // /fleet/vehicles/driver-assignments feed (the pairing worker), not here.
  // obdOdometerMeters carries the live odometer (meters) for the PM countdown; it is a documented
  // valid stats type and degrades to null if absent.
  //
  // FALLBACK: if the full types set 400s (some Samsara accounts don't support all types), retry with
  // the minimal set (gps,engineStates) — the two that carry city/state + engine state. This keeps
  // the dispatch board's live location working even when the account lacks obd/fuel stats.
  //
  // SILENT DEGRADE (Lead, 2026-09-30) — the fallback below is correct and stays, but it used to be
  // INVISIBLE, and that cost 35 days of odometer. Measured live on telematics.vehicle_locations,
  // rows written by this very path (raw_samsara_event_id LIKE 'cron:stats:%'):
  //     2026-08-25   4,645 rows   4,510 with odometer
  //     2026-08-26     779 rows     733 with odometer
  //     [12-day gap -- the feed was down entirely]
  //     2026-09-10   1,900 rows         0 with odometer
  //     2026-09-11   4,121 rows         0 with odometer
  //     2026-09-12   3,628 rows         0 with odometer   ... and every day since
  // The feed came back on the DEGRADED set and never said so. obdOdometerMeters is the odometer,
  // and without it driven miles cannot be computed, which is why company-settlement MPG has had no
  // honest input since August. Nothing was broken loudly enough to notice.
  //
  // So the fetch now REPORTS which set it got. The caller records it. A degraded feed is a named,
  // visible condition -- never a column that quietly turns to null.
  const typesSets = [requestedTypes, SAMSARA_STATS_TYPES_DEGRADED];
  let res: Response | null = null;
  let lastError: SamsaraApiError | null = null;
  let typesUsed = requestedTypes;
  // Samsara's own words for WHY the full set was refused. Without this, a degrade is a mystery we
  // can only guess at from the outside -- and guessing is what turned 35 days of missing odometer
  // into an open question instead of an answer. Captured here, recorded by the caller.
  let fullSetError: string | null = null;
  for (const types of typesSets) {
    typesUsed = types;
    const url = new URL(`${SAMSARA_API_BASE}/fleet/vehicles/stats`);
    url.searchParams.set("types", types);
    if (after) url.searchParams.set("after", after);
    try {
      res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }));
    } catch (error) {
      throw new SamsaraApiError(`samsara_network_error:${String((error as Error)?.message ?? error)}`, null, null, true);
    }
    if (res.ok) break;
    const body = await readJsonResponse(res);
    const retryable = res.status === 429 || res.status >= 500;
    lastError = new SamsaraApiError(`samsara_http_${res.status}`, res.status, body, retryable);
    if (types === requestedTypes) {
      // Keep Samsara's verbatim refusal of the FULL set. `message` names the offending type or the
      // missing scope; that one string is the whole diagnosis.
      const detail = (() => {
        try {
          return typeof body === "string" ? body : JSON.stringify(body);
        } catch {
          return String(body);
        }
      })();
      fullSetError = `http_${res.status}: ${String(detail).slice(0, 500)}`;
    }
    if (res.status !== 400) break; // only retry on 400 (bad types)
    res = null;
  }
  if (!res || !res.ok) {
    throw lastError ?? new SamsaraApiError("samsara_http_unknown", null, null, false);
  }
  const json = await readJsonResponse(res);
  const rows = Array.isArray(json.data)
    ? json.data.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    : [];
  const data = rows
    .map((row) => parseVehicleStatRow(row))
    .filter((row): row is SamsaraVehicleStat => Boolean(row));
  const { hasNextPage, cursor } = parsePagination(json);
  return { data, hasNextPage, cursor, typesUsed, fullSetError };
}

async function fetchSamsaraPage(
  token: string,
  endpoint: "/fleet/drivers" | "/fleet/vehicles" | "/fleet/trailers" | "/addresses" | "/fleet/safety-events",
  after: string | null,
  extraParams?: Record<string, string>
): Promise<{
  data: Record<string, unknown>[];
  hasNextPage: boolean;
  cursor: string | null;
}> {
  const url = new URL(`${SAMSARA_API_BASE}${endpoint}`);
  // ROUND 306 E-12: measured live 2026-10-01 -- /fleet/safety-events rejects limit > 200 with HTTP 400
  // ("Limit must be <= 200"), so the harsh-events poller never read a single event. The other four
  // endpoints accept 512.
  url.searchParams.set("limit", endpoint === "/fleet/safety-events" ? "200" : "512");
  if (after) url.searchParams.set("after", after);
  for (const [key, value] of Object.entries(extraParams ?? {})) url.searchParams.set(key, value);
  let res: Response;
  try {
    res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }));
  } catch (error) {
    throw new SamsaraApiError(
      `samsara_network_error:${String((error as Error)?.message ?? error)}`,
      null,
      null,
      true
    );
  }
  if (!res.ok) {
    const body = await readJsonResponse(res);
    const retryable = res.status === 429 || res.status >= 500;
    throw new SamsaraApiError(`samsara_http_${res.status}`, res.status, body, retryable);
  }
  const json = await readJsonResponse(res);
  const data = Array.isArray(json.data)
    ? json.data.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    : [];
  const { hasNextPage, cursor } = parsePagination(json);
  return { data, hasNextPage, cursor };
}

export class SamsaraClient {
  constructor(private readonly _config: SamsaraConfig) {}

  private _token(): string | null {
    return effectiveToken(this._config);
  }

  async testConnection(): Promise<{ ok: boolean; org_id?: string; error?: string }> {
    const token = this._token();
    if (!token) return { ok: false, error: "not_configured" };
    try {
      const url = new URL(`${SAMSARA_API_BASE}/fleet/vehicles`);
      url.searchParams.set("limit", "1");
      const res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }));
      if (!res.ok) {
        const body = await readJsonResponse(res);
        return { ok: false, error: `http_${res.status}:${JSON.stringify(body).slice(0, 500)}` };
      }
      return { ok: true, org_id: this._config.samsaraOrgId ?? undefined };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "fetch_error" };
    }
  }

  async listDrivers(): Promise<SamsaraDriver[]> {
    const token = this._token();
    if (!token) return [];
    const out: SamsaraDriver[] = [];
    let after: string | null = null;
    try {
      for (let page = 0; page < 50; page += 1) {
        const { data, hasNextPage, cursor } = await fetchSamsaraPage(token, "/fleet/drivers", after);
        for (const row of data) {
          if (typeof row.id === "string" && row.id.trim().length > 0) {
            out.push({ id: row.id.trim(), raw: row });
          }
        }
        if (!hasNextPage || !cursor) break;
        after = cursor;
      }
    } catch {
      return [];
    }
    return out;
  }

  /** ROW-39 (2026-09-05 owner finding): /fleet/drivers defaults to `driverActivationStatus=active`
   *  when the param is omitted — every existing caller of listDrivers() above relies on exactly that
   *  default (syncSamsaraDriversMaster creates/updates mdata.drivers rows from it; widening it would
   *  flood the driver roster with hundreds of ex-employees never part of this TMS), so this is a
   *  SEPARATE method, not a change to listDrivers()'s behavior. Used ONLY by the row-39 mirror
   *  collector, which writes to integrations.samsara_drivers (a raw mirror), never to mdata.drivers.
   *  Fetches BOTH statuses (two full paginated passes; Samsara has no combined "all" value) and
   *  stamps driverActivationStatus onto every raw row so it is never missing even if the API response
   *  itself omits the field. */
  async listDriversAllActivationStatuses(): Promise<SamsaraDriver[]> {
    const token = this._token();
    if (!token) return [];
    const out: SamsaraDriver[] = [];
    for (const activationStatus of ["active", "deactivated"] as const) {
      let after: string | null = null;
      for (let page = 0; page < 50; page += 1) {
        const { data, hasNextPage, cursor } = await fetchSamsaraPage(token, "/fleet/drivers", after, {
          driverActivationStatus: activationStatus,
        });
        for (const row of data) {
          if (typeof row.id === "string" && row.id.trim().length > 0) {
            out.push({
              id: row.id.trim(),
              raw: { ...row, driverActivationStatus: row.driverActivationStatus ?? activationStatus },
            });
          }
        }
        if (!hasNextPage || !cursor) break;
        after = cursor;
      }
    }
    return out;
  }

  /** HOS/ELD duty logs per driver for a time window (GET /fleet/hos/logs). Scope confirmed live.
   *  driverIds (optional) SCOPES the pull to specific Samsara drivers — without it the endpoint returns the
   *  whole account (1358 drivers for this token), which mapped almost nothing (1204 unmapped) and missed the
   *  active board drivers. Pass the tenant's active driver ids to get exactly their events. */
  async listHosLogs(startTimeIso: string, endTimeIso: string, driverIds?: string[]): Promise<SamsaraHosDriverLogs[]> {
    const token = this._token();
    if (!token) return [];
    const out: SamsaraHosDriverLogs[] = [];
    let after: string | null = null;
    const scoped = (driverIds ?? []).filter((d) => d && d.trim().length > 0);
    try {
      for (let page = 0; page < 50; page += 1) {
        const url = new URL(`${SAMSARA_API_BASE}/fleet/hos/logs`);
        url.searchParams.set("startTime", startTimeIso);
        url.searchParams.set("endTime", endTimeIso);
        if (scoped.length > 0) url.searchParams.set("driverIds", scoped.join(","));
        if (after) url.searchParams.set("after", after);
        const res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }));
        if (!res.ok) break;
        const json = (await res.json()) as {
          data?: unknown;
          pagination?: { endCursor?: string; hasNextPage?: boolean };
        };
        const data = Array.isArray(json.data) ? json.data : [];
        for (const row of data) {
          const rec = row as Record<string, unknown>;
          const driver = rec.driver as { id?: unknown } | undefined;
          const driverId = driver && typeof driver.id === "string" ? driver.id.trim() : "";
          if (!driverId) continue;
          const rawLogs = Array.isArray(rec.hosLogs) ? rec.hosLogs : [];
          const logs = rawLogs
            .map((l) => l as Record<string, unknown>)
            .map((l) => ({
              startedAt: typeof l.logStartTime === "string" ? l.logStartTime : null,
              endedAt: typeof l.logEndTime === "string" ? l.logEndTime : null,
              hosStatusType: typeof l.hosStatusType === "string" ? l.hosStatusType : null,
            }))
            .filter((l): l is SamsaraHosLog => Boolean(l.startedAt) && Boolean(l.hosStatusType));
          if (logs.length > 0) out.push({ driverId, logs });
        }
        const hasNext = Boolean(json.pagination?.hasNextPage);
        const cursor = json.pagination?.endCursor ?? null;
        if (!hasNext || !cursor) break;
        after = cursor;
      }
    } catch {
      return out;
    }
    return out;
  }

  /** Samsara's COMPUTED HOS clocks per driver (GET /fleet/hos/clocks). Scope-confirmed live (200, 468 drivers).
   *  Durations are ms; converted to minutes. Scoped to driverIds (the active board drivers). */
  /** ROUND 304 T-47 -- per-driver per-day HOS drive distance, the independent second signal for
   *  driven miles per leg. startDate/endDate are YYYY-MM-DD. */
  /**
   * ROUND 304 T-48 — POST /fuel-purchase. Body shape measured live against Samsara's validator
   * (2026-10-01, rejected probes only, nothing created): every value is a STRING —
   * fuelQuantityLiters "123.456", transactionPrice {amount:"1.00", currency}, vehicleId, ISO
   * transactionTime, free-text transactionLocation; iftaFuelType is an enum ("Diesel", "Gasoline", ...).
   * Throws SamsaraApiError on any non-2xx so the caller records the failure, never a silent drop.
   */
  async createFuelPurchase(body: SamsaraFuelPurchaseBody): Promise<{ samsara_fuel_purchase_id: string | null }> {
    const token = this._token();
    if (!token) throw new SamsaraApiError("samsara_token_missing", null, null, false);
    let res: Response;
    try {
      res = await withCircuitBreaker("samsara", () =>
        samsaraFetch(`${SAMSARA_API_BASE}/fuel-purchase`, {
          method: "POST",
          headers: { ...bearerHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      );
    } catch (error) {
      throw new SamsaraApiError(`samsara_network_error:${String((error as Error)?.message ?? error)}`, null, null, true);
    }
    const json = await readJsonResponse(res);
    if (!res.ok) throw new SamsaraApiError(`samsara_fuel_purchase_http_${res.status}`, res.status, json, res.status === 429 || res.status >= 500);
    const data = (json.data ?? json) as Record<string, unknown>;
    const id = data.uuid ?? data.id;
    return { samsara_fuel_purchase_id: id == null ? null : String(id) };
  }

  /**
   * ROUND 304 T-49 — GET /fleet/reports/ifta/vehicle (scope "Read IFTA (US)"; verified live 200 on
   * the USMCA token 2026-10-01). Fields measured live: data.vehicleReports[].vehicle{id,name},
   * .jurisdictions[]{jurisdiction,totalMeters,taxableMeters}; data.troubleshooting. A period Samsara
   * is still processing comes back 400 "IFTA data may still be processing" -> SamsaraApiError.
   */
  async listIftaVehicleReports(period: SamsaraIftaPeriod): Promise<SamsaraIftaVehicleReportResult> {
    const token = this._token();
    if (!token) throw new SamsaraApiError("samsara_token_missing", null, null, false);
    const vehicles: SamsaraIftaVehicleReport[] = [];
    let troubleshooting: Record<string, unknown> | null = null;
    let after: string | null = null;
    for (let page = 0; page < 200; page += 1) {
      const url = new URL(`${SAMSARA_API_BASE}/fleet/reports/ifta/vehicle`);
      url.searchParams.set("year", String(period.year));
      if (period.month) url.searchParams.set("month", period.month);
      if (period.quarter) url.searchParams.set("quarter", period.quarter);
      if (after) url.searchParams.set("after", after);
      let res: Response;
      try {
        res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }, 30_000));
      } catch (error) {
        throw new SamsaraApiError(`samsara_network_error:${String((error as Error)?.message ?? error)}`, null, null, true);
      }
      const json = await readJsonResponse(res);
      if (!res.ok) throw new SamsaraApiError(`samsara_ifta_http_${res.status}`, res.status, json, res.status === 429 || res.status >= 500);
      const data = (json.data ?? {}) as Record<string, unknown>;
      if (data.troubleshooting && typeof data.troubleshooting === "object") troubleshooting = data.troubleshooting as Record<string, unknown>;
      for (const raw of Array.isArray(data.vehicleReports) ? data.vehicleReports : []) {
        const r = raw as Record<string, unknown>;
        const v = (r.vehicle ?? {}) as Record<string, unknown>;
        if (v.id == null) continue;
        const jurisdictions = (Array.isArray(r.jurisdictions) ? r.jurisdictions : [])
          .map((x) => x as Record<string, unknown>)
          .filter((x) => typeof x.jurisdiction === "string" && Number.isFinite(Number(x.totalMeters)))
          .map((x) => ({
            jurisdiction: String(x.jurisdiction),
            total_meters: Number(x.totalMeters),
            taxable_meters: Number.isFinite(Number(x.taxableMeters)) ? Number(x.taxableMeters) : 0,
          }));
        vehicles.push({ samsara_vehicle_id: String(v.id), vehicle_name: typeof v.name === "string" ? v.name : null, jurisdictions });
      }
      const { hasNextPage, cursor } = parsePagination(json);
      if (!hasNextPage || !cursor) break;
      after = cursor;
    }
    return { vehicles, troubleshooting };
  }

  /**
   * ROUND 304 T-50 — GET /fleet/reports/{vehicles|drivers}/fuel-energy (scope "Read Fuel & Energy";
   * 200 on the USMCA token 2026-10-01). Live fields: vehicle|driver{id,name}, efficiencyMpge,
   * fuelConsumedMl, distanceTraveledMeters, engineRunTimeDurationMs, engineIdleTimeDurationMs.
   * A missing number stays null -- never 0.
   */
  /**
   * ROUND 313 E-05 — GET /fleet/vehicles/stats/history?types=obdOdometerMeters (probed 2026-10-01: HTTP 200,
   * T148 2026-09-25 = 1,250 readings, ~30 s apart). The REAL odometer Samsara read at each instant -- the source
   * the stop writer's catch-up uses for stops older than the E-01 gps-decoration era. Meters -> miles here.
   */
  async listOdometerHistory(vehicleIds: string[], startIso: string, endIso: string): Promise<Map<string, Array<{ at: Date; miles: number }>>> {
    const token = this._token();
    if (!token) throw new SamsaraApiError("samsara_token_missing", null, null, false);
    const out = new Map<string, Array<{ at: Date; miles: number }>>();
    let after: string | null = null;
    for (let page = 0; page < 500; page += 1) {
      const url = new URL(`${SAMSARA_API_BASE}/fleet/vehicles/stats/history`);
      url.searchParams.set("types", "obdOdometerMeters");
      url.searchParams.set("vehicleIds", vehicleIds.join(","));
      url.searchParams.set("startTime", startIso);
      url.searchParams.set("endTime", endIso);
      if (after) url.searchParams.set("after", after);
      let res: Response;
      try {
        res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }, 30_000));
      } catch (error) {
        throw new SamsaraApiError(`samsara_network_error:${String((error as Error)?.message ?? error)}`, null, null, true);
      }
      const json = await readJsonResponse(res);
      if (!res.ok) throw new SamsaraApiError(`samsara_odometer_history_http_${res.status}`, res.status, json, res.status === 429 || res.status >= 500);
      for (const raw of Array.isArray(json.data) ? (json.data as unknown[]) : []) {
        const v = raw as Record<string, unknown>;
        if (v.id == null) continue;
        const list = out.get(String(v.id)) ?? [];
        for (const p of Array.isArray(v.obdOdometerMeters) ? (v.obdOdometerMeters as Record<string, unknown>[]) : []) {
          const meters = Number(p.value);
          const at = new Date(String(p.time));
          if (Number.isFinite(meters) && meters > 0 && !Number.isNaN(at.getTime())) list.push({ at, miles: meters / 1609.344 });
        }
        out.set(String(v.id), list);
      }
      const { hasNextPage, cursor } = parsePagination(json);
      if (!hasNextPage || !cursor) break;
      after = cursor;
    }
    return out;
  }

  async listFuelEnergyReports(kind: "vehicles" | "drivers", startIso: string, endIso: string): Promise<SamsaraFuelEnergyRow[]> {
    const token = this._token();
    if (!token) throw new SamsaraApiError("samsara_token_missing", null, null, false);
    const num = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
    const out: SamsaraFuelEnergyRow[] = [];
    let after: string | null = null;
    for (let page = 0; page < 200; page += 1) {
      const url = new URL(`${SAMSARA_API_BASE}/fleet/reports/${kind}/fuel-energy`);
      url.searchParams.set("startDate", startIso);
      url.searchParams.set("endDate", endIso);
      if (after) url.searchParams.set("after", after);
      let res: Response;
      try {
        res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }, 30_000));
      } catch (error) {
        throw new SamsaraApiError(`samsara_network_error:${String((error as Error)?.message ?? error)}`, null, null, true);
      }
      const json = await readJsonResponse(res);
      if (!res.ok) throw new SamsaraApiError(`samsara_fuel_energy_http_${res.status}`, res.status, json, res.status === 429 || res.status >= 500);
      const data = (json.data ?? {}) as Record<string, unknown>;
      const rows = (kind === "vehicles" ? data.vehicleReports : data.driverReports) as unknown[] | undefined;
      for (const raw of Array.isArray(rows) ? rows : []) {
        const r = raw as Record<string, unknown>;
        const subject = ((kind === "vehicles" ? r.vehicle : r.driver) ?? {}) as Record<string, unknown>;
        if (subject.id == null) continue;
        out.push({
          subject_id: String(subject.id),
          subject_name: typeof subject.name === "string" ? subject.name : null,
          efficiency_mpge: num(r.efficiencyMpge),
          fuel_consumed_ml: num(r.fuelConsumedMl),
          distance_traveled_meters: num(r.distanceTraveledMeters),
          engine_run_time_ms: num(r.engineRunTimeDurationMs),
          engine_idle_time_ms: num(r.engineIdleTimeDurationMs),
        });
      }
      const { hasNextPage, cursor } = parsePagination(json);
      if (!hasNextPage || !cursor) break;
      after = cursor;
    }
    return out;
  }

  /**
   * ROUND 304 T-51 — GET /fleet/dvirs/history (200 on the USMCA token 2026-10-01; window max 30 days).
   * Live fields: id, type (preTrip/postTrip), safetyStatus, authorSignature{signatoryUser{id,name},
   * signedAtTime,type}, startTime, endTime, odometerMeters, location, vehicle{id,name}, trailerName,
   * trailer. Defect arrays are passed through untouched (none observed live yet -- never re-shaped).
   */
  async listDvirs(startIso: string, endIso: string): Promise<SamsaraDvir[]> {
    const token = this._token();
    if (!token) throw new SamsaraApiError("samsara_token_missing", null, null, false);
    const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
    const out: SamsaraDvir[] = [];
    let after: string | null = null;
    for (let page = 0; page < 200; page += 1) {
      const url = new URL(`${SAMSARA_API_BASE}/fleet/dvirs/history`);
      url.searchParams.set("startTime", startIso);
      url.searchParams.set("endTime", endIso);
      if (after) url.searchParams.set("after", after);
      let res: Response;
      try {
        res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }, 30_000));
      } catch (error) {
        throw new SamsaraApiError(`samsara_network_error:${String((error as Error)?.message ?? error)}`, null, null, true);
      }
      const json = await readJsonResponse(res);
      if (!res.ok) throw new SamsaraApiError(`samsara_dvirs_http_${res.status}`, res.status, json, res.status === 429 || res.status >= 500);
      for (const raw of Array.isArray(json.data) ? json.data : []) {
        const r = raw as Record<string, unknown>;
        if (r.id == null) continue;
        const sig = (r.authorSignature ?? {}) as Record<string, unknown>;
        const signer = (sig.signatoryUser ?? {}) as Record<string, unknown>;
        const vehicle = (r.vehicle ?? {}) as Record<string, unknown>;
        const odo = Number(r.odometerMeters);
        out.push({
          id: String(r.id),
          type: str(r.type),
          safety_status: str(r.safetyStatus),
          signer_user_id: signer.id == null ? null : String(signer.id),
          signer_type: str(sig.type),
          signed_at: str(sig.signedAtTime),
          end_time: str(r.endTime),
          odometer_meters: r.odometerMeters == null || !Number.isFinite(odo) ? null : odo,
          location: str(r.location),
          samsara_vehicle_id: vehicle.id == null ? null : String(vehicle.id),
          trailer_name: str(r.trailerName),
          vehicle_defects: Array.isArray(r.vehicleDefects) ? r.vehicleDefects : [],
          trailer_defects: Array.isArray(r.trailerDefects) ? r.trailerDefects : [],
        });
      }
      const { hasNextPage, cursor } = parsePagination(json);
      if (!hasNextPage || !cursor) break;
      after = cursor;
    }
    return out;
  }

  /**
   * ROUND 306 E-30 — POST /v1/fleet/messages. Shape measured live 2026-10-01 with rejected probes (nothing
   * sent): {driverIds: number[] (Samsara driver ids as integers), text: string}; string ids are rejected.
   */
  async sendDriverMessage(samsaraDriverIds: string[], text: string): Promise<{ status: number }> {
    const token = this._token();
    if (!token) throw new SamsaraApiError("samsara_token_missing", null, null, false);
    const ids = samsaraDriverIds.map((id) => Number(id)).filter((n) => Number.isSafeInteger(n) && n > 0);
    if (ids.length === 0) throw new SamsaraApiError("samsara_message_no_driver_ids", null, null, false);
    let res: Response;
    try {
      res = await withCircuitBreaker("samsara", () =>
        samsaraFetch(`${SAMSARA_API_BASE}/v1/fleet/messages`, {
          method: "POST",
          headers: { ...bearerHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify({ driverIds: ids, text: text.slice(0, 2500) }),
        })
      );
    } catch (error) {
      throw new SamsaraApiError(`samsara_network_error:${String((error as Error)?.message ?? error)}`, null, null, true);
    }
    if (!res.ok) {
      const body = await readJsonResponse(res);
      throw new SamsaraApiError(`samsara_message_http_${res.status}`, res.status, body, res.status === 429 || res.status >= 500);
    }
    return { status: res.status };
  }

  /**
   * E-30 replies: GET /v1/fleet/messages?endMs&durationMs (200, data [] on 2026-10-01 -- no message has ever
   * existed). Parsed to Samsara's documented v1 shape {driverId, text, sentAtMs, sender:{type,name}}; anything
   * missing a driver, text or time is dropped, never guessed.
   */
  async listDriverMessages(endMs: number, durationMs: number): Promise<Array<{ samsaraDriverId: string; text: string; sentAtMs: number; senderType: string; senderName: string | null }>> {
    const token = this._token();
    if (!token) throw new SamsaraApiError("samsara_token_missing", null, null, false);
    const url = new URL(`${SAMSARA_API_BASE}/v1/fleet/messages`);
    url.searchParams.set("endMs", String(endMs));
    url.searchParams.set("durationMs", String(durationMs));
    const res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }, 20_000));
    const json = await readJsonResponse(res);
    if (!res.ok) throw new SamsaraApiError(`samsara_messages_http_${res.status}`, res.status, json, res.status === 429 || res.status >= 500);
    const out = [];
    for (const raw of Array.isArray(json.data) ? (json.data as Record<string, unknown>[]) : []) {
      const sender = asObject(raw.sender) ?? {};
      const sentAtMs = Number(raw.sentAtMs);
      if (raw.driverId == null || typeof raw.text !== "string" || !raw.text.trim() || !Number.isFinite(sentAtMs)) continue;
      out.push({
        samsaraDriverId: String(raw.driverId),
        text: raw.text,
        sentAtMs,
        senderType: String(sender.type ?? "").toLowerCase(),
        senderName: typeof sender.name === "string" ? sender.name : null,
      });
    }
    return out;
  }

  /**
   * E-32: GET /fleet/documents?startTime&endTime (200 with data null on 2026-10-01 -- no driver has submitted a
   * document yet; one document type exists, "Proof of Delivery", field "Photos"). Raw rows, paginated.
   */
  async listDocuments(startIso: string, endIso: string): Promise<Record<string, unknown>[]> {
    const token = this._token();
    if (!token) throw new SamsaraApiError("samsara_token_missing", null, null, false);
    const out: Record<string, unknown>[] = [];
    let after: string | null = null;
    for (let page = 0; page < 100; page += 1) {
      const url = new URL(`${SAMSARA_API_BASE}/fleet/documents`);
      url.searchParams.set("startTime", startIso);
      url.searchParams.set("endTime", endIso);
      if (after) url.searchParams.set("after", after);
      const res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }, 30_000));
      const json = await readJsonResponse(res);
      if (!res.ok) throw new SamsaraApiError(`samsara_documents_http_${res.status}`, res.status, json, res.status === 429 || res.status >= 500);
      for (const d of Array.isArray(json.data) ? (json.data as unknown[]) : []) { const o = asObject(d); if (o) out.push(o); }
      const { hasNextPage, cursor } = parsePagination(json);
      if (!hasNextPage || !cursor) break;
      after = cursor;
    }
    return out;
  }

  async listHosDailyLogs(startDate: string, endDate: string): Promise<SamsaraHosDailyLog[]> {
    const token = this._token();
    if (!token) return [];
    const out: SamsaraHosDailyLog[] = [];
    // Samsara 400s with "endDate must be on or before the current date" -- current date in the org's
    // timezone (America/Chicago for this fleet), not UTC. Clamp, never fail the whole pull.
    const orgToday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
    const end = endDate > orgToday ? orgToday : endDate;
    if (startDate > end) return [];
    let after: string | null = null;
    for (let page = 0; page < 200; page += 1) {
      const url = new URL(`${SAMSARA_API_BASE}/fleet/hos/daily-logs`);
      url.searchParams.set("startDate", startDate);
      url.searchParams.set("endDate", end);
      if (after) url.searchParams.set("after", after);
      let res: Response;
      try {
        // Measured live: a 16-day window's first page takes ~8 s, so the default 12 s timeout aborts
        // later pages. 30 s for this endpoint only.
        res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }, 30_000));
      } catch (error) {
        throw new SamsaraApiError(`samsara_network_error:${String((error as Error)?.message ?? error)}`, null, null, true);
      }
      const json = await readJsonResponse(res);
      if (!res.ok) throw new SamsaraApiError(`samsara_hos_daily_logs_http_${res.status}`, res.status, json, res.status === 429 || res.status >= 500);
      const rows = Array.isArray(json.data) ? json.data : [];
      for (const row of rows) {
        const r = row as Record<string, unknown>;
        const driver = (r.driver ?? {}) as Record<string, unknown>;
        const dist = (r.distanceTraveled ?? {}) as Record<string, unknown>;
        const id = driver.id == null ? "" : String(driver.id);
        if (!id || typeof r.startTime !== "string" || typeof r.endTime !== "string") continue;
        const meters = Number(dist.driveDistanceMeters);
        out.push({ samsara_driver_id: id, start_time: r.startTime, end_time: r.endTime, drive_distance_meters: Number.isFinite(meters) ? meters : null });
      }
      const { hasNextPage, cursor } = parsePagination(json);
      if (!hasNextPage || !cursor) break;
      after = cursor;
    }
    return out;
  }

  async listHosClocks(driverIds?: string[]): Promise<SamsaraHosClocks[]> {
    const token = this._token();
    if (!token) return [];
    const out: SamsaraHosClocks[] = [];
    let after: string | null = null;
    const scoped = (driverIds ?? []).filter((d) => d && d.trim().length > 0);
    const msToMin = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v / 60000) : null);
    const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
    try {
      for (let page = 0; page < 50; page += 1) {
        const url = new URL(`${SAMSARA_API_BASE}/fleet/hos/clocks`);
        if (scoped.length > 0) url.searchParams.set("driverIds", scoped.join(","));
        if (after) url.searchParams.set("after", after);
        const res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }));
        if (!res.ok) break;
        const json = (await res.json()) as { data?: unknown; pagination?: { endCursor?: string; hasNextPage?: boolean } };
        const data = Array.isArray(json.data) ? json.data : [];
        for (const row of data) {
          const rec = row as Record<string, unknown>;
          const driver = rec.driver as { id?: unknown } | undefined;
          const driverId = driver && typeof driver.id === "string" ? driver.id.trim() : "";
          if (!driverId) continue;
          const clocks = obj(rec.clocks);
          const cyc = obj(clocks.cycle);
          const drv = obj(clocks.drive);
          const shf = obj(clocks.shift);
          const brk = obj(clocks.break);
          out.push({
            driverId,
            cycle_remaining_min: msToMin(cyc.cycleRemainingDurationMs),
            drive_remaining_min: msToMin(drv.driveRemainingDurationMs),
            shift_remaining_min: msToMin(shf.shiftRemainingDurationMs),
            break_remaining_min: msToMin(brk.timeUntilBreakDurationMs),
            cycle_started_at: typeof cyc.cycleStartedAtTime === "string" ? cyc.cycleStartedAtTime : null,
            cycle_tomorrow_min: msToMin(cyc.cycleTomorrowDurationMs),
            raw: rec,
          });
        }
        const hasNext = Boolean(json.pagination?.hasNextPage);
        const cursor = json.pagination?.endCursor ?? null;
        if (!hasNext || !cursor) break;
        after = cursor;
      }
    } catch {
      return out;
    }
    return out;
  }

  async listVehicleLocations(): Promise<SamsaraVehicleLocation[]> {
    const token = this._token();
    if (!token) return [];
    const out: SamsaraVehicleLocation[] = [];
    let after: string | null = null;
    for (let page = 0; page < 50; page += 1) {
      const { data, hasNextPage, cursor } = await fetchSamsaraLocationsPage(token, after);
      out.push(...data);
      if (!hasNextPage || !cursor) break;
      after = cursor;
    }
    return out;
  }

  /** GET /fleet/vehicles/stats?types=gps,engineStates — latest GPS (with reverseGeo city/state) + engine state.
   *  driverAssignments is NOT a valid stats type (it 400s the request); driver login comes from the separate
   *  /fleet/vehicles/driver-assignments feed. Defensive parse; never throws on shape. */
  async listVehicleStats(): Promise<SamsaraVehicleStat[]> {
    return (await this.listVehicleStatsWithMeta()).data;
  }

  /**
   * Same fetch, but it also says WHICH types set the account actually served. A caller that needs
   * odometer (driven miles, MPG, PM countdowns) must check `degraded` rather than discover a null
   * column weeks later -- see the measurement in fetchSamsaraStatsPage.
   */
  async listVehicleStatsWithMeta(): Promise<{
    data: SamsaraVehicleStat[];
    typesUsed: string;
    degraded: boolean;
    /** Samsara's verbatim refusal, when a set was refused. */
    fullSetError: string | null;
  }> {
    const token = this._token();
    if (!token) return { data: [], typesUsed: SAMSARA_STATS_TYPES_PRIMARY, degraded: false, fullSetError: null };

    const pull = async (types: string) => {
      const out: SamsaraVehicleStat[] = [];
      let after: string | null = null;
      let used = types;
      let err: string | null = null;
      for (let page = 0; page < 50; page += 1) {
        const p = await fetchSamsaraStatsPage(token, after, types);
        if (p.typesUsed === SAMSARA_STATS_TYPES_DEGRADED) used = SAMSARA_STATS_TYPES_DEGRADED;
        if (p.fullSetError && !err) err = p.fullSetError;
        out.push(...p.data);
        if (!p.hasNextPage || !p.cursor) break;
        after = p.cursor;
      }
      return { data: out, used, err };
    };

    // PRIMARY carries odometer and engine hours. It is never traded away -- see the constants above
    // for why (Samsara caps this endpoint at 4 types, and asking for 5 cost 35 days of odometer).
    const primary = await pull(SAMSARA_STATS_TYPES_PRIMARY);
    const degraded = primary.used === SAMSARA_STATS_TYPES_DEGRADED;

    // FUEL is a SECOND call because it does not fit in the same four. Best-effort: fuel level is
    // useful, but it must never be able to take odometer down with it, so a failure here is logged
    // and the primary data still stands.
    let fuelError: string | null = null;
    const byId = new Map(primary.data.map((row) => [row.id, row]));
    try {
      const fuel = await pull(SAMSARA_STATS_TYPES_FUEL);
      for (const row of fuel.data) {
        if (row.fuel_level_pct === null) continue;
        const base = byId.get(row.id);
        if (base) base.fuel_level_pct = row.fuel_level_pct;
        else byId.set(row.id, row);
      }
      fuelError = fuel.err;
    } catch (error) {
      fuelError = `fuel_pull_failed:${String((error as Error)?.message ?? error)}`;
    }

    return {
      data: Array.from(byId.values()),
      typesUsed: degraded ? SAMSARA_STATS_TYPES_DEGRADED : SAMSARA_STATS_TYPES_PRIMARY,
      degraded,
      fullSetError: primary.err ?? fuelError,
    };
  }

  /**
   * ROUND 297.1 J-3 — one Samsara call for the fleet's fault codes, SEPARATE from
   * listVehicleStatsWithMeta's own 4-type cap (faultCodes does not fit alongside
   * gps/engineStates/obdOdometerMeters/obdEngineSeconds without risking the same "one extra type
   * trades away odometer" failure this file's own header already documents). Returns the RAW row
   * per vehicle (not a parsed SamsaraVehicleStat) -- fault-code-processor.service.ts's own
   * extractFaultCodesFromPayload() already tolerates several real-world shapes
   * (faultCodes/fault_codes/dtc_codes/diagnostics/faults), so the raw row is handed to it directly
   * rather than this client guessing a single rigid shape.
   */
  async listVehicleFaultCodes(): Promise<{ id: string; raw: Record<string, unknown> }[]> {
    const token = this._token();
    if (!token) return [];
    const out: { id: string; raw: Record<string, unknown> }[] = [];
    let after: string | null = null;
    for (let page = 0; page < 50; page += 1) {
      const url = new URL(`${SAMSARA_API_BASE}/fleet/vehicles/stats`);
      url.searchParams.set("types", SAMSARA_STATS_TYPES_FAULT);
      if (after) url.searchParams.set("after", after);
      let res: Response;
      try {
        res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }));
      } catch (error) {
        throw new SamsaraApiError(`samsara_network_error:${String((error as Error)?.message ?? error)}`, null, null, true);
      }
      if (!res.ok) {
        const body = await readJsonResponse(res);
        throw new SamsaraApiError(`samsara_http_${res.status}`, res.status, body, res.status === 429 || res.status >= 500);
      }
      const json = await readJsonResponse(res);
      const rows = Array.isArray(json.data)
        ? json.data.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
        : [];
      for (const row of rows) {
        const id = typeof row.id === "string" && row.id.trim().length > 0 ? row.id.trim() : null;
        if (!id) continue;
        out.push({ id, raw: row });
      }
      const { hasNextPage, cursor } = parsePagination(json);
      if (!hasNextPage || !cursor) break;
      after = cursor;
    }
    return out;
  }

  async listVehicles(): Promise<SamsaraVehicle[]> {
    const token = this._token();
    if (!token) return [];
    const out: SamsaraVehicle[] = [];
    let after: string | null = null;
    try {
      for (let page = 0; page < 50; page += 1) {
        const { data, hasNextPage, cursor } = await fetchSamsaraPage(token, "/fleet/vehicles", after);
        for (const row of data) {
          if (typeof row.id === "string" && row.id.trim().length > 0) {
            out.push({ id: row.id.trim(), raw: row });
          }
        }
        if (!hasNextPage || !cursor) break;
        after = cursor;
      }
    } catch {
      return [];
    }
    return out;
  }

  /** Real trailers (GET /fleet/trailers) — distinct Samsara resource from vehicles. */
  async listTrailers(): Promise<SamsaraTrailer[]> {
    const token = this._token();
    if (!token) return [];
    const out: SamsaraTrailer[] = [];
    let after: string | null = null;
    try {
      for (let page = 0; page < 50; page += 1) {
        const { data, hasNextPage, cursor } = await fetchSamsaraPage(token, "/fleet/trailers", after);
        for (const row of data) {
          if (typeof row.id === "string" && row.id.trim().length > 0) {
            out.push({ id: row.id.trim(), raw: row });
          }
        }
        if (!hasNextPage || !cursor) break;
        after = cursor;
      }
    } catch {
      return [];
    }
    return out;
  }

  async countEntity(entityType: SamsaraRemoteEntityType): Promise<number> {
    const token = this._token();
    if (!token) {
      throw new SamsaraApiError("samsara_not_configured", null, null, false);
    }
    const endpoint: "/fleet/drivers" | "/fleet/vehicles" | "/addresses" =
      entityType === "drivers" ? "/fleet/drivers" : entityType === "vehicles" ? "/fleet/vehicles" : "/addresses";
    let total = 0;
    let after: string | null = null;
    for (let page = 0; page < 500; page += 1) {
      const { data, hasNextPage, cursor } = await fetchSamsaraPage(token, endpoint, after);
      total += data.length;
      if (!hasNextPage || !cursor) break;
      after = cursor;
    }
    return total;
  }

  async countDrivers(): Promise<number> {
    return this.countEntity("drivers");
  }

  async countVehicles(): Promise<number> {
    return this.countEntity("vehicles");
  }

  async countAddresses(): Promise<number> {
    return this.countEntity("addresses");
  }

  /** ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT Step 2 — full address list, junk included (the
      order is explicit: import everything, deactivate later on evidence, never on a guess). Each
      row carries Samsara's own geofence shape (circle radius or polygon vertices) verbatim — bring
      it, never redraw it. */
  async listAddresses(): Promise<SamsaraAddress[]> {
    const token = this._token();
    if (!token) return [];
    const out: SamsaraAddress[] = [];
    let after: string | null = null;
    for (let page = 0; page < 500; page += 1) {
      const { data, hasNextPage, cursor } = await fetchSamsaraPage(token, "/addresses", after);
      for (const row of data) {
        if (typeof row.id === "string" && row.id.trim().length > 0) {
          out.push({ id: row.id.trim(), raw: row });
        }
      }
      if (!hasNextPage || !cursor) break;
      after = cursor;
    }
    return out;
  }

  /**
   * ROUND 301 T-30 — Samsara's dedicated Safety Events feed (harsh braking/accel/turn, speeding,
   * distracted/mobile-use, no-seatbelt). This is the poll fallback for a category the webhook was
   * meant to carry but has never once delivered (T-28). A SEPARATE endpoint from /fleet/vehicles/
   * stats -- safety events are not a "stat" and do not compete with the odometer/fault-code
   * types-cap. Raw rows only; safety/harsh-events-ingestion.service.ts's own
   * processHarshEventsFromVehiclePayload() already tolerates several real-world field-name
   * variants, so it is handed the row as-is rather than this client guessing a single rigid shape.
   */
  async listSafetyEvents(startTimeIso: string, endTimeIso: string): Promise<{ id: string; raw: Record<string, unknown> }[]> {
    const token = this._token();
    if (!token) return [];
    const out: { id: string; raw: Record<string, unknown> }[] = [];
    let after: string | null = null;
    for (let page = 0; page < 500; page += 1) {
      const { data, hasNextPage, cursor } = await fetchSamsaraPage(token, "/fleet/safety-events", after, {
        startTime: startTimeIso,
        endTime: endTimeIso,
      });
      for (const row of data) {
        const id = typeof row.id === "string" && row.id.trim().length > 0 ? row.id.trim() : null;
        if (!id) continue;
        out.push({ id, raw: row });
      }
      if (!hasNextPage || !cursor) break;
      after = cursor;
    }
    return out;
  }

  async getHosLogs(driverId: string, range: { start: string; end: string }): Promise<HosLog[]> {
    const token = this._token();
    if (!token) return [];
    const url = new URL(`${SAMSARA_API_BASE}/v1/fleet/drivers/${encodeURIComponent(driverId)}/log_edits`);
    url.searchParams.set("startMs", String(new Date(range.start).getTime()));
    url.searchParams.set("endMs", String(new Date(range.end).getTime()));
    const res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }));
    const json = await readJsonResponse(res);
    if (!res.ok) {
      throw new SamsaraApiError(`samsara_hos_log_edits_http_${res.status}`, res.status, json, res.status === 429 || res.status >= 500);
    }
    const rows = Array.isArray(json.logEdits) ? json.logEdits : Array.isArray(json.data) ? json.data : [];
    return rows.filter((row): row is HosLog => Boolean(asObject(row)));
  }

  async getDashcamClipUrl(clipId: string): Promise<string | null> {
    const token = this._token();
    if (!token || !clipId.trim()) return null;
    const url = new URL(`${SAMSARA_API_BASE}/fleet/dashcam/clips/${encodeURIComponent(clipId)}`);
    try {
      const res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }));
      if (!res.ok) return null;
      const json = await readJsonResponse(res);
      const direct = typeof json.url === "string" ? json.url : null;
      const nested = json.data && typeof json.data === "object" ? (json.data as Record<string, unknown>) : null;
      const nestedUrl = nested && typeof nested.url === "string" ? nested.url : null;
      return direct ?? nestedUrl ?? null;
    } catch {
      return null;
    }
  }

  async requestDashcamClip(input: {
    vehicleId: string;
    startAtIso: string;
    durationSec: number;
    cameraFacing: DashcamFacing;
  }): Promise<{ clipId: string; clipUrl: string | null } | null> {
    const token = this._token();
    if (!token) return null;
    const url = new URL(`${SAMSARA_API_BASE}/fleet/dashcam/clips`);
    const body = {
      vehicleId: input.vehicleId,
      startTime: input.startAtIso,
      durationSec: input.durationSec,
      cameraFacing: input.cameraFacing,
    };
    try {
      const res = await withCircuitBreaker("samsara", () =>
        fetch(url, {
          method: "POST",
          headers: { ...bearerHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      );
      if (!res.ok) return null;
      const json = await readJsonResponse(res);
      const clipId =
        (typeof json.id === "string" && json.id) ||
        (typeof (json.data as Record<string, unknown> | undefined)?.id === "string" ? String((json.data as Record<string, unknown>).id) : "");
      if (!clipId) return null;
      const clipUrl = await this.getDashcamClipUrl(clipId);
      return { clipId, clipUrl };
    } catch {
      return null;
    }
  }

  /**
   * Blueprint §5.2.3 outbound geofence: POST /addresses (Samsara Addresses API).
   * Circle radius is WF-051 250 ft, integer meters.
   */
  /**
   * ROUND 306 E-07 — GET /addresses/{externalKey:value}. Measured live 2026-10-01: an unknown external id
   * answers 404 "unable to find address id by external id"; that is returned as null, never thrown.
   */
  async findAddressByExternalId(key: string, value: string): Promise<{ id: string } | null> {
    const token = this._token();
    if (!token) throw new SamsaraApiError("samsara_not_configured", null, null, false);
    const url = new URL(`${SAMSARA_API_BASE}/addresses/${encodeURIComponent(`${key}:${value}`)}`);
    let res: Response;
    try {
      res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }));
    } catch (error) {
      throw new SamsaraApiError(`samsara_network_error:${String((error as Error)?.message ?? error)}`, null, null, true);
    }
    const json = await readJsonResponse(res);
    if (res.status === 404) return null;
    if (!res.ok) throw new SamsaraApiError(`samsara_http_${res.status}`, res.status, json, res.status === 429 || res.status >= 500);
    const nested = asObject(json.data);
    const id = json.id ?? nested?.id;
    return typeof id === "string" && id ? { id } : null;
  }

  async createAddress(input: {
    name: string;
    formattedAddress: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    geofenceId: string;
    externalIds: Ih35SamsaraExternalIds;
  }): Promise<{ id: string }> {
    const token = this._token();
    if (!token) {
      throw new SamsaraApiError("samsara_not_configured", null, null, false);
    }
    const url = new URL(`${SAMSARA_API_BASE}/addresses`);
    const body = {
      name: input.name.slice(0, 255),
      formattedAddress: input.formattedAddress.slice(0, 1024),
      latitude: input.latitude,
      longitude: input.longitude,
      geofence: {
        circle: {
          latitude: input.latitude,
          longitude: input.longitude,
          radiusMeters: Math.round(input.radiusMeters),
        },
      },
      externalIds: {
        // Kept for compatibility with addresses created before the #43 standard.
        ih35GeofenceId: input.geofenceId,
        ...buildIh35SamsaraExternalIds(input.externalIds),
      },
    };
    let res: Response;
    try {
      res = await withCircuitBreaker("samsara", () =>
        samsaraFetch(url, {
          method: "POST",
          headers: { ...bearerHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      );
    } catch (error) {
      throw new SamsaraApiError(
        `samsara_network_error:${String((error as Error)?.message ?? error)}`,
        null,
        null,
        true
      );
    }
    const json = await readJsonResponse(res);
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      throw new SamsaraApiError(`samsara_http_${res.status}`, res.status, json, retryable);
    }
    const nested = asObject(json.data);
    const idRaw = json.id ?? nested?.id;
    const id = typeof idRaw === "string" && idRaw.trim().length > 0 ? idRaw.trim() : "";
    if (!id) {
      throw new SamsaraApiError("samsara_address_missing_id", res.status, json, false);
    }
    return { id };
  }

  /** E-31 read-back: GET /fleet/routes/{id} (raw `data`; probed 2026-10-01 on route 4446734085 -> 200). */
  async getRoute(routeId: string): Promise<Record<string, unknown> | null> {
    const token = this._token();
    if (!token) throw new SamsaraApiError("samsara_not_configured", null, null, false);
    const url = new URL(`${SAMSARA_API_BASE}/fleet/routes/${encodeURIComponent(routeId)}`);
    const res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }));
    const json = await readJsonResponse(res);
    if (res.status === 404) return null;
    if (!res.ok) throw new SamsaraApiError(`samsara_http_${res.status}`, res.status, json, res.status === 429 || res.status >= 500);
    return asObject(json.data) ?? null;
  }

  /** Idempotent route delivery keyed by ih35Load; a retry patches the same Samsara route. */
  async upsertRoute(input: {
    loadId: string;
    name: string;
    unitId: string;
    driverId?: string | null;
    /** ROUND 306 E-31: Samsara's OWN ids (mirror-first). Samsara has no ih35Unit/ih35Driver external ids. */
    samsaraVehicleId: string;
    samsaraDriverId?: string | null;
    stops: SamsaraRouteStopInput[];
  }): Promise<{ id: string; created: boolean }> {
    const token = this._token();
    if (!token) throw new SamsaraApiError("samsara_not_configured", null, null, false);
    if (input.stops.length < 2) throw new SamsaraApiError("samsara_route_requires_two_stops", null, null, false);
    const externalRouteId = `ih35Load:${input.loadId}`;
    const body = {
      name: input.name.slice(0, 255),
      externalIds: buildIh35SamsaraExternalIds({ ih35Load: input.loadId }),
      // Samsara (probed 2026-10-01, HTTP 400): "Route can be assigned to a vehicle or a driver, but not both."
      // Assign the TRUCK: the unit->vehicle map is one-to-one, a driver can hold several Samsara accounts, and
      // whoever is logged into that vehicle sees the route.
      vehicleId: input.samsaraVehicleId,
      settings: {
        routeStartingCondition: "departFirstStop",
        routeCompletionCondition: "arriveLastStop",
        sequencingMethod: "manual",
      },
      stops: input.stops.map((stop, index) => {
        // Samsara (probed 2026-10-01, HTTP 400): "scheduledArrival for first stop should not be set if
        // routeStartingCondition is departFirstStop" -- the route starts when the truck LEAVES stop 1, so stop 1
        // carries a departure time only (its own, else its scheduled arrival -- the pickup appointment).
        const first = index === 0;
        const departure = first ? stop.scheduledDepartureTime ?? stop.scheduledArrivalTime : stop.scheduledDepartureTime;
        return {
        externalIds: buildIh35SamsaraExternalIds(stop.externalIds),
        ...(stop.addressId ? { addressId: stop.addressId } : {}),
        ...(stop.singleUseLocation ? { singleUseLocation: stop.singleUseLocation } : {}),
        sequenceNumber: index + 1,
        ...(!first && stop.scheduledArrivalTime ? { scheduledArrivalTime: stop.scheduledArrivalTime } : {}),
        ...(departure ? { scheduledDepartureTime: departure } : {}),
        ...(stop.notes ? { notes: stop.notes.slice(0, 2000) } : {}),
        };
      }),
    };

    const existingUrl = new URL(`${SAMSARA_API_BASE}/fleet/routes/${encodeURIComponent(externalRouteId)}`);
    const existing = await withCircuitBreaker("samsara", () => samsaraFetch(existingUrl, { headers: bearerHeaders(token) }));
    const created = existing.status === 404;
    if (!created && !existing.ok) {
      const errorBody = await readJsonResponse(existing);
      throw new SamsaraApiError(`samsara_http_${existing.status}`, existing.status, errorBody, existing.status === 429 || existing.status >= 500);
    }
    const url = created ? new URL(`${SAMSARA_API_BASE}/fleet/routes`) : existingUrl;
    const res = await withCircuitBreaker("samsara", () => samsaraFetch(url, {
      method: created ? "POST" : "PATCH",
      headers: { ...bearerHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
    const json = await readJsonResponse(res);
    if (!res.ok) throw new SamsaraApiError(`samsara_http_${res.status}`, res.status, json, res.status === 429 || res.status >= 500);
    const nested = asObject(json.data);
    const idRaw = json.id ?? nested?.id;
    const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : "";
    if (!id) throw new SamsaraApiError("samsara_route_missing_id", res.status, json, false);
    return { id, created };
  }
}
