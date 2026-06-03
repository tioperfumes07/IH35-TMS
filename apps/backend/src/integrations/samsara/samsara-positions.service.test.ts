import { beforeEach, describe, expect, it, vi } from "vitest";
import { SamsaraApiError } from "./samsara-client.js";

const listVehicleLocationsMock = vi.fn();
const ingestVehicleLocationEventMock = vi.fn();
const getSamsaraConfigForCompanyMock = vi.fn();
const decryptSamsaraSecretMock = vi.fn();

vi.mock("./samsara-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./samsara-client.js")>();
  return {
    ...actual,
    SamsaraClient: vi.fn().mockImplementation(() => ({
      listVehicleLocations: listVehicleLocationsMock,
    })),
  };
});

vi.mock("../../telematics/vehicle-locations.service.js", () => ({
  deriveEngineState: () => "on",
  ingestVehicleLocationEvent: ingestVehicleLocationEventMock,
}));

vi.mock("./samsara.service.js", () => ({
  getSamsaraConfigForCompany: getSamsaraConfigForCompanyMock,
}));

vi.mock("../../lib/samsara-crypto.js", () => ({
  decryptSamsaraSecret: decryptSamsaraSecretMock,
}));

describe("syncSamsaraVehicleLocations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    decryptSamsaraSecretMock.mockReturnValue("token");
    ingestVehicleLocationEventMock.mockResolvedValue(true);
    getSamsaraConfigForCompanyMock.mockResolvedValue({
      is_enabled: true,
      samsara_org_id: "org-1",
      encrypted_api_token: Buffer.from("enc"),
    });
  });

  it("upserts position with correct operating_company_id and unit mapping", async () => {
    const { syncSamsaraVehicleLocations } = await import("./samsara-positions.service.js");
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("integration_sync_log")) return { rows: [{ ok: false }] };
        if (sql.includes("FROM integrations.samsara_vehicles")) {
          return { rows: [{ samsara_vehicle_id: "veh-1", unit_id: "unit-1" }] };
        }
        if (sql.includes("FROM mdata.units")) return { rows: [] };
        return { rows: [] };
      }),
    };

    listVehicleLocationsMock.mockResolvedValue([
      {
        id: "veh-1",
        latitude: 30.1,
        longitude: -97.7,
        captured_at: "2026-06-02T12:00:00.000Z",
        speed_mph: 55,
        heading_deg: 180,
        engine_on: true,
        raw: { id: "veh-1" },
      },
    ]);

    const stats = await syncSamsaraVehicleLocations(client as never, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(stats.inserted).toBe(1);
    expect(ingestVehicleLocationEventMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        unit_id: "unit-1",
        samsara_vehicle_id: "veh-1",
      })
    );
  });

  it("returns errors without throwing when Samsara responds 401", async () => {
    const { syncSamsaraVehicleLocations } = await import("./samsara-positions.service.js");
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
        if (sql.includes("INSERT INTO integrations.integration_sync_log")) return { rows: [] };
        return { rows: [] };
      }),
    };

    listVehicleLocationsMock.mockRejectedValue(new SamsaraApiError("samsara_http_401", 401, null, false));
    const stats = await syncSamsaraVehicleLocations(client as never, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(stats.errors.join(" ")).toContain("401");
    expect(stats.inserted).toBe(0);
  });
});
