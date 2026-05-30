import { describe, expect, it, vi } from "vitest";
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

  it("enforces tenant-scoped reserve movement listing", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM factoring.reserve_movement")) {
        expect(sql).toContain("AND tenant_id = $2::uuid");
        expect(values).toEqual([batchId, tenantId]);
        return {
          rows: [
            {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
    expect(rows[0]).toMatchObject({ tenant_id: tenantId, batch_id: batchId });
  });

  it("returns reserve balances for multiple factors", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      expect(sql).toContain("FROM factoring.v_factor_reserve_balance");
      expect(sql).toContain("WHERE tenant_id = $1::uuid");
      expect(values).toEqual([tenantId]);
      return {
        rows: [
          {
            tenant_id: tenantId,
            factor_id: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
            balance_cents: 12000,
            last_movement_at: "2026-05-29T10:00:00.000Z",
            movement_count: 4,
          },
          {
            tenant_id: tenantId,
            factor_id: "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
            balance_cents: 5000,
            last_movement_at: "2026-05-30T10:00:00.000Z",
            movement_count: 2,
          },
        ],
      };
    });

    const balances = await getFactorReserveBalances(tenantId, { client: { query } });
    expect(balances).toHaveLength(2);
    expect(balances[0]).toMatchObject({ balance_cents: 12000, movement_count: 4 });
    expect(balances[1]).toMatchObject({ factor_id: "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2" });
  });

  it("supports history pagination and date filters", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("WITH filtered")) {
        expect(sql).toContain("created_at >= $3::timestamptz");
        expect(sql).toContain("created_at <= $4::timestamptz");
        expect(values).toEqual([
          tenantId,
          factorId,
          "2026-05-01T00:00:00.000Z",
          "2026-05-31T23:59:59.000Z",
          10,
          20,
        ]);
        return {
          rows: [
            {
              id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              tenant_id: tenantId,
              batch_id: batchId,
              factor_id: factorId,
              direction: "credit",
              amount_cents: 2000,
              reason: "manual_adjustment",
              created_at: "2026-05-20T12:00:00.000Z",
              signed_amount_cents: 2000,
              running_balance_cents: 7000,
            },
          ],
        };
      }
      if (sql.includes("COUNT(*)::bigint AS total")) {
        expect(values).toEqual([tenantId, factorId, "2026-05-01T00:00:00.000Z", "2026-05-31T23:59:59.000Z"]);
        return { rows: [{ total: 35 }] };
      }
      return { rows: [] };
    });

    const page = await getReserveBalanceHistory(
      tenantId,
      factorId,
      "2026-05-01T00:00:00.000Z",
      "2026-05-31T23:59:59.000Z",
      { client: { query }, limit: 10, offset: 20 }
    );

    expect(page.limit).toBe(10);
    expect(page.offset).toBe(20);
    expect(page.total).toBe(35);
    expect(page.movements[0]).toMatchObject({ signed_amount_cents: 2000, running_balance_cents: 7000 });
  });

  it("forecasts projected reserve releases", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("WITH credits")) {
        expect(values).toEqual([tenantId, factorId, 60, 30]);
        return {
          rows: [
            {
              release_date: "2026-06-10",
              projected_release_cents: 3000,
              source_movement_count: 1,
            },
            {
              release_date: "2026-06-15",
              projected_release_cents: 2000,
              source_movement_count: 2,
            },
          ],
        };
      }
      if (sql.includes("FROM factoring.v_factor_reserve_balance")) {
        return { rows: [{ balance_cents: 15000 }] };
      }
      return { rows: [] };
    });

    const forecast = await forecastReserveReleases(tenantId, factorId, 30, { client: { query } });
    expect(forecast.factor_id).toBe(factorId);
    expect(forecast.hold_period_days).toBe(60);
    expect(forecast.starting_balance_cents).toBe(15000);
    expect(forecast.total_projected_release_cents).toBe(5000);
    expect(forecast.schedule).toHaveLength(2);
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
