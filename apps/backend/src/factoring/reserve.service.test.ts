import { afterEach, describe, expect, it, vi } from "vitest";

// OWNER LAW 2026-10-02 competing-engine audit: reserve READERS read the factoring KPI engine (GL), never the retired
// factoring.reserve_movement ledger. The engine is mocked here; its own SQL is covered by
// scripts/verify-factoring-banking-kpis-tie-to-ledger.mjs.
const engine = vi.hoisted(() => ({
  active: null as string | null,
  book: { escrow: 0, cash: 0, total: 0 },
  postings: [] as Array<{ id: string; entry_date: string; memo: string | null; signed_cents: number; pool: "escrow" | "cash" }>,
}));
vi.mock("./factoring-kpi.service.js", () => ({
  activeFactorId: async () => engine.active,
  factoringBookReserveCents: async () => engine.book,
  factoringReservePostings: async () => engine.postings,
}));
import {
  autoPostOverageOnSettle,
  calculateBatchOverage,
  forecastReserveReleases,
  getFactorReserveBalances,
  getReserveBalanceHistory,
  listReserveMovementsForBatch,
  postReserveMovement,
  ReserveMovementError,
} from "./reserve.service.js";

const batchId = "33333333-3333-4333-8333-333333333333";
const tenantId = "11111111-1111-4111-8111-111111111111";
const factorId = "88888888-8888-4888-8888-888888888888";

