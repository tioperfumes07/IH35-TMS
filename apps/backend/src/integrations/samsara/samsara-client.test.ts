import { afterEach, describe, expect, it, vi } from "vitest";
import { parseVehicleStatRow, SamsaraApiError, SamsaraClient } from "./samsara-client.js";

const originalFetch = globalThis.fetch;

describe("SamsaraClient count methods", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("counts drivers across paginated responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "d1" }, { id: "d2" }],
            pagination: { hasNextPage: true, endCursor: "c2" },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "d3" }],
            pagination: { hasNextPage: false },
          }),
          { status: 200 }
        )
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new SamsaraClient({ apiToken: "token", samsaraOrgId: "org-1" });
    const count = await client.countDrivers();

    expect(count).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/fleet/drivers");
  });

  it("throws SamsaraApiError on 429", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "rate limited" }), { status: 429 })
    ) as unknown as typeof fetch;

    const client = new SamsaraClient({ apiToken: "token", samsaraOrgId: "org-1" });

    try {
      await client.countVehicles();
      throw new Error("expected countVehicles to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SamsaraApiError);
      expect(error).toMatchObject({ statusCode: 429 });
    }
  });
});

describe("parseVehicleStatRow odometer (FINISH-OPS #7)", () => {
  it("converts obdOdometerMeters (meters) to miles", () => {
    const stat = parseVehicleStatRow({ id: "veh1", obdOdometerMeters: { value: 1_609_340, time: "2026-06-21T00:00:00Z" } });
    expect(stat).not.toBeNull();
    // 1,609,340 m = 1000 mi (1 mi = 1609.34 m)
    expect(stat?.odometer_mi).toBe(1000);
  });

  it("falls back to gatewayOdometerMeters when obd is absent", () => {
    const stat = parseVehicleStatRow({ id: "veh2", gatewayOdometerMeters: { value: 804_670 } });
    expect(stat?.odometer_mi).toBe(500);
  });

  it("is null when no odometer stat present", () => {
    const stat = parseVehicleStatRow({ id: "veh3", gps: { latitude: 27.5, longitude: -99.5 } });
    expect(stat?.odometer_mi).toBeNull();
  });

  it("is null for a negative/invalid odometer value", () => {
    const stat = parseVehicleStatRow({ id: "veh4", obdOdometerMeters: { value: -5 } });
    expect(stat?.odometer_mi).toBeNull();
  });
});
