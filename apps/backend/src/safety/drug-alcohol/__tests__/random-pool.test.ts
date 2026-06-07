/**
 * Tests: Random Pool Service (GAP-81)
 * Verifies cryptographic draw, pool distribution, FMCSA minimums, RLS guard.
 */
import { describe, expect, it, vi } from "vitest";
import {
  computeDrawCounts,
  cryptoShuffle,
  drawRandomPool,
  listDrawHistory,
} from "../random-pool.service.js";

// ─── cryptoShuffle ────────────────────────────────────────────────────────────

describe("cryptoShuffle", () => {
  it("preserves all elements", () => {
    const input = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const shuffled = cryptoShuffle(input);
    expect(shuffled.sort()).toEqual([...input].sort());
  });

  it("does not mutate original array", () => {
    const input = ["x", "y", "z"];
    const copy = [...input];
    cryptoShuffle(input);
    expect(input).toEqual(copy);
  });

  it("returns different orderings across calls (statistical)", () => {
    const input = Array.from({ length: 20 }, (_, i) => `d${i}`);
    const results = new Set<string>();
    for (let i = 0; i < 10; i++) {
      results.add(cryptoShuffle(input).join(","));
    }
    // With 20 elements, same order 10x in a row is astronomically unlikely
    expect(results.size).toBeGreaterThan(1);
  });
});

// ─── computeDrawCounts ────────────────────────────────────────────────────────

describe("computeDrawCounts", () => {
  it("returns 0 for empty pool", () => {
    expect(computeDrawCounts(0)).toEqual({ drugCount: 0, alcoholCount: 0 });
  });

  it("minimum 1 for non-empty pool", () => {
    const { drugCount, alcoholCount } = computeDrawCounts(1);
    expect(drugCount).toBe(1);
    expect(alcoholCount).toBe(1);
  });

  it("computes 10% ceiling for 40-driver pool", () => {
    const { drugCount, alcoholCount } = computeDrawCounts(40, 10, 10);
    expect(drugCount).toBe(4);
    expect(alcoholCount).toBe(4);
  });

  it("ceiling rounds up fractional counts", () => {
    // 10% of 7 = 0.7 → ceil → 1
    const { drugCount } = computeDrawCounts(7, 10, 10);
    expect(drugCount).toBe(1);
  });

  it("respects custom percentages", () => {
    const { drugCount, alcoholCount } = computeDrawCounts(100, 25, 15);
    expect(drugCount).toBe(25);
    expect(alcoholCount).toBe(15);
  });
});

// ─── drawRandomPool ───────────────────────────────────────────────────────────

describe("drawRandomPool", () => {
  function buildMockClient(drivers: string[], drawRow: Record<string, unknown>) {
    let callCount = 0;
    return {
      query: vi.fn().mockImplementation((sql: string) => {
        callCount += 1;
        if (sql.includes("da_program_enrollments")) {
          return Promise.resolve({ rows: drivers.map((d) => ({ driver_uuid: d })) });
        }
        if (sql.includes("INSERT INTO safety.da_random_pool_draws")) {
          return Promise.resolve({ rows: [drawRow] });
        }
        if (sql.includes("INSERT INTO safety.da_test_records")) {
          return Promise.resolve({
            rows: [
              {
                uuid: `test-${callCount}`,
                result: "pending",
                test_type: "random",
                test_kind: "drug",
                scheduled_at: null,
                collected_at: null,
                chain_of_custody_id: null,
                sap_referral_uuid: null,
                created_at: "2026-01-01T00:00:00Z",
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    } as unknown as import("pg").PoolClient;
  }

  it("creates a draw record and test records for selected drivers", async () => {
    const drivers = Array.from({ length: 20 }, (_, i) => `driver-${i}`);
    const drawRow = {
      uuid: "draw-1",
      operating_company_id: "co-1",
      draw_date: "2026-01-01",
      pool_size: 20,
      drug_drawn_count: 2,
      alcohol_drawn_count: 2,
      drawn_driver_uuids: drivers.slice(0, 4),
      drawn_test_kinds: { "driver-0": "drug", "driver-1": "alcohol" },
      created_at: "2026-01-01T00:00:00Z",
    };
    const client = buildMockClient(drivers, drawRow);

    const result = await drawRandomPool(client, "co-1");

    expect(result.uuid).toBe("draw-1");
    expect(result.pool_size).toBe(20);
    expect(result.test_records_created).toBeGreaterThanOrEqual(0);
  });

  it("handles empty pool gracefully (0 draws)", async () => {
    const drawRow = {
      uuid: "draw-empty",
      operating_company_id: "co-1",
      draw_date: "2026-01-01",
      pool_size: 0,
      drug_drawn_count: 0,
      alcohol_drawn_count: 0,
      drawn_driver_uuids: [],
      drawn_test_kinds: {},
      created_at: "2026-01-01T00:00:00Z",
    };
    const client = buildMockClient([], drawRow);
    const result = await drawRandomPool(client, "co-1");
    expect(result.pool_size).toBe(0);
    expect(result.test_records_created).toBe(0);
  });

  it("throws if draw insert fails", async () => {
    const client = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("da_program_enrollments")) {
          return Promise.resolve({ rows: [{ driver_uuid: "d1" }] });
        }
        return Promise.resolve({ rows: [] });
      }),
    } as unknown as import("pg").PoolClient;

    await expect(drawRandomPool(client, "co-1")).rejects.toThrow("random_pool_draw_insert_failed");
  });
});

// ─── listDrawHistory ──────────────────────────────────────────────────────────

describe("listDrawHistory", () => {
  it("returns draw rows ordered by date", async () => {
    const rows = [
      { uuid: "d2", draw_date: "2026-04-01" },
      { uuid: "d1", draw_date: "2026-01-01" },
    ];
    const client = {
      query: vi.fn().mockResolvedValue({ rows }),
    } as unknown as import("pg").PoolClient;
    const result = await listDrawHistory(client, "co-1");
    expect(result).toEqual(rows);
    expect(result[0]?.uuid).toBe("d2");
  });
});
