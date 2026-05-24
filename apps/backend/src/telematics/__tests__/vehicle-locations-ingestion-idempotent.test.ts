import { describe, expect, it, vi } from "vitest";
import { ingestVehicleLocationEvent } from "../vehicle-locations.service.js";

describe("vehicle location ingestion idempotency", () => {
  it("returns false when duplicate raw event is ignored", async () => {
    let calls = 0;
    const client = {
      query: vi.fn(async () => {
        calls += 1;
        return { rows: [], rowCount: calls === 1 ? 1 : 0 };
      }),
    };

    const payload = {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      unit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      samsara_vehicle_id: "sv-1",
      captured_at: "2026-05-24T00:00:00.000Z",
      lat: 30.2672,
      lng: -97.7431,
      speed_mph: 55,
      heading_deg: 180,
      engine_state: "on" as const,
      raw_samsara_event_id: "sam-evt-1",
      payload: { id: "sam-evt-1" },
    };
    expect(await ingestVehicleLocationEvent(client as never, payload)).toBe(true);
    expect(await ingestVehicleLocationEvent(client as never, payload)).toBe(false);
  });
});
