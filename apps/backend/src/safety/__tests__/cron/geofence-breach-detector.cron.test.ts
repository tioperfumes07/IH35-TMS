import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertTenantContextMock, withLuciaBypassMock } = vi.hoisted(() => ({
  assertTenantContextMock: vi.fn(),
  withLuciaBypassMock: vi.fn(),
}));

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: withLuciaBypassMock,
}));

vi.mock("../../../cron/_helpers/tenant-context-guard.js", () => ({
  assertTenantContext: assertTenantContextMock,
}));

describe("geofence breach cron tick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asserts tenant context, advances watermark, and dedups within 5 minutes", async () => {
    const { runGeofenceBreachDetectionTick } = await import("../../../cron/geofence-breach-detector.cron.js");
    const inserts: string[] = [];
    const outbox: string[] = [];
    let dedupChecks = 0;

    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        if (sql.includes("SELECT set_config('app.operating_company_id'")) return { rows: [], rowCount: 1 };
        if (sql.includes("FROM geo.geofences")) {
          return {
            rows: [
              {
                geofence_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                customer_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                vertices_json: [
                  { lat: 1, lng: -1 },
                  { lat: 1, lng: 1 },
                  { lat: -1, lng: 1 },
                  { lat: -1, lng: -1 },
                ],
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes("WITH recent AS")) {
          return {
            rows: [
              {
                vehicle_id: "11111111-1111-1111-1111-111111111111",
                captured_at: "2026-05-24T10:00:00.000Z",
                position_lat: 0,
                position_lng: 0,
                previous_lat: 2,
                previous_lng: 2,
              },
              {
                vehicle_id: "11111111-1111-1111-1111-111111111111",
                captured_at: "2026-05-24T10:03:00.000Z",
                position_lat: 0.1,
                position_lng: 0.1,
                previous_lat: 2,
                previous_lng: 2,
              },
            ],
            rowCount: 2,
          };
        }
        if (sql.includes("FROM safety.geofence_breach_events") && sql.includes("AND event_at >=")) {
          dedupChecks += 1;
          if (dedupChecks === 1) return { rows: [], rowCount: 0 };
          return { rows: [{ id: "existing-event" }], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO safety.geofence_breach_events")) {
          const eventType = String(values?.[4] ?? "");
          inserts.push(eventType);
          return { rows: [{ id: "new-event-id" }], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO outbox.events")) {
          outbox.push(String(values?.[0] ?? ""));
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    const stats = await runGeofenceBreachDetectionTick(
      client as never,
      "99999999-9999-9999-9999-999999999999",
      "2026-05-24T09:55:00.000Z",
      "2026-05-24T10:10:00.000Z"
    );

    expect(assertTenantContextMock).toHaveBeenCalledWith("99999999-9999-9999-9999-999999999999", "safety.geofence_breach_cron");
    expect(stats.next_watermark).toBe("2026-05-24T10:03:00.000Z");
    expect(stats.events_inserted).toBe(1);
    expect(stats.dedup_skipped).toBe(1);
    expect(inserts).toEqual(["entry"]);
    expect(outbox).toEqual(["geofence_breach_detected"]);
  });
});
