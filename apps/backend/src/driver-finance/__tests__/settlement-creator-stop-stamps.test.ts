import { describe, expect, it, vi } from "vitest";
import { stampStopsFromTracking, STOP_MATCH_RADIUS_M } from "../settlement-creator-deliver.js";

type Rows = Record<string, unknown>[];
function fake(stops: Rows, events: Rows, opts: { unit?: string | null } = {}) {
  const updates: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (/FROM mdata\.loads WHERE id/.test(sql)) return { rows: [{ load_number: "13508", unit_id: opts.unit === undefined ? "u-T156" : opts.unit, company_id: "co" }] };
      if (/FROM mdata\.load_stops WHERE load_id/.test(sql)) return { rows: stops };
      if (/FROM telematics\.unit_stop_events/.test(sql)) return { rows: events };
      if (/UPDATE mdata\.load_stops/.test(sql)) { updates.push({ sql, params }); return { rows: [] }; }
      return { rows: [] };
    }),
  };
  return { client, updates };
}
const pickup = { id: "s1", sequence_number: 1, stop_type: "pickup", latitude: "27.53", longitude: "-99.48", sched_day: null, stamped: false };
const delivery = { id: "s2", sequence_number: 2, stop_type: "delivery", latitude: "32.77", longitude: "-96.79", sched_day: null, stamped: false };

describe("ROUND 443.16 — stop stamps come from the tracking data", () => {
  it("a stop event at the stop on its date -> real started_at / ended_at, eld_geofence, linked by stop event id", async () => {
    const { client, updates } = fake([pickup], [{ id: "ev1", started_at: "2026-08-06T15:12:00Z", ended_at: "2026-08-06T17:40:00Z", metres: "120" }]);
    const r = await stampStopsFromTracking(client as never, "l", { pickupDate: "2026-08-06", deliveryDate: "2026-08-07" });
    expect(r[0]).toMatchObject({ precision: "tracked", stop_event_id: "ev1", arrival_at: "2026-08-06T15:12:00Z", departure_at: "2026-08-06T17:40:00Z" });
    expect(updates[0]!.sql).toMatch(/actual_stamp_precision = 'tracked'/);
    expect(updates[0]!.params).toEqual(["s1", "2026-08-06T15:12:00Z", "2026-08-06T17:40:00Z", "ev1"]);
  });
  it("several candidates -> the nearest, and the result says so", async () => {
    const { client } = fake([pickup], [{ id: "near", started_at: "a", ended_at: "b", metres: "40" }, { id: "far", started_at: "c", ended_at: "d", metres: "600" }]);
    const r = await stampStopsFromTracking(client as never, "l", { pickupDate: "2026-08-06" });
    expect(r[0]).toMatchObject({ stop_event_id: "near", note: expect.stringContaining("nearest of 2") });
  });
  it("no stop event -> the document date, date_only, manual — never an invented clock time, with the reason", async () => {
    const { client, updates } = fake([delivery], []);
    const r = await stampStopsFromTracking(client as never, "l", { deliveryDate: "2026-08-07" });
    expect(r[0]).toMatchObject({ precision: "date_only", stop_event_id: null, note: expect.stringContaining(`within ${STOP_MATCH_RADIUS_M} m on 2026-08-07`) });
    expect(updates[0]!.sql).toMatch(/actual_stamp_precision = 'date_only'/);
    expect(updates[0]!.sql).not.toMatch(/T18:00/);
  });
  it("a load with no truck is date only, saying why", async () => {
    const { client } = fake([pickup], [], { unit: null });
    const r = await stampStopsFromTracking(client as never, "l", { pickupDate: "2026-08-06" });
    expect(r[0]).toMatchObject({ precision: "date_only", note: expect.stringContaining("no truck") });
  });
  it("a stop already stamped is never overwritten", async () => {
    const { client, updates } = fake([{ ...pickup, stamped: true }], []);
    const r = await stampStopsFromTracking(client as never, "l", { pickupDate: "2026-08-06" });
    expect(r[0]!.precision).toBe("already_stamped");
    expect(updates).toHaveLength(0);
  });
});

import { localDayStartIso } from "../settlement-creator-deliver.js";
describe("date-only instants are the local day start, DST-correct (never an invented hour)", () => {
  it("summer (CDT, -05:00)", () => expect(localDayStartIso("2026-08-07")).toBe("2026-08-07T05:00:00.000Z"));
  it("winter (CST, -06:00)", () => expect(localDayStartIso("2026-12-07")).toBe("2026-12-07T06:00:00.000Z"));
});
