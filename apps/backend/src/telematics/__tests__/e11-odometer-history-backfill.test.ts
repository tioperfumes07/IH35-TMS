/**
 * E11 / ENG-29 (LEAD 11-03) — boundaries the anchor rule could not measure get Samsara's own odometer reads.
 * Fail-old: before E11 nothing stored those reads (144 of 148 loads without real miles: no odometer 08-27 … 09-29).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { pickAnchor } from "../odometer-anchor.js";
import {
  _resetAnsweredEmptyForTests, pickBoundaryReads, planOdometerBackfill, runOdometerHistoryBackfill, writeBoundaryReads,
  type OdometerRead,
} from "../odometer-history-backfill.service.js";

const at = "2026-09-03T20:15:00.000Z";
const r = (iso: string, miles: number): OdometerRead => ({ at: new Date(iso), miles });

describe("E11 pickBoundaryReads", () => {
  it("takes the nearest read at/before and at/after inside 30 minutes", () => {
    const p = pickBoundaryReads(at, [r("2026-09-03T19:40:00Z", 100), r("2026-09-03T20:14:30Z", 120), r("2026-09-03T20:15:30Z", 121), r("2026-09-03T20:50:00Z", 140)]);
    expect(p.before?.miles).toBe(120);
    expect(p.after?.miles).toBe(121);
  });
  it("never reaches outside the window and drops zero / non-finite reads", () => {
    const p = pickBoundaryReads(at, [r("2026-09-03T19:40:00Z", 100), r("2026-09-03T20:20:00Z", 0), r("2026-09-03T20:50:00Z", 140)]);
    expect(p).toEqual({ before: null, after: null });
  });
  it("a stored before-read inside 30 minutes is an anchor the unchanged anchor rule accepts for a moving truck", () => {
    const p = pickBoundaryReads(at, [r("2026-09-03T20:14:30Z", 120)]);
    const anchor = pickAnchor(at, { odometer_mi: p.before!.miles, read_at: p.before!.at.toISOString(), source: "odometer_readings" }, 500);
    expect(anchor.anchor?.odometer_mi).toBe(120);
  });
});

function fakeDb() {
  const inserts: unknown[][] = [];
  const planRows: Array<{ unit_id: string; at: string; vid: string | null; attempted: boolean }> = [];
  const client = {
    async query(sql: string, values: unknown[] = []) {
      if (/FROM unnest\(\$2::uuid\[\], \$3::timestamptz\[\]\)/.test(sql)) return { rows: planRows };
      if (/INSERT INTO telematics\.odometer_readings/.test(sql)) { inserts.push(values); return { rows: [{ id: String(inserts.length) }] }; }
      return { rows: [] };
    },
  };
  return { client, inserts, planRows };
}

describe("E11 plan / write", () => {
  beforeEach(() => _resetAnsweredEmptyForTests());
  it("asks only for un-attempted boundaries of trucks with a Samsara id, ±30 minutes", async () => {
    const db = fakeDb();
    db.planRows.push({ unit_id: "u1", at, vid: "v1", attempted: false }, { unit_id: "u2", at, vid: "v2", attempted: true }, { unit_id: "u3", at, vid: null, attempted: false });
    const p = await planOdometerBackfill(db.client as never, "c", [{ key: "a", unit_id: "u1", at }, { key: "b", unit_id: "u2", at }, { key: "c", unit_id: "u3", at }]);
    expect(p.requests).toEqual([{ unit_id: "u1", vehicle_id: "v1", at, from: "2026-09-03T19:45:00.000Z", to: "2026-09-03T20:45:00.000Z" }]);
    expect(p.skipped_attempted).toBe(1);
    expect(p.skipped_no_vehicle).toBe(1);
  });
  it("stores only Samsara's measured reads; an empty window writes nothing and is not asked again", async () => {
    const db = fakeDb();
    const q1 = { unit_id: "u1", vehicle_id: "v1", at, from: "x", to: "y" };
    const q2 = { unit_id: "u2", vehicle_id: "v2", at, from: "x", to: "y" };
    const w = await writeBoundaryReads(db.client as never, "c", new Map([[q1, [r("2026-09-03T20:14:30Z", 120.04), r("2026-09-03T20:15:30Z", 121)]], [q2, []]]));
    expect(w).toEqual({ reads_written: 2, empty_windows: 1 });
    expect(db.inserts.map((v) => v[3])).toEqual([120, 121]);
    expect(db.inserts.every((v) => v.length === 4)).toBe(true);
    db.planRows.push({ unit_id: "u2", at, vid: "v2", attempted: false });
    const again = await planOdometerBackfill(db.client as never, "c", [{ key: "b", unit_id: "u2", at }]);
    expect(again.requests).toEqual([]);
  });
});

describe("E11 runOdometerHistoryBackfill", () => {
  beforeEach(() => _resetAnsweredEmptyForTests());
  it("plans in one transaction, asks Samsara outside it, writes in another; a failed call is retried next tick", async () => {
    const db = fakeDb();
    db.planRows.push({ unit_id: "u1", at, vid: "v1", attempted: false }, { unit_id: "u2", at: "2026-09-04T10:00:00.000Z", vid: "v2", attempted: false });
    let open = 0;
    let httpInsideTx = false;
    const summary = await runOdometerHistoryBackfill("c", {
      withDb: async (fn) => { open += 1; try { return await fn(db.client as never); } finally { open -= 1; } },
      historyFor: async () => async (ids) => {
        if (open > 0) httpInsideTx = true;
        if (ids[0] === "v2") throw new Error("samsara_http_503");
        return new Map([["v1", [r("2026-09-03T20:10:00Z", 5000)]]]);
      },
      gapsFor: async () => [{ key: "a", unit_id: "u1", at }, { key: "b", unit_id: "u2", at: "2026-09-04T10:00:00.000Z" }],
    });
    expect(httpInsideTx).toBe(false);
    expect(summary).toMatchObject({ gaps: 2, asked: 2, reads_written: 1, fetch_failed: 1, empty_windows: 0 });
  });
  it("does nothing without Samsara", async () => {
    const db = fakeDb();
    const s = await runOdometerHistoryBackfill("c", {
      withDb: async (fn) => fn(db.client as never), historyFor: async () => null, gapsFor: async () => [{ key: "a", unit_id: "u1", at }],
    });
    expect(s.asked).toBe(0);
    expect(db.inserts).toEqual([]);
  });
});
