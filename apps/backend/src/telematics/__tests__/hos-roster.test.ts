import { describe, expect, it } from "vitest";
import { getHosDailyRoster } from "../hos-tracker.service.js";

const OCI = "11111111-1111-4111-8111-111111111111";
const D1 = "22222222-2222-4222-8222-222222222222"; // has events -> available
const NOW = new Date("2026-06-19T20:00:00.000Z");

function client() {
  return {
    query: async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM telematics.vehicle_driver_assignments"))
        return { rows: [{ driver_id: D1, driver_name: "Real Driver", unit_id: "00000000-0000-4000-8000-000000000162", unit_number: "T162" }] };
      if (sql.includes("FROM hos.duty_status_events"))
        return {
          rows: [
            { driver_id: D1, started_at: "2026-06-18T20:00:00.000Z", ended_at: "2026-06-19T13:00:00.000Z", duty_status: "off_duty" },
            { driver_id: D1, started_at: "2026-06-19T13:00:00.000Z", ended_at: null, duty_status: "driving" },
          ],
        };
      return { rows: [] };
    },
  };
}

describe("getHosDailyRoster (canonical source for timeline + table)", () => {
  it("binds the complete multi-driver selection before roster rows and KPI counts", async () => {
    const ids = [D1, "33333333-3333-4333-8333-333333333333"];
    let seen: { sql: string; values?: unknown[] } | undefined;
    const db = { query: async <R>(sql: string, values?: unknown[]) => {
      if (sql.includes("FROM telematics.vehicle_driver_assignments")) seen = { sql, values };
      return { rows: [] as R[] };
    } };
    const roster = await getHosDailyRoster(db, OCI, "2026-06-19", NOW, ids);
    expect(seen?.sql).toContain("a.driver_id = ANY($2::uuid[])");
    expect(seen?.values).toEqual([OCI, ids]);
    expect(roster.counts.active).toBe(0);
  });
  it("returns one row per active driver with name/unit + real clocks + KPI counts", async () => {
    const roster = await getHosDailyRoster(client(), OCI, "2026-06-19", NOW);
    expect(roster.drivers).toHaveLength(1);
    const d = roster.drivers[0];
    expect(d.driver_name).toBe("Real Driver");
    expect(d.unit_number).toBe("T162");
    expect(d.unit_id).toBe("00000000-0000-4000-8000-000000000162");
    expect(d.available).toBe(true);
    expect(d.current_duty_status).toBe("driving"); // last segment of the day
    expect(d.clocks).not.toBeNull();
    expect(roster.counts.active).toBe(1);
    expect(roster.counts.driving).toBe(1);
    expect(roster.counts.unavailable).toBe(0);
  });
});
