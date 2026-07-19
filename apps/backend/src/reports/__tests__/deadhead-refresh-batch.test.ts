import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import {
  DEADHEAD_REFRESH_UNIT_BATCH_SIZE,
  refreshDeadheadCache,
} from "../deadhead.service.js";

// G5-4 regression guard: refreshDeadheadCache must (a) read loads with bounded set-based
// batch queries — never a per-(unit×week) loop — and (b) upsert with ONE multi-row INSERT.
// Results (miles, pct, fleet avg, rank) stay byte-identical to the prior per-row path.

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

type QueryCall = { sql: string; params: unknown[] };

function makeClient(opts: {
  unitIds: string[];
  loadsForUnits: (unitIds: string[], rangeStart: string, rangeEnd: string) => unknown[];
  failInsert?: boolean;
}): { client: PoolClient; calls: QueryCall[]; insertCalls: QueryCall[]; loadCalls: QueryCall[] } {
  const calls: QueryCall[] = [];
  const insertCalls: QueryCall[] = [];
  const loadCalls: QueryCall[] = [];

  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/FROM mdata\.units/.test(sql)) {
        return { rows: opts.unitIds.map((id) => ({ id })) };
      }
      if (/INSERT INTO reports\.deadhead_cache/.test(sql)) {
        if (opts.failInsert) throw new Error("planted_insert_failure");
        insertCalls.push({ sql, params });
        return { rows: [] };
      }
      if (/FROM mdata\.loads/.test(sql) && /ANY\(\$2::uuid\[\]\)/.test(sql)) {
        loadCalls.push({ sql, params });
        const unitIds = params[1] as string[];
        const rangeStart = String(params[2]);
        const rangeEnd = String(params[3]);
        return { rows: opts.loadsForUnits(unitIds, rangeStart, rangeEnd) };
      }
      // Legacy per-unit computeDeadhead path must not be used by refresh.
      if (/FROM mdata\.loads/.test(sql) && /assigned_unit_id = \$2::uuid/.test(sql)) {
        throw new Error("N+1 regression: per-unit load query inside refreshDeadheadCache");
      }
      return { rows: [] };
    },
  } as unknown as PoolClient;

  return { client, calls, insertCalls, loadCalls };
}

describe("refreshDeadheadCache — batched read + upsert (G5-4)", () => {
  it("emits bounded batch load reads + a single multi-row INSERT with prior loop tuples/ranks", async () => {
    const week0 = mondayOfWeek(new Date());
    const week0Iso = isoDate(week0);
    const week0Start = new Date(`${week0Iso}T00:00:00.000Z`).toISOString();
    const stopInWeek0 = new Date(`${week0Iso}T12:00:00.000Z`).toISOString();

    const { client, insertCalls, loadCalls } = makeClient({
      unitIds: ["unit-A", "unit-B"],
      loadsForUnits: (unitIds) => {
        const rows: unknown[] = [];
        if (unitIds.includes("unit-A")) {
          rows.push({
            unit_id: "unit-A",
            id: "load-a",
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
          });
        }
        if (unitIds.includes("unit-B")) {
          rows.push({
            unit_id: "unit-B",
            id: "load-b",
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
          });
        }
        return rows;
      },
    });

    const total = await refreshDeadheadCache(client, "opco-1");

    expect(total).toBe(24);
    expect(loadCalls).toHaveLength(1);
    expect(loadCalls[0].sql).not.toMatch(/SELECT\s+\*/i);
    expect(loadCalls[0].params[0]).toBe("opco-1");
    expect(loadCalls[0].params[1]).toEqual(["unit-A", "unit-B"]);
    expect(String(loadCalls[0].params[2])).toBeTruthy();
    expect(String(loadCalls[0].params[3])).toBeTruthy();
    // Range must cover the current week start (bounded 12-week window).
    expect(new Date(String(loadCalls[0].params[2])).getTime()).toBeLessThanOrEqual(
      new Date(week0Start).getTime()
    );

    expect(insertCalls).toHaveLength(1);
    const { sql, params } = insertCalls[0];
    expect(sql).toMatch(/ON CONFLICT \(unit_id, week_starting\)/);
    expect(sql).not.toMatch(/SELECT\s+\*/i);

    const tupleCount = (sql.match(/\(\$/g) ?? []).length;
    expect(tupleCount).toBe(2);
    expect(params).toHaveLength(20);

    const rowB = params.slice(0, 10);
    const rowA = params.slice(10, 20);
    expect(rowB).toEqual(["opco-1", "unit-B", week0Iso, 200, 100, 100, 50, 1, 35, 1]);
    expect(rowA).toEqual(["opco-1", "unit-A", week0Iso, 125, 100, 25, 20, 1, 35, 2]);
  });

  it("handles empty fleets with zero load queries and zero inserts", async () => {
    const { client, insertCalls, loadCalls } = makeClient({
      unitIds: [],
      loadsForUnits: () => {
        throw new Error("should not fetch loads for empty fleet");
      },
    });

    const total = await refreshDeadheadCache(client, "opco-empty");
    expect(total).toBe(0);
    expect(loadCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });

  it("chunks large fleets without dropping units (no silent cap)", async () => {
    const unitCount = DEADHEAD_REFRESH_UNIT_BATCH_SIZE + 3;
    const unitIds = Array.from({ length: unitCount }, (_, i) => `unit-${i}`);
    const seen = new Set<string>();

    const { client, loadCalls } = makeClient({
      unitIds,
      loadsForUnits: (chunk) => {
        for (const id of chunk) seen.add(id);
        return [];
      },
    });

    const total = await refreshDeadheadCache(client, "opco-large");
    expect(total).toBe(unitCount * 12);
    expect(loadCalls.length).toBe(Math.ceil(unitCount / DEADHEAD_REFRESH_UNIT_BATCH_SIZE));
    expect(seen.size).toBe(unitCount);
  });

  it("keeps entity scope on every units/loads/insert statement", async () => {
    const week0 = mondayOfWeek(new Date());
    const stopInWeek0 = new Date(`${isoDate(week0)}T12:00:00.000Z`).toISOString();
    const { client, calls } = makeClient({
      unitIds: ["unit-A"],
      loadsForUnits: () => [
        {
          unit_id: "unit-A",
          id: "load-a",
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
    const { client, insertCalls } = makeClient({
      unitIds: ["unit-A", "unit-B"],
      failInsert: true,
      loadsForUnits: (unitIds) =>
        unitIds.map((unitId) => ({
          unit_id: unitId,
          id: `load-${unitId}`,
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
    // Failure happens on the only INSERT attempt — never N partial per-row inserts.
    expect(insertCalls).toHaveLength(0);
  });
});
