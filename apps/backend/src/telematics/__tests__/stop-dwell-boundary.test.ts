import { describe, expect, it } from "vitest";
import {
  DWELL_BOUNDARY_MIN_MINUTES,
  DWELL_BOUNDARY_RADIUS_M,
  dwellVia,
  metresBetween,
  pickStopDwell,
  type DwellCandidate,
} from "../stop-dwell-boundary.service.js";
import { resolveStopBoundary } from "../load-real-driven-miles.service.js";

// 13510 Linden NJ: the stop pin and a dock ~1.08 mi (1,738 m) north of it.
const STOP = { lat: 40.6256, lng: -74.2307 };
const north = (m: number) => ({ lat: STOP.lat + m / 111_320, lng: STOP.lng });
const REF = new Date("2026-08-07T05:00:00.000Z");
const dwell = (offsetM: number, startIso: string, minutes: number): DwellCandidate => {
  const p = north(offsetM);
  const s = new Date(startIso);
  return { startedAt: s, endedAt: new Date(s.getTime() + minutes * 60_000), dwellMinutes: minutes, lat: p.lat, lng: p.lng };
};

describe("GPS-dwell stop boundary (owner: the gps is source of truth; the system does it automatically)", () => {
  it("a dwell ~1.1 mi off the pin (fence never entered) is the stop: arrival = start, departure = end", () => {
    const d = dwell(1738, "2026-08-07T14:10:00.000Z", 95);
    const a = pickStopDwell("arrival", STOP, REF, [d], [], true);
    const dep = pickStopDwell("departure", STOP, REF, [d], [], true);
    expect(a.hit?.at).toBe("2026-08-07T14:10:00.000Z");
    expect(dep.hit?.at).toBe("2026-08-07T15:45:00.000Z");
    expect(a.hit!.distance_m).toBeGreaterThan(1700);
    expect(a.hit!.distance_m).toBeLessThan(1780);
    expect(a.reason).toBeNull();
  });

  it("a dwell beyond the 3 mi radius is NEVER used — NULL with the distance as the reason", () => {
    const far = dwell(DWELL_BOUNDARY_RADIUS_M + 500, "2026-08-07T14:10:00.000Z", 120);
    const p = pickStopDwell("arrival", STOP, REF, [far], [], true);
    expect(p.hit).toBeNull();
    expect(p.reason).toMatch(/beyond the 4828 m \(3 mi\) GPS-verification radius/);
  });

  it("no dwell -> NULL with a precise reason; no fixes -> its own reason", () => {
    expect(pickStopDwell("arrival", STOP, REF, [], [], true)).toEqual({ hit: null, reason: expect.stringMatching(/no truck dwell of 10 min or more/) });
    expect(pickStopDwell("arrival", STOP, REF, [], [], false)).toEqual({ hit: null, reason: expect.stringMatching(/no GPS fixes for the truck/) });
  });

  it("a short pause, a dwell outside the 48 h window, and a fuel-stop dwell are not the stop", () => {
    const short = dwell(100, "2026-08-07T14:10:00.000Z", DWELL_BOUNDARY_MIN_MINUTES - 1);
    const late = dwell(100, "2026-08-10T14:10:00.000Z", 90);
    const fuel = dwell(300, "2026-08-07T09:00:00.000Z", 40);
    const zone = { ...north(300), r: 200 };
    expect(pickStopDwell("arrival", STOP, REF, [short, late, fuel], [zone], true).hit).toBeNull();
  });

  it("the nearest dwell wins, ties broken by time", () => {
    const near = dwell(900, "2026-08-08T10:00:00.000Z", 60);
    const nearer = dwell(400, "2026-08-07T20:00:00.000Z", 30);
    expect(pickStopDwell("arrival", STOP, REF, [near, nearer], [], true).hit!.at).toBe("2026-08-07T20:00:00.000Z");
  });

  it("metresBetween is a real distance", () => {
    expect(Math.abs(metresBetween(STOP.lat, STOP.lng, north(1000).lat, STOP.lng) - 1000)).toBeLessThan(3);
  });
});

describe("resolveStopBoundary with a GPS dwell", () => {
  const stop = {
    stop_id: "s1", load_id: "l1", unit_id: "u1", sequence_number: 1, latitude: STOP.lat, longitude: STOP.lng,
    arrival_at: "2026-08-07T05:00:00.000Z", departure_at: "2026-08-07T05:00:00.000Z", scheduled_arrival_at: null,
    arrival_source: "manual", departure_source: "manual",
  };
  const pick = pickStopDwell("departure", STOP, REF, [dwell(1738, "2026-08-07T14:10:00.000Z", 95)], [], true);

  it("a manual date-only stop with a dwell is measured at the dwell, odometer from the shared anchor", () => {
    const anchor = { odometer_mi: 431000.4, read_at: "2026-08-07T15:45:00.000Z", source: "vehicle_locations" as const };
    const b = resolveStopBoundary("departure", stop, undefined, { anchor, reason: null }, pick);
    expect(b.anchor).toEqual(anchor);
    expect(b.at).toBe("2026-08-07T15:45:00.000Z");
    expect(b.via).toBe(dwellVia(pick.hit!));
    expect(b.via).toMatch(/^gps_dwell /);
  });

  it("a dwell whose odometer cannot be anchored is NULL with that reason — never a guess", () => {
    const b = resolveStopBoundary("departure", stop, undefined, { anchor: null, reason: "no reading near the time" }, pick);
    expect(b.anchor).toBeNull();
    expect(b.reason).toMatch(/GPS dwell at .* no reading near the time/);
  });

  it("no dwell keeps the original refusal and appends the dwell reason", () => {
    const none = pickStopDwell("departure", STOP, REF, [], [], true);
    const b = resolveStopBoundary("departure", stop, undefined, undefined, none);
    expect(b.anchor).toBeNull();
    expect(b.reason).toMatch(/not a measurement; GPS dwell: no truck dwell/);
  });

  it("a device-recorded stop time still wins over a dwell", () => {
    const anchor = { odometer_mi: 1, read_at: "2026-08-07T05:00:00.000Z", source: "vehicle_locations" as const };
    const b = resolveStopBoundary("departure", { ...stop, departure_source: "eld_geofence" }, undefined, { anchor, reason: null }, pick);
    expect(b.via).toBe("eld_geofence");
  });
});
