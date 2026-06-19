import { describe, expect, it } from "vitest";
import { getHosDaily } from "../hos-tracker.service.js";

const OCI = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-06-19T20:00:00.000Z"); // 15:00 CT; Laredo day 2026-06-19 = [05:00Z, next 05:00Z)

// Routes the service's two queries: set_config -> empty; the events SELECT -> the provided rows.
function clientWith(events: Array<{ started_at: string; ended_at: string | null; duty_status: string }>) {
  return {
    query: async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM hos.duty_status_events")) return { rows: events };
      return { rows: [] };
    },
  };
}

describe("getHosDaily", () => {
  it("builds real segments, per-status totals, clocks and driven-cycle from events", async () => {
    const daily = await getHosDaily(
      clientWith([
        { started_at: "2026-06-19T05:00:00.000Z", ended_at: "2026-06-19T13:00:00.000Z", duty_status: "off_duty" },
        { started_at: "2026-06-19T13:00:00.000Z", ended_at: "2026-06-19T18:00:00.000Z", duty_status: "driving" },
        { started_at: "2026-06-19T18:00:00.000Z", ended_at: null, duty_status: "on_duty_not_driving" },
      ]),
      OCI, DRIVER, "2026-06-19", NOW
    );

    expect(daily.available).toBe(true);
    expect(daily.segments).toHaveLength(3);
    expect(daily.per_status_minutes.driving).toBe(300); // 13:00->18:00
    expect(daily.per_status_minutes.on_duty_not_driving).toBe(120); // 18:00->20:00 (ongoing -> asOf)
    expect(daily.clocks).not.toBeNull();
    expect(daily.clocks!.drive_remaining_min).toBe(660 - 300); // 11h - 5h driven
    // driven in cycle = on-duty (driving + on_duty_not_driving) = 420 min
    expect(daily.driven_cycle_min).toBe(420);
    expect(daily.eight_day_breakdown).toHaveLength(8);
    // segments carry timeline geometry + CT-formatted times
    expect(daily.segments[0].day_width).toBeGreaterThan(0);
    expect(daily.segments[1].start_ct).toMatch(/CT$/);
  });

  it("HONEST: a driver-day with NO events is 'unavailable' — null clocks, empty timeline, no violation", async () => {
    const daily = await getHosDaily(clientWith([]), OCI, DRIVER, "2026-06-19", NOW);
    expect(daily.available).toBe(false);
    expect(daily.clocks).toBeNull();
    expect(daily.driven_cycle_min).toBeNull();
    expect(daily.segments).toEqual([]);
  });
});
