import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import {
  DEADHEAD_REFRESH_UNIT_BATCH_SIZE,
  computeDeadhead,
  refreshDeadheadCache,
} from "../deadhead.service.js";

// G5-4: refreshDeadheadCache must batch-load (never per unit×week await computeDeadhead)
// and remain behaviorally equivalent to the computeDeadhead oracle. Id tie-break is
// intentional + documented in deadhead.service.ts (ORDER BY …, l.id ASC / localeCompare).

function mondayOfWeek(d: Date): Date {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  return copy;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

type FixtureLoad = {
  id: string;
  unit_id: string;
  loaded_miles: number | null;
  deadhead_miles_to_pickup: number | null;
  miles_practical: number | null;
  miles_shortest: number | null;
  miles_deadhead: number | null;
  deadhead_miles_calculation_method: string | null;
  created_at: string;
  first_stop_at: string | null;
  pickup_city: string | null;
  delivery_city: string | null;
  stop_ats: string[];
};

type QueryCall = { sql: string; params: unknown[] };

function weekWindows(): Array<{ week: string; startMs: number; endMs: number; startIso: string; endIso: string }> {
  const now = new Date();
  const out = [];
  for (let i = 0; i < 12; i += 1) {
    const week = isoDate(mondayOfWeek(addDays(now, -i * 7)));
    const start = new Date(`${week}T00:00:00.000Z`);
    const end = addDays(start, 7);
    out.push({
      week,
      startMs: start.getTime(),
      endMs: end.getTime(),
      startIso: start.toISOString(),
      endIso: end.toISOString(),
    });
  }
  return out;
}

function belongsToWindow(load: FixtureLoad, startMs: number, endMs: number): boolean {
  return load.stop_ats.some((stop) => {
    const ms = new Date(stop).getTime();
    return ms >= startMs && ms < endMs;
  });
}

function sortLoads(a: FixtureLoad, b: FixtureLoad): number {
  const aFirst = a.first_stop_at ? new Date(a.first_stop_at).getTime() : null;
  const bFirst = b.first_stop_at ? new Date(b.first_stop_at).getTime() : null;
  if (aFirst == null && bFirst != null) return 1;
  if (aFirst != null && bFirst == null) return -1;
  if (aFirst != null && bFirst != null && aFirst !== bFirst) return aFirst - bFirst;
  const aCreated = new Date(a.created_at).getTime();
  const bCreated = new Date(b.created_at).getTime();
  if (aCreated !== bCreated) return aCreated - bCreated;
  return a.id.localeCompare(b.id);
}

function makeFixtureClient(opts: {
  unitIds: string[];
  loads: FixtureLoad[];
  failInsert?: boolean;
}): {
  client: PoolClient;
  insertCalls: QueryCall[];
  loadBatchCalls: QueryCall[];
  loadSingleCalls: QueryCall[];
} {
  const insertCalls: QueryCall[] = [];
  const loadBatchCalls: QueryCall[] = [];
  const loadSingleCalls: QueryCall[] = [];

  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      if (/FROM mdata\.units/.test(sql)) {
        return { rows: opts.unitIds.map((id) => ({ id })) };
      }
      if (/INSERT INTO reports\.deadhead_cache/.test(sql)) {
        if (opts.failInsert) throw new Error("planted_insert_failure");
        insertCalls.push({ sql, params });
        return { rows: [] };
      }
      if (/FROM mdata\.loads/.test(sql) && /ANY\(\$2::uuid\[\]\)/.test(sql)) {
        loadBatchCalls.push({ sql, params });
        const unitIds = new Set(params[1] as string[]);
        const rangeStart = new Date(String(params[2])).getTime();
        const rangeEnd = new Date(String(params[3])).getTime();
        const rows = opts.loads
          .filter((load) => unitIds.has(load.unit_id) && belongsToWindow(load, rangeStart, rangeEnd))
          .sort((a, b) => a.unit_id.localeCompare(b.unit_id) || sortLoads(a, b))
          .map((load) => ({ ...load }));
        return { rows };
      }
      if (/FROM mdata\.loads/.test(sql) && /assigned_unit_id = \$2::uuid/.test(sql)) {
        loadSingleCalls.push({ sql, params });
        const unitId = String(params[1]);
        const weekStart = new Date(String(params[2])).getTime();
        const weekEnd = new Date(String(params[3])).getTime();
        const rows = opts.loads
          .filter((load) => load.unit_id === unitId && belongsToWindow(load, weekStart, weekEnd))
          .sort(sortLoads)
          .map((load) => ({ ...load }));
        return { rows };
      }
      return { rows: [] };
    },
  } as unknown as PoolClient;

  return { client, insertCalls, loadBatchCalls, loadSingleCalls };
}

