import { describe, expect, it, vi } from "vitest";
import {
  autoPostOverageOnSettle,
  calculateBatchOverage,
  listReserveMovementsForBatch,
  postReserveMovement,
  ReserveMovementError,
} from "./reserve.service.js";

const batchId = "33333333-3333-4333-8333-333333333333";
const tenantId = "11111111-1111-4111-8111-111111111111";

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
              factor_id: "88888888-8888-4888-8888-888888888888",
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
