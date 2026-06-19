import { describe, expect, it } from "vitest";
import { getFleetLocationHosRows } from "../fleet-location-hos.service.js";

// Regression: a compliance/safety board must NEVER show the fabricated 14h "fresh shift" default for a driver
// whose HOS we don't actually have. computeHosClocks([]) returns drive=660/window=840/cycle=4200/status=ok; the
// reader must instead mark assigned-but-no-events drivers "unavailable" with BLANK clocks. A driver WITH ingested
// events shows real, differing clocks.
const OCI = "11111111-1111-4111-8111-111111111111";
const DRIVER_WITH = "22222222-2222-4222-8222-222222222222"; // has duty events -> real clocks
const DRIVER_WITHOUT = "33333333-3333-4333-8333-333333333333"; // no events -> "unavailable"
const ASOF = new Date("2026-06-19T20:00:00.000Z");

function pos(unit_id: string, unit_number: string) {
  return {
    unit_id, unit_number, samsara_vehicle_id: `v-${unit_number}`, captured_at: "2026-06-19T19:55:00.000Z",
    lat: "27.5", lng: "-99.5", city: "Laredo", state: "TX", formatted_location: "Laredo, TX",
    speed_mph: "10.0", heading_deg: "180.0", engine_state: "On",
  };
}

// Routes each of the reader's queries by SQL content. Driver WITH gets a reset + a 2h driving segment (so the
// clocks come out BELOW the 660/840 full default); driver WITHOUT gets no events at all.
function makeClient() {
  return {
    query: async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM mdata.units")) return { rows: [pos("unit-a", "T-A"), pos("unit-b", "T-B")] };
      if (sql.includes("FROM telematics.vehicle_driver_assignments")) {
        return {
          rows: [
            { assigned_unit_id: "unit-a", driver_id: DRIVER_WITH, driver_name: "Real Clocks" },
            { assigned_unit_id: "unit-b", driver_id: DRIVER_WITHOUT, driver_name: "No Hos Feed" },
          ],
        };
      }
      if (sql.includes("FROM mdata.loads")) return { rows: [] };
      if (sql.includes("FROM hos.duty_status_events")) {
        return {
          rows: [
            { driver_id: DRIVER_WITH, started_at: "2026-06-18T20:00:00.000Z", ended_at: "2026-06-19T18:00:00.000Z", duty_status: "off_duty" },
            { driver_id: DRIVER_WITH, started_at: "2026-06-19T18:00:00.000Z", ended_at: null, duty_status: "driving" },
          ],
        };
      }
      return { rows: [] };
    },
  };
}

describe("fleet-location-hos honest HOS state (no fabricated 840)", () => {
  it("shows real clocks for a driver WITH events and 'unavailable'+blank for a driver WITHOUT", async () => {
    const rows = await getFleetLocationHosRows(makeClient(), OCI, ASOF);
    const a = rows.find((r) => r.unit_number === "T-A")!;
    const b = rows.find((r) => r.unit_number === "T-B")!;

    // Driver WITH events: real, differing clocks (driving 2h since reset => below the 660/840 full default).
    expect(a.hos_status).not.toBe("unavailable");
    expect(a.window_remaining_min).not.toBeNull();
    expect(a.window_remaining_min!).toBeLessThan(840); // NOT the fabricated full window
    expect(a.drive_remaining_min!).toBeLessThan(660);

    // Driver WITHOUT events: HONEST unavailable, blank clocks — never the fabricated 840/ok.
    expect(b.hos_status).toBe("unavailable");
    expect(b.drive_remaining_min).toBeNull();
    expect(b.window_remaining_min).toBeNull();
    expect(b.break_remaining_min).toBeNull();
    expect(b.cycle_remaining_min).toBeNull();
  });

  it("PER-DRIVER STALENESS: a driver whose fix is >2h old reads 'unavailable' (HOS suppressed, never 'ok')", async () => {
    // Same real events as the coherent case, but the position fix is ~16h old (live case: SOSA PEREZ).
    const stalePos = { ...pos("unit-s", "T-S"), captured_at: "2026-06-19T04:00:00.000Z" }; // 16h before ASOF
    const client = {
      query: async (sql: string) => {
        if (sql.includes("set_config")) return { rows: [] };
        if (sql.includes("FROM mdata.units")) return { rows: [stalePos] };
        if (sql.includes("FROM telematics.vehicle_driver_assignments"))
          return { rows: [{ assigned_unit_id: "unit-s", driver_id: DRIVER_WITH, driver_name: "Stale Fix" }] };
        if (sql.includes("FROM mdata.loads")) return { rows: [] };
        if (sql.includes("FROM hos.duty_status_events"))
          return {
            rows: [
              { driver_id: DRIVER_WITH, started_at: "2026-06-18T20:00:00.000Z", ended_at: "2026-06-19T18:00:00.000Z", duty_status: "off_duty" },
              { driver_id: DRIVER_WITH, started_at: "2026-06-19T18:00:00.000Z", ended_at: null, duty_status: "driving" },
            ],
          };
        return { rows: [] };
      },
    };
    const rows = await getFleetLocationHosRows(client, OCI, ASOF);
    const s = rows.find((r) => r.unit_number === "T-S")!;
    expect(s.hos_status).toBe("unavailable"); // >2h stale -> suppressed, NOT "ok"
    expect(s.drive_remaining_min).toBeNull();
    expect(s.window_remaining_min).toBeNull();
  });
});