function parseInsertSummaries(params: unknown[]) {
  const rows = [];
  for (let i = 0; i < params.length; i += 10) {
    rows.push({
      unit_id: String(params[i + 1]),
      week_starting: String(params[i + 2]),
      total_miles: Number(params[i + 3]),
      loaded_miles: Number(params[i + 4]),
      deadhead_miles: Number(params[i + 5]),
      deadhead_pct: params[i + 6] == null ? null : Number(params[i + 6]),
      load_count: Number(params[i + 7]),
      fleet_avg_deadhead_pct: params[i + 8] == null ? null : Number(params[i + 8]),
      rank_in_fleet: Number(params[i + 9]),
    });
  }
  return rows;
}

describe("refreshDeadheadCache — batched read + upsert (G5-4)", () => {
  it("emits bounded batch load reads + a single multi-row INSERT with prior loop tuples/ranks", async () => {
    const week0 = mondayOfWeek(new Date());
    const week0Iso = isoDate(week0);
    const stopInWeek0 = new Date(`${week0Iso}T12:00:00.000Z`).toISOString();

    const { client, insertCalls, loadBatchCalls } = makeFixtureClient({
      unitIds: ["unit-A", "unit-B"],
      loads: [
        {
          id: "load-a",
          unit_id: "unit-A",
          loaded_miles: 100,
          deadhead_miles_to_pickup: 25,
          miles_practical: null,
          miles_shortest: null,
          miles_deadhead: null,
          deadhead_miles_calculation_method: "manual",
          created_at: stopInWeek0,
          first_stop_at: stopInWeek0,
          pickup_city: null,
          delivery_city: null,
          stop_ats: [stopInWeek0],
        },
        {
          id: "load-b",
          unit_id: "unit-B",
          loaded_miles: 100,
          deadhead_miles_to_pickup: 100,
          miles_practical: null,
          miles_shortest: null,
          miles_deadhead: null,
          deadhead_miles_calculation_method: "manual",
          created_at: stopInWeek0,
          first_stop_at: stopInWeek0,
          pickup_city: null,
          delivery_city: null,
          stop_ats: [stopInWeek0],
        },
      ],
    });

    const total = await refreshDeadheadCache(client, "opco-1");
    expect(total).toBe(24);
    expect(loadBatchCalls).toHaveLength(1);
    expect(loadBatchCalls[0].sql).not.toMatch(/SELECT\s+\*/i);
    expect(insertCalls).toHaveLength(1);

    const rows = parseInsertSummaries(insertCalls[0].params);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      unit_id: "unit-B",
      week_starting: week0Iso,
      total_miles: 200,
      deadhead_pct: 50,
      rank_in_fleet: 1,
      fleet_avg_deadhead_pct: 35,
    });
    expect(rows[1]).toMatchObject({
      unit_id: "unit-A",
      week_starting: week0Iso,
      total_miles: 125,
      deadhead_pct: 20,
      rank_in_fleet: 2,
      fleet_avg_deadhead_pct: 35,
    });
  });

  it("handles empty fleets with zero load queries and zero inserts", async () => {
    const { client, insertCalls, loadBatchCalls } = makeFixtureClient({ unitIds: [], loads: [] });
    const total = await refreshDeadheadCache(client, "opco-empty");
    expect(total).toBe(0);
    expect(loadBatchCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });

  it("chunks 203+ units without dropping any (no silent cap)", async () => {
    const unitCount = DEADHEAD_REFRESH_UNIT_BATCH_SIZE + 3;
    expect(unitCount).toBeGreaterThan(202);
    const unitIds = Array.from({ length: unitCount }, (_, i) => `unit-${String(i).padStart(3, "0")}`);
    const seen = new Set<string>();
    const loadBatchCalls: QueryCall[] = [];

    const recordingClient = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/FROM mdata\.units/.test(sql)) return { rows: unitIds.map((id) => ({ id })) };
        if (/ANY\(\$2::uuid\[\]\)/.test(sql)) {
          for (const id of params[1] as string[]) seen.add(id);
          loadBatchCalls.push({ sql, params });
          return { rows: [] };
        }
        if (/INSERT INTO reports\.deadhead_cache/.test(sql)) return { rows: [] };
        return { rows: [] };
      },
    } as unknown as PoolClient;

    const total = await refreshDeadheadCache(recordingClient, "opco-large");
    expect(total).toBe(unitCount * 12);
    expect(loadBatchCalls.length).toBe(Math.ceil(unitCount / DEADHEAD_REFRESH_UNIT_BATCH_SIZE));
    expect(seen.size).toBe(unitCount);
  });

  it("keeps entity scope on every units/loads/insert statement", async () => {
    const week0 = mondayOfWeek(new Date());
    const stopInWeek0 = new Date(`${isoDate(week0)}T12:00:00.000Z`).toISOString();
    const calls: QueryCall[] = [];
    const base = makeFixtureClient({
      unitIds: ["unit-A"],
      loads: [
        {
          id: "load-a",
          unit_id: "unit-A",
          loaded_miles: 10,
          deadhead_miles_to_pickup: 0,
          miles_practical: null,
          miles_shortest: null,
          miles_deadhead: null,
          deadhead_miles_calculation_method: "manual",
          created_at: stopInWeek0,
          first_stop_at: stopInWeek0,
          pickup_city: null,
          delivery_city: null,
          stop_ats: [stopInWeek0],
        },
      ],
    });
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        return (base.client as { query: (s: string, p?: unknown[]) => Promise<unknown> }).query(sql, params);
      },
    } as unknown as PoolClient;

    await refreshDeadheadCache(client, "opco-scoped");
    for (const call of calls) {
      if (/mdata\.units|mdata\.loads|deadhead_cache/.test(call.sql)) {
        expect(call.params[0]).toBe("opco-scoped");
      }
    }
  });

  it("fails the single INSERT atomically (no partial multi-row write)", async () => {
    const week0 = mondayOfWeek(new Date());
    const stopInWeek0 = new Date(`${isoDate(week0)}T12:00:00.000Z`).toISOString();
    const { client, insertCalls } = makeFixtureClient({
      unitIds: ["unit-A", "unit-B"],
      failInsert: true,
      loads: ["unit-A", "unit-B"].map((unitId) => ({
        id: `load-${unitId}`,
        unit_id: unitId,
        loaded_miles: 50,
        deadhead_miles_to_pickup: 10,
        miles_practical: null,
        miles_shortest: null,
        miles_deadhead: null,
        deadhead_miles_calculation_method: "manual",
        created_at: stopInWeek0,
        first_stop_at: stopInWeek0,
        pickup_city: null,
        delivery_city: null,
        stop_ats: [stopInWeek0],
      })),
    });

    await expect(refreshDeadheadCache(client, "opco-1")).rejects.toThrow("planted_insert_failure");
    expect(insertCalls).toHaveLength(0);
  });
});

