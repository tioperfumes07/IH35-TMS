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
        return { rows: [{ driver_id: D1, driver_name: "Real Driver", unit_number: "T162" }] };
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
  it("returns one row per active driver with name/unit + real clocks + KPI counts", async () => {
    const roster = await getHosDailyRoster(client(), OCI, "2026-06-19", NOW);
    expect(roster.drivers).toHaveLength(1);
    const d = roster.drivers[0];
    expect(d.driver_name).toBe("Real Driver");
    expect(d.unit_number).toBe("T162");
    expect(d.available).toBe(true);
    expect(d.current_duty_status).toBe("driving"); // last segment of the day
    expect(d.clocks).not.toBeNull();
    expect(roster.counts.active).toBe(1);
    expect(roster.counts.driving).toBe(1);
    expect(roster.counts.unavailable).toBe(0);
  });
});
