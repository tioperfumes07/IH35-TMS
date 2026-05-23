import { describe, expect, it, vi } from "vitest";
import { computeProgressStatus } from "../load-progress.service.js";

describe("load progress unknown status behavior", () => {
  it("returns unknown when no unit gps payload exists", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM mdata.load_stops")) {
          return {
            rows: [
              {
                stop_id: "11111111-1111-1111-1111-111111111111",
                scheduled_arrival_at: "2026-05-23T20:00:00.000Z",
                latitude: 30.2672,
                longitude: -97.7431,
              },
            ],
          };
        }
        if (sql.includes("FROM integrations.samsara_vehicles")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const result = await computeProgressStatus(client, {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      load_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      assigned_unit_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    });

    expect(result.progress_status).toBe("unknown");
    expect(result.eta_delta_minutes).toBeNull();
  });
});
