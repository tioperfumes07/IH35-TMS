import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import {
  LANE_CACHE_INSERT_BINDS_PER_ROW,
  LANE_CACHE_INSERT_BIND_BUDGET,
  LANE_CACHE_INSERT_MAX_ROWS,
  refreshLaneProfitabilityCache,
} from "../lane-profitability.service.js";

// G5-4: lane profitability cache refresh must upsert with bind-budget-chunked
// multi-row INSERTs (never a per-lane await client.query INSERT). Empty batches
// skip INSERT; DELETE + all chunks share the caller's transaction.

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

function collectInsertedOrigins(insertCalls: Array<{ params: unknown[] }>): string[] {
  const origins: string[] = [];
  for (const call of insertCalls) {
    for (let i = 0; i < call.params.length; i += LANE_CACHE_INSERT_BINDS_PER_ROW) {
      origins.push(String(call.params[i + 1]));
    }
  }
  return origins;
}

describe("refreshLaneProfitabilityCache — bind-budget multi-row INSERT (G5-4)", () => {
  it("exports a bind budget safely below PostgreSQL 65535", () => {
    expect(LANE_CACHE_INSERT_BINDS_PER_ROW).toBe(19);
    expect(LANE_CACHE_INSERT_BIND_BUDGET).toBeLessThan(65535);
    expect(LANE_CACHE_INSERT_MAX_ROWS).toBe(
      Math.floor(LANE_CACHE_INSERT_BIND_BUDGET / LANE_CACHE_INSERT_BINDS_PER_ROW)
    );
    expect(LANE_CACHE_INSERT_MAX_ROWS * LANE_CACHE_INSERT_BINDS_PER_ROW).toBeLessThanOrEqual(
      LANE_CACHE_INSERT_BIND_BUDGET
    );
  });

  it("issues exactly one multi-row INSERT for small batches with prior per-row values", async () => {
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
        if (/WITH pickup AS/.test(sql)) return { rows: lanes };
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
    expect((sql.match(/\(\$/g) ?? []).length).toBe(2);
    expect(params).toHaveLength(38);
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
    expect(params.slice(19, 38)[14]).toBeNull();
    expect(params.slice(19, 38)[18]).toBeNull();
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

  it("chunks >3500 lanes into multiple INSERTs with no omissions or duplicates", async () => {
    expect(LANE_CACHE_INSERT_MAX_ROWS).toBeLessThan(3500);
    const laneCount = 3501;
    const lanes = Array.from({ length: laneCount }, (_, i) =>
      lane({
        origin_city: `City${String(i).padStart(4, "0")}`,
        destination_city: `Dest${i}`,
        gross_profit_cents: 1000 + i,
        last_load_date: "2026-06-15",
      })
    );

    const insertCalls: Array<{ sql: string; params: unknown[] }> = [];
    let deleteCount = 0;
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/WITH pickup AS/.test(sql)) return { rows: lanes };
        if (/DELETE FROM reports\.lane_profitability_cache/.test(sql)) {
          deleteCount += 1;
          return { rows: [] };
        }
        if (/INSERT INTO reports\.lane_profitability_cache/.test(sql)) {
          expect(params.length).toBeLessThanOrEqual(LANE_CACHE_INSERT_BIND_BUDGET);
          expect(params.length % LANE_CACHE_INSERT_BINDS_PER_ROW).toBe(0);
          insertCalls.push({ sql, params });
          return { rows: [] };
        }
        if (/refresh_lane_metrics_monthly/.test(sql)) return { rows: [] };
        return { rows: [] };
      },
    } as unknown as PoolClient;

    const total = await refreshLaneProfitabilityCache(client, "opco-1", "2026-01-01", "2026-12-31");
    const expectedChunks = Math.ceil(laneCount / LANE_CACHE_INSERT_MAX_ROWS);
    expect(total).toBe(laneCount);
    expect(deleteCount).toBe(1);
    expect(insertCalls.length).toBe(expectedChunks);
    expect(insertCalls.length).toBeGreaterThan(1);

    const origins = collectInsertedOrigins(insertCalls);
    expect(origins).toHaveLength(laneCount);
    expect(new Set(origins).size).toBe(laneCount);
    expect(origins).toEqual(lanes.map((row) => row.origin_city));
    expect(insertCalls[0].params.length / LANE_CACHE_INSERT_BINDS_PER_ROW).toBe(LANE_CACHE_INSERT_MAX_ROWS);
    expect(insertCalls[insertCalls.length - 1].params.length / LANE_CACHE_INSERT_BINDS_PER_ROW).toBe(
      laneCount - LANE_CACHE_INSERT_MAX_ROWS * (expectedChunks - 1)
    );
  });

  it("rolls back later-chunk failure after earlier chunks (caller txn atomicity)", async () => {
    const laneCount = LANE_CACHE_INSERT_MAX_ROWS + 5;
    const lanes = Array.from({ length: laneCount }, (_, i) =>
      lane({ origin_city: `City${i}`, destination_city: `Dest${i}` })
    );

    let deleteCount = 0;
    let insertAttempts = 0;
    let metricsCalled = false;
    const client = {
      query: async (sql: string, _params: unknown[] = []) => {
        if (/WITH pickup AS/.test(sql)) return { rows: lanes };
        if (/DELETE FROM reports\.lane_profitability_cache/.test(sql)) {
          deleteCount += 1;
          return { rows: [] };
        }
        if (/INSERT INTO reports\.lane_profitability_cache/.test(sql)) {
          insertAttempts += 1;
          if (insertAttempts >= 2) throw new Error("planted_lane_chunk_failure");
          return { rows: [] };
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
    ).rejects.toThrow("planted_lane_chunk_failure");
    expect(deleteCount).toBe(1);
    expect(insertAttempts).toBe(2);
    expect(metricsCalled).toBe(false);
  });

  it("keeps entity scope on compute + delete + insert chunks", async () => {
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

  it("propagates first-chunk INSERT failure after DELETE (no metrics)", async () => {
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

  // LIAB-F9927-SILENT-CATCH-SWEEP (reports leg): refresh_lane_metrics_monthly() failing must NOT
  // fail the whole cache refresh (it's a separate, best-effort monthly rollup) — but it must no
  // longer be swallowed with zero visibility either. Same class as BANK-F9521's fail-loud-in-logs.
  it("does not fail the cache refresh when refresh_lane_metrics_monthly() itself fails, but logs it", async () => {
    const warnCalls: unknown[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args);
    };
    try {
      const client = {
        query: async (sql: string, _params: unknown[] = []) => {
          if (/WITH pickup AS/.test(sql)) return { rows: [lane({ origin_city: "A", destination_city: "B" })] };
          if (/DELETE FROM reports\.lane_profitability_cache/.test(sql)) return { rows: [] };
          if (/INSERT INTO reports\.lane_profitability_cache/.test(sql)) return { rows: [] };
          if (/refresh_lane_metrics_monthly/.test(sql)) throw new Error("planted_monthly_refresh_failure");
          return { rows: [] };
        },
      } as unknown as PoolClient;

      const total = await refreshLaneProfitabilityCache(client, "opco-1", "2026-01-01", "2026-01-31");
      expect(total).toBe(1);
      expect(warnCalls).toHaveLength(1);
      const logged = String(warnCalls[0]);
      expect(logged).toMatch(/refresh_lane_metrics_monthly/);
      expect(logged).toMatch(/opco-1/);
    } finally {
      console.warn = originalWarn;
    }
  });
});
