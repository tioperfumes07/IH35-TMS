import { describe, expect, it } from "vitest";
import { classifySegmentKind, recordCompletedLoadLeg } from "../real-driven-miles.service.js";

describe("Samsara real driven miles per load leg", () => {
  it("classifies operational legs without folding detours into planned mileage", () => {
    expect(classifySegmentKind("pickup", "delivery")).toBe("loaded");
    expect(classifySegmentKind("delivery", "pickup")).toBe("deadhead_to_pickup");
    expect(classifySegmentKind("delivery", "rest")).toBe("empty_home");
    expect(classifySegmentKind("pickup", "fuel")).toBe("fuel_detour");
  });

  it("records the prior fence-exit to current fence-entry odometer delta", async () => {
    const writes: { sql: string; values?: unknown[] }[] = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        writes.push({ sql, values });
        if (sql.includes("WITH current_stop")) return { rows: [{
          from_stop_id: "11111111-1111-1111-1111-111111111111",
          to_stop_id: "22222222-2222-2222-2222-222222222222",
          from_stop_type: "pickup",
          to_stop_type: "delivery",
          started_at: "2026-09-05T12:00:00.000Z",
          odometer_start_mi: 1000,
        }] };
        return { rows: [] };
      },
    };
    await expect(recordCompletedLoadLeg(client as never, {
      operatingCompanyId: "33333333-3333-3333-3333-333333333333",
      loadId: "44444444-4444-4444-4444-444444444444",
      unitId: "55555555-5555-5555-5555-555555555555",
      toStopId: "22222222-2222-2222-2222-222222222222",
      endedAt: "2026-09-05T14:00:00.000Z",
      odometerEndMi: 1123.4,
    })).resolves.toEqual({ recorded: true });
    const insert = writes.find((q) => q.sql.includes("INSERT INTO telematics.load_odometer_segments"));
    expect(insert?.values?.slice(-2)).toEqual([1000, 1123.4]);
  });

  it("fails closed instead of creating negative or planned-mile segments", async () => {
    const client = { query: async () => ({ rows: [{
      from_stop_id: "a", to_stop_id: "b", from_stop_type: "pickup", to_stop_type: "delivery",
      started_at: "2026-09-05T12:00:00.000Z", odometer_start_mi: 1000,
    }] }) };
    await expect(recordCompletedLoadLeg(client as never, {
      operatingCompanyId: "c", loadId: "l", unitId: "u", toStopId: "s",
      endedAt: "2026-09-05T14:00:00.000Z", odometerEndMi: 999,
    })).resolves.toEqual({ recorded: false, reason: "odometer_non_monotonic" });
  });
});
