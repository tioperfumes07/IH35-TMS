import { describe, expect, it, vi } from "vitest";

const { replay, bind } = vi.hoisted(() => ({
  replay: vi.fn(async () => ({ positions_checked: 40, events_written: 2 })),
  bind: vi.fn(async () => ({ id: "fence-gps-1", outcome: "created" as const })),
}));
vi.mock("../load-stop-geofence-sync.service.js", () => ({ replayUnitWindowForFences: replay }));
vi.mock("../../dispatch/geofences/load-geofence-binding.service.js", () => ({ bindVerifiedStopFence: bind }));

import { persistStopDwellEvidence } from "../stop-dwell-evidence.service.js";
import { resolveStopBoundary } from "../load-real-driven-miles.service.js";
import { pickStopDwell } from "../stop-dwell-boundary.service.js";

const hit = { at: "2026-08-07T18:04:48.000Z", started_at: "2026-08-07T18:04:48.000Z", ended_at: "2026-08-07T19:04:32.000Z",
  minutes: 59.7, distance_m: 4786, lat: 40.66, lng: -74.23, samples: 30 };
const ev = { load_id: "load-1", stop_id: "stop-1", unit_id: "unit-1", sequence_number: 1, hit };

function fakeClient(opts: { eventsOnFence: number; insertReturns: boolean }) {
  const sql: string[] = [];
  const client = {
    query: vi.fn(async (q: string) => {
      sql.push(q);
      if (/INSERT INTO telematics\.unit_stop_events/.test(q)) return { rows: opts.insertReturns ? [{ id: "evt-1" }] : [] };
      if (/SELECT id::text FROM telematics\.unit_stop_events/.test(q)) return { rows: [{ id: "evt-existing" }] };
      if (/UPDATE mdata\.load_stops/.test(q)) return { rows: [{ id: "stop-1" }] };
      if (/FROM geo\.geofence_events/.test(q)) return { rows: [{ n: String(opts.eventsOnFence) }] };
      if (/SELECT vertices_json/.test(q)) return { rows: [{ vertices_json: [{ lat: 1, lng: 1 }, { lat: 1, lng: 2 }, { lat: 2, lng: 2 }] }] };
      return { rows: [] };
    }),
  };
  return { client, sql };
}

describe("persistStopDwellEvidence — stop evidence, GPS-verified fence, replay", () => {
  it("writes the dwell event, links it only when the stop has none, mints the -gps fence and replays the dwell window", async () => {
    replay.mockClear(); bind.mockClear();
    const { client, sql } = fakeClient({ eventsOnFence: 0, insertReturns: true });
    const r = await persistStopDwellEvidence(client, "co-1", [ev, { ...ev }]);
    expect(r).toEqual({ stops: 1, stop_events: 1, stops_linked: 1, fences: 1, events_written: 2 });
    const link = sql.find((q) => /UPDATE mdata\.load_stops/.test(q))!;
    expect(link).toMatch(/s\.actual_stop_event_id IS NULL/);
    // never stamps a time, a source or a precision (detention reads actual_departure_at)
    for (const q of sql) expect(q).not.toMatch(/actual_(arrival|departure)_at\s*=|actual_stamp_precision\s*=|actual_(arrival|departure)_source\s*=/);
    expect(bind).toHaveBeenCalledWith(client, "co-1", "load-1", 1, { lat: 40.66, lng: -74.23 });
    expect(replay).toHaveBeenCalledTimes(1);
    const [, , unit, fences, since, until] = replay.mock.calls[0] as unknown as [unknown, string, string, Array<{ id: string }>, string, string];
    expect(unit).toBe("unit-1");
    expect(fences[0].id).toBe("fence-gps-1");
    expect(since).toBe("2026-08-07T16:04:48.000Z");
    expect(until).toBe("2026-08-07T21:04:32.000Z");
  });

  it("is idempotent: an existing stop event is reused and a fence that already has crossings is not replayed again", async () => {
    replay.mockClear();
    const { client } = fakeClient({ eventsOnFence: 3, insertReturns: false });
    const r = await persistStopDwellEvidence(client, "co-1", [ev]);
    expect(r.stop_events).toBe(0);
    expect(r.events_written).toBe(0);
    expect(replay).not.toHaveBeenCalled();
  });
});

describe("a fence crossing without a real OBD read yields to the GPS dwell", () => {
  const stop = { stop_id: "s1", load_id: "l1", unit_id: "u1", sequence_number: 1, latitude: 40.6256, longitude: -74.2307,
    arrival_at: "2026-08-07T05:00:00.000Z", departure_at: "2026-08-07T05:00:00.000Z", scheduled_arrival_at: null,
    arrival_source: "manual", departure_source: "manual" };
  const pick = pickStopDwell("departure", { lat: 40.6256, lng: -74.2307 }, new Date("2026-08-07T05:00:00.000Z"),
    [{ startedAt: new Date("2026-08-07T14:10:00.000Z"), endedAt: new Date("2026-08-07T15:45:00.000Z"), dwellMinutes: 95, lat: 40.6412, lng: -74.2307 }], [], true);
  const absent = { odo: null, at: "2026-08-07T15:40:00.000Z", src: "absent" };
  it("absent-odometer crossing + dwell -> measured at the dwell", () => {
    const anchor = { odometer_mi: 431000.4, read_at: "2026-08-07T15:45:00.000Z", source: "vehicle_locations" as const };
    expect(resolveStopBoundary("departure", stop, absent, { anchor, reason: null }, pick).via).toMatch(/^gps_dwell /);
  });
  it("absent-odometer crossing and no dwell -> the original refusal", () => {
    expect(resolveStopBoundary("departure", stop, absent, undefined, undefined).reason).toMatch(/has a absent odometer -- not a measurement/);
  });
  it("a real-OBD crossing always wins", () => {
    const b = resolveStopBoundary("departure", stop, { odo: 1000, at: "2026-08-07T15:40:00.000Z", src: "real_obd" }, undefined, pick);
    expect(b.via).toBe("geofence");
  });
});
