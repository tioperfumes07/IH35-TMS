import { describe, expect, it } from "vitest";
import { classifyStops, metersBetween, sameFacilityName, VERIFY_RADIUS_M } from "../stop-gps-verification.service.js";

// LEAD 443.74 — every stop verified against the unit's GPS dwell; pure classification, no DB.
const day = (d: string) => new Date(`${d}T05:00:00Z`);
const dwell = (lat: number, lng: number, start: string, minutes: number) => {
  const s = new Date(start);
  return { unitId: "u", startedAt: s, endedAt: new Date(s.getTime() + minutes * 60000), dwellMinutes: minutes, sampleCount: 10, lat, lng,
    city: null, state: null, odometerMi: null, odometerReadAt: null, odometerAgeMinutes: null, odometerNote: "" };
};
const stop = (seq: number, type: string, lat: number | null, lng: number | null, d: string) =>
  ({ stop_id: `s${seq}`, sequence_number: seq, stop_type: type, lat, lng, day: day(d), document_address: `doc ${seq}` });
const always = () => true;

describe("classifyStops (443.74)", () => {
  it("a dwell inside the fence radius on the stop's day verifies the stop", () => {
    const [v] = classifyStops([stop(1, "pickup", 27.62, -99.476, "2026-10-08")], [dwell(27.6205, -99.4762, "2026-10-08T15:00:00Z", 90)], always);
    expect(v.verdict).toBe("verified");
    expect(v.distance_m).toBeLessThanOrEqual(VERIFY_RADIUS_M);
  });
  it("13660 shape: the truck loaded 96 km away — the stop disagrees and points at the dwell", () => {
    const [v] = classifyStops([stop(1, "pickup", 35.0158479, -78.1108299, "2026-10-05")],
      [dwell(34.6086, -79.0409, "2026-10-05T14:49:44Z", 239.4), dwell(34.6077, -79.0431, "2026-10-05T18:59:24Z", 60.9)], always);
    expect(v.verdict).toBe("disagrees");
    expect(v.dwell).toMatchObject({ lat: 34.6086, lng: -79.0409 });
    expect(Math.round((v.distance_m ?? 0) / 1000)).toBe(96);
  });
  it("a delivery takes the latest of the longest dwells, a pickup the earliest", () => {
    const ds = [dwell(30, -90, "2026-10-07T05:00:00Z", 100), dwell(30.5, -90.5, "2026-10-07T20:00:00Z", 100)];
    expect(classifyStops([stop(1, "pickup", 40, -80, "2026-10-07")], ds, always)[0].dwell?.lat).toBe(30);
    expect(classifyStops([stop(1, "delivery", 40, -80, "2026-10-07")], ds, always)[0].dwell?.lat).toBe(30.5);
  });
  it("each stop's dwell starts after the previous stop's dwell", () => {
    const ds = [dwell(30, -90, "2026-10-07T05:00:00Z", 200), dwell(31, -91, "2026-10-07T12:00:00Z", 150)];
    const v = classifyStops([stop(1, "pickup", 40, -80, "2026-10-07"), stop(2, "delivery", 41, -81, "2026-10-07")], ds, always);
    expect(v[0].dwell?.lat).toBe(30);
    expect(v[1].dwell?.lat).toBe(31);
  });
  it("no fixes on the stop's day = no_gps; fixes but no dwell = no_dwell; no point = no_point — the stop stays as the document says", () => {
    expect(classifyStops([stop(1, "pickup", 40, -80, "2026-10-07")], [], () => false)[0].verdict).toBe("no_gps");
    expect(classifyStops([stop(1, "pickup", 40, -80, "2026-10-07")], [], always)[0].verdict).toBe("no_dwell");
    expect(classifyStops([stop(1, "pickup", null, null, "2026-10-07")], [], always)[0].verdict).toBe("no_point");
  });
  it("metersBetween is the haversine distance", () => {
    expect(Math.round(metersBetween(35.0158479, -78.1108299, 34.6086, -79.0409) / 1000)).toBe(96);
  });
  it("a dwell 2,500 km away is the truck elsewhere on those dates — gps_elsewhere, never a correction", () => {
    const [v] = classifyStops([stop(1, "delivery", 40.53, -74.35, "2026-09-21")], [dwell(29.29, -98.66, "2026-09-21T10:00:00Z", 300)], always);
    expect(v.verdict).toBe("gps_elsewhere");
  });
  it("a facility is confirmed only by a distinctive shared name word", () => {
    expect(sameFacilityName("US COLD STORAGE WARSAW NC", "United States Cold Storage")).toBe(true);
    expect(sameFacilityName("WAL MART (TEXAS) - LANCASTER", "Walmart Distribution Center 8348")).toBe(true);
    expect(sameFacilityName("Semares", "Robert A Martinez MD")).toBe(false);
    expect(sameFacilityName("RLS Logistics Delanco", "ID Logistics")).toBe(false);
  });
});
