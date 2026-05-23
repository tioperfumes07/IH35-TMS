import { describe, expect, it, vi } from "vitest";
import { getDriverForVehicleAtTime, processVehicleDriverPairingWebhookEvent } from "../vehicle-driver-lookup.service.js";

describe("vehicle-driver pairing tenant isolation", () => {
  it("scopes lookup and writes by operating_company_id", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes("FROM mdata.equipment e")) {
          return { rows: [{ unit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }] };
        }
        if (sql.includes("FROM mdata.drivers d")) {
          return { rows: [{ driver_id: "cccccccc-cccc-cccc-cccc-cccccccccccc" }] };
        }
        if (sql.includes("FROM telematics.vehicle_driver_assignments")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    await processVehicleDriverPairingWebhookEvent(client, {
      id: "11111111-1111-1111-1111-111111111111",
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      event_type: "vehicle_assigned",
      received_at: "2026-05-23T20:00:00.000Z",
      payload: {
        vehicleId: "veh-1",
        driverId: "drv-1",
        occurredAt: "2026-05-23T20:00:00.000Z",
      },
    });

    const unitLookup = calls.find((entry) => entry.sql.includes("FROM mdata.equipment e"));
    expect(unitLookup?.params[0]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    await getDriverForVehicleAtTime(
      client,
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "2026-05-23T20:30:00.000Z"
    );
    const lookup = calls.find((entry) => entry.sql.includes("FROM telematics.vehicle_driver_assignments"));
    expect(lookup?.sql).toContain("operating_company_id = $1::uuid");
  });
});