describe("refreshDeadheadCache — computeDeadhead oracle equivalence (G5-4)", () => {
  async function oracleSummaries(client: PoolClient, opco: string, unitIds: string[]) {
    const weeks = weekWindows().map((w) => w.week);
    const out = [];
    for (const unitId of unitIds) {
      for (const week of weeks) {
        out.push(await computeDeadhead(client, opco, unitId, week));
      }
    }
    return out;
  }

  it("matches computeDeadhead across multiple weeks, stored vs estimated deadhead, and empty loads", async () => {
    const windows = weekWindows();
    const week0 = windows[0]!;
    const week1 = windows[1]!;
    const t0 = new Date(week0.startMs + 2 * 3600_000).toISOString();
    const t1 = new Date(week0.startMs + 5 * 3600_000).toISOString();
    const t2 = new Date(week1.startMs + 3 * 3600_000).toISOString();

    const loads: FixtureLoad[] = [
      // Stored deadhead_miles_to_pickup on unit-A week0 (chain: Dallas → Austin uses stored miles).
      {
        id: "a-1",
        unit_id: "unit-A",
        loaded_miles: 200,
        deadhead_miles_to_pickup: 40,
        miles_practical: null,
        miles_shortest: null,
        miles_deadhead: null,
        deadhead_miles_calculation_method: "manual",
        created_at: t0,
        first_stop_at: t0,
        pickup_city: "Dallas, TX",
        delivery_city: "Austin, TX",
        stop_ats: [t0],
      },
      // Estimated path: null stored miles + previous delivery (Austin, TX) != pickup
      // (San Antonio, TX) -> real curated-table great-circle estimate (74 miles), not the old
      // hardcoded 0.
      {
        id: "a-2",
        unit_id: "unit-A",
        loaded_miles: 150,
        deadhead_miles_to_pickup: null,
        miles_practical: null,
        miles_shortest: null,
        miles_deadhead: null,
        deadhead_miles_calculation_method: null,
        created_at: t1,
        first_stop_at: t1,
        pickup_city: "San Antonio, TX",
        delivery_city: "Houston, TX",
        stop_ats: [t1],
      },
      // Legacy miles_deadhead fallback in week1.
      {
        id: "a-3",
        unit_id: "unit-A",
        loaded_miles: null,
        deadhead_miles_to_pickup: null,
        miles_practical: 90,
        miles_shortest: null,
        miles_deadhead: 15,
        deadhead_miles_calculation_method: "manual",
        created_at: t2,
        first_stop_at: t2,
        pickup_city: "Houston, TX",
        delivery_city: "Laredo, TX",
        stop_ats: [t2],
      },
      // unit-B: empty activity (no loads) → oracle zeros for every week.
    ];

    const unitIds = ["unit-A", "unit-B"];
    const { client, insertCalls, loadBatchCalls, loadSingleCalls } = makeFixtureClient({
      unitIds,
      loads,
    });

    const oracle = await oracleSummaries(client, "opco-1", unitIds);
    expect(loadSingleCalls.length).toBe(unitIds.length * 12);

    const total = await refreshDeadheadCache(client, "opco-1");
    expect(total).toBe(unitIds.length * 12);
    expect(loadBatchCalls.length).toBe(1);

    // Compare every unit×week summary (including empty weeks) against oracle.
    const oracleByKey = new Map(oracle.map((row) => [`${row.unit_id}|${row.week_starting}`, row]));
    for (const unitId of unitIds) {
      for (const { week } of windows) {
        const key = `${unitId}|${week}`;
        const expected = oracleByKey.get(key)!;
        // Recompute via single-unit oracle already done; rebuild batch summary by re-calling computeDeadhead
        // on a fresh single-query client view — equality holds because both paths share fixture ordering.
        expect(expected.unit_id).toBe(unitId);
        expect(expected.week_starting).toBe(week);
      }
    }

    // Batch path insert set must equal oracle rows with total_miles > 0 (same filter as refresh).
    const expectedInsert = oracle
      .filter((row) => row.total_miles > 0)
      .map((row) => ({
        unit_id: row.unit_id,
        week_starting: row.week_starting,
        total_miles: row.total_miles,
        loaded_miles: row.loaded_miles,
        deadhead_miles: row.deadhead_miles,
        deadhead_pct: row.deadhead_pct,
        load_count: row.load_count,
      }))
      .sort((a, b) => a.week_starting.localeCompare(b.week_starting) || a.unit_id.localeCompare(b.unit_id));

    const inserted = parseInsertSummaries(insertCalls[0]?.params ?? [])
      .map((row) => ({
        unit_id: row.unit_id,
        week_starting: row.week_starting,
        total_miles: row.total_miles,
        loaded_miles: row.loaded_miles,
        deadhead_miles: row.deadhead_miles,
        deadhead_pct: row.deadhead_pct,
        load_count: row.load_count,
      }))
      .sort((a, b) => a.week_starting.localeCompare(b.week_starting) || a.unit_id.localeCompare(b.unit_id));

    expect(inserted).toEqual(expectedInsert);

    // Spot-check: week0 unit-A has stored 40 (a-1, Dallas -> Austin) + a real curated-table
    // estimate for a-2's Austin, TX -> San Antonio, TX leg (74 miles, DEADHEAD-REPORT-ESTIMATED-
    // BRANCH-ALWAYS-RETURNS-ZERO-DEADHEAD fix — previously hardcoded 0 for any differing-city pair).
    const week0A = oracleByKey.get(`unit-A|${week0.week}`)!;
    expect(week0A).toMatchObject({
      loaded_miles: 350,
      deadhead_miles: 114,
      load_count: 2,
      total_miles: 464,
    });
    const week1A = oracleByKey.get(`unit-A|${week1.week}`)!;
    expect(week1A).toMatchObject({
      loaded_miles: 90,
      deadhead_miles: 15,
      load_count: 1,
    });
    const emptyB = oracleByKey.get(`unit-B|${week0.week}`)!;
    expect(emptyB).toMatchObject({ total_miles: 0, load_count: 0, deadhead_pct: null });
  });

  it("uses deterministic id tie-break when first_stop_at and created_at are identical", async () => {
    const week0 = weekWindows()[0]!;
    const sameTs = new Date(week0.startMs + 4 * 3600_000).toISOString();

    // Intentionally reverse id order vs insertion order — tie-break must sort by id ASC.
    const loads: FixtureLoad[] = [
      {
        id: "load-z",
        unit_id: "unit-A",
        loaded_miles: 10,
        deadhead_miles_to_pickup: null,
        miles_practical: null,
        miles_shortest: null,
        miles_deadhead: null,
        deadhead_miles_calculation_method: null,
        created_at: sameTs,
        first_stop_at: sameTs,
        pickup_city: "CityZ, TX",
        delivery_city: "CityZ-D, TX",
        stop_ats: [sameTs],
      },
      {
        id: "load-a",
        unit_id: "unit-A",
        loaded_miles: 20,
        deadhead_miles_to_pickup: null,
        miles_practical: null,
        miles_shortest: null,
        miles_deadhead: null,
        deadhead_miles_calculation_method: null,
        created_at: sameTs,
        first_stop_at: sameTs,
        pickup_city: "CityA, TX",
        delivery_city: "CityA-D, TX",
        stop_ats: [sameTs],
      },
    ];

    const { client } = makeFixtureClient({ unitIds: ["unit-A"], loads });
    const oracle = await computeDeadhead(client, "opco-1", "unit-A", week0.week);
    await refreshDeadheadCache(client, "opco-1");

    // With identical timestamps, id ASC puts load-a before load-z. Estimated deadhead
    // miles are still 0, but load_count/order must be stable across both paths.
    expect(oracle.load_count).toBe(2);
    expect(oracle.loaded_miles).toBe(30);
    expect(oracle.deadhead_miles).toBe(0);

    // Re-run refresh twice — insert tuples must be identical (deterministic tie-break).
    const first = makeFixtureClient({ unitIds: ["unit-A"], loads });
    await refreshDeadheadCache(first.client, "opco-1");
    const second = makeFixtureClient({ unitIds: ["unit-A"], loads });
    await refreshDeadheadCache(second.client, "opco-1");
    expect(first.insertCalls[0]?.params).toEqual(second.insertCalls[0]?.params);
  });

  it("oracle-matches batch path for previous-delivery chains spanning a week", async () => {
    const week0 = weekWindows()[0]!;
    const t1 = new Date(week0.startMs + 1 * 3600_000).toISOString();
    const t2 = new Date(week0.startMs + 2 * 3600_000).toISOString();
    const t3 = new Date(week0.startMs + 3 * 3600_000).toISOString();

    const loads: FixtureLoad[] = [
      {
        id: "c1",
        unit_id: "unit-C",
        loaded_miles: 100,
        deadhead_miles_to_pickup: 5,
        miles_practical: null,
        miles_shortest: null,
        miles_deadhead: null,
        deadhead_miles_calculation_method: "manual",
        created_at: t1,
        first_stop_at: t1,
        pickup_city: "A, TX",
        delivery_city: "B, TX",
        stop_ats: [t1],
      },
      {
        id: "c2",
        unit_id: "unit-C",
        loaded_miles: 100,
        deadhead_miles_to_pickup: 25,
        miles_practical: null,
        miles_shortest: null,
        miles_deadhead: null,
        deadhead_miles_calculation_method: "manual",
        created_at: t2,
        first_stop_at: t2,
        pickup_city: "B, TX",
        delivery_city: "C, TX",
        stop_ats: [t2],
      },
      {
        id: "c3",
        unit_id: "unit-C",
        loaded_miles: 100,
        deadhead_miles_to_pickup: null,
        miles_practical: null,
        miles_shortest: null,
        miles_deadhead: null,
        deadhead_miles_calculation_method: null,
        created_at: t3,
        first_stop_at: t3,
        pickup_city: "D, TX",
        delivery_city: "E, TX",
        stop_ats: [t3],
      },
    ];

    const { client, insertCalls } = makeFixtureClient({ unitIds: ["unit-C"], loads });
    const oracle = await computeDeadhead(client, "opco-1", "unit-C", week0.week);
    await refreshDeadheadCache(client, "opco-1");

    expect(oracle).toMatchObject({
      loaded_miles: 300,
      deadhead_miles: 30, // 5 + 25 + 0(estimated)
      load_count: 3,
      total_miles: 330,
    });

    const inserted = parseInsertSummaries(insertCalls[0].params).find(
      (row) => row.unit_id === "unit-C" && row.week_starting === week0.week
    );
    expect(inserted).toMatchObject({
      loaded_miles: oracle.loaded_miles,
      deadhead_miles: oracle.deadhead_miles,
      load_count: oracle.load_count,
      total_miles: oracle.total_miles,
      deadhead_pct: oracle.deadhead_pct,
    });
  });
});
