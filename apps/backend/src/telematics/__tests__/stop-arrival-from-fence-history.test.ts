import { describe, expect, it, vi } from "vitest";

/**
 * LEAD 443.335 — a load booked after its trip (13700: booked 10/22 19:11Z, run 10/20–10/21) gets its stops from the unit's
 * replayed visits to the load's own stop fences, through the stop engine, at the observed times. Fails on the old tree:
 * the module did not exist and stampStopArrival had no evidence time (it stamped now()).
 */
const h = vi.hoisted(() => ({ arrive: vi.fn(), depart: vi.fn() }));
vi.mock("../../dispatch/geofence-auto-delivery.service.js", () => ({ GEOFENCE_AUTO_DELIVERY_ACTOR: "00000000-0000-4000-8000-000000000001" }));
vi.mock("../../dispatch/stop-stamp.service.js", () => ({ stampStopArrival: h.arrive, stampStopDeparture: h.depart }));

const { planStampsFromFenceHistory, completeStopsFromFenceHistory } = await import("../stop-arrival-from-fence-history.service.js");

const BOOKED = "2026-10-22T19:11:14.232Z";
const stops13700 = [
  { stop_id: "s1", sequence_number: 1, scheduled_at: "2026-10-21T13:00:00Z", actual_arrival_at: null, actual_departure_at: null, fence_created_at: BOOKED },
  { stop_id: "s2", sequence_number: 2, scheduled_at: "2026-10-23T13:00:00Z", actual_arrival_at: null, actual_departure_at: null, fence_created_at: BOOKED },
];
const events13700 = [
  { sequence_number: 1, event_kind: "entered" as const, occurred_at: "2026-10-20T20:10:05Z" },
  { sequence_number: 1, event_kind: "exited" as const, occurred_at: "2026-10-20T23:30:14Z" },
  { sequence_number: 2, event_kind: "entered" as const, occurred_at: "2026-10-21T15:34:27Z" },
  { sequence_number: 2, event_kind: "exited" as const, occurred_at: "2026-10-21T16:34:53Z" },
  { sequence_number: 2, event_kind: "entered" as const, occurred_at: "2026-10-21T17:09:26Z" },
  { sequence_number: 2, event_kind: "exited" as const, occurred_at: "2026-10-21T17:49:57Z" },
];

describe("planStampsFromFenceHistory", () => {
  it("13700: pickup and delivery proven from the replayed visits, in order, at the observed times", () => {
    expect(planStampsFromFenceHistory(stops13700, events13700)).toEqual([
      { stop_id: "s1", sequence_number: 1, arrive_at: "2026-10-20T20:10:05.000Z", depart_at: "2026-10-20T23:30:14.000Z" },
      { stop_id: "s2", sequence_number: 2, arrive_at: "2026-10-21T15:34:27.000Z", depart_at: "2026-10-21T16:34:53.000Z" },
    ]);
  });

  it("a visit after the fence existed is the live detector's — never replayed here", () => {
    const late = stops13700.map((s) => ({ ...s, fence_created_at: "2026-10-19T00:00:00Z" }));
    expect(planStampsFromFenceHistory(late, events13700)).toEqual([]);
  });

  it("a visit outside ±72 h of the appointment is not evidence for this stop", () => {
    const far = [{ ...stops13700[0], scheduled_at: "2026-10-26T13:00:00Z" }];
    expect(planStampsFromFenceHistory(far, events13700)).toEqual([]);
  });

  it("the first stop takes the visit closest to its appointment", () => {
    const evs = [
      { sequence_number: 1, event_kind: "entered" as const, occurred_at: "2026-10-19T08:00:00Z" },
      { sequence_number: 1, event_kind: "exited" as const, occurred_at: "2026-10-19T09:00:00Z" },
      ...events13700,
    ];
    expect(planStampsFromFenceHistory([stops13700[0]], evs)[0].arrive_at).toBe("2026-10-20T20:10:05.000Z");
  });

  it("a delivery visit before the pickup departure is not the delivery", () => {
    const evs = [
      events13700[0], events13700[1],
      { sequence_number: 2, event_kind: "entered" as const, occurred_at: "2026-10-20T21:00:00Z" },
      { sequence_number: 2, event_kind: "exited" as const, occurred_at: "2026-10-20T21:30:00Z" },
    ];
    expect(planStampsFromFenceHistory(stops13700, evs).map((p) => p.sequence_number)).toEqual([1]);
  });

  it("an arrived-but-open stop stops the walk; no exit yet = arrival only", () => {
    const open = [{ ...stops13700[0], actual_arrival_at: "2026-10-20T20:10:05Z" }, stops13700[1]];
    expect(planStampsFromFenceHistory(open, events13700)).toEqual([]);
    expect(planStampsFromFenceHistory([stops13700[0]], [events13700[0]])).toEqual([
      { stop_id: "s1", sequence_number: 1, arrive_at: "2026-10-20T20:10:05.000Z", depart_at: null },
    ]);
  });
});

describe("completeStopsFromFenceHistory", () => {
  it("stamps through the stop engine with the evidence times (arrival + departure per stop)", async () => {
    h.arrive.mockResolvedValue({ ok: true, proforma_invoice: null });
    h.depart.mockResolvedValue({ ok: true, proforma_invoice: null });
    const client = {
      query: vi.fn(async (q: string) => {
        if (q.includes("FROM mdata.load_stops s\n        WHERE s.load_id")) return { rows: stops13700 };
        if (q.includes("FROM geo.geofence_events e")) return { rows: events13700 };
        if (q.includes("FOR UPDATE OF s, l")) {
          return { rows: [{ id: "s", stop_type: "pickup", status: "arrived", load_status: "dispatched", operating_company_id: "co" }] };
        }
        return { rows: [] };
      }),
    };
    const out = await completeStopsFromFenceHistory(client as never, "co", { load_id: "L", load_number: "13700", unit_id: "U" });
    expect(out.outcome).toBe("stamped");
    expect(h.arrive.mock.calls.map((c) => c[2].at)).toEqual(["2026-10-20T20:10:05.000Z", "2026-10-21T15:34:27.000Z"]);
    expect(h.depart.mock.calls.map((c) => c[2].at)).toEqual(["2026-10-20T23:30:14.000Z", "2026-10-21T16:34:53.000Z"]);
    expect(h.arrive.mock.calls[0][2].source).toBe("eld_geofence");
  });

  it("a refused arrival stops the load and reports it (nothing after it is written)", async () => {
    h.arrive.mockReset(); h.depart.mockReset();
    h.arrive.mockResolvedValue({ ok: false, error: "invalid_load_state", from: "x", to: "y" });
    const client = {
      query: vi.fn(async (q: string) => {
        if (q.includes("FROM mdata.load_stops s\n        WHERE s.load_id")) return { rows: stops13700 };
        if (q.includes("FROM geo.geofence_events e")) return { rows: events13700 };
        if (q.includes("FOR UPDATE OF s, l")) return { rows: [{ id: "s", stop_type: "pickup", status: "pending", load_status: "x", operating_company_id: "co" }] };
        return { rows: [] };
      }),
    };
    const out = await completeStopsFromFenceHistory(client as never, "co", { load_id: "L", load_number: "13700", unit_id: "U" });
    expect(out).toMatchObject({ outcome: "refused", stamped_before_refusal: 0 });
    expect(h.depart).not.toHaveBeenCalled();
  });
});
