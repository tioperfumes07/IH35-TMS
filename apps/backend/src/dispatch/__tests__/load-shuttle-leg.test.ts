import { describe, expect, it, vi } from "vitest";

/**
 * LEAD 443.238 (owner 10-22) — a pickup served by the local yard shuttle: the leg is recorded through THE writer and the
 * stop-evidence engine stamps the pickup from it (owner ruling → date only; the shuttle truck's GPS stop event → tracked).
 * Fails on the old engine: it looked only at the line truck (never at the shipper) and left the pickup unstamped.
 */
const audit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: audit }));
const { recordLoadShuttleLeg } = await import("../load-shuttle-leg.service.js");

function client(withEvent: boolean) {
  const sql: Array<{ q: string; v?: unknown[] }> = [];
  let legInserted = false;
  return {
    sql,
    query: vi.fn(async (q: string, v?: unknown[]) => {
      sql.push({ q, v });
      if (q.includes("FROM mdata.load_stops s JOIN mdata.loads l") && q.includes("stop_type::text = 'pickup'"))
        return { rows: [{ id: "pu", latitude: "27.52", longitude: "-99.51", day: "2026-10-20", load_number: "13692" }] };
      if (q.includes("FROM mdata.units") && q.includes("unit_number = ANY")) return { rows: [{ id: "u120", unit_number: "T120" }, { id: "u122", unit_number: "T122" }, { id: "u124", unit_number: "T124" }] };
      if (q.includes("FROM telematics.unit_stop_events e") && q.includes("e.unit_id = ANY"))
        return { rows: withEvent ? [{ id: "ev1", unit_id: "u122", started_at: "2026-10-20T15:00:00Z", ended_at: "2026-10-20T16:00:00Z", metres: 120 }] : [] };
      if (q.includes("INSERT INTO dispatch.load_shuttle_legs")) { legInserted = true; return { rows: [{ id: "leg1" }] }; }
      if (q.includes("SELECT load_number, assigned_unit_id")) return { rows: [{ load_number: "13692", unit_id: "line", company_id: "c" }] };
      if (q.includes("FROM mdata.load_stops WHERE load_id = $1::uuid AND soft_deleted_at IS NULL ORDER BY sequence_number"))
        return { rows: [{ id: "pu", sequence_number: 1, stop_type: "pickup", latitude: "27.52", longitude: "-99.51", sched_day: "2026-10-20", stamped: false }] };
      if (q.includes("FROM dispatch.load_shuttle_legs sl") && q.includes("sl.from_stop_id = $2"))
        return { rows: legInserted ? [withEvent
          ? { id: "leg1", picked_up_at: "2026-10-20T15:00:00Z", dropped_at: "2026-10-20T16:00:00Z", stop_event_id: "ev1", precision: "tracked", evidence: "gps_stop_event", started_at: "2026-10-20T15:00:00Z", ended_at: "2026-10-20T16:00:00Z" }
          : { id: "leg1", picked_up_at: "2026-10-20T12:00:00Z", dropped_at: null, stop_event_id: null, precision: "date_only", evidence: "owner_ruling", started_at: null, ended_at: null }] : [] };
      return { rows: [] };
    }),
  };
}
const input = { operatingCompanyId: "c", loadId: "L", unitNumbers: ["T120", "T122", "T124"], evidence: "owner_ruling" as const, note: "owner ruling 10-22", actorUserId: "u" };

describe("443.238 — local yard shuttle leg", () => {
  it("owner ruling with no shuttle GPS → leg date_only with the candidates; pickup stamped date-only from the leg", async () => {
    const c = client(false);
    const r = await recordLoadShuttleLeg(c as never, input);
    expect(r.precision).toBe("date_only");
    const ins = c.sql.find((s) => s.q.includes("INSERT INTO dispatch.load_shuttle_legs"))!;
    expect(ins.v?.[3]).toBeNull(); // unit unknown
    expect(ins.v?.[5]).toEqual(["T120", "T122", "T124"]);
    expect(ins.v?.[8]).toBe("owner_ruling");
    const stamp = c.sql.find((s) => s.q.includes("actual_stamp_precision = 'date_only'"));
    expect(stamp?.v?.slice(0, 2)).toEqual(["pu", "2026-10-20"]);
    expect(c.sql.some((s) => /settlement_lines|driver_bills/.test(s.q))).toBe(false); // never a pay line
    expect(audit).toHaveBeenCalledWith(expect.anything(), "u", "dispatch.load.shuttle_leg_recorded", expect.objectContaining({ evidence: "owner_ruling" }));
  });

  it("a candidate shuttle truck's GPS stop event at the shipper → leg tracked on that truck; pickup stamped with its times", async () => {
    const c = client(true);
    const r = await recordLoadShuttleLeg(c as never, input);
    expect(r).toMatchObject({ precision: "tracked", unit_id: "u122" });
    const stamp = c.sql.find((s) => s.q.includes("actual_stamp_precision = 'tracked'"));
    expect(stamp?.v).toEqual(["pu", "2026-10-20T15:00:00Z", "2026-10-20T16:00:00Z", "ev1"]);
  });
});
