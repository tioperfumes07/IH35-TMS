/**
 * Post-MVP: replace stub with HTTP client wired to Samsara REST API.
 * @packageDocumentation
 */

export type SamsaraConfig = {
  apiToken: string | null;
  samsaraOrgId: string | null;
};

export type SamsaraDriver = { id: string; raw: Record<string, unknown> };
export type SamsaraVehicle = { id: string; raw: Record<string, unknown> };
export type HosLog = Record<string, unknown>;

export class SamsaraClient {
  constructor(private readonly _config: SamsaraConfig) {}

  // TODO(post-mvp-samsara): call Samsara /fleet/vehicles or org endpoint to validate token
  async testConnection(): Promise<{ ok: boolean; org_id?: string; error?: string }> {
    void this._config;
    throw new Error("SamsaraNotConfigured: post-MVP");
  }

  // TODO(post-mvp-samsara): GET /fleet/drivers (paginated)
  async listDrivers(): Promise<SamsaraDriver[]> {
    throw new Error("SamsaraNotConfigured: post-MVP");
  }

  // TODO(post-mvp-samsara): GET /fleet/vehicles (paginated)
  async listVehicles(): Promise<SamsaraVehicle[]> {
    throw new Error("SamsaraNotConfigured: post-MVP");
  }

  // TODO(post-mvp-samsara): GET HOS logs for driver + time range
  async getHosLogs(_driverId: string, _range: { start: string; end: string }): Promise<HosLog[]> {
    throw new Error("SamsaraNotConfigured: post-MVP");
  }
}
