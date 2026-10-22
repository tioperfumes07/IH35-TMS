import { describe, expect, it, vi } from "vitest";

/**
 * LEAD 443.238 sweep A (register B5 / C1) — a GPS point with no driver resolves the driver from the unit's CURRENT load = the
 * load service's board set (earliest pickup first), never a private `NOT IN ('delivered','cancelled')` list that let invoiced /
 * closed / voided / abandoned / draft loads name the driver. Fails on the old detector (private list, latest-updated load).
 */
vi.mock("../dot-dwell-detector.service.js", () => ({ processDotDwellForGeofenceEvent: vi.fn(async () => undefined) }));
vi.mock("../../dispatch/load-transition.service.js", () => ({ transitionDispatchLoadInClientTx: vi.fn(async () => ({ ok: true })) }));
vi.mock("../../dispatch/geofence-auto-delivery.service.js", () => ({ GEOFENCE_AUTO_DELIVERY_ACTOR: "00000000-0000-4000-8000-000000000001" }));
vi.mock("../../accounting/proforma-mint-on-first-pickup.js", () => ({ mintProformaInvoiceOnFirstPickup: vi.fn(async () => undefined) }));
const { processGeofenceDetectionsForGpsPoint } = await import("../geofence-detector.service.js");

const square = [{ lng: -97.75, lat: 30.28 }, { lng: -97.73, lat: 30.28 }, { lng: -97.73, lat: 30.26 }, { lng: -97.75, lat: 30.26 }];

describe("443.238 — the fence names the driver of the unit's board load", () => {
  it("resolves the driver from the load service's board set, earliest pickup first", async () => {
    const sql: string[] = [];
    const client = {
      query: vi.fn(async (q: string) => {
        sql.push(q);
        if (q.includes("FROM geo.geofences g") && !q.includes("UPDATE")) {
          return { rows: [{ geofence_id: "11111111-1111-4111-8111-111111111111", vertices_json: square, last_event_kind: null }] };
        }
        if (q.includes("INSERT INTO geo.geofence_events")) return { rows: [], rowCount: 1 };
        return { rows: [] };
      }),
    };
    await processGeofenceDetectionsForGpsPoint(client as never, {
      operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80",
      unit_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      latitude: 30.27,
      longitude: -97.74,
      occurred_at: "2026-10-22T15:00:00.000Z",
    });
    const driverSql = sql.find((q) => q.includes("COALESCE(l.assigned_primary_driver_id, l.assigned_secondary_driver_id)"));
    expect(driverSql).toBeDefined();
    expect(driverSql).toContain("views.live_loads");
    expect(driverSql).not.toMatch(/NOT IN \('delivered', 'cancelled'\)/);
    expect(driverSql).toMatch(/ORDER BY \(SELECT min\(COALESCE\(s\.actual_arrival_at, s\.appointment_start_at, s\.scheduled_arrival_at\)\)/);
  });
});
