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
export type HosLog = Record<string, unknown>;

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
        const url = new URL(`${SAMSARA_API_BASE}/fleet/drivers`);
        url.searchParams.set("limit", "512");
        if (after) url.searchParams.set("after", after);
        const res = await fetch(url, { headers: bearerHeaders(token) });
        if (!res.ok) break;
        const json = await readJsonResponse(res);
        const data = Array.isArray(json.data) ? json.data : [];
        for (const row of data) {
          if (row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string") {
            out.push({ id: String((row as { id: string }).id), raw: row as Record<string, unknown> });
          }
        }
        const pagination = json.pagination as { endCursor?: string; hasNextPage?: boolean } | undefined;
        if (pagination?.hasNextPage && pagination.endCursor) after = pagination.endCursor;
        else if (typeof json.after === "string") after = json.after;
        else break;
      }
    } catch {
      return [];
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
        const url = new URL(`${SAMSARA_API_BASE}/fleet/vehicles`);
        url.searchParams.set("limit", "512");
        if (after) url.searchParams.set("after", String(after));
        const res = await fetch(url, { headers: bearerHeaders(token) });
        if (!res.ok) break;
        const json = await readJsonResponse(res);
        const data = Array.isArray(json.data) ? json.data : [];
        for (const row of data) {
          if (row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string") {
            out.push({ id: String((row as { id: string }).id), raw: row as Record<string, unknown> });
          }
        }
        const pagination = json.pagination as { endCursor?: string; hasNextPage?: boolean } | undefined;
        if (pagination?.hasNextPage && pagination.endCursor) after = pagination.endCursor;
        else break;
      }
    } catch {
      return [];
    }
    return out;
  }

  async getHosLogs(_driverId: string, _range: { start: string; end: string }): Promise<HosLog[]> {
    void _driverId;
    void _range;
    const token = this._token();
    if (!token) return [];
    return [];
  }
}
