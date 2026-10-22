import { describe, expect, it, vi } from "vitest";

/**
 * LEAD 443.233 (owner 10-22: "Laredo → Laredo yard moves are not lanes") — a load whose origin and destination are the same
 * city/state is a yard move: the ONE lane engine never counts it in catalogs.lane_mileage or mdata.customer_lanes, and audits
 * the exclusion by name (dispatch.load.lane_excluded, reason yard_move). Fails on the old engine (it upserted the lane).
 */
const h = vi.hoisted(() => ({ audit: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: h.audit }));
const { learnLoadLanes } = await import("../load-lane-learning.service.js");

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD = "44444444-4444-4444-8444-444444444444";

function client(destCity: string) {
  const sql: string[] = [];
  return {
    sql,
    query: vi.fn(async (q: string) => {
      sql.push(q);
      if (q.includes("FROM mdata.loads WHERE id = $1::uuid")) {
        return { rows: [{ id: LOAD, customer_id: "c1", miles_practical: "7.2", miles_shortest: null, miles_deadhead: "0", loaded_miles: "7.2", rate_total_cents: "50000", created_at: "2026-10-12T00:00:00Z" }] };
      }
      if (q.includes("FROM mdata.load_stops") && q.includes("ORDER BY sequence_number")) {
        return { rows: [
          { id: "s1", sequence_number: 1, stop_type: "pickup", city: "Laredo", state: "TX", postal_code: "78045", latitude: 27.6, longitude: -99.5, leg_miles: "0", at: "2026-10-12" },
          { id: "s2", sequence_number: 2, stop_type: "delivery", city: destCity, state: "TX", postal_code: "78046", latitude: 27.5, longitude: -99.4, leg_miles: "7.2", at: "2026-10-12" },
        ] };
      }
      return { rows: [] };
    }),
  };
}

describe("443.233 — a yard move is not a lane", () => {
  it("Laredo → Laredo: no lane_mileage / customer_lanes write, excluded by name", async () => {
    h.audit.mockClear();
    const c = client("Laredo");
    const out = await learnLoadLanes(c as never, { operatingCompanyId: OPCO, loadId: LOAD, fresh: false, routeCorrected: true, actorUserId: "u1" });
    expect(out.lane_skip_reason).toBe("yard_move");
    expect(out.customer_lane_skip_reason).toBe("yard_move");
    expect(c.sql.some((q) => /INSERT INTO catalogs\.lane_mileage|UPDATE catalogs\.lane_mileage/.test(q))).toBe(false);
    expect(c.sql.some((q) => /INSERT INTO mdata\.customer_lanes|UPDATE mdata\.customer_lanes/.test(q))).toBe(false);
    expect(h.audit).toHaveBeenCalledWith(expect.anything(), "u1", "dispatch.load.lane_excluded", expect.objectContaining({ reason: "yard_move", load_id: LOAD }), "info", "LEAD-443-233");
  });

  it("Laredo → Weslaco is a lane (not excluded)", async () => {
    const c = client("Weslaco");
    const out = await learnLoadLanes(c as never, { operatingCompanyId: OPCO, loadId: LOAD, fresh: false, routeCorrected: true, actorUserId: "u1" });
    expect(out.lane_skip_reason).not.toBe("yard_move");
  });
});
