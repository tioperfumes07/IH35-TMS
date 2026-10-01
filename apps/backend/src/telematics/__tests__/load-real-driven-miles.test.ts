import { describe, expect, it } from "vitest";
import { pickAnchor, realDrivenMiles, type OdometerAnchor } from "../odometer-anchor.js";
import {
  computeLoadRealDrivenMiles,
  loadTotalFromLegs,
  resolveStopBoundary,
  stopTimesOutOfOrder,
  type LegRow,
} from "../load-real-driven-miles.service.js";

const A = (odometer_mi: number, read_at: string, source: OdometerAnchor["source"] = "vehicle_locations"): OdometerAnchor => ({ odometer_mi, read_at, source });
const stop = (o: Partial<Parameters<typeof resolveStopBoundary>[1]> = {}) => ({
  stop_id: "s1", load_id: "l1", unit_id: "u1", sequence_number: 2, latitude: 27.5, longitude: -99.5,
  arrival_at: "2026-10-01T15:00:00.000Z", departure_at: "2026-10-01T17:00:00.000Z", scheduled_arrival_at: null,
  arrival_source: "manual", departure_source: "manual", ...o,
});

describe("shared odometer anchor", () => {
  it("a reading AFTER the boundary counts only when the truck did not move in between", () => {
    const after = A(500010, "2026-10-01T15:20:00.000Z");
    expect(pickAnchor("2026-10-01T15:00:00.000Z", null, 0, after, 0).anchor).toEqual(after);
    expect(pickAnchor("2026-10-01T15:00:00.000Z", null, 0, after, 3).anchor).toBeNull();
  });
  it("a valid before-anchor wins over an after-anchor", () => {
    const before = A(500000, "2026-10-01T14:50:00.000Z");
    expect(pickAnchor("2026-10-01T15:00:00.000Z", before, 9, A(500010, "2026-10-01T15:20:00.000Z"), 0).anchor).toEqual(before);
  });
  it("missing anchors are null with a reason, never 0", () => {
    expect(realDrivenMiles(null, A(1, "y"), "gap", null)).toEqual({ miles: null, reason: "start: gap" });
  });
});

describe("load real driven miles -- odometer only, NULL with a reason, never 0", () => {
  it("a geofence capture with a real OBD odometer is the boundary", () => {
    const b = resolveStopBoundary("arrival", stop(), { odo: 412345.6, at: "2026-10-01T15:03:00Z", src: "real_obd" }, undefined);
    expect(b.anchor?.odometer_mi).toBe(412345.6);
    expect(b.via).toBe("geofence");
  });
  it("an interpolated or absent geofence odometer is not a measurement", () => {
    expect(resolveStopBoundary("arrival", stop(), { odo: 1, at: "x", src: "interpolated" }, undefined).reason).toMatch(/interpolated odometer -- not a measurement/);
    expect(resolveStopBoundary("departure", stop(), { odo: null, at: "x", src: "absent" }, undefined).anchor).toBeNull();
  });
  it("a manual or unsourced stop time is never measured", () => {
    expect(resolveStopBoundary("arrival", stop(), undefined, { anchor: A(1, "x"), reason: null }).reason).toMatch(/manual entry, not a measurement/);
    expect(resolveStopBoundary("arrival", stop({ arrival_source: null }), undefined, undefined).reason).toMatch(/unsourced entry/);
  });
  it("a device-recorded stop time resolves through the anchor rule", () => {
    const b = resolveStopBoundary("arrival", stop({ arrival_source: "eld_geofence" }), undefined, { anchor: A(9, "t"), reason: null });
    expect(b.anchor?.odometer_mi).toBe(9);
    expect(b.via).toBe("eld_geofence");
  });
  it("stop times out of order refuse with that reason (not 'odometer went backwards')", () => {
    expect(stopTimesOutOfOrder("2026-08-07T12:00:00Z", "2026-08-07T08:00:00Z", "loaded", 2)).toMatch(/stop 1 departure .* is not before stop 2 arrival/);
    expect(stopTimesOutOfOrder("2026-08-07T08:00:00Z", "2026-08-07T12:00:00Z", "loaded", 2)).toBeNull();
  });
  it("load total = loaded legs only; deadhead stays on stop 1; a missing loaded leg makes the load NULL", () => {
    const leg = (kind: LegRow["kind"], seq: number, miles: number | null): LegRow => ({ stop_id: `s${seq}`, sequence_number: seq, kind, from_at: null, to_at: null, miles, source: miles == null ? null : "odometer", reason: miles == null ? "gap" : null });
    expect(loadTotalFromLegs([leg("deadhead", 1, null), leg("loaded", 2, 900.4), leg("loaded", 3, 100.2)])).toMatchObject({ miles: 1000.6, reason: null });
    expect(loadTotalFromLegs([leg("deadhead", 1, 50), leg("loaded", 2, null)])).toMatchObject({ miles: null, reason: "stop 2 (loaded leg): gap" });
    expect(loadTotalFromLegs([leg("deadhead", 1, 50)])).toMatchObject({ miles: null, reason: "load has a single stop -- no loaded leg" });
  });
  it("end to end (mocked db): geofence exit at pickup -> entry at delivery", async () => {
    const client = {
      query: async <T>(sql: string): Promise<{ rows: T[] }> => {
        const r = (x: unknown[]) => ({ rows: x as T[] });
        if (sql.includes("JOIN mdata.load_stops s ON s.load_id = l.id")) return r([
          stop({ stop_id: "p", sequence_number: 1, arrival_at: "2026-10-01T10:00:00Z", departure_at: "2026-10-01T11:00:00Z" }),
          stop({ stop_id: "d", sequence_number: 2, arrival_at: "2026-10-01T20:00:00Z", departure_at: null }),
        ]);
        if (sql.includes("telematics.geofence_odometer_captures")) return r([
          { k: "p:departure", odo: "400000.0", at: "2026-10-01T11:05:00Z", src: "real_obd" },
          { k: "d:arrival", odo: "400512.3", at: "2026-10-01T19:58:00Z", src: "real_obd" },
        ]);
        return r([]);
      },
    };
    const [row] = await computeLoadRealDrivenMiles(client, "00000000-0000-4000-8000-0000000000aa", ["l1"]);
    expect(row.legs[0]).toMatchObject({ kind: "deadhead", miles: null, reason: expect.stringMatching(/deadhead start unknown/) });
    expect(row.legs[1]).toMatchObject({ kind: "loaded", miles: 512.3, source: "odometer:geofence->geofence" });
    expect(row.miles_driven_actual).toBe(512.3);
  });
});
