import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { refreshLaneProfitabilityCache } from "../lane-profitability.service.js";

// G5-4: lane profitability cache refresh must upsert with ONE multi-row INSERT,
// never a per-lane await client.query INSERT loop. Empty batches skip INSERT;
// failures stay atomic under the caller's transaction.

type LaneRow = {
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  load_count: number;
  total_revenue_cents: number;
  total_fuel_cost_cents: number;
  total_driver_pay_cents: number;
  total_maintenance_cost_cents: number;
  total_miles: number;
  gross_profit_cents: number;
  profit_per_mile_cents: number | null;
  profit_per_load_cents: number | null;
  margin_pct: number | null;
  avg_deadhead_pct: number | null;
  last_load_date: string | null;
};

function lane(partial: Partial<LaneRow> & Pick<LaneRow, "origin_city" | "destination_city">): LaneRow {
  return {
    origin_state: "TX",
    destination_state: "TX",
    load_count: 2,
    total_revenue_cents: 100_000,
    total_fuel_cost_cents: 20_000,
    total_driver_pay_cents: 30_000,
    total_maintenance_cost_cents: 5_000,
    total_miles: 500,
    gross_profit_cents: 45_000,
    profit_per_mile_cents: 90,
    profit_per_load_cents: 22_500,
    margin_pct: 45,
    avg_deadhead_pct: 10,
    last_load_date: "2026-07-01",
    ...partial,
  };
}

