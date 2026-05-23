import { describe, expect, it, vi } from "vitest";
import { autoCreateGeofencesForLoadWithClient } from "../auto-geofence.service.js";

describe("auto geofence tenant isolation", () => {
  it("scopes reads and writes by operating_company_id", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes("FROM mdata.load_stops s")) {
          return {
            rows: [
              {
                stop_id: "11111111-1111-1111-1111-111111111111",
                location_id: null,
                address_line1: "100 Main St",
                city: "Austin",
                state: "TX",
                country: "US",
                latitude: 30.2672,
                longitude: -97.7431,
                customer_id: "22222222-2222-2222-2222-222222222222",
                customer_name: "ACME",
              },
            ],
          };
        }
        if (sql.includes("FROM geo.geofences g")) return { rows: [] };
        if (sql.includes("INSERT INTO geo.geofences")) return { rows: [] };
        return { rows: [] };
      }),
    };

    await autoCreateGeofencesForLoadWithClient(client, "33333333-3333-4333-8333-333333333333", {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      load_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    });

    const readStops = calls.find((call) => call.sql.includes("FROM mdata.load_stops s"));
    expect(readStops?.params[0]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    const insert = calls.find((call) => call.sql.includes("INSERT INTO geo.geofences"));
    expect(insert?.params[0]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });
});
