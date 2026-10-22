import { describe, expect, it, vi } from "vitest";

/**
 * LEAD 443.232 (P0 — GPS down 9 h): one load's fence status walk failed (13691: its settlement close hit a check violation)
 * and the error escaped into the positions tick's transaction, rolling back EVERY unit's GPS. The walk now runs in its own
 * SAVEPOINT: a failure is rolled back, audited by name, and the point's processing returns normally.
 * Fails on the old detector: the transition's error propagated out of processGeofenceDetectionsForGpsPoint.
 */
const h = vi.hoisted(() => ({ transition: vi.fn(), audit: vi.fn(async () => undefined) }));
vi.mock("../dot-dwell-detector.service.js", () => ({ processDotDwellForGeofenceEvent: vi.fn(async () => undefined) }));
vi.mock("../../dispatch/load-transition.service.js", () => ({ transitionDispatchLoadInClientTx: h.transition }));
vi.mock("../../dispatch/geofence-auto-delivery.service.js", () => ({ GEOFENCE_AUTO_DELIVERY_ACTOR: "00000000-0000-4000-8000-000000000001" }));
vi.mock("../../accounting/proforma-mint-on-first-pickup.js", () => ({ mintProformaInvoiceOnFirstPickup: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: h.audit }));

const { processGeofenceDetectionsForGpsPoint } = await import("../geofence-detector.service.js");

const square = [{ lng: -71.2, lat: 42.6 }, { lng: -71.1, lat: 42.6 }, { lng: -71.1, lat: 42.5 }, { lng: -71.2, lat: 42.5 }];
const LOAD = "b5c304c9-35ad-4f6f-8600-f50563927a56";

function client() {
  const sql: string[] = [];
  return {
    sql,
    query: vi.fn(async (q: string) => {
      sql.push(q);
      if (q.includes("FROM geo.geofences g") && !q.includes("UPDATE")) return { rows: [{ geofence_id: "11111111-1111-4111-8111-111111111111", vertices_json: square, last_event_kind: null }] };
      if (q.includes("INSERT INTO geo.geofence_events")) return { rows: [], rowCount: 1 };
      if (q.includes("UPDATE mdata.load_stops")) return { rows: [{ load_id: LOAD, stop_id: "33333333-3333-4333-8333-333333333333", booked_by_user_id: null, stop_type: "delivery", sequence_number: 2 }] };
      if (q.includes("NOT EXISTS")) return { rows: [{ "?column?": 1 }] }; // the final delivery
      if (q.includes("SELECT status::text AS status FROM mdata.loads")) return { rows: [{ status: "dispatched" }] };
      return { rows: [] };
    }),
  };
}

describe("443.232 — a failed fence status walk never escapes the point's processing", () => {
  it("rolls the walk back to its savepoint, audits it by name, and returns the point's result", async () => {
    h.transition.mockReset().mockRejectedValue(Object.assign(new Error("current transaction is aborted, commands ignored until end of transaction block"), { code: "25P02" }));
    h.audit.mockClear();
    const c = client();
    const r = await processGeofenceDetectionsForGpsPoint(c as never, {
      operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80", unit_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      latitude: 42.55, longitude: -71.15, occurred_at: "2026-10-22T05:10:00.000Z", source: "samsara_gps",
    });
    expect(r.stop_arrivals_stamped).toBe(1);
    expect(c.sql).toContain("SAVEPOINT fence_status_walk");
    expect(c.sql).toContain("ROLLBACK TO SAVEPOINT fence_status_walk");
    expect(h.audit).toHaveBeenCalledWith(expect.anything(), "00000000-0000-4000-8000-000000000001", "telematics.fence_status_walk_failed",
      expect.objectContaining({ load_id: LOAD, target: "delivered_pending_docs" }), "warning", "LEAD-443-232-GPS-P0");
  });
});
