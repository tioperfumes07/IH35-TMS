/**
 * Samsara REST client. Uses api.samsara.com when a token is available
 * (configured row, SAMSARA_API_TOKEN, or SAMSARA_API_KEY); otherwise list APIs no-op to [].
 * @packageDocumentation
 */

import { withCircuitBreaker } from "../../lib/circuit-breaker/index.js";

export type SamsaraConfig = {
  apiToken: string | null;
  samsaraOrgId: string | null;
};

export type SamsaraDriver = { id: string; raw: Record<string, unknown> };
export type SamsaraVehicle = { id: string; raw: Record<string, unknown> };
export type SamsaraTrailer = { id: string; raw: Record<string, unknown> };
export type SamsaraHosLog = { startedAt: string; endedAt: string | null; hosStatusType: string };
export type SamsaraHosDriverLogs = { driverId: string; logs: SamsaraHosLog[] };
export type SamsaraVehicleLocation = {
  id: string;
  latitude: number;
  longitude: number;
  captured_at: string;
  speed_mph: number | null;
  heading_deg: number | null;
  engine_on: boolean | null;
  raw: Record<string, unknown>;
};
// /fleet/vehicles/stats?types=gps,driverAssignments — one call gives the latest GPS fix
// (incl. reverseGeo.formattedLocation -> city/state) AND the current driver assignment per vehicle.
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
  current_driver: { samsara_driver_id: string; started_at: string; ended_at: string | null } | null;
  raw: Record<string, unknown>;
};
export type HosLog = Record<string, unknown>;
export type SamsaraRemoteEntityType = "drivers" | "vehicles";
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

function parseVehicleLocationRow(row: Record<string, unknown>): SamsaraVehicleLocation | null {
  const id = typeof row.id === "string" && row.id.trim().length > 0 ? row.id.trim() : null;
  if (!id) return null;

  const locationCandidates = [
    asObject(row.location),
    asObject(row.gps),
    asObject(row.position),
  ].filter((v): v is Record<string, unknown> => Boolean(v));

  for (const location of locationCandidates) {
    const latRaw = location.latitude ?? location.lat;
    const lngRaw = location.longitude ?? location.lng ?? location.lon;
    const latitude = Number(latRaw);
    const longitude = Number(lngRaw);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const timeRaw =
      location.time ??
      location.timestamp ??
      location.recorded_at ??
      location.recordedAt ??
      location.occurred_at ??
      row.time ??
      row.timestamp;
    const captured_at =
      typeof timeRaw === "string" && timeRaw.trim().length > 0
        ? new Date(timeRaw).toISOString()
        : new Date().toISOString();

    const speedCandidates = [location.speed_mph, location.speedMph, location.speed];
    let speed_mph: number | null = null;
    for (const raw of speedCandidates) {
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 0) {
        speed_mph = value;
        break;
      }
    }

    const headingCandidates = [location.heading_deg, location.heading, location.bearing];
    let heading_deg: number | null = null;
    for (const raw of headingCandidates) {
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      heading_deg = Number((((value % 360) + 360) % 360).toFixed(2));
      break;
    }

    const engineRaw = row.engine_on ?? row.engineOn ?? row.is_engine_on ?? asObject(row.engine)?.on;
    let engine_on: boolean | null = null;
    if (typeof engineRaw === "boolean") engine_on = engineRaw;
    else if (typeof engineRaw === "string") {
      const lowered = engineRaw.toLowerCase();
      if (lowered === "on" || lowered === "true") engine_on = true;
      if (lowered === "off" || lowered === "false") engine_on = false;
    }

    return {
      id,
      latitude,
      longitude,
      captured_at,
      speed_mph,
      heading_deg,
      engine_on,
      raw: row,
    };
  }

  return null;
}

async function fetchSamsaraLocationsPage(token: string, after: string | null): Promise<{
  data: SamsaraVehicleLocation[];
  hasNextPage: boolean;
  cursor: string | null;
}> {
  const url = new URL(`${SAMSARA_API_BASE}/fleet/vehicles/locations`);
  url.searchParams.set("limit", "512");
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
    .map((row) => parseVehicleLocationRow(row))
    .filter((row): row is SamsaraVehicleLocation => Boolean(row));
  const { hasNextPage, cursor } = parsePagination(json);
  return { data, hasNextPage, cursor };
}

