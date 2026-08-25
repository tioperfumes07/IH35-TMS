import { beforeEach, describe, expect, it, vi } from "vitest";

const createAddress = vi.fn();
const getSamsaraConfigForCompany = vi.fn();
const decryptSamsaraSecret = vi.fn();
const appendCrudAudit = vi.fn();

vi.mock("../../../integrations/samsara/samsara-client.js", () => ({
  SamsaraApiError: class SamsaraApiError extends Error {
    retryable: boolean;
    constructor(message: string, _status: number | null, _body: unknown, retryable: boolean) {
      super(message);
      this.retryable = retryable;
    }
  },
  SamsaraClient: class {
    createAddress = (...args: unknown[]) => createAddress(...args);
  },
}));

vi.mock("../../../integrations/samsara/samsara.service.js", () => ({
  getSamsaraConfigForCompany: (...args: unknown[]) => getSamsaraConfigForCompany(...args),
  rowIsConfigured: (row: unknown) => Boolean(row),
}));

vi.mock("../../../lib/samsara-crypto.js", () => ({
  decryptSamsaraSecret: (...args: unknown[]) => decryptSamsaraSecret(...args),
}));

vi.mock("../../../audit/crud-audit.js", () => ({
  appendCrudAudit: (...args: unknown[]) => appendCrudAudit(...args),
}));

const OPCO = "aaaaaaaa-aaaa-aaaa-4aaa-aaaaaaaaaaaa";
const GEOFENCE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACTOR = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("SamsaraCreateGeofenceHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    decryptSamsaraSecret.mockReturnValue("token");
    getSamsaraConfigForCompany.mockResolvedValue({
      is_enabled: true,
      encrypted_api_token: Buffer.from("enc"),
      samsara_org_id: "org",
    });
    createAddress.mockResolvedValue({ id: "samsara-addr-1" });
    appendCrudAudit.mockResolvedValue(undefined);
  });

  it("POSTs WF-051 radius address when Samsara is configured", async () => {
    const { SamsaraCreateGeofenceHandler } = await import("../samsara-create-geofence.handler.js");
    const handler = new SamsaraCreateGeofenceHandler();
    const result = await handler.deliver(
      {
        operating_company_id: OPCO,
        geofence_id: GEOFENCE,
        latitude: 27.5,
        longitude: -99.5,
        formatted_address: "Laredo, TX",
        label: "Laredo, TX",
        actor_user_id: ACTOR,
      },
      { client: { query: vi.fn() } as never, eventId: "e1", instanceId: "t", log: () => {} }
    );
    expect(result?.message).toBe("samsara_geofence_created:samsara-addr-1");
    expect(createAddress).toHaveBeenCalledWith(
      expect.objectContaining({
        geofenceId: GEOFENCE,
        latitude: 27.5,
        longitude: -99.5,
        radiusMeters: 76,
      })
    );
    expect(appendCrudAudit).toHaveBeenCalled();
  });

  it("skips when Samsara is not configured", async () => {
    getSamsaraConfigForCompany.mockResolvedValue(null);
    const { SamsaraCreateGeofenceHandler } = await import("../samsara-create-geofence.handler.js");
    const handler = new SamsaraCreateGeofenceHandler();
    const result = await handler.deliver(
      {
        operating_company_id: OPCO,
        geofence_id: GEOFENCE,
        latitude: 27.5,
        longitude: -99.5,
        formatted_address: "Laredo, TX",
        label: "Laredo, TX",
      },
      { client: { query: vi.fn() } as never, eventId: "e2", instanceId: "t", log: () => {} }
    );
    expect(result?.message).toBe("samsara_not_configured");
    expect(createAddress).not.toHaveBeenCalled();
  });
});
