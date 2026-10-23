import { describe, expect, it, vi } from "vitest";

/**
 * LEAD 443.279 — a load is delivered only through its final delivery stop's DEPARTURE.
 * Fails on the old detector: a final-delivery ARRIVAL walked the load to delivered_pending_docs (13691/13694/13696/13697).
 */
const h = vi.hoisted(() => ({ transition: vi.fn(), stampDeparture: vi.fn() }));
vi.mock("../dot-dwell-detector.service.js", () => ({ processDotDwellForGeofenceEvent: vi.fn(async () => undefined) }));
vi.mock("../../dispatch/load-transition.service.js", () => ({ transitionDispatchLoadInClientTx: h.transition }));
vi.mock("../../dispatch/geofence-auto-delivery.service.js", () => ({ GEOFENCE_AUTO_DELIVERY_ACTOR: "00000000-0000-4000-8000-000000000001" }));
vi.mock("../../accounting/proforma-mint-on-first-pickup.js", () => ({ mintProformaInvoiceOnFirstPickup: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../../dispatch/stop-stamp.service.js", () => ({ stampStopDeparture: h.stampDeparture }));

const { processGeofenceDetectionsForGpsPoint } = await import("../geofence-detector.service.js");
const { completeFinalDepartureFromFenceHistory } = await import("../fence-departure-from-history.service.js");

const square = [{ lng: -71.2, lat: 42.6 }, { lng: -71.1, lat: 42.6 }, { lng: -71.1, lat: 42.5 }, { lng: -71.2, lat: 42.5 }];
const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD = "b5c304c9-35ad-4f6f-8600-f50563927a56";
const STOP = "33333333-3333-4333-8333-333333333333";

function detectorClient(lastEvent: "entered" | null) {
  return {
    query: vi.fn(async (q: string) => {
      if (q.includes("FROM geo.geofences g") && !q.includes("UPDATE")) {
        return { rows: [{ geofence_id: "11111111-1111-4111-8111-111111111111", vertices_json: square, last_event_kind: lastEvent }] };
      }
      if (q.includes("INSERT INTO geo.geofence_events")) return { rows: [], rowCount: 1 };
      if (q.includes("UPDATE mdata.load_stops")) {
        return { rows: [{ load_id: LOAD, stop_id: STOP, booked_by_user_id: null, stop_type: "delivery", sequence_number: 2 }] };
      }
      if (q.includes("NOT EXISTS")) return { rows: [{ "?column?": 1 }] };
      if (q.includes("SELECT status::text AS status FROM mdata.loads")) return { rows: [{ status: "in_transit" }] };
      return { rows: [] };
    }),
  };
}

describe("443.279 — delivered only through the final stop's departure", () => {
  it("a final-delivery ARRIVAL stamps the stop but never delivers the load", async () => {
    h.transition.mockReset().mockResolvedValue({ ok: true });
    await processGeofenceDetectionsForGpsPoint(detectorClient(null) as never, {
      operating_company_id: CO, unit_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      latitude: 42.55, longitude: -71.15, occurred_at: "2026-10-23T11:25:00.000Z", source: "samsara_gps",
    });
    expect(h.transition.mock.calls.some((c) => c[4]?.new_status === "delivered_pending_docs")).toBe(false);
  });

  it("the final-delivery EXIT delivers the load at the exit time, as fence evidence", async () => {
    h.transition.mockReset().mockResolvedValue({ ok: true });
    await processGeofenceDetectionsForGpsPoint(detectorClient("entered") as never, {
      operating_company_id: CO, unit_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      latitude: 42.7, longitude: -71.15, occurred_at: "2026-10-23T14:49:23.000Z", source: "samsara_gps",
    });
    expect(h.transition).toHaveBeenCalledWith(expect.anything(), expect.anything(), CO, LOAD,
      { new_status: "delivered_pending_docs", delivered_at: "2026-10-23T14:49:23.000Z", departure_evidence: "fence" });
  });

  it("the history repair stamps the FIRST stored fix outside the fence through the stop engine", async () => {
    h.stampDeparture.mockReset().mockResolvedValue({ ok: true, proforma_invoice: null });
    const client = {
      query: vi.fn(async (q: string) => {
        if (q.includes("FROM geo.geofences")) return { rows: [{ vertices_json: square }] };
        if (q.includes("FROM telematics.vehicle_locations")) {
          return { rows: [
            { id: "f1", lat: "42.55", lng: "-71.15", captured_at: "2026-10-23T12:00:00Z" },
            { id: "f2", lat: "42.70", lng: "-71.15", captured_at: "2026-10-23T14:49:23Z" },
            { id: "f3", lat: "42.90", lng: "-71.15", captured_at: "2026-10-23T15:30:00Z" },
          ] };
        }
        if (q.includes("FOR UPDATE OF s, l")) return { rows: [{ id: STOP, stop_type: "delivery", status: "arrived", load_status: "delivered_pending_docs", operating_company_id: CO }] };
        return { rows: [] };
      }),
    };
    const r = await completeFinalDepartureFromFenceHistory(client as never, CO, {
      load_id: LOAD, load_number: "13694", stop_id: STOP, sequence_number: 2, unit_id: "u1", arrived_at: "2026-10-23T11:25:05Z",
    });
    expect(r).toEqual({ load_number: "13694", outcome: "stamped", departed_at: "2026-10-23T14:49:23Z", fix_id: "f2" });
    expect(h.stampDeparture).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: STOP }),
      expect.objectContaining({ source: "eld_geofence", at: "2026-10-23T14:49:23Z", loadId: LOAD }));
  });

  it("no stored fix outside the fence = no evidence = nothing written (never an invented time)", async () => {
    h.stampDeparture.mockReset();
    const client = {
      query: vi.fn(async (q: string) => {
        if (q.includes("FROM geo.geofences")) return { rows: [{ vertices_json: square }] };
        if (q.includes("FROM telematics.vehicle_locations")) return { rows: [{ id: "f1", lat: "42.55", lng: "-71.15", captured_at: "2026-10-23T10:40:00Z" }] };
        return { rows: [] };
      }),
    };
    const r = await completeFinalDepartureFromFenceHistory(client as never, CO, {
      load_id: LOAD, load_number: "13697", stop_id: STOP, sequence_number: 2, unit_id: "u1", arrived_at: "2026-10-23T10:14:55Z",
    });
    expect(r.outcome).toBe("no_evidence");
    expect(h.stampDeparture).not.toHaveBeenCalled();
  });
});
