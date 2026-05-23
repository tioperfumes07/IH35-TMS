import { describe, expect, it, vi } from "vitest";
import { processHarshEventsFromVehiclePayload } from "../harsh-events-ingestion.service.js";

describe("harsh event ingestion idempotency", () => {
  it("returns inserted count and skips duplicates on conflict", async () => {
    let insertAttempts = 0;
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM telematics.vehicle_driver_assignments")) return { rows: [] };
        if (sql.includes("INSERT INTO safety.harsh_events")) {
          insertAttempts += 1;
          return { rows: [], rowCount: insertAttempts === 1 ? 1 : 0 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    const payload = {
      harsh_events: [{ id: "evt-1", type: "harsh_brake", severity: "major", speed_mph: 63 }],
    };

    const first = await processHarshEventsFromVehiclePayload(client as never, {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      unit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      event_at: "2026-05-24T00:00:00.000Z",
      samsara_event_id: "evt-1",
      payload,
    });
    const second = await processHarshEventsFromVehiclePayload(client as never, {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      unit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      event_at: "2026-05-24T00:00:00.000Z",
      samsara_event_id: "evt-1",
      payload,
    });

    expect(first).toBe(1);
    expect(second).toBe(0);
  });
});
