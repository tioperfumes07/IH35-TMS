import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { refreshDeadheadCache } from "../deadhead.service.js";

// G5-4 regression guard: refreshDeadheadCache must upsert the deadhead cache with ONE batched
// multi-row INSERT, not a per-row INSERT inside the nested unit×week loop (the old N+1). This test
// drives the real function against a mock client and asserts (a) exactly one INSERT statement is
// issued and (b) the batched VALUES/params carry the same per-(unit,week) values, fleet averages,
// and ranks the per-row loop produced — a pure perf refactor with byte-identical results.

// Mirror the service's Monday-of-week helper so we can target the current (i=0) week deterministically.
function mondayOfWeek(d: Date): Date {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  return copy;
}

describe("refreshDeadheadCache — batched upsert (G5-4)", () => {
  it("emits a single multi-row INSERT with the same tuples/ranks the loop produced", async () => {
    const week0 = mondayOfWeek(new Date());
    const week0Iso = new Date(`${week0.toISOString().slice(0, 10)}T00:00:00.000Z`).toISOString();

    const insertCalls: Array<{ sql: string; params: unknown[] }> = [];

    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/FROM mdata\.units/.test(sql)) {
          return { rows: [{ id: "unit-A" }, { id: "unit-B" }] };
        }
        if (/INSERT INTO reports\.deadhead_cache/.test(sql)) {
          insertCalls.push({ sql, params });
          return { rows: [] };
        }
        if (/FROM mdata\.loads/.test(sql)) {
          const unitId = params[1];
          const weekStartIso = params[2];
          // Only the current week has activity; all prior weeks stay at total_miles=0 (not inserted).
          if (weekStartIso !== week0Iso) return { rows: [] };
          if (unitId === "unit-A") {
            return { rows: [{ loaded_miles: 100, deadhead_miles_to_pickup: 25, pickup_city: null, delivery_city: null }] };
          }
          if (unitId === "unit-B") {
            return { rows: [{ loaded_miles: 100, deadhead_miles_to_pickup: 100, pickup_city: null, delivery_city: null }] };
          }
          return { rows: [] };
        }
        return { rows: [] };
      },
    } as unknown as PoolClient;

    const total = await refreshDeadheadCache(client, "opco-1");

    // 2 units × 12 weeks of summaries computed.
    expect(total).toBe(24);

    // BATCHED: exactly one INSERT statement, never one-per-row.
    expect(insertCalls).toHaveLength(1);

    const { sql, params } = insertCalls[0];
    expect(sql).toMatch(/ON CONFLICT \(unit_id, week_starting\)/);

    // Only the two units with total_miles>0 in the current week are upserted → 2 value-tuples × 10 params.
    const tupleCount = (sql.match(/\(\$/g) ?? []).length;
    expect(tupleCount).toBe(2);
    expect(params).toHaveLength(20);

    // Unit B: total=200, deadhead_pct=50 → rank 1. Unit A: total=125, deadhead_pct=20 → rank 2.
    // fleet_avg_deadhead_pct = (50 + 20) / 2 = 35 for both rows.
    // Tuple layout: [opco, unit_id, week, total, loaded, deadhead, pct, load_count, fleet_avg, rank]
    const rowB = params.slice(0, 10);
    const rowA = params.slice(10, 20);

    expect(rowB).toEqual(["opco-1", "unit-B", week0.toISOString().slice(0, 10), 200, 100, 100, 50, 1, 35, 1]);
    expect(rowA).toEqual(["opco-1", "unit-A", week0.toISOString().slice(0, 10), 125, 100, 25, 20, 1, 35, 2]);
  });
});
