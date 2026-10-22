import { describe, expect, it, vi } from "vitest";
import { stampFinalActiveDeliveryDeparture } from "../stamp-final-delivery-departure.js";

/**
 * LEAD 443.230 (CC-3) — when the office confirms delivery, the load's EARLIER stops still unstamped are stamped from the
 * truck's own tracking (the stop-evidence engine) and settled; the attested final departure is never overwritten.
 * Fails on the old helper: it stamped only the final delivery stop, so 13687 / 13688 kept their pickup 'pending'.
 */
const OPCO = "11111111-1111-4111-8111-111111111111";
const LOAD = "44444444-4444-4444-8444-444444444444";

describe("443.230 — office delivery stamps the earlier stops from tracking", () => {
  it("stamps the unstamped pickup from the unit's stop event, leaves the stamped final stop alone, settles statuses", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("UPDATE mdata.load_stops s") && sql.includes("COALESCE($3::timestamptz, now())")) return { rows: [], rowCount: 1 };
      if (sql.includes("SELECT load_number, assigned_unit_id")) return { rows: [{ load_number: "13688", unit_id: "unit-1", company_id: OPCO }] };
      if (sql.includes("FROM mdata.load_stops WHERE load_id = $1::uuid AND soft_deleted_at IS NULL ORDER BY sequence_number"))
        return { rows: [
          { id: "stop-pu", sequence_number: 1, stop_type: "pickup", latitude: "27.5", longitude: "-99.5", sched_day: "2026-10-16", stamped: false },
          { id: "stop-del", sequence_number: 2, stop_type: "delivery", latitude: "39.7", longitude: "-75.3", sched_day: "2026-10-19", stamped: true },
        ] };
      if (sql.includes("FROM telematics.unit_stop_events")) return { rows: [{ id: "ev-1", started_at: "2026-10-16T14:00:00Z", ended_at: "2026-10-16T16:00:00Z", metres: "120" }] };
      return { rows: [], rowCount: 0 };
    });
    const n = await stampFinalActiveDeliveryDeparture({ query } as never, OPCO, LOAD, "2026-10-20T00:59:58Z");
    expect(n).toBe(1);
    const tracked = query.mock.calls.filter(([s]) => String(s).includes("actual_stamp_precision = 'tracked'"));
    expect(tracked).toHaveLength(1);
    expect(tracked[0]![1]).toEqual(["stop-pu", "2026-10-16T14:00:00Z", "2026-10-16T16:00:00Z", "ev-1"]);
    expect(String(tracked[0]![0])).toContain("actual_arrival_at IS NULL AND actual_departure_at IS NULL");
    expect(query.mock.calls.some(([s]) => String(s).includes("status = 'departed'::mdata.stop_status_enum, updated_at = now()") && String(s).includes("actual_departure_at IS NOT NULL"))).toBe(true);
  });
});
