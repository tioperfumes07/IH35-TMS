import { describe, expect, it, vi } from "vitest";
import { stampStopsFromTracking } from "../settlement-creator-deliver.js";

/** LEAD 443.234 — on a LIVE load the stop-evidence engine stamps only a tracked stop event: no date-only fallback, no future day. */
function client(events: boolean) {
  const sql: Array<{ q: string; v?: unknown[] }> = [];
  return {
    sql,
    query: vi.fn(async (q: string, v?: unknown[]) => {
      sql.push({ q, v });
      if (q.includes("SELECT load_number, assigned_unit_id")) return { rows: [{ load_number: "13692", unit_id: "u1", company_id: "c" }] };
      if (q.includes("FROM mdata.load_stops WHERE load_id = $1::uuid AND soft_deleted_at IS NULL ORDER BY sequence_number"))
        return { rows: [
          { id: "pu", sequence_number: 1, stop_type: "pickup", latitude: "27.5", longitude: "-99.5", sched_day: "2026-10-20", stamped: false },
          { id: "del", sequence_number: 2, stop_type: "delivery", latitude: "40.5", longitude: "-74.4", sched_day: "2099-01-01", stamped: false },
        ] };
      if (q.includes("FROM telematics.unit_stop_events")) return { rows: events ? [{ id: "e1", started_at: "2026-10-20T14:00:00Z", ended_at: "2026-10-20T15:00:00Z", metres: "90" }] : [] };
      return { rows: [] };
    }),
  };
}

describe("443.234 — trackedOnly", () => {
  it("no tracked event → nothing stamped (no date-only), future stop untouched", async () => {
    const c = client(false);
    const out = await stampStopsFromTracking(c as never, "L", "c", {}, { trackedOnly: true });
    expect(c.sql.some((s) => s.q.includes("actual_stamp_precision = 'date_only'"))).toBe(false);
    expect(c.sql.some((s) => s.q.includes("actual_stamp_precision = 'tracked'"))).toBe(false);
    expect(out.map((o) => o.note)).toEqual([expect.stringContaining("no tracked evidence"), expect.stringContaining("has not come")]);
  });
  it("a tracked event is stamped; the future stop is not", async () => {
    const c = client(true);
    await stampStopsFromTracking(c as never, "L", "c", {}, { trackedOnly: true });
    const tracked = c.sql.filter((s) => s.q.includes("actual_stamp_precision = 'tracked'"));
    expect(tracked).toHaveLength(1);
    expect(tracked[0]!.v?.[0]).toBe("pu");
  });
});
