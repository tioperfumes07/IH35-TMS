import { describe, expect, it, vi } from "vitest";

vi.mock("../dot-dwell-detector.service.js", () => ({ processDotDwellForGeofenceEvent: vi.fn(async () => undefined) }));

import { processGeofenceDetectionsForGpsPoint } from "../geofence-detector.service.js";

// CC-3 queue 6 — ONE arrival detector: the stop's fence 'entered' stamps load_stops.actual_arrival_at, is counted as
// stop_arrivals_stamped (the poll path's arrivals_triggered) and prompts the driver "Arrived at stop?".
const square = [
  { lng: -97.75, lat: 30.28 },
  { lng: -97.73, lat: 30.28 },
  { lng: -97.73, lat: 30.26 },
  { lng: -97.75, lat: 30.26 },
];

function clientFor(lastEventKind: "entered" | "exited" | null, stamped: boolean) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("FROM geo.geofences g") && !sql.includes("UPDATE")) {
        return { rows: [{ geofence_id: "11111111-1111-4111-8111-111111111111", vertices_json: square, last_event_kind: lastEventKind }] };
      }
      if (sql.includes("INSERT INTO geo.geofence_events")) return { rows: [], rowCount: 1 };
      if (sql.includes("UPDATE mdata.load_stops")) {
        return stamped
          ? { rows: [{ load_id: "22222222-2222-4222-8222-222222222222", stop_id: "33333333-3333-4333-8333-333333333333", booked_by_user_id: null }] }
          : { rows: [] };
      }
      return { rows: [] };
    }),
  };
}

const point = (inside: boolean) => ({
  operating_company_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  unit_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  latitude: inside ? 30.27 : 30.5,
  longitude: inside ? -97.74 : -97.5,
  occurred_at: "2026-10-02T15:00:00.000Z",
  driver_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
});

describe("geofence detector — the one stop-arrival detector", () => {
  it("an entered stop fence stamps, counts and prompts the driver once", async () => {
    const notifyDriver = vi.fn(async () => undefined);
    const res = await processGeofenceDetectionsForGpsPoint(clientFor(null, true), point(true), { notifyDriver });
    expect(res.stop_arrivals_stamped).toBe(1);
    expect(notifyDriver).toHaveBeenCalledTimes(1);
    expect(notifyDriver.mock.calls[0][0]).toMatchObject({
      driverId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      title: "Arrived at stop?",
      tag: "arrival-33333333-3333-4333-8333-333333333333",
      data: { kind: "arrival_prompt", stop_id: "33333333-3333-4333-8333-333333333333" },
    });
  });

  it("an already-stamped stop (no row returned) neither counts nor prompts", async () => {
    const notifyDriver = vi.fn(async () => undefined);
    const res = await processGeofenceDetectionsForGpsPoint(clientFor(null, false), point(true), { notifyDriver });
    expect(res.stop_arrivals_stamped).toBe(0);
    expect(notifyDriver).not.toHaveBeenCalled();
  });

  it("an exit is a departure, never an arrival", async () => {
    const notifyDriver = vi.fn(async () => undefined);
    const res = await processGeofenceDetectionsForGpsPoint(clientFor("entered", true), point(false), { notifyDriver });
    expect(res.transitions_written).toBe(1);
    expect(res.stop_arrivals_stamped).toBe(0);
    expect(notifyDriver).not.toHaveBeenCalled();
  });
});