describe("factoring reserve service", () => {
  it("calculates overage math as positive delta only", () => {
    expect(calculateBatchOverage(120000, 100000)).toBe(20000);
    expect(calculateBatchOverage(90000, 100000)).toBe(0);
    expect(calculateBatchOverage(100000, 100000)).toBe(0);
  });

  it("auto posts reserve credit when overage is positive", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM factoring.batch")) {
        return {
          rows: [
            {
              id: batchId,
              tenant_id: tenantId,
              expected_advance_cents: 100000,
              factor_id: factorId,
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO factoring.reserve_movement")) {
        return {
          rows: [
            {
              id: "99999999-9999-4999-8999-999999999999",
              tenant_id: String(values?.[0]),
              batch_id: String(values?.[1]),
              factor_id: String(values?.[2]),
              direction: String(values?.[3]),
              amount_cents: Number(values?.[4]),
              reason: String(values?.[5]),
              created_at: "2026-05-30T00:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await autoPostOverageOnSettle(batchId, 105000, tenantId, { client: { query } });
    expect(result.posted).toBe(true);
    expect(result.overage_cents).toBe(5000);
    expect(result.movement).toMatchObject({
      direction: "credit",
      amount_cents: 5000,
      tenant_id: tenantId,
      batch_id: batchId,
      reason: "batch_settlement_overage",
    });
  });

  it("skips posting when overage is zero", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM factoring.batch")) {
        return {
          rows: [
            {
              id: batchId,
              tenant_id: tenantId,
              expected_advance_cents: 100000,
              factor_id: null,
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO factoring.reserve_movement")) {
        throw new Error("insert_should_not_run");
      }
      return { rows: [] };
    });

    const result = await autoPostOverageOnSettle(batchId, 100000, tenantId, { client: { query } });
    expect(result).toMatchObject({ posted: false, overage_cents: 0, movement: null });
  });

  it("enforces company-scoped reserve movement listing", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM factoring.reserve_movement")) {
        expect(sql).toContain("AND operating_company_id = $2::uuid");
        expect(values).toEqual([batchId, tenantId]);
        return {
          rows: [
            {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              operating_company_id: tenantId,
              tenant_id: tenantId,
              batch_id: batchId,
              factor_id: null,
              direction: "credit",
              amount_cents: 2500,
              reason: "manual_adjustment",
              created_at: "2026-05-30T00:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const rows = await listReserveMovementsForBatch(batchId, tenantId, { client: { query } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ operating_company_id: tenantId, tenant_id: tenantId, batch_id: batchId });
  });

  afterEach(() => {
    engine.active = null;
    engine.book = { escrow: 0, cash: 0, total: 0 };
    engine.postings = [];
  });

  it("balances = the engine's book reserve on the active factor (never reserve_movement)", async () => {
    engine.active = factorId;
    engine.book = { escrow: 5100, cash: 7800, total: 12900 };
    engine.postings = [
      { id: "p1", entry_date: "2026-09-01", memo: "Funding FP-1", signed_cents: 5100, pool: "escrow" },
      { id: "p2", entry_date: "2026-09-01", memo: "Funding FP-1", signed_cents: 7800, pool: "cash" },
    ];
    const query = vi.fn(async () => ({ rows: [] }));
    const rows = await getFactorReserveBalances(tenantId, { client: { query } });
    expect(rows).toEqual([{ operating_company_id: tenantId, tenant_id: tenantId, factor_id: factorId, balance_cents: 12900, last_movement_at: "2026-09-01", movement_count: 2 }]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("reserve_movement"))).toBe(false);
  });

  it("history = GL postings on the two reserve accounts, running balance, newest first, paged and date-filtered", async () => {
    engine.active = factorId;
    engine.postings = [
      { id: "p1", entry_date: "2026-09-01", memo: "Funding", signed_cents: 5000, pool: "escrow" },
      { id: "p2", entry_date: "2026-09-10", memo: "CCG payment", signed_cents: -2000, pool: "escrow" },
      { id: "p3", entry_date: "2026-09-20", memo: "Funding", signed_cents: 1000, pool: "cash" },
    ];
    const query = vi.fn(async () => ({ rows: [] }));
    const page = await getReserveBalanceHistory(tenantId, factorId, "2026-09-05", undefined, { client: { query }, limit: 1 });
    expect(page.total).toBe(2);
    expect(page.movements).toHaveLength(1);
    expect(page.movements[0]).toMatchObject({ id: "p3", direction: "credit", amount_cents: 1000, running_balance_cents: 4000 });
    const all = await getReserveBalanceHistory(tenantId, factorId, undefined, undefined, { client: { query } });
    expect(all.movements.map((m) => m.id)).toEqual(["p3", "p2", "p1"]);
    expect(all.movements[1]).toMatchObject({ direction: "debit", amount_cents: 2000, signed_amount_cents: -2000, running_balance_cents: 3000 });
    const other = await getReserveBalanceHistory(tenantId, "99999999-9999-4999-8999-999999999999", undefined, undefined, { client: { query } });
    expect(other.total).toBe(0);
  });

  it("forecast = reserve additions released after the hold period, from the engine's book reserve", async () => {
    engine.active = factorId;
    engine.book = { escrow: 5000, cash: 0, total: 5000 };
    const recent = new Date(Date.now() - 50 * 86_400_000).toISOString().slice(0, 10);
    engine.postings = [
      { id: "p1", entry_date: recent, memo: "Funding", signed_cents: 5000, pool: "escrow" },
      { id: "p2", entry_date: "2020-01-01", memo: "old", signed_cents: 999, pool: "escrow" },
    ];
    const query = vi.fn(async () => ({ rows: [] }));
    const forecast = await forecastReserveReleases(tenantId, factorId, 30, { client: { query } });
    expect(forecast.starting_balance_cents).toBe(5000);
    expect(forecast.total_projected_release_cents).toBe(5000);
    expect(forecast.schedule).toHaveLength(1);
  });

  it("returns sane defaults for empty history and forecast", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("WITH filtered")) return { rows: [] };
      if (sql.includes("COUNT(*)::bigint AS total")) return { rows: [{ total: 0 }] };
      if (sql.includes("WITH credits")) return { rows: [] };
      if (sql.includes("FROM factoring.v_factor_reserve_balance")) return { rows: [] };
      return { rows: [] };
    });

    const page = await getReserveBalanceHistory(tenantId, factorId, undefined, undefined, { client: { query } });
    expect(page).toMatchObject({ total: 0, limit: 50, offset: 0 });
    expect(page.movements).toHaveLength(0);

    const forecast = await forecastReserveReleases(tenantId, factorId, undefined, { client: { query } });
    expect(forecast.lookahead_days).toBe(30);
    expect(forecast.starting_balance_cents).toBe(0);
    expect(forecast.total_projected_release_cents).toBe(0);
    expect(forecast.schedule).toEqual([]);
  });

  it("rejects invalid direction enum", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await expect(
      postReserveMovement(batchId, tenantId, "invalid" as never, 1000, "bad_direction", { client: { query } })
    ).rejects.toMatchObject<ReserveMovementError>({
      code: "invalid_direction",
      statusCode: 400,
    });
  });
});
