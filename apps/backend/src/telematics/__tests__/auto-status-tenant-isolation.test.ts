import { describe, expect, it, vi } from "vitest";
import { processAutoStatusSuggestionForVehicleEvent } from "../auto-status.service.js";

describe("auto status tenant isolation", () => {
  it("keeps all reads and writes scoped by operating_company_id", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes("FROM mdata.loads l")) {
          return { rows: [{ load_id: "l1", current_status: "assigned", driver_id: null, next_stop_type: "pickup" }] };
        }
        if (sql.includes("FROM geo.geofence_events ge")) {
          return { rows: [{ event_kind: "entered", occurred_at: new Date().toISOString() }] };
        }
        return { rows: [] };
      }),
    };

    await processAutoStatusSuggestionForVehicleEvent(client, {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      unit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      occurred_at: new Date().toISOString(),
      speed_mph: 20,
      engine_on: true,
    });

    const loadQuery = calls.find((c) => c.sql.includes("FROM mdata.loads l"));
    expect(loadQuery?.params[0]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    const insert = calls.find((c) => c.sql.includes("INSERT INTO dispatch.auto_status_suggestions"));
    expect(insert?.params[0]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });
});
