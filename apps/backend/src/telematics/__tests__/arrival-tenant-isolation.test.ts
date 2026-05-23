import { describe, expect, it, vi } from "vitest";
import { processArrivalDetectionsForGpsPoint } from "../arrival-detection.service.js";

describe("arrival detector tenant isolation", () => {
  it("uses operating_company_id filters in reads and writes", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes("FROM mdata.loads l")) {
          return {
            rows: [
              {
                stop_id: "11111111-1111-1111-1111-111111111111",
                stop_label: "Test Stop",
                latitude: 30.2672,
                longitude: -97.7431,
              },
            ],
          };
        }
        if (sql.includes("FROM telematics.vehicle_driver_assignments")) {
          return { rows: [{ driver_id: "cccccccc-cccc-cccc-cccc-cccccccccccc" }] };
        }
        if (sql.includes("FROM dispatch.stop_arrivals")) {
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO dispatch.stop_arrivals")) {
          return { rows: [{ id: "dddddddd-dddd-dddd-dddd-dddddddddddd" }] };
        }
        return { rows: [] };
      }),
    };

    await processArrivalDetectionsForGpsPoint(client, {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      unit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      latitude: 30.2672,
      longitude: -97.7431,
      occurred_at: "2026-05-23T20:00:00.000Z",
    });

    const loadQuery = calls.find((entry) => entry.sql.includes("FROM mdata.loads l"));
    expect(loadQuery?.sql).toContain("l.operating_company_id = $1::uuid");
    expect(loadQuery?.params[0]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    const insertQuery = calls.find((entry) => entry.sql.includes("INSERT INTO dispatch.stop_arrivals"));
    expect(insertQuery?.params[0]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });
});
