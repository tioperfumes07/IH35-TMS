import { describe, expect, it } from "vitest";
import { getLatestHosClocksByDriver } from "../samsara-hos-clocks-pull.service.js";

const OCI = "11111111-1111-4111-8111-111111111111";
const D_OK = "22222222-2222-4222-8222-222222222222";
const D_VIOL = "33333333-3333-4333-8333-333333333333";

// PR C: board/roster read Samsara's VERBATIM clocks from samsara.hos_snapshots. Violation = Samsara's numbers
// (any of cycle/drive/shift remaining <= 0), NOT our recompute. Latest snapshot per driver.
function client(rows: Record<string, unknown>[]) {
  return { query: async (sql: string) => (sql.includes("FROM samsara.hos_snapshots") ? { rows } : { rows: [] }) };
}

describe("getLatestHosClocksByDriver (verbatim Samsara clocks)", () => {
  it("maps the verbatim minutes per driver and derives violation only from Samsara's numbers", async () => {
    const map = await getLatestHosClocksByDriver(
      client([
        { driver_uuid: D_OK, driving_hours_remaining: 369, on_duty_hours_remaining: 468, cycle_hours_remaining: 1586, time_to_next_break_minutes: 300, samsara_event_at: "2026-06-19T05:00:00Z", polled_at: "2026-06-19T20:00:00Z" },
        { driver_uuid: D_VIOL, driving_hours_remaining: 0, on_duty_hours_remaining: 0, cycle_hours_remaining: 120, time_to_next_break_minutes: 0, samsara_event_at: null, polled_at: "2026-06-19T20:00:00Z" },
      ]),
      OCI
    );
    const ok = map.get(D_OK)!;
    expect(ok.cycle_remaining_min).toBe(1586);
    expect(ok.drive_remaining_min).toBe(369);
    expect(ok.shift_remaining_min).toBe(468);
    expect(ok.violation).toBe(false);

    const viol = map.get(D_VIOL)!;
    expect(viol.violation).toBe(true); // drive=0 / shift=0 -> Samsara violation
    expect(viol.cycle_remaining_min).toBe(120);
  });

  it("a driver with no snapshot is absent (caller renders honest 'unavailable')", async () => {
    const map = await getLatestHosClocksByDriver(client([]), OCI);
    expect(map.size).toBe(0);
  });
});
