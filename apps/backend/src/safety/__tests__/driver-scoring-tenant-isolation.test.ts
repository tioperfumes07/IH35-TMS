import { describe, expect, it, vi } from "vitest";
import { processHarshEventsFromVehiclePayload } from "../harsh-events-ingestion.service.js";

describe("driver scoring tenant isolation", () => {
  it("inserts harsh events with tenant-scoped keys", async () => {
    const calls: Array<{ sql: string; values: unknown[] | undefined }> = [];
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes("FROM telematics.vehicle_driver_assignments")) return { rows: [], rowCount: 0 };
        if (sql.includes("INSERT INTO safety.harsh_events")) return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
    };

    await processHarshEventsFromVehiclePayload(client as never, {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      unit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      event_at: "2026-05-24T00:00:00.000Z",
      samsara_event_id: "evt-tenant",
      payload: {
        harsh_events: [{ id: "evt-tenant", type: "speeding", severity: "critical" }],
      },
    });

    const insert = calls.find((entry) => entry.sql.includes("INSERT INTO safety.harsh_events"));
    expect(insert?.sql).toContain("operating_company_id");
    expect(insert?.values?.[0]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(insert?.values?.[1]).toBe("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
  });
});
