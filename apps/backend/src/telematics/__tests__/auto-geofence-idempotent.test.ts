import { describe, expect, it, vi } from "vitest";
import { autoCreateGeofencesForLoadWithClient } from "../auto-geofence.service.js";

describe("auto geofence idempotency", () => {
  it("creates geofences once and skips duplicates on replay", async () => {
    const existingByAddress = new Set<string>();
    let inserts = 0;

    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
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
        if (sql.includes("FROM geo.geofences g")) {
          const normalizedAddress = String(params[2] ?? "");
          return { rows: existingByAddress.has(normalizedAddress) ? [{ id: "existing-id" }] : [] };
        }
        if (sql.includes("INSERT INTO geo.geofences")) {
          existingByAddress.add(String(params[1]).toLowerCase());
          inserts += 1;
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const input = {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      load_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    };

    await autoCreateGeofencesForLoadWithClient(client, "33333333-3333-4333-8333-333333333333", input);
    await autoCreateGeofencesForLoadWithClient(client, "33333333-3333-4333-8333-333333333333", input);

    expect(inserts).toBe(1);
  });
});