describe("refreshLaneProfitabilityCache — multi-row INSERT (G5-4)", () => {
  it("issues exactly one multi-row INSERT with prior per-row values", async () => {
    const lanes = [
      lane({ origin_city: "Laredo", destination_city: "Dallas", gross_profit_cents: 50_000 }),
      lane({
        origin_city: "Dallas",
        destination_city: "Houston",
        gross_profit_cents: 40_000,
        profit_per_mile_cents: null,
        last_load_date: null,
      }),
    ];

    const insertCalls: Array<{ sql: string; params: unknown[] }> = [];
    let deleteCount = 0;

    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/WITH pickup AS/.test(sql)) {
          return { rows: lanes };
        }
        if (/DELETE FROM reports\.lane_profitability_cache/.test(sql)) {
          deleteCount += 1;
          expect(params).toEqual(["opco-1", "2026-01-01", "2026-07-01"]);
          return { rows: [] };
        }
        if (/INSERT INTO reports\.lane_profitability_cache/.test(sql)) {
          insertCalls.push({ sql, params });
          return { rows: [] };
        }
        if (/refresh_lane_metrics_monthly/.test(sql)) return { rows: [] };
        return { rows: [] };
      },
    } as unknown as PoolClient;

    const total = await refreshLaneProfitabilityCache(client, "opco-1", "2026-01-01", "2026-07-01");
    expect(total).toBe(2);
    expect(deleteCount).toBe(1);
    expect(insertCalls).toHaveLength(1);

    const { sql, params } = insertCalls[0];
    expect(sql).toMatch(/VALUES/);
    expect(sql).toMatch(/ON CONFLICT \(/);
    expect(sql).not.toMatch(/SELECT\s+\*/i);
    const tupleCount = (sql.match(/\(\$/g) ?? []).length;
    expect(tupleCount).toBe(2);
    expect(params).toHaveLength(38);

    // Tuple layout matches prior per-row INSERT (19 bound params + NOW() in SQL).
    expect(params.slice(0, 19)).toEqual([
      "opco-1",
      "Laredo",
      "TX",
      "Dallas",
      "TX",
      "2026-01-01",
      "2026-07-01",
      2,
      100_000,
      20_000,
      30_000,
      5_000,
      500,
      50_000,
      90,
      22_500,
      45,
      10,
      "2026-07-01",
    ]);
    expect(params.slice(19, 38)).toEqual([
      "opco-1",
      "Dallas",
      "TX",
      "Houston",
      "TX",
      "2026-01-01",
      "2026-07-01",
      2,
      100_000,
      20_000,
      30_000,
      5_000,
      500,
      40_000,
      null,
      22_500,
      45,
      10,
      null,
    ]);
  });

  it("skips INSERT on empty lane batch (DELETE still scoped)", async () => {
    const insertCalls: string[] = [];
    let deleteParams: unknown[] | null = null;

    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/WITH pickup AS/.test(sql)) return { rows: [] };
        if (/DELETE FROM reports\.lane_profitability_cache/.test(sql)) {
          deleteParams = params;
          return { rows: [] };
        }
        if (/INSERT INTO reports\.lane_profitability_cache/.test(sql)) {
          insertCalls.push(sql);
          return { rows: [] };
        }
        if (/refresh_lane_metrics_monthly/.test(sql)) return { rows: [] };
        return { rows: [] };
      },
    } as unknown as PoolClient;

    const total = await refreshLaneProfitabilityCache(client, "opco-empty", "2026-01-01", "2026-03-31");
    expect(total).toBe(0);
    expect(deleteParams).toEqual(["opco-empty", "2026-01-01", "2026-03-31"]);
    expect(insertCalls).toHaveLength(0);
  });

  it("handles large batches in one INSERT (no per-row await loop / no silent cap)", async () => {
    const lanes = Array.from({ length: 250 }, (_, i) =>
      lane({
        origin_city: `City${i}`,
        destination_city: `Dest${i}`,
        gross_profit_cents: 1000 + i,
        last_load_date: "2026-06-15",
      })
    );

    const insertCalls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/WITH pickup AS/.test(sql)) return { rows: lanes };
        if (/DELETE FROM reports\.lane_profitability_cache/.test(sql)) return { rows: [] };
        if (/INSERT INTO reports\.lane_profitability_cache/.test(sql)) {
          insertCalls.push({ sql, params });
          return { rows: [] };
        }
        if (/refresh_lane_metrics_monthly/.test(sql)) return { rows: [] };
        return { rows: [] };
      },
    } as unknown as PoolClient;

    const total = await refreshLaneProfitabilityCache(client, "opco-1", "2026-01-01", "2026-12-31");
    expect(total).toBe(250);
    expect(insertCalls).toHaveLength(1);
    expect((insertCalls[0].sql.match(/\(\$/g) ?? []).length).toBe(250);
    expect(insertCalls[0].params).toHaveLength(250 * 19);
  });

  it("keeps entity scope on compute + delete + insert", async () => {
    const scoped: unknown[] = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/WITH pickup AS|lane_profitability_cache/.test(sql)) {
          scoped.push(params[0]);
        }
        if (/WITH pickup AS/.test(sql)) {
          return { rows: [lane({ origin_city: "A", destination_city: "B" })] };
        }
        if (/refresh_lane_metrics_monthly/.test(sql)) return { rows: [] };
        return { rows: [] };
      },
    } as unknown as PoolClient;

    await refreshLaneProfitabilityCache(client, "opco-only", "2026-01-01", "2026-01-31");
    expect(scoped.every((id) => id === "opco-only")).toBe(true);
    expect(scoped.length).toBeGreaterThanOrEqual(3);
  });

  it("propagates INSERT failure after DELETE (caller txn provides atomicity)", async () => {
    let deleted = false;
    let metricsCalled = false;
    const client = {
      query: async (sql: string, _params: unknown[] = []) => {
        if (/WITH pickup AS/.test(sql)) {
          return { rows: [lane({ origin_city: "A", destination_city: "B" })] };
        }
        if (/DELETE FROM reports\.lane_profitability_cache/.test(sql)) {
          deleted = true;
          return { rows: [] };
        }
        if (/INSERT INTO reports\.lane_profitability_cache/.test(sql)) {
          throw new Error("planted_lane_insert_failure");
        }
        if (/refresh_lane_metrics_monthly/.test(sql)) {
          metricsCalled = true;
          return { rows: [] };
        }
        return { rows: [] };
      },
    } as unknown as PoolClient;

    await expect(
      refreshLaneProfitabilityCache(client, "opco-1", "2026-01-01", "2026-01-31")
    ).rejects.toThrow("planted_lane_insert_failure");
    expect(deleted).toBe(true);
    expect(metricsCalled).toBe(false);
  });
});