// Best-effort city/state from a Samsara reverseGeo.formattedLocation string. Samsara documents only the
// flat formattedLocation string (e.g. "1200 San Bernardo Ave, Laredo, TX"), so parse from the right:
// the last "XX"-looking token is the state, the segment before it is the city. Returns nulls if unsure.
function parseCityState(formatted: string | null): { city: string | null; state: string | null } {
  if (!formatted) return { city: null, state: null };
  const parts = formatted.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length === 0) return { city: null, state: null };
  // Last part may be "TX" or "TX 78040" (or a country). Pull a 2-letter US state code if present.
  const last = parts[parts.length - 1];
  const stateMatch = last.match(/\b([A-Z]{2})\b/);
  const state = stateMatch ? stateMatch[1] : null;
  let city: string | null = null;
  if (state && parts.length >= 2) city = parts[parts.length - 2] || null;
  else if (!state && parts.length >= 2) city = parts[parts.length - 2] || null;
  return { city, state };
}

function parseVehicleStatRow(row: Record<string, unknown>): SamsaraVehicleStat | null {
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

  return { id, latitude, longitude, captured_at, speed_mph, heading_deg, formatted_location, city, state, engine_state, current_driver, raw: row };
}

async function fetchSamsaraStatsPage(token: string, after: string | null): Promise<{
  data: SamsaraVehicleStat[];
  hasNextPage: boolean;
  cursor: string | null;
}> {
  const url = new URL(`${SAMSARA_API_BASE}/fleet/vehicles/stats`);
  // VALID stats types only. driverAssignments is NOT a valid /fleet/vehicles/stats type — including it
  // 400s the whole request (the bug that left city/state blank). Driver login lives on the separate
  // /fleet/vehicles/driver-assignments feed (the pairing worker), not here.
  url.searchParams.set("types", "gps,engineStates");
  if (after) url.searchParams.set("after", after);
  let res: Response;
  try {
    res = await withCircuitBreaker("samsara", () => samsaraFetch(url, { headers: bearerHeaders(token) }));
  } catch (error) {
    throw new SamsaraApiError(`samsara_network_error:${String((error as Error)?.message ?? error)}`, null, null, true);
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
    .map((row) => parseVehicleStatRow(row))
    .filter((row): row is SamsaraVehicleStat => Boolean(row));
  const { hasNextPage, cursor } = parsePagination(json);
  return { data, hasNextPage, cursor };
}

async function fetchSamsaraPage(token: string, endpoint: "/fleet/drivers" | "/fleet/vehicles" | "/fleet/trailers", after: string | null): Promise<{
  data: Record<string, unknown>[];
  hasNextPage: boolean;
  cursor: string | null;
}> {
  const url = new URL(`${SAMSARA_API_BASE}${endpoint}`);
  url.searchParams.set("limit", "512");
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

  /** GET /fleet/vehicles/stats?types=gps,driverAssignments — latest GPS (with reverseGeo city/state)
   *  plus the current driver assignment per vehicle, in one call. Defensive parse; never throws on shape. */
  async listVehicleStats(): Promise<SamsaraVehicleStat[]> {
    const token = this._token();
    if (!token) return [];
    const out: SamsaraVehicleStat[] = [];
    let after: string | null = null;
    for (let page = 0; page < 50; page += 1) {
      const { data, hasNextPage, cursor } = await fetchSamsaraStatsPage(token, after);
      out.push(...data);
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
    const endpoint: "/fleet/drivers" | "/fleet/vehicles" = entityType === "drivers" ? "/fleet/drivers" : "/fleet/vehicles";
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

  async getHosLogs(_driverId: string, _range: { start: string; end: string }): Promise<HosLog[]> {
    void _driverId;
    void _range;
    const token = this._token();
    if (!token) return [];
    return [];
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
}
