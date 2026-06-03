/**
 * Samsara REST client. Uses api.samsara.com when a token is available
 * (configured row, SAMSARA_API_TOKEN, or SAMSARA_API_KEY); otherwise list APIs no-op to [].
 * @packageDocumentation
 */

export type SamsaraConfig = {
  apiToken: string | null;
  samsaraOrgId: string | null;
};

export type SamsaraDriver = { id: string; raw: Record<string, unknown> };
export type SamsaraVehicle = { id: string; raw: Record<string, unknown> };
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
    res = await fetch(url, { headers: bearerHeaders(token) });
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

async function fetchSamsaraPage(token: string, endpoint: "/fleet/drivers" | "/fleet/vehicles", after: string | null): Promise<{
  data: Record<string, unknown>[];
  hasNextPage: boolean;
  cursor: string | null;
}> {
  const url = new URL(`${SAMSARA_API_BASE}${endpoint}`);
  url.searchParams.set("limit", "512");
  if (after) url.searchParams.set("after", after);
  let res: Response;
  try {
    res = await fetch(url, { headers: bearerHeaders(token) });
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
      const res = await fetch(url, { headers: bearerHeaders(token) });
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
      const res = await fetch(url, { headers: bearerHeaders(token) });
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
      const res = await fetch(url, {
        method: "POST",
        headers: { ...bearerHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
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
